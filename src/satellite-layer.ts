import * as THREE from 'three/webgpu';
import { OrbitLine } from './orbit-line';
import { bodies, type BodyId } from './astronomy';
import { satellitePath, satellitePosition, type Satellite } from './satellites';
import { EarthSatelliteCloud } from './earth-satellite-cloud';
import type { OrbitFilter } from './satellite-orbits';
import { OrbitSatelliteModel } from './orbit-satellite-model';

export class SatelliteLayer {
  readonly root = new THREE.Group();
  items: Satellite[] = [];
  private selection = '';
  earth?: EarthSatelliteCloud;
  private body: BodyId = 'mars';
  private appearance = new OrbitSatelliteModel();
  get selected() { return this.body === 'earth' ? this.earth?.selected ?? '' : this.selection; }
  set selected(value: string) { if (this.body === 'earth' && this.earth) this.earth.selected = value; else this.selection = value; }
  onSelect?: (id: string) => void;
  private entries = new Map<string, { marker: THREE.Mesh; line: OrbitLine; satellite: Satellite }>();
  private pathEpoch = NaN;
  private pathWallTime = -Infinity;
  private markerGeometry = new THREE.OctahedronGeometry(0.024);
  private moonGeometry = new THREE.SphereGeometry(0.028, 16, 12);

  constructor() { this.root.visible = false; }

  setBody(body: BodyId, catalog: Satellite[], parent: THREE.Group) {
    this.clear();
    this.body = body;
    this.items = catalog.filter(s => s.parent === body);
    this.root.removeFromParent(); parent.add(this.root);
    this.root.add(this.appearance.root);
    if (this.earth) this.earth.root.removeFromParent();
    if (body === 'earth') {
      this.earth ??= new EarthSatelliteCloud();
      if (this.earth.items[0] !== this.items[0] || this.earth.items.length !== this.items.length) this.earth.setItems(this.items);
      this.root.add(this.earth.root);
      return;
    }
    this.items.forEach(satellite => {
      const marker = new THREE.Mesh(satellite.kind === 'natural' ? this.moonGeometry : this.markerGeometry,
        new THREE.MeshBasicMaterial({ color: satellite.color }));
      marker.userData.satellite = satellite.id;
      const line = new OrbitLine(satellite.color);
      line.frustumCulled = false;
      this.root.add(marker, line); this.entries.set(satellite.id, { marker, line, satellite });
    });
    this.selected = this.items[0]?.id ?? '';
    this.pathEpoch = NaN;
  }

  select(id: string) {
    if (this.body === 'earth') { this.earth?.select(id); return; }
    if (this.entries.has(id)) { this.selected = id; this.pathEpoch = NaN; }
  }
  setEarthFilter(filter: OrbitFilter) { this.earth?.applyFilter(filter); }

  update(date: Date, presentation: THREE.Quaternion, rate = 1, camera?: THREE.Camera, height = 900) {
    if (!this.root.visible) return;
    this.root.quaternion.copy(presentation);
    this.root.updateWorldMatrix(true, true);
    this.appearance.update(this.items.find(s => s.id === this.selected), date, camera, height);
    if (this.body === 'earth') {
      if (this.earth) this.earth.hideSelectedMarker = this.appearance.root.visible;
      this.root.updateWorldMatrix(true, true);
      if (camera) this.earth?.update(date, rate, camera, height);
      return;
    }
    const rebuild = !Number.isFinite(this.pathEpoch) || (Math.abs(date.getTime() - this.pathEpoch) > 30000 && performance.now() - this.pathWallTime > 1500);
    if (rebuild) { this.pathEpoch = date.getTime(); this.pathWallTime = performance.now(); }
    this.entries.forEach(({ marker, line, satellite }) => {
      const position = satellitePosition(satellite, date);
      marker.visible = position !== null; line.visible = position !== null;
      (marker.material as THREE.Material).visible = !(satellite.id === this.selected && this.appearance.root.visible);
      if (!position) return;
      marker.position.copy(position).divideScalar(bodies[satellite.parent].radius);
      marker.scale.setScalar(satellite.id === this.selected ? 1.5 : 0.85);
      line.setSelected(satellite.id === this.selected);
      if (rebuild) {
        const points = satellitePath(satellite, date).map(p => p.divideScalar(bodies[satellite.parent].radius));
        line.setPoints(points);
      }
    });
  }

  extent(date: Date, filtered = false) {
    if (this.body === 'earth') return this.earth?.extent(date, filtered) ?? 1.6;
    const selected = this.items.find(s => s.id === this.selected);
    if (!selected) return 1.6;
    const points = satellitePath(selected, date, 64);
    return Math.max(1.3, ...points.map(p => p.length() / bodies[selected.parent].radius));
  }

  labels(camera: THREE.Camera, width: number, height: number) {
    if (this.body === 'earth') return this.earth?.labels(camera, width, height) ?? [];
    const center = this.root.getWorldPosition(new THREE.Vector3());
    const radius = this.root.parent!.scale.x;
    return [...this.entries].map(([id, { marker }]) => {
      const world = marker.getWorldPosition(new THREE.Vector3());
      const ray = new THREE.Ray(camera.position, world.clone().sub(camera.position).normalize());
      const intersection = ray.intersectSphere(new THREE.Sphere(center, radius), new THREE.Vector3());
      const occluded = intersection !== null && intersection.distanceTo(camera.position) < world.distanceTo(camera.position) - 0.01;
      const point = world.project(camera);
      return { id, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2,
        visible: marker.visible && !occluded && point.z > -1 && point.z < 1 && Math.abs(point.x) < 0.95 && Math.abs(point.y) < 0.85 };
    });
  }

  hit(raycaster: THREE.Raycaster) {
    const modelHit = this.appearance.hit(raycaster);
    if (modelHit) {
      const center = this.root.getWorldPosition(new THREE.Vector3());
      const surface = raycaster.ray.intersectSphere(new THREE.Sphere(center, this.root.parent!.scale.x), new THREE.Vector3());
      if (!surface || surface.distanceTo(raycaster.ray.origin) >= modelHit.distance) return modelHit.id;
    }
    if (this.body === 'earth') return this.earth?.hit(raycaster);
    const hits = raycaster.intersectObjects([...this.entries.values()].map(entry => entry.marker).filter(marker => marker.visible), false);
    if (!hits[0]) return undefined;
    const center = this.root.getWorldPosition(new THREE.Vector3());
    const intersection = raycaster.ray.intersectSphere(new THREE.Sphere(center, this.root.parent!.scale.x), new THREE.Vector3());
    if (intersection && intersection.distanceTo(raycaster.ray.origin) < hits[0].distance) return undefined;
    return hits[0].object.userData.satellite as string;
  }
  private clear() {
    this.entries.forEach(({ marker, line }) => { (marker.material as THREE.Material).dispose(); line.dispose(); });
    this.root.clear(); this.entries.clear();
  }
  dispose() { this.appearance.dispose(); this.earth?.dispose(); this.clear(); this.root.removeFromParent(); this.markerGeometry.dispose(); this.moonGeometry.dispose(); }
}
