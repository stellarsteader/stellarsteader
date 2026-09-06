import * as THREE from 'three/webgpu';
import { OrbitLine } from './orbit-line';
import { satellitePath, type Satellite } from './satellites';
import { matchesOrbit, orbitMetrics, type OrbitFilter } from './satellite-orbits';
import { bodies } from './astronomy';

type Batch = { generation: number; time: number; span: number; from: Float32Array; to: Float32Array };
export class EarthSatelliteCloud {
  readonly root = new THREE.Group();
  items: Satellite[] = [];
  selected = '';
  filter: OrbitFilter = 'all';
  renderedCount = 0;
  sampleTime = NaN;
  error = '';
  hideSelectedMarker = false;
  private worker = new Worker(new URL('./earth-satellite-worker.ts', import.meta.url), { type: 'module' });
  private generation = 0;
  private pending = false;
  private requestedAt = -Infinity;
  private batch?: Batch;
  private mesh?: THREE.InstancedMesh;
  private geometry = new THREE.OctahedronGeometry(1);
  private material = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private line = new OrbitLine('#ffffff', true);
  private positions = new Float32Array();
  private shown = new Uint8Array();
  private eligible = new Uint8Array();
  private epochs = new Float64Array();
  private matrix = new THREE.Matrix4();
  private point = new THREE.Vector3();
  private pathTime = NaN;
  private pathWall = -Infinity;
  private requestTime = NaN;
  constructor() {
    this.line.visible = false;
    this.root.add(this.line); this.line.frustumCulled = false;
    this.worker.onmessage = ({ data }: MessageEvent<Batch>) => {
      if (data.generation !== this.generation) return;
      this.batch = data; this.pending = false;
    };
    this.worker.onerror = () => { this.error = 'Satellite calculation worker failed. Reload the page to retry.'; this.pending = false; };
  }
  setItems(items: Satellite[]) {
    this.items = items; this.selected = items.find(s => s.id === 'iss')?.id ?? items[0]?.id ?? '';
    this.batch = undefined; this.pending = false; this.generation++; this.requestedAt = -Infinity;
    if (this.mesh) { this.root.remove(this.mesh); this.mesh.dispose(); }
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, items.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.positions = new Float32Array(items.length * 3); this.shown = new Uint8Array(items.length);
    this.eligible = new Uint8Array(items.length);
    this.epochs = Float64Array.from(items, s => Date.parse(s.epoch!));
    items.forEach((s, i) => { this.mesh!.setColorAt(i, new THREE.Color(s.color)); this.mesh!.setMatrixAt(i, this.matrix.makeScale(0,0,0)); });
    this.root.add(this.mesh); this.applyFilter(this.filter);
    this.worker.postMessage({ type: 'catalog', generation: this.generation, items });
  }
  applyFilter(filter: OrbitFilter) {
    this.filter = filter;
    this.items.forEach((s,i) => { this.eligible[i] = Number(matchesOrbit(s,filter)); });
    if (!this.items.some((s,i) => this.eligible[i] && s.id === this.selected)) this.selected = '';
    this.pathTime = NaN;
  }
  select(id: string) {
    if (this.items.some((s,i) => s.id === id && this.eligible[i])) { this.selected = id; this.pathTime = NaN; }
  }
  update(date: Date, rate: number, camera: THREE.Camera, viewportHeight: number) {
    if (!this.mesh) return;
    const time = date.getTime(), wall = performance.now();
    if (!this.pending && !this.error && time !== this.requestTime && (wall - this.requestedAt > 350 || Math.abs(time - this.requestTime) > Math.max(1000, Math.abs(rate) * 1500))) {
      // Adjacent samples enable smooth motion. At accelerated playback the window
      // grows, capped at one minute; it never extends the underlying ±7-day guard.
      this.pending = true; this.requestedAt = wall; this.requestTime = time;
      this.worker.postMessage({ type: 'sample', generation: this.generation, time, span: Math.min(60000, Math.max(1000, Math.abs(rate) * 1000)) });
    }
    const batch = this.batch;
    // Large clock jumps discard old positions immediately. At very fast playback
    // show the latest calculated sample while the next worker batch is in flight.
    const valid = batch && Math.abs(time - batch.time) <= Math.max(2000, Math.abs(rate) * 2000);
    const t = batch ? THREE.MathUtils.clamp((time - batch.time) / batch.span, 0, 1) : 0;
    this.sampleTime = valid && batch ? batch.time + batch.span * t : NaN;
    const cameraLocal = this.root.worldToLocal(camera.position.clone());
    this.renderedCount = 0;
    for (let i = 0; i < this.items.length; i++) {
      const j = i * 3;
      const epoch = this.epochs[i];
      const show = this.eligible[i] && valid && Math.abs(time - epoch) <= 7 * 86400000 && Number.isFinite(batch.from[j]);
      this.shown[i] = Number(!!show);
      if (show) {
        const mix = Number.isFinite(batch.to[j]) ? t : 0;
        this.point.set(batch.from[j] + (mix ? (batch.to[j] - batch.from[j]) * mix : 0),
          batch.from[j+1] + (mix ? (batch.to[j+1] - batch.from[j+1]) * mix : 0), batch.from[j+2] + (mix ? (batch.to[j+2] - batch.from[j+2]) * mix : 0));
        this.point.toArray(this.positions, j);
        const size = Math.max(0.0025, this.point.distanceTo(cameraLocal) * 0.65 / viewportHeight) * (this.items[i].id === this.selected ? 2.7 : 1);
        const displayedSize = this.hideSelectedMarker && this.items[i].id === this.selected ? 0 : size;
        this.matrix.makeScale(displayedSize,displayedSize,displayedSize).setPosition(this.point); this.renderedCount++;
      } else this.matrix.makeScale(0,0,0);
      this.mesh.setMatrixAt(i,this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // InstancedMesh raycasting caches its sphere; orbital motion changes it.
    this.mesh.boundingSphere = null;
    const selected = this.items.find(s => s.id === this.selected);
    this.line.visible = !!selected && !!this.shown[this.items.indexOf(selected)];
    if (selected && (!Number.isFinite(this.pathTime) || (Math.abs(time-this.pathTime)>30000 && wall-this.pathWall>1500))) {
      this.pathTime=time; this.pathWall=wall;
      const points=satellitePath(selected,date).map(p=>p.divideScalar(bodies.earth.radius));
      this.line.setPoints(points);
      this.line.visible = this.line.visible && !!this.shown[this.items.indexOf(selected)];
    }
  }
  extent(date: Date, filtered = false) {
    const selected = !filtered && this.items.find(s=>s.id===this.selected);
    if (selected) return Math.max(1.3, ...satellitePath(selected,date,64).map(p=>p.length()/bodies.earth.radius));
    const radii = this.items.filter((_,i)=>this.eligible[i]).map(s=>(orbitMetrics(s).apogee+bodies.earth.radius)/bodies.earth.radius).filter(Number.isFinite).sort((a,b)=>a-b);
    // All-orbits view opens close enough to see LEO; the user can zoom out to GEO.
    if (this.filter==='all') return 1.6;
    return Math.max(1.3, Math.min(70,radii[Math.floor(radii.length*0.98)] ?? 1.6));
  }
  selectedWorldPosition(target = new THREE.Vector3()) {
    const index = this.items.findIndex(s => s.id === this.selected);
    if (index < 0 || !this.shown[index]) return null;
    return this.root.localToWorld(target.fromArray(this.positions, index * 3));
  }
  labels(camera: THREE.Camera,width: number,height: number) {
    const index=this.items.findIndex(s=>s.id===this.selected);
    if(index<0) return [];
    const world=new THREE.Vector3().fromArray(this.positions,index*3).applyMatrix4(this.root.matrixWorld);
    const center=this.root.getWorldPosition(new THREE.Vector3()), radius=this.root.getWorldScale(new THREE.Vector3()).x;
    const ray=new THREE.Ray(camera.position,world.clone().sub(camera.position).normalize());
    const hit=ray.intersectSphere(new THREE.Sphere(center,radius),new THREE.Vector3());
    const hidden=hit && hit.distanceTo(camera.position)<world.distanceTo(camera.position)-0.001;
    const p=world.project(camera);
    return [{id:this.selected,x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:!!this.shown[index]&&!hidden&&p.z>-1&&p.z<1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.85}];
  }
  hit(raycaster: THREE.Raycaster) {
    if(!this.mesh) return;
    const hit=raycaster.intersectObject(this.mesh,false).find(hit => hit.instanceId !== undefined && this.shown[hit.instanceId]);
    if(hit?.instanceId===undefined||!this.shown[hit.instanceId]) return;
    const center=this.root.getWorldPosition(new THREE.Vector3()), radius=this.root.getWorldScale(new THREE.Vector3()).x;
    const sphereHit=raycaster.ray.intersectSphere(new THREE.Sphere(center,radius),new THREE.Vector3());
    if(sphereHit&&sphereHit.distanceTo(raycaster.ray.origin)<hit.distance) return;
    return this.items[hit.instanceId].id;
  }
  dispose() { this.worker.terminate(); this.mesh?.dispose(); this.geometry.dispose(); this.material.dispose(); this.line.dispose(); this.root.removeFromParent(); }
}
