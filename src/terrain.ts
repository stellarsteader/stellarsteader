import * as THREE from 'three/webgpu';
import { TerrainHeights, type TerrainBody } from './terrain-data';
import type { PatchBuffers, PatchChange, PatchReference, TerrainRequest, TerrainResponse, TerrainQuality } from './terrain-protocol';
export { terrainGeometry } from './terrain-geometry';

type PatchMesh = PatchReference & { mesh: THREE.Mesh; morphStart: number };
const MORPH_MS = 200;
const UPLOAD_PATCHES_PER_FRAME = 4;

export class PlanetTerrain {
  readonly root = new THREE.Group();
  field?: TerrainHeights;
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private worker?: Worker;
  private entries = new Map<number, PatchMesh>();
  private queue: PatchChange[] = [];
  private response?: Extract<TerrainResponse, { type: 'update' }>;
  private pending = false;
  private requestId = 0;
  private lastSelection = -Infinity;
  private lastCamera = new THREE.Vector3(Infinity, 0, 0);
  private lastSettings = '';
  private needsSelection = true;
  private disposed = false;
  private empty = new THREE.BufferGeometry();
  private localCamera = new THREE.Vector3();
  private initialResolve?: () => void;
  private initialReject?: (error: Error) => void;
  readonly stats = { workerMs: 0, cacheHits: 0, uploadedPatches: 0, reusedPatches: 0, jobs: 0 };

  constructor(readonly body: TerrainBody, private surface: THREE.Mesh) {
    surface.add(this.root);
    this.empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    this.empty.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    this.empty.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
    this.empty.setDrawRange(0, 0);
    this.empty.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    surface.geometry = this.empty;
    this.root.userData.terrain = body;
    this.root.userData.stats = this.stats;
  }

  private send(message: TerrainRequest) { this.worker!.postMessage(message); }

  init() {
    this.status = 'loading';
    return new Promise<void>((resolve, reject) => {
      this.initialResolve = resolve; this.initialReject = reject;
      this.worker = new Worker(new URL('./terrain-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<TerrainResponse>) => {
        if (this.disposed) return;
        if (data.type === 'error') { this.fail(data.message); return; }
        if (data.type === 'ready') {
          this.field = new TerrainHeights(this.body, data.base);
          for (const patch of data.patches) this.attach(patch, -Infinity);
          this.status = 'ready'; this.initialResolve?.(); this.initialResolve = undefined; this.initialReject = undefined;
        } else if (data.type === 'tile') {
          this.field!.tiles.set(data.key, data.data); this.field!.revision = data.revision;
          this.needsSelection = true;
        } else if (data.id === this.requestId) {
          this.pending = false;
          this.stats.workerMs = data.workerMs; this.stats.cacheHits += data.cacheHits; this.stats.jobs++;
          this.queue = data.changes; this.response = data;
        }
      };
      this.worker.onerror = event => this.fail(event.message);
      this.send({ type: 'init', body: this.body });
    });
  }

  private fail(message: string) {
    this.pending = false; this.queue = []; this.status = 'error';
    this.root.userData.refining = false; this.root.userData.error = message;
    this.initialReject?.(new Error(message)); this.initialReject = undefined;
    console.error(`Terrain worker (${this.body}): ${message}`);
  }

  private attach(patch: PatchBuffers, now: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(patch.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(patch.normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(patch.uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(patch.index, 1));
    // All patches, including startup roots, share the same GPU morph layout.
    // compileAsync at startup therefore warms the actual terrain shader variant.
    geometry.morphAttributes.position = [new THREE.BufferAttribute(patch.targetPosition, 3)];
    geometry.morphAttributes.normal = [new THREE.BufferAttribute(patch.targetNormal, 3)];
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(...patch.center), patch.radius);
    const mesh = new THREE.Mesh(geometry, this.surface.material);
    mesh.userData.body = this.body; mesh.userData.patch = patch.patch; mesh.morphTargetInfluences![0] = now === -Infinity ? 1 : 0;
    this.entries.set(patch.id, { id: patch.id, patch: patch.patch, key: patch.key, mesh, morphStart: now });
    this.root.add(mesh); this.stats.uploadedPatches++;
  }

  update(active: boolean, camera: THREE.PerspectiveCamera, pixelHeight: number, quality: TerrainQuality, relief: boolean, detail: boolean, uploadBudget = UPLOAD_PATCHES_PER_FRAME) {
    if (!active || !this.field || this.disposed || this.status !== 'ready') return;
    const now = performance.now();
    const local = this.surface.worldToLocal(this.localCamera.copy(camera.position));
    let morphing = false;
    for (const entry of this.entries.values()) {
      const t = Math.min(1, (now - entry.morphStart) / MORPH_MS);
      entry.mesh.morphTargetInfluences![0] = t * t * (3 - 2 * t);
      if (t < 1) morphing = true;
    }
    // Drop stale uncommitted work on large moves/settings changes. Already
    // visible patches remain intact, and the next request uses those exact IDs.
    const settings = `${pixelHeight}/${camera.fov}/${quality}/${relief}/${detail}`;
    const movedFar = local.distanceTo(this.lastCamera) > Math.max(.08, local.length() * .12);
    if (this.queue.length && (settings !== this.lastSettings || movedFar)) {
      this.queue = []; this.response = undefined; this.needsSelection = true;
    }
    let uploaded = 0;
    for (let i = 0; i < this.queue.length;) {
      const change = this.queue[i];
      if (uploaded + change.add.length > uploadBudget) break;
      // Worker sampled the old patches at their endpoints. Wait only for this
      // local transaction, never block refinement elsewhere on the globe.
      if (change.remove.some(id => now - this.entries.get(id)!.morphStart < MORPH_MS)) { i++; continue; }
      for (const id of change.remove) {
        const entry = this.entries.get(id)!;
        this.root.remove(entry.mesh); entry.mesh.geometry.dispose(); this.entries.delete(id);
      }
      for (const patch of change.add) this.attach(patch, now);
      uploaded += change.add.length; this.queue.splice(i, 1); morphing = true;
    }
    if (!this.queue.length && this.response) {
      this.needsSelection ||= this.response.more || this.response.revision !== this.field.revision;
      this.root.userData.revision = this.response.revision; this.root.userData.relief = this.response.relief;
      this.stats.reusedPatches += this.entries.size - uploaded;
      this.response = undefined;
    }
    this.root.userData.refining = this.pending || this.queue.length > 0 || morphing || this.needsSelection;
    if (this.pending || this.queue.length || now - this.lastSelection < 120) return;
    const moved = local.distanceToSquared(this.lastCamera) > 1e-8;
    // Revisit tile requests periodically for completion/retry even at rest.
    if (!this.needsSelection && !moved && settings === this.lastSettings && (!detail || now - this.lastSelection < 1000)) return;
    this.needsSelection = false; this.pending = true; this.root.userData.refining = true; this.lastSelection = now;
    this.lastCamera.copy(local); this.lastSettings = settings;
    this.send({ type: 'update', id: ++this.requestId, camera: local.toArray(), pixelHeight, fov: camera.fov, quality, relief, detail,
      entries: [...this.entries.values()].map(({ id, patch, key }) => ({ id, patch, key })) });
  }

  dispose() {
    this.disposed = true; this.worker?.terminate(); this.root.removeFromParent();
    this.entries.forEach(entry => entry.mesh.geometry.dispose()); this.entries.clear();
    this.queue = []; this.response = undefined; this.empty.dispose();
    this.field?.tiles.clear(); this.field = undefined;
    this.initialReject?.(new Error('Terrain disposed')); this.initialReject = undefined;
  }
}
