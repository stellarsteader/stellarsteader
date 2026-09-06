import { Vector3, type BufferGeometry } from 'three';
import { TerrainHeights, terrainPatches, patchKey, wrap, clamp, type TerrainPatch } from './terrain-data';
import { terrainGeometry } from './terrain-geometry';
import { morphFromSurface, type TerrainSurface } from './terrain-morph';
import { containsPatch, nextTerrainPatches, patchDataKey } from './terrain-plan';
import type { TerrainRequest, TerrainResponse, PatchBuffers, PatchChange } from './terrain-protocol';

let field: TerrainHeights;
let nextId = 0;
const surfaces = new Map<number, TerrainSurface>();
const cache = new Map<string, BufferGeometry>();
const pending = new Set<string>();
const retryAt = new Map<string, number>();
const send = (message: TerrainResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

async function loadGrid(url: string, samples: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Terrain HTTP ${response.status}`);
  const compressed = await response.arrayBuffer();
  const bytes = new Uint8Array(compressed);
  const buffer = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : compressed;
  if (buffer.byteLength !== samples * 2) throw new Error('Invalid terrain grid length');
  const data = new Int16Array(samples), view = new DataView(buffer);
  for (let i = 0; i < samples; i++) data[i] = view.getInt16(i * 2, true) + (i % 1025 === 0 ? 0 : data[i - 1]);
  return data;
}

function packet(patch: TerrainPatch, key: string, geometry: BufferGeometry): PatchBuffers {
  const id = ++nextId;
  surfaces.set(id, { patch, geometry, influence: 1 });
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const targetPosition = geometry.morphAttributes.position?.[0] ?? position;
  const targetNormal = geometry.morphAttributes.normal?.[0] ?? normal;
  // Worker retains transition sources; only owned copies cross the boundary.
  return { id, patch, key,
    position: new Float32Array(position.array), normal: new Float32Array(normal.array),
    uv: new Float32Array(geometry.getAttribute('uv').array), index: new Uint16Array(geometry.index!.array),
    targetPosition: new Float32Array(targetPosition.array), targetNormal: new Float32Array(targetNormal.array),
    center: geometry.boundingSphere!.center.toArray(), radius: geometry.boundingSphere!.radius,
  };
}
function transfers(patches: PatchBuffers[]) {
  return patches.flatMap(p => [p.position.buffer, p.normal.buffer, p.uv.buffer, p.index.buffer, p.targetPosition.buffer, p.targetNormal.buffer]) as ArrayBuffer[];
}
function requestTiles(camera: Vector3) {
  if (camera.length() > 1.8) return;
  const u = wrap(Math.atan2(camera.z, -camera.x) / (2 * Math.PI)), v = Math.acos(clamp(camera.y / camera.length(), -1, 1)) / Math.PI;
  const tx = Math.min(7, Math.floor(u * 8)), ty = Math.min(3, Math.floor(v * 4));
  for (const [dx, dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const x = (tx + dx + 8) % 8, y = ty + dy, key = `${x}-${y}`;
    if (y < 0 || y > 3 || pending.size >= 3 || field.tiles.has(key) || pending.has(key) || (retryAt.get(key) ?? 0) > performance.now()) continue;
    pending.add(key);
    void loadGrid(`/terrain/${field.body}/${key}.bin.gz`, 1025 * 1025).then(data => {
      field.tiles.set(key, data); field.revision++;
      const copy = data.slice(); send({ type: 'tile', key, data: copy, revision: field.revision }, [copy.buffer]);
    }).catch(() => retryAt.set(key, performance.now() + 15000)).finally(() => pending.delete(key));
  }
}

self.onmessage = async ({ data }: MessageEvent<TerrainRequest>) => {
  try {
    if (data.type === 'init') {
      field = new TerrainHeights(data.body, await loadGrid(`/terrain/${data.body}/base.bin.gz`, 1025 * 513));
      const patches = terrainPatches(new Vector3(0, 0, 100), 1, 35, 'auto').map(patch => packet(patch, patchDataKey(patch, [], true), terrainGeometry(field, patch)));
      const base = field.base.slice(); send({ type: 'ready', base, patches }, [base.buffer, ...transfers(patches)]);
      return;
    }
    const started = performance.now(), camera = new Vector3(...data.camera);
    if (data.detail) requestTiles(camera);
    const active = new Set(data.entries.map(entry => entry.id));
    for (const [id, surface] of surfaces) if (!active.has(id)) { surface.geometry.dispose(); surfaces.delete(id); }
    const desired = terrainPatches(camera, data.pixelHeight, data.fov, data.quality);
    const patches = nextTerrainPatches(data.entries.map(entry => entry.patch), desired);
    const changes: PatchChange[] = [];
    let cacheHits = 0;
    const processed = new Set<string>();
    for (const patch of patches) {
      const key = patchDataKey(patch, field.tiles.keys(), data.relief);
      if (data.entries.some(entry => entry.key === key)) continue;
      const previous = data.entries.filter(entry => containsPatch(patch, entry.patch) || containsPatch(entry.patch, patch));
      const groupKey = previous.map(entry => entry.id).sort((a,b) => a-b).join(',');
      if (processed.has(groupKey)) continue;
      processed.add(groupKey);
      const targets = patches.filter(target => previous.some(entry => containsPatch(entry.patch, target) || containsPatch(target, entry.patch)));
      const sources = previous.map(entry => {
        const surface = surfaces.get(entry.id);
        if (!surface) throw new Error('Terrain source no longer available');
        return surface;
      });
      const add = targets.map(target => {
        const targetKey = patchDataKey(target, field.tiles.keys(), data.relief);
        let canonical = cache.get(targetKey);
        if (canonical) { cacheHits++; cache.delete(targetKey); }
        else canonical = terrainGeometry(field, target, data.relief);
        cache.set(targetKey, canonical);
        const geometry = canonical.clone();
        morphFromSurface(geometry, sources);
        return packet(target, targetKey, geometry);
      });
      changes.push({ remove: previous.map(entry => entry.id), add });
    }
    // Release distant children first so partial commits do not overshoot the
    // quality budget while refinements on the new side of the globe arrive.
    const distance = (change: PatchChange) => Math.min(...change.add.map(p => camera.distanceToSquared(new Vector3(...p.center))));
    changes.sort((a, b) => (a.add.length - a.remove.length) - (b.add.length - b.remove.length) || distance(a) - distance(b));
    while (cache.size > 640) { const key = cache.keys().next().value!; cache.get(key)!.dispose(); cache.delete(key); }
    const finalKeys = new Set(desired.map(patchKey));
    send({ type: 'update', id: data.id, changes, revision: field.revision, relief: data.relief,
      more: patches.length !== desired.length || patches.some(p => !finalKeys.has(patchKey(p))),
      workerMs: performance.now() - started, cacheHits }, transfers(changes.flatMap(change => change.add)));
  } catch (error) { send({ type: 'error', message: String(error), id: data.type === 'update' ? data.id : undefined }); }
};
