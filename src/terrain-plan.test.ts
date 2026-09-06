import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { terrainPatches, patchKey, splitPatch } from './terrain-data';
import { containsPatch, nextTerrainPatches, patchDataKey } from './terrain-plan';

const roots = terrainPatches(new Vector3(0, 0, 100), 1, 35, 'high');

test('Incremental refinement reaches the same detail with complete nonoverlapping coverage at every step', () => {
  let current = roots;
  for (const camera of [new Vector3(1.015,0,0), new Vector3(-.5,.5,-.73).normalize().multiplyScalar(1.025), new Vector3(0,0,100)]) {
    const desired = terrainPatches(camera, 1000, 35, 'high');
    for (let step=0;step<8;step++) {
      const next = nextTerrainPatches(current, desired);
      assert.ok(next.length<=224);
      assert.ok(Math.abs(next.reduce((sum,p)=>sum+p.width*p.height,0)-1)<1e-12);
      for(let i=0;i<next.length;i++) for(let j=i+1;j<next.length;j++) {
        const a=next[i],b=next[j];
        assert.ok(a.u+a.width<=b.u || b.u+b.width<=a.u || a.v+a.height<=b.v || b.v+b.height<=a.v);
      }
      for(const old of current) assert.ok(next.filter(p=>containsPatch(old,p)).length<=4,'No refinement transaction uploads more than four patches');
      current=next;
    }
    assert.deepEqual(current.map(patchKey).sort(),desired.map(patchKey).sort());
  }
});

test('Tile arrival preserves unrelated patch identities and invalidates boundary neighbors', () => {
  const patch={u:.25,v:.5,width:1/256,height:1/128,level:6};
  const initial=patchDataKey(patch,['2-2'],true);
  assert.equal(patchDataKey(patch,['2-2','6-0'],true),initial);
  assert.notEqual(patchDataKey(patch,['2-2','1-2'],true),initial);
  assert.equal(patchDataKey(patch,['6-0','2-2'],true),patchDataKey(patch,['2-2','6-0'],true));
  assert.equal(patchDataKey(patch,['2-2'],false),patchDataKey(patch,[],false));
  assert.notEqual(patchDataKey(patch,[],true),patchDataKey(patch,[],false));
  const dateLine={...patch,u:0};
  assert.notEqual(patchDataKey(dateLine,[],true),patchDataKey(dateLine,['7-2'],true));
});

test('Unchanged layout preserves patch references and coarsening is a single replacement',()=>{
  assert.deepEqual(nextTerrainPatches(roots,roots),roots);
  const parent=roots[0], children=splitPatch(parent);
  const current=[...children,...roots.slice(1)];
  assert.deepEqual(nextTerrainPatches(current,roots),roots);
});
