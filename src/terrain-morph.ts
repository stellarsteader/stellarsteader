import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { clamp, type TerrainPatch } from './terrain-data';

export type TerrainSurface = { patch: TerrainPatch; geometry: BufferGeometry; influence?: number };

// Sample the actual triangles of a rendered patch, not the elevation raster.
// Refining vertices start on the old surface, including its curvature and normals.
export function sampleTerrainSurface(surface: TerrainSurface, u: number, v: number, attribute: 'position'|'normal', out = new Vector3()) {
  const p = surface.patch;
  const x = clamp((u-p.u)/p.width)*32, y = clamp((v-p.v)/p.height)*32;
  const ix = Math.min(31,Math.floor(x)), iy = Math.min(31,Math.floor(y));
  const fx = x-ix, fy = y-iy, a = iy*33+ix;
  const indices = fx+fy <= 1 ? [a,a+1,a+33] : [a+1,a+33,a+34];
  const weights = fx+fy <= 1 ? [1-fx-fy,fx,fy] : [1-fy,1-fx,fx+fy-1];
  const base = surface.geometry.getAttribute(attribute);
  const target = surface.geometry.morphAttributes[attribute]?.[0];
  const influence = target ? surface.influence ?? 1 : 0;
  out.set(0,0,0);
  for(let i=0;i<3;i++) {
    const j=indices[i], w=weights[i];
    out.x += w*(base.getX(j)*(1-influence)+(target?.getX(j)??0)*influence);
    out.y += w*(base.getY(j)*(1-influence)+(target?.getY(j)??0)*influence);
    out.z += w*(base.getZ(j)*(1-influence)+(target?.getZ(j)??0)*influence);
  }
  return attribute === 'normal' ? out.normalize() : out;
}

export function morphFromSurface(geometry: BufferGeometry, previous: TerrainSurface[]) {
  const uv = geometry.getAttribute('uv');
  const initialPositions = new Float32Array(uv.count*3), initialNormals = new Float32Array(uv.count*3);
  const position = new Vector3(), normal = new Vector3();
  let owner: TerrainSurface | undefined;
  for(let i=0;i<uv.count;i++) {
    const u=uv.getX(i), v=1-uv.getY(i);
    const contains=(s:TerrainSurface)=>u>=s.patch.u-1e-8 && u<=s.patch.u+s.patch.width+1e-8 && v>=s.patch.v-1e-8 && v<=s.patch.v+s.patch.height+1e-8;
    if(!owner || !contains(owner)) owner=previous.find(contains);
    if(!owner) throw new Error('Terrain morph lost globe coverage');
    sampleTerrainSurface(owner,u,v,'position',position);
    sampleTerrainSurface(owner,u,v,'normal',normal);
    if(i>=33*33) position.addScaledVector(position.clone().normalize(),-.002);
    position.toArray(initialPositions,i*3);normal.toArray(initialNormals,i*3);
  }
  geometry.morphAttributes.position = [geometry.getAttribute('position')];
  geometry.morphAttributes.normal = [geometry.getAttribute('normal')];
  geometry.setAttribute('position',new BufferAttribute(initialPositions,3));
  geometry.setAttribute('normal',new BufferAttribute(initialNormals,3));
  geometry.computeBoundingSphere();
  // Culling must contain both transition endpoints, including refined peaks.
  const target = geometry.morphAttributes.position[0];
  for(let i=0;i<target.count;i++) {
    position.fromBufferAttribute(target as BufferAttribute,i);
    geometry.boundingSphere!.radius = Math.max(geometry.boundingSphere!.radius,position.distanceTo(geometry.boundingSphere!.center));
  }
}
