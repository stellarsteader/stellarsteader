import { Vector3 } from 'three';

export type TerrainBody = 'moon' | 'mars';
export const TERRAIN_WIDTH = 8192;
export const TERRAIN_HEIGHT = 4096;
export const TERRAIN_TILE_SIZE = 1024;
export const terrainRadius = { moon: 1737400, mars: 3389500 };
export const wrap = (u: number) => ((u % 1) + 1) % 1;
export const clamp = (v: number, min=0, max=1) => Math.max(min, Math.min(max, v));

export function sampleGrid(data: Int16Array, width: number, height: number, u: number, v: number) {
  const x = clamp(u) * width, y = clamp(v) * height;
  const x0 = Math.min(width-1, Math.floor(x)), y0 = Math.min(height-1, Math.floor(y));
  const fx = x-x0, fy = y-y0, i = y0*(width+1)+x0;
  return (data[i]*(1-fx)+data[i+1]*fx)*(1-fy) + (data[i+width+1]*(1-fx)+data[i+width+2]*fx)*fy;
}

export class TerrainHeights {
  tiles = new Map<string, Int16Array>();
  revision = 0;
  constructor(readonly body: TerrainBody, readonly base: Int16Array) {}
  height(u: number, v: number) {
    u = wrap(u); v = clamp(v);
    // Longitude is undefined at the poles: every patch must meet at one vertex.
    if (v < 1e-8 || v > 1-1e-8) return sampleGrid(this.base,1024,512,.5,v);
    const low = sampleGrid(this.base,1024,512,u,v);
    const tx = Math.min(7,Math.floor(u*8)), ty = Math.min(3,Math.floor(v*4));
    const tile = this.tiles.get(`${tx}-${ty}`);
    if (!tile) return low;
    const x=u*8-tx, y=v*4-ty;
    // A narrow overlap fades to the shared base while adjacent tiles stream in.
    const blend=clamp(Math.min(
      this.tiles.has(`${(tx+7)%8}-${ty}`)?1:x*128,
      this.tiles.has(`${(tx+1)%8}-${ty}`)?1:(1-x)*128,
      this.tiles.has(`${tx}-${ty-1}`)?1:y*128,
      this.tiles.has(`${tx}-${ty+1}`)?1:(1-y)*128,
    ));
    return low + (sampleGrid(tile,1024,1024,x,y)-low)*blend;
  }
  point(u: number, v: number, relief=true, target=new Vector3()) {
    const lon=u*Math.PI*2, colat=clamp(v)*Math.PI;
    const radius=1+(relief?this.height(u,v)/terrainRadius[this.body]:0);
    return target.set(-Math.cos(lon)*Math.sin(colat),Math.cos(colat),Math.sin(lon)*Math.sin(colat)).multiplyScalar(radius);
  }
}

export type TerrainPatch = { u: number; v: number; width: number; height: number; level: number };
export const patchKey = (p: TerrainPatch) => `${p.level}/${p.u}/${p.v}`;
export function splitPatch(p: TerrainPatch): TerrainPatch[] {
  return [0,1,2,3].map(i=>({u:p.u+(i%2)*p.width/2,v:p.v+Math.floor(i/2)*p.height/2,width:p.width/2,height:p.height/2,level:p.level+1}));
}

// Screen-space tessellation with a hard mesh budget. The nearest visible patches
// refine first; far-side patches remain coarse and no part of the sphere is lost.
export function terrainPatches(camera: Vector3, pixelHeight: number, fov: number, quality: 'auto'|'high'|'ultra'): TerrainPatch[] {
  const leaves: TerrainPatch[]=[];
  for(let y=0;y<2;y++) for(let x=0;x<4;x++) leaves.push({u:x/4,v:y/2,width:1/4,height:1/2,level:0});
  const direction=camera.clone().normalize(), distance=camera.length();
  const projection=pixelHeight/(2*Math.tan(fov*Math.PI/360));
  const threshold=quality==='ultra'?3:quality==='high'?5:7;
  const budget=quality==='ultra'?320:quality==='high'?224:160;
  const center=new Vector3();
  const horizon=Math.acos(1/Math.max(1.001,distance));
  const scores=new Map<TerrainPatch,number>();
  const score=(p:TerrainPatch)=>{
    const u=p.u+p.width/2, v=p.v+p.height/2, lon=u*Math.PI*2, colat=v*Math.PI;
    center.set(-Math.cos(lon)*Math.sin(colat),Math.cos(colat),Math.sin(lon)*Math.sin(colat));
    const angular=Math.max(p.width*2*Math.PI,p.height*Math.PI);
    const angle=Math.acos(clamp(center.dot(direction),-1,1));
    if(angle>horizon+angular*.75+.08 || p.level>=6) return 0;
    const nearest=Math.max(.008,camera.distanceTo(center)-angular*.7);
    return angular/32*projection/nearest;
  };
  while(leaves.length+3<=budget) {
    let best=-1, error=threshold;
    for(let i=0;i<leaves.length;i++) { const p=leaves[i]; let s=scores.get(p); if(s===undefined) {s=score(p); scores.set(p,s);} if(s>error) {best=i;error=s;} }
    if(best<0) break;
    leaves.splice(best,1,...splitPatch(leaves[best]));
  }
  return leaves;
}
