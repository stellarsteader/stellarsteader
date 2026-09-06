import type { TerrainBody, TerrainPatch } from './terrain-data';

export type TerrainQuality = 'auto' | 'high' | 'ultra';
export type PatchReference = { id: number; patch: TerrainPatch; key: string };
export type PatchBuffers = PatchReference & {
  position: Float32Array; normal: Float32Array; uv: Float32Array; index: Uint16Array;
  targetPosition: Float32Array; targetNormal: Float32Array;
  center: [number, number, number]; radius: number;
};
export type PatchChange = { remove: number[]; add: PatchBuffers[] };
export type TerrainRequest = { type: 'init'; body: TerrainBody } | {
  type: 'update'; id: number; camera: [number, number, number]; pixelHeight: number; fov: number;
  quality: TerrainQuality; relief: boolean; detail: boolean; entries: PatchReference[];
};
export type TerrainResponse = { type: 'ready'; base: Int16Array; patches: PatchBuffers[] } |
  { type: 'tile'; key: string; data: Int16Array; revision: number } |
  { type: 'update'; id: number; changes: PatchChange[]; revision: number; relief: boolean; more: boolean; workerMs: number; cacheHits: number } |
  { type: 'error'; message: string; id?: number };
