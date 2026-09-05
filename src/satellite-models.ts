import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import sources from '../scripts/satellite-model-sources.json';

export const satelliteModels = new Map(sources.map(source => [source.id, { ...source, path: `/models/${source.id}.glb` }]));
export type SatelliteModelAsset = NonNullable<ReturnType<typeof satelliteModels.get>>;
const decoder = new DRACOLoader().setDecoderPath('/vendor/draco/').setWorkerLimit(2);
const loader = new GLTFLoader().setDRACOLoader(decoder);
const cache = new Map<string, Promise<THREE.Group>>();
const loaded = new Set<THREE.Group>();
let disposed = false;
export function disposeObjectResources(root: THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
  root.traverse(object=> {
    const mesh=object as THREE.Mesh;
    if(mesh.geometry) geometries.add(mesh.geometry);
    if(mesh.material) (Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));
  });
  for(const material of materials) {
    for(const value of Object.values(material)) if(value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  geometries.forEach(g=>g.dispose()); textures.forEach(t=>t.dispose());
}
export function normalizeModel(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model), sphere=bounds.getBoundingSphere(new THREE.Sphere());
  if(!Number.isFinite(sphere.radius)||sphere.radius<=0) throw new Error('Model has invalid bounds');
  const center=new THREE.Group(); center.add(model); model.position.sub(sphere.center);
  const normalized=new THREE.Group(); normalized.add(center); center.scale.setScalar(1/sphere.radius);
  return normalized;
}
export async function loadSatelliteModel(id: string): Promise<THREE.Group> {
  const asset=satelliteModels.get(id);
  if(!asset) throw new Error('No verified model for this object');
  if(!cache.has(id)) {
    cache.set(id,loader.loadAsync(asset.path).then(gltf=> {
      const root=normalizeModel(gltf.scene);
      // These assets are static appearance references; embedded cameras/lights do
      // not control either the orbit scene or our inspection lighting.
      const remove: THREE.Object3D[]=[];
      root.traverse(o=> { if((o as THREE.Light).isLight||(o as THREE.Camera).isCamera) remove.push(o); });
      remove.forEach(o=>o.removeFromParent());
      if(disposed) { disposeObjectResources(root); throw new Error('Model loader disposed'); }
      loaded.add(root); return root;
    }).catch(error=> { cache.delete(id); throw error; }));
  }
  return (await cache.get(id)!).clone(true);
}
export function disposeSatelliteModels() { disposed=true; decoder.dispose(); loaded.forEach(disposeObjectResources); loaded.clear(); cache.clear(); }
