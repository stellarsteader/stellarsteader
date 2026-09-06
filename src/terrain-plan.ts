import { patchKey, splitPatch, type TerrainPatch } from './terrain-data';

export function containsPatch(outer: TerrainPatch, inner: TerrainPatch) {
  return inner.u >= outer.u && inner.v >= outer.v && inner.u + inner.width <= outer.u + outer.width && inner.v + inner.height <= outer.v + outer.height;
}

// At most four new meshes per transaction. Every intermediate plan covers the
// whole globe; a distant parent is never replaced by hundreds of uploads at once.
export function nextTerrainPatches(current: TerrainPatch[], desired: TerrainPatch[]) {
  const next = new Map<string, TerrainPatch>();
  for (const patch of current) {
    const ancestor = desired.find(target => containsPatch(target, patch));
    if (ancestor) next.set(patchKey(ancestor), ancestor);
    else for (const child of splitPatch(patch)) next.set(patchKey(child), child);
  }
  return [...next.values()];
}

// Tile availability changes the narrow blend along neighboring tile boundaries.
// Include that neighborhood (and the finite-difference normal footprint), but
// exclude unrelated tiles so a download cannot invalidate the entire globe.
export function patchDataKey(patch: TerrainPatch, keys: Iterable<string>, relief: boolean) {
  if (!relief) return `${patchKey(patch)}/sphere`;
  const relevant: string[] = [];
  const margin = 1 / 8192;
  for (const key of keys) {
    const [x, y] = key.split('-').map(Number);
    if ((y + 2) / 4 + margin < patch.v || (y - 1) / 4 - margin > patch.v + patch.height) continue;
    if ([-1, 0, 1].some(wrap => (x + 2) / 8 + wrap + margin >= patch.u && (x - 1) / 8 + wrap - margin <= patch.u + patch.width)) relevant.push(key);
  }
  return `${patchKey(patch)}/${relevant.sort().join(',')}`;
}
