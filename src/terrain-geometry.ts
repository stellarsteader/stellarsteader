import * as THREE from 'three';
import { TerrainHeights, clamp, type TerrainPatch } from './terrain-data';

export function terrainGeometry(field: TerrainHeights, patch: TerrainPatch, relief=true) {
  const segments=32, stride=segments+1;
  const positions:number[]=[], normals:number[]=[], uvs:number[]=[], indices:number[]=[];
  const p=new THREE.Vector3(), a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3(), d=new THREE.Vector3();
  const add=(u:number,v:number,skirt=false)=>{
    field.point(u,v,relief,p);
    const e=1/8192;
    field.point(u+e,v,relief,a); field.point(u-e,v,relief,b);
    field.point(u,clamp(v+e),relief,c); field.point(u,clamp(v-e),relief,d);
    c.sub(d).cross(a.sub(b)).normalize();
    if(v<e || v>1-e || !relief) c.copy(p).normalize();
    if(skirt) p.addScaledVector(p.clone().normalize(),-.002);
    positions.push(p.x,p.y,p.z); normals.push(c.x,c.y,c.z); uvs.push(u,1-v);
  };
  for(let y=0;y<=segments;y++) for(let x=0;x<=segments;x++) add(patch.u+x/segments*patch.width,patch.v+y/segments*patch.height);
  for(let y=0;y<segments;y++) for(let x=0;x<segments;x++) {
    const a=y*stride+x,b=a+1,c=a+stride,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  // Downward edge skirts close cracks where adjacent patches have different LODs.
  const edges=[Array.from({length:stride},(_,i)=>i),Array.from({length:stride},(_,i)=>i*stride+segments),Array.from({length:stride},(_,i)=>segments*stride+segments-i),Array.from({length:stride},(_,i)=>(segments-i)*stride)];
  for(const edge of edges) {
    const start=positions.length/3;
    for(const i of edge) add(uvs[i*2],1-uvs[i*2+1],true);
    for(let i=0;i<segments;i++) indices.push(edge[i],edge[i+1],start+i,edge[i+1],start+i+1,start+i);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices);
  geometry.computeBoundingSphere(); return geometry;
}

