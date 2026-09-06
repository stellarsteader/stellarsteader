import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Vector3 } from 'three';
import { TerrainHeights, terrainPatches, terrainRadius, sampleGrid, type TerrainBody } from './terrain-data';
import { terrainGeometry } from './terrain';

function grid(body:TerrainBody,name='base') {
  const bytes=gunzipSync(readFileSync(new URL(`../public/terrain/${body}/${name}.bin.gz`,import.meta.url)));
  const data=new Int16Array(bytes.length/2);for(let i=0;i<data.length;i++) data[i]=bytes.readInt16LE(i*2)+(i%1025===0?0:data[i-1]);return data;
}
test('DEM bilinear sampling preserves signed meter elevations and inclusive edges',()=>{
  const data=Int16Array.from([-1000,1000,3000,5000]);
  assert.equal(sampleGrid(data,1,1,.5,.5),2000);
  assert.equal(sampleGrid(data,1,1,0,0),-1000);assert.equal(sampleGrid(data,1,1,1,1),5000);
});
test('Real MOLA elevations put Olympus Mons above 18 km and Hellas below -6 km',()=>{
  const field=new TerrainHeights('mars',grid('mars'));
  assert.ok(field.height((180-133.8)/360,(90-18.65)/180)>18000);
  assert.ok(field.height((180+70)/360,(90+42)/180)<-6000);
});
test('Real LOLA data preserves basin depths, longitude wrapping, and a single pole',()=>{
  const field=new TerrainHeights('moon',grid('moon'));
  assert.ok(field.height((180-169)/360,(90+53)/180)<-2000);
  for(const v of [0,.1,.5,.9,1]) assert.equal(field.height(0,v),field.height(1,v));
  assert.ok(field.point(0,0).distanceTo(field.point(.7,0))<1e-10);
});
test('Terrain changes actual vertex radius in physical units; disabling relief restores a sphere',()=>{
  const field=new TerrainHeights('moon',new Int16Array(1025*513).fill(5000));
  assert.ok(Math.abs(field.point(.2,.4).length()-(1+5000/terrainRadius.moon))<1e-10);
  assert.ok(Math.abs(field.point(.2,.4,false).length()-1)<1e-10);
  const geometry=terrainGeometry(field,{u:.25,v:.25,width:.125,height:.125,level:1});
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  const a=new Vector3().fromBufferAttribute(p,0), b=new Vector3().fromBufferAttribute(p,33), c=new Vector3().fromBufferAttribute(p,1);
  assert.ok(b.sub(a).cross(c.sub(a)).dot(a)>0,'front faces point outwards');
  assert.ok(new Vector3().fromBufferAttribute(n,200).dot(new Vector3().fromBufferAttribute(p,200))>.99);
  assert.ok(Array.from(p.array).every(Number.isFinite));geometry.dispose();
});
test('Adaptive terrain covers the globe without exceeding its budget and refines on approach',()=>{
  for(const quality of ['auto','high','ultra'] as const) {
    const far=terrainPatches(new Vector3(3,0,0),900,35,quality);
    const near=terrainPatches(new Vector3(1.015,0,0),900,35,quality);
    assert.ok(Math.abs(near.reduce((s,p)=>s+p.width*p.height,0)-1)<1e-9);
    assert.ok(near.length<=({auto:160,high:224,ultra:320}[quality]));
    assert.ok(Math.max(...near.map(p=>p.level))>Math.max(...far.map(p=>p.level)));
  }
});
test('Adjacent streamed elevation tiles share exact edge samples, including the date line',()=>{
  for(const body of ['moon','mars'] as const) {
    const west=grid(body,'0-1'),east=grid(body,'1-1'),last=grid(body,'7-1');
    assert.equal(west.length,1025*1025);
    for(let row=0;row<=1024;row++) {
      assert.equal(west[row*1025+1024],east[row*1025]);
      assert.equal(last[row*1025+1024],west[row*1025]);
    }
  }
});

test('Refinement starts exactly on the previous triangles and ends at measured terrain',async()=>{
  const { morphFromSurface, sampleTerrainSurface }=await import('./terrain-morph');
  const coarseField=new TerrainHeights('moon',new Int16Array(1025*513).fill(1000));
  const detailedField=new TerrainHeights('moon',new Int16Array(1025*513).fill(4000));
  const parent={u:.25,v:.25,width:.25,height:.5,level:0};
  const child={u:.25,v:.25,width:.125,height:.25,level:1};
  const old=terrainGeometry(coarseField,parent), next=terrainGeometry(detailedField,child);
  const target=Float32Array.from(next.getAttribute('position').array);
  morphFromSurface(next,[{patch:parent,geometry:old}]);
  for(const i of [0,1,17,200,800,1088]) {
    const uv=next.getAttribute('uv'), u=uv.getX(i),v=1-uv.getY(i);
    const expected=sampleTerrainSurface({patch:parent,geometry:old},u,v,'position');
    const actual=new Vector3().fromBufferAttribute(next.getAttribute('position'),i);
    assert.ok(actual.distanceTo(expected)<1e-7);
    const finished=sampleTerrainSurface({patch:child,geometry:next,influence:1},u,v,'position');
    assert.ok(finished.distanceTo(new Vector3().fromArray(target,i*3))<1e-7);
  }
  old.dispose();next.dispose();
});
