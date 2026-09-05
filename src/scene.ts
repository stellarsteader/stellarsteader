import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { planetMaterials, type PlanetTextures } from './materials';
import { bodies, physicalState, orbitPosition, type BodyId, type SceneClock } from './astronomy';
import { OrbitLine } from './orbit-line';
import { LUNAR_CONTEXT_SCALE, moonPositionInSolarView } from './orbit-layout';
import { SatelliteLayer } from './satellite-layer';
import { type Satellite } from './satellites';
import { SurfaceMap, surfacePoint, detailDistanceRatio, surfaceDragSpeed, type Place, type MapFrame } from './surface-map';

export type View = 'overview' | 'detail' | 'orbit' | 'satellites';
export type Quality = 'auto' | 'high' | 'ultra';
type Planet = {
  root: THREE.Group;
  surface: THREE.Mesh;
  atmosphere: THREE.Mesh;
  clouds?: THREE.Mesh;
  grid: THREE.Group;
  materials: ReturnType<typeof planetMaterials>;
  presentation: THREE.Quaternion;
  basePresentation: THREE.Quaternion;
  orientation: THREE.Quaternion;
  size: number;
};

const ids: BodyId[] = ['earth', 'moon', 'mars'];
const lightDirection = new THREE.Vector3(-0.65, 0.4, 0.9).normalize();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Observatory {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1000);
  readonly controls: OrbitControls;
  readonly planets = new Map<BodyId, Planet>();
  readonly surfaceMap = new SurfaceMap();
  placeCatalog: Place[] = [];
  onMapFrame?: (frame: MapFrame) => void;
  private placeFlight?: { start: number; direction: THREE.Vector3; rotation: THREE.Quaternion; center: THREE.Vector3; fromDistance: number; toDistance: number };
  readonly satellites = new SatelliteLayer();
  satelliteCatalog: Satellite[] = [];
  onSatelliteLabels?: (labels: { id: string; x: number; y: number; visible: boolean }[]) => void;
  onSatelliteSelect?: (id: string) => void;
  private orbitScene = new THREE.Scene();
  private orbitPaths = new THREE.Group();
  private lunarContextPath?: OrbitLine;
  private orbitMarkers = new Map<BodyId, THREE.Mesh>();
  private centralBody?: THREE.Mesh;
  private worker = new Worker(new URL('./orbit-worker.ts', import.meta.url), { type: 'module' });
  private requestId = 0;
  private lastOrbitEpoch = 0;
  private lastOrbitRequest = -Infinity;
  private lastGeometryUpdate = 0;
  private lastFrame = 0;
  private overviewAngle = 0;
  private interacting = false;
  private resumeRotationAt = 0;
  private sun = new THREE.DirectionalLight('#fff9ed', 3.0);
  private ambient = new THREE.AmbientLight('#a2b6ce', 0.075);
  private displaySun = lightDirection.clone();
  rotationEnabled = !reducedMotion;
  shadowsEnabled = true;
  private frameCount = 0;
  private frameAnchor = performance.now();
  private fps = 0;
  private ownedTextures: THREE.Texture[] = [];
  private transition?: { start: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 };
  private raycaster = new THREE.Raycaster();
  private pointerStart = new THREE.Vector2();
  private geometry = new THREE.SphereGeometry(1, 192, 96);
  private atmosphereGeometry = new THREE.SphereGeometry(1, 64, 40);
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private hidden = false;
  private autoPixelRatio = 1;
  private slowFrames = 0;
  view: View = 'overview';
  selected: BodyId = 'earth';
  quality: Quality = 'auto';
  atmosphereEnabled = true;
  cloudsEnabled = true;
  gridEnabled = false;
  followDawn = false;
  onSelect?: (body: BodyId) => void;
  onStats?: (stats: { fps: number; backend: string; triangles: number; resolution: string }) => void;
  onOrbitReady?: () => void;
  onLabels?: (labels: { id: string; x: number; y: number; visible: boolean }[]) => void;

  constructor(private host: HTMLElement, readonly clock: SceneClock) {
    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', forceWebGL: new URLSearchParams(location.search).get('renderer') === 'webgl' });
    this.renderer.setClearColor(0x06080b, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive Earth, Moon and Mars. Select a world using the buttons, or drag to explore a selected world.');
    this.host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.enabled = false;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.6;
    this.controls.addEventListener('start', () => { this.transition = undefined; this.placeFlight = undefined; this.host.dataset.camera = 'settled'; this.followDawn = false; this.interacting = true; });
    this.controls.addEventListener('end', () => { this.interacting = false; this.resumeRotationAt = performance.now() + 2500; });
    this.sun.position.copy(lightDirection).multiplyScalar(100);
    this.scene.add(this.sun, this.ambient);
    this.orbitScene.add(new THREE.AmbientLight('#ffffff', 2.1));
    this.orbitScene.add(this.orbitPaths);
    this.addStars(this.scene, 700);
    this.addStars(this.orbitScene, 500);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.worker.onmessage = ({ data }) => {
      if (data.id !== this.requestId || this.disposed) return;
      this.clearOrbitPaths();
      Object.entries(data.paths as Partial<Record<BodyId, number[][]>>).forEach(([id, points]) => {
        const line = new OrbitLine(bodies[id as BodyId].color, id === this.selected);
        line.setPoints(points!.map(p => new THREE.Vector3(...p as [number, number, number])));
        if (id === 'moon' && this.selected === 'earth') {
          line.scale.setScalar(LUNAR_CONTEXT_SCALE);
          line.position.set(...orbitPosition('earth', this.clock.now()));
          line.material.color.set('#ffffff').multiplyScalar(0.55);
          this.lunarContextPath = line;
        }
        this.orbitPaths.add(line);
      });
      this.onOrbitReady?.();
    };
  }

  async init(onProgress: (value: number, label: string) => void) {
    await this.renderer.init();
    const webgpu = (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const load = async (name: string, srgb = true) => {
      const map = await loader.loadAsync(`/textures/${name}`);
      map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.anisotropy = Math.min(8, this.renderer.getMaxAnisotropy());
      map.wrapS = THREE.RepeatWrapping;
      onProgress(++loaded / 6, 'Preparing planetary surfaces');
      return map;
    };
    const [earthDay, earthNight, earthPacked, moonDay, moonHeight, marsDay] = await Promise.all([
      load('earth-day.webp'), load('earth-night.webp'), load('earth-packed.webp', false),
      load('moon-day.webp'), load('moon-height.png', false), load('mars-day.webp'),
    ]);
    this.createPlanet('earth', { day: earthDay, night: earthNight, packed: earthPacked }, webgpu, 1.92);
    this.createPlanet('moon', { day: moonDay, height: moonHeight }, webgpu, 1.38);
    this.createPlanet('mars', { day: marsDay }, webgpu, 1.72);
    this.layout();
    this.updateGeometry();
    this.setView('overview', 'earth', false);
    this.resize();
    onProgress(1, 'Compiling light and atmosphere');
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.setAnimationLoop(this.animate);
  }

  private createPlanet(id: BodyId, maps: PlanetTextures, webgpu: boolean, size: number) {
    const materials = planetMaterials(id, maps, webgpu);
    const root = new THREE.Group();
    root.scale.setScalar(size);
    const surface = new THREE.Mesh(this.geometry, materials.material);
    surface.userData.body = id;
    root.add(surface);
    const atmosphere = new THREE.Mesh(this.atmosphereGeometry, materials.atmosphere);
    atmosphere.scale.setScalar(id === 'earth' ? 1.045 : 1.035);
    atmosphere.visible = id !== 'moon';
    atmosphere.renderOrder = 3;
    root.add(atmosphere);
    let clouds: THREE.Mesh | undefined;
    if (materials.clouds) {
      clouds = new THREE.Mesh(this.geometry, materials.clouds);
      clouds.scale.setScalar(1.006);
      clouds.renderOrder = 1;
      surface.add(clouds);
    }
    const grid = this.makeGrid();
    grid.visible = false;
    surface.add(grid);
    const state = physicalState(id, this.clock.now());
    const presentation = this.presentationFrame(state.sun, state.north);
    this.ownedTextures.push(...Object.values(maps).filter((map): map is THREE.Texture => map instanceof THREE.Texture));
    this.planets.set(id, { root, surface, atmosphere, clouds, grid, materials, presentation, basePresentation: presentation.clone(), orientation: state.orientation.clone(), size });
    this.scene.add(root);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ map: maps.day, color: '#ffffff' }));
    marker.scale.setScalar(id === 'earth' ? 0.14 : id === 'mars' ? 0.12 : 0.1);
    marker.userData.body = id;
    this.orbitMarkers.set(id, marker);
    this.orbitScene.add(marker);
  }

  private makeGrid() {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: '#d1e2da', transparent: true, opacity: 0.16, depthWrite: false });
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const a = THREE.MathUtils.degToRad(latitude);
      const points = Array.from({ length: 129 }, (_, i) => {
        const angle = i / 128 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * Math.cos(a), Math.sin(a), Math.sin(angle) * Math.cos(a)).multiplyScalar(1.009);
      });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    for (let longitude = 0; longitude < 180; longitude += 30) {
      const a = THREE.MathUtils.degToRad(longitude);
      const points = Array.from({ length: 129 }, (_, i) => {
        const angle = i / 128 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * Math.cos(a), Math.sin(angle), Math.cos(angle) * Math.sin(a)).multiplyScalar(1.009);
      });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    return group;
  }

  private addStars(scene: THREE.Scene, count: number) {
    let seed = 731;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const positions: number[] = [], colors: number[] = [];
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2, z = random() * 2 - 1, r = Math.sqrt(1 - z*z);
      positions.push(Math.cos(theta) * r * 150, z * 150, Math.sin(theta) * r * 150);
      const intensity = 0.12 + Math.pow(random(), 4) * 0.65;
      colors.push(intensity * 0.86, intensity * 0.92, intensity);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.065, vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false }));
    scene.add(stars);
  }

  private layout() {
    const mobile = this.host.clientWidth < 760;
    const positions = mobile
      ? { earth: [-1.8, 1.5, 0], moon: [2.0, 1.3, -0.5], mars: [0.4, -2.1, 0] }
      : { earth: [-4.8, 0.1, 0], moon: [0, 0.35, -0.55], mars: [4.5, -0.1, -0.25] };
    this.planets.forEach((p, id) => p.root.position.set(...positions[id] as [number, number, number]));
  }

  private presentationFrame(sun: THREE.Vector3, north: THREE.Vector3) {
    const frame = new THREE.Quaternion().setFromUnitVectors(sun, lightDirection);
    const projectedNorth = north.clone().applyQuaternion(frame).projectOnPlane(lightDirection).normalize();
    const projectedUp = new THREE.Vector3(0, 1, 0).projectOnPlane(lightDirection).normalize();
    const angle = Math.atan2(lightDirection.dot(new THREE.Vector3().crossVectors(projectedNorth, projectedUp)), projectedNorth.dot(projectedUp));
    return new THREE.Quaternion().setFromAxisAngle(lightDirection, angle).multiply(frame);
  }

  resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    this.autoPixelRatio = Math.min(devicePixelRatio, width < 760 ? 1.3 : 1.5);
    this.renderer.setPixelRatio(this.quality === 'ultra' ? Math.min(devicePixelRatio, 2) : this.quality === 'high' ? Math.min(devicePixelRatio, 1.6) : this.autoPixelRatio);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.layout();
    if (this.planets.size) this.setView(this.view, this.selected, false);
  }

  setView(view: View, selected: BodyId = this.selected, animate = true, filteredSatellites = false) {
    const previous = this.view;
    const previousBody = this.selected;
    this.placeFlight = undefined;
    this.view = view; this.selected = selected; this.followDawn = false;
    this.controls.autoRotate = false;
    this.controls.enabled = view !== 'overview';
    this.camera.clearViewOffset();
    this.camera.far = 1000;
    this.planets.forEach((p, id) => { p.root.visible = view === 'overview' || id === selected; });
    let target = new THREE.Vector3();
    let destination = new THREE.Vector3();
    const mobile = this.host.clientWidth < 760;
    this.satellites.root.visible = view === 'satellites';
    if (view === 'overview') {
      this.controls.minDistance = 0.1; this.controls.maxDistance = 100;
      const distance = mobile ? 23.5 / Math.min(1, this.camera.aspect * 1.65) : Math.max(16.5, 8.2 / this.camera.aspect / Math.tan(THREE.MathUtils.degToRad(17.5)));
      destination.set(0, 0.7, distance);
      target.set(0, 0.35, 0);
    } else if (view === 'detail') {
      const planet = this.planets.get(selected)!;
      target.copy(planet.root.position);
      destination.copy(target).add(new THREE.Vector3(0.15, 0.12, 1).normalize().multiplyScalar(planet.size * detailDistanceRatio(this.host.clientWidth, this.host.clientHeight)));
      this.controls.minDistance = planet.size * 1.08;
      this.controls.maxDistance = planet.size * 14;
      this.surfaceMap.setPlaces(this.placeCatalog.filter(place => place.body === selected));
    } else if (view === 'satellites') {
      const planet = this.planets.get(selected)!;
      if (previous !== 'satellites' || previousBody !== selected || this.satellites.items.length === 0) this.satellites.setBody(selected, this.satelliteCatalog, planet.root);
      this.satellites.root.visible = true;
      this.satellites.update(this.clock.now(), planet.presentation);
      target.copy(planet.root.position);
      const extent = this.satellites.extent(this.clock.now(), filteredSatellites) * planet.size;
      const desktopFit = Math.max(4.2, this.host.clientHeight / Math.max(260, this.host.clientWidth * .916 - 640) / Math.tan(THREE.MathUtils.degToRad(17.5)));
      destination.copy(target).add(new THREE.Vector3(0.15, 0.65, 1).normalize().multiplyScalar(extent * (mobile ? Math.max(10.5, 4 / this.camera.aspect) : desktopFit)));
      this.camera.far = Math.max(1000, destination.distanceTo(target) + extent * 3);
      if (mobile) this.camera.setViewOffset(this.host.clientWidth, this.host.clientHeight, 0, this.host.clientHeight * 0.19, this.host.clientWidth, this.host.clientHeight);
      if (!mobile) this.camera.setViewOffset(this.host.clientWidth, this.host.clientHeight, -this.host.clientWidth * 0.03, 0, this.host.clientWidth, this.host.clientHeight);
      this.controls.minDistance = planet.size * 1.65; this.controls.maxDistance = Math.max(100, extent * 10);
    } else {
      const orbitExtent = selected === 'moon' ? 4.2 : 6.8;
      const orbitDistance = Math.max(23, this.host.clientHeight * orbitExtent / Math.max(360, this.host.clientWidth * .916 - 360) / Math.tan(THREE.MathUtils.degToRad(17.5)));
      destination.copy(new THREE.Vector3(0, .53, .85).normalize().multiplyScalar(mobile ? 25 : orbitDistance));
      if (!mobile) this.camera.setViewOffset(this.host.clientWidth, this.host.clientHeight, this.host.clientWidth * .12, 0, this.host.clientWidth, this.host.clientHeight);
      else this.camera.setViewOffset(this.host.clientWidth, this.host.clientHeight, 0, this.host.clientHeight * .22, this.host.clientWidth, this.host.clientHeight);
      this.controls.minDistance = 3; this.controls.maxDistance = Math.max(45, destination.length() * 1.5);
      this.setupOrbit();
    }
    this.camera.updateProjectionMatrix();
    if (animate && !reducedMotion && previous !== 'orbit' && view !== 'orbit' && view !== 'satellites' && previous !== 'satellites') {
      this.transition = { start: performance.now(), duration: 1350, from: this.camera.position.clone(), to: destination, fromTarget: this.controls.target.clone(), toTarget: target };
    } else {
      this.transition = undefined; this.camera.position.copy(destination); this.controls.target.copy(target); this.camera.lookAt(target); this.controls.update();
    }
    this.host.dataset.camera = this.transition ? 'moving' : 'settled';
  }

  setPlaceCatalog(places: Place[]) {
    this.placeCatalog = places;
    this.surfaceMap.setPlaces(places.filter(place => place.body === this.selected));
  }
  setMapEnabled(enabled: boolean) { this.surfaceMap.enabled = enabled; this.surfaceMap.invalidate(); }
  focusPlace(place: Place) {
    if (this.view !== 'detail' || place.body !== this.selected) return;
    const planet = this.planets.get(this.selected)!;
    const direction = surfacePoint(place.latitude, place.longitude).applyQuaternion(planet.surface.quaternion);
    const from = this.camera.position.clone().sub(planet.root.position);
    const ratio = place.level === 0 ? 2.6 : place.level === 1 ? 1.9 : place.level === 2 ? 1.35 : 1.15;
    this.transition = undefined; this.followDawn = false;
    this.resumeRotationAt = performance.now() + 4500;
    this.surfaceMap.selected = place.id; this.surfaceMap.invalidate();
    this.placeFlight = { start: performance.now(), center: planet.root.position.clone(), direction: from.clone().normalize(),
      rotation: new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), direction), fromDistance: from.length(), toDistance: planet.size * ratio };
    this.host.dataset.camera = 'moving';
  }

  setSatelliteCatalog(catalog: Satellite[]) {
    this.satelliteCatalog = catalog;
    if (this.view === 'satellites') {
      this.satellites.setBody(this.selected, catalog, this.planets.get(this.selected)!.root);
      this.setView(this.view, this.selected, false);
    }
  }
  selectSatellite(id: string) {
    this.satellites.select(id);
    if (this.view === 'satellites') this.setView(this.view, this.selected, false);
  }

  private setupOrbit() {
    if (this.centralBody) {
      this.orbitScene.remove(this.centralBody);
      this.centralBody.geometry.dispose(); (this.centralBody.material as THREE.Material).dispose();
    }
    const moonView = this.selected === 'moon';
    const material = new THREE.MeshBasicMaterial(moonView ? { map: (this.orbitMarkers.get('earth')!.material as THREE.MeshBasicMaterial).map } : { color: '#ffe3ae' });
    this.centralBody = new THREE.Mesh(new THREE.SphereGeometry(moonView ? 0.24 : 0.16, 40, 24), material);
    this.orbitScene.add(this.centralBody);
    this.orbitMarkers.forEach((marker, id) => { marker.visible = moonView ? id === 'moon' : this.selected === 'earth' || id !== 'moon'; });
    this.orbitMarkers.get('moon')!.scale.setScalar(this.selected === 'earth' ? 0.065 : 0.1);
    this.updateGeometry();
    this.clearOrbitPaths();
    this.requestOrbit();
  }

  private requestOrbit() {
    this.lastOrbitEpoch = this.clock.now().getTime();
    this.lastOrbitRequest = performance.now();
    this.worker.postMessage({ id: ++this.requestId, body: this.selected, time: this.lastOrbitEpoch });
  }
  private clearOrbitPaths() {
    this.lunarContextPath = undefined;
    this.orbitPaths.children.forEach(child => (child as OrbitLine).dispose());
    this.orbitPaths.clear();
  }

  setQuality(quality: Quality) {
    this.quality = quality;
    const segments = quality === 'ultra' ? 320 : quality === 'high' ? 256 : 192;
    const old = this.geometry;
    this.geometry = new THREE.SphereGeometry(1, segments, segments / 2);
    this.planets.forEach(p => { p.surface.geometry = this.geometry; if (p.clouds) p.clouds.geometry = this.geometry; });
    old.dispose(); this.resize();
  }
  setLayer(layer: 'atmosphere' | 'clouds' | 'grid' | 'relief', enabled: boolean) {
    if (layer === 'atmosphere') this.atmosphereEnabled = enabled;
    if (layer === 'clouds') this.cloudsEnabled = enabled;
    if (layer === 'grid') this.gridEnabled = enabled;
    this.planets.forEach((p, id) => {
      if (layer === 'atmosphere') p.atmosphere.visible = enabled && id !== 'moon';
      if (layer === 'clouds' && p.clouds) p.clouds.visible = enabled;
      if (layer === 'grid') p.grid.visible = enabled;
      if (layer === 'relief') p.materials.relief.value = enabled ? 1 : 0;
    });
  }
  zoom(direction: number) {
    if (this.view === 'overview') return;
    this.transition = undefined;
    this.placeFlight = undefined;
    this.resumeRotationAt = performance.now() + 2500;
    this.host.dataset.camera = 'settled';
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(direction > 0 ? 0.82 : 1.22);
    offset.setLength(THREE.MathUtils.clamp(offset.length(), this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update();
  }
  followSunrise() {
    if (this.view !== 'detail') return;
    this.placeFlight = undefined;
    const p = this.planets.get(this.selected)!;
    const north = new THREE.Vector3(0, 1, 0).applyQuaternion(p.surface.quaternion);
    const tangent = new THREE.Vector3().crossVectors(this.displaySun, north).normalize();
    const direction = tangent.addScaledVector(this.displaySun, 0.16).normalize();
    this.transition = { start: performance.now(), duration: reducedMotion ? 0 : 1400, from: this.camera.position.clone(), to: p.root.position.clone().addScaledVector(direction, p.size * detailDistanceRatio(this.host.clientWidth, this.host.clientHeight)), fromTarget: this.controls.target.clone(), toTarget: p.root.position.clone() };
    this.followDawn = true; this.host.dataset.camera = 'moving';
  }

  private updateGeometry() {
    const date = this.clock.now();
    this.planets.forEach((planet, id) => {
      const state = physicalState(id, date);
      // Each composed body has its own presentation frame. Physical Sun/body geometry
      // is retained within it; translated display positions never drive illumination.
      planet.basePresentation.copy(this.presentationFrame(state.sun, state.north));
      planet.orientation.copy(state.orientation);
      planet.materials.radius.value = planet.size;
      if (planet.clouds) planet.materials.cloudOffset.value = reducedMotion ? 0 : ((date.getTime() / 86400000) % 1) * 0.006;
      const marker = this.orbitMarkers.get(id)!;
      marker.position.set(...(id === 'moon' && this.view === 'orbit' && this.selected === 'earth' ? moonPositionInSolarView(date) : orbitPosition(id, date)));
    });
    if (this.lunarContextPath) this.lunarContextPath.position.copy(this.orbitMarkers.get('earth')!.position);
    if (this.view === 'orbit' && Math.abs(date.getTime() - this.lastOrbitEpoch) > 300000 && performance.now() - this.lastOrbitRequest > 1000) this.requestOrbit();
  }

  setRotationEnabled(enabled: boolean) { this.rotationEnabled = enabled; this.controls.autoRotate = false; if (enabled) this.followDawn = false; }

  setShadowsEnabled(enabled: boolean) {
    this.shadowsEnabled = enabled;
    this.planets.forEach(p => { p.materials.unlit.value = enabled ? 0 : 1; });
    this.sun.intensity = enabled ? 3 : 0;
    this.ambient.color.set(enabled ? '#a2b6ce' : '#ffffff');
    this.ambient.intensity = enabled ? 0.075 : 3;
  }

  private updatePresentation() {
    // Rotate each composed world about its own center, with its Sun direction.
    // This changes the viewpoint, preserving the physical day/night relationship.
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.overviewAngle);
    this.displaySun.copy(lightDirection).applyQuaternion(turn);
    this.sun.position.copy(this.displaySun).multiplyScalar(100);
    this.planets.forEach(planet => {
      planet.presentation.copy(turn).multiply(planet.basePresentation);
      planet.surface.quaternion.copy(planet.presentation).multiply(planet.orientation);
      planet.materials.sunDirection.value.copy(this.displaySun);
    });
  }

  private animate = () => {
    if (this.disposed || this.hidden) return;
    const now = performance.now();
    const delta = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const rotating = this.rotationEnabled && !this.interacting && !this.transition && !this.placeFlight && !this.followDawn && now >= this.resumeRotationAt;
    if (this.view === 'overview' && rotating) this.overviewAngle = (this.overviewAngle + delta * Math.PI / 180) % (2 * Math.PI);
    if (now - this.lastGeometryUpdate > 100) { this.updateGeometry(); this.lastGeometryUpdate = now; }
    this.updatePresentation();
    if (this.transition) {
      const t = Math.min(1, (now - this.transition.start) / Math.max(1, this.transition.duration));
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      this.camera.position.lerpVectors(this.transition.from, this.transition.to, eased);
      this.controls.target.lerpVectors(this.transition.fromTarget, this.transition.toTarget, eased);
      this.camera.lookAt(this.controls.target);
      if (t === 1) { this.transition = undefined; this.host.dataset.camera = 'settled'; }
    }
    if (this.placeFlight) {
      const flight = this.placeFlight;
      const t = reducedMotion ? 1 : Math.min(1, (now - flight.start) / 1050), eased = t * t * (3 - 2 * t);
      const direction = flight.direction.clone().applyQuaternion(new THREE.Quaternion().slerp(flight.rotation, eased));
      this.camera.position.copy(flight.center).addScaledVector(direction, THREE.MathUtils.lerp(flight.fromDistance, flight.toDistance, eased));
      this.controls.target.copy(flight.center); this.camera.lookAt(flight.center);
      if (t === 1) { this.placeFlight = undefined; this.host.dataset.camera = 'settled'; }
    }
    this.controls.rotateSpeed = this.view === 'detail'
      ? surfaceDragSpeed(this.camera.position.distanceTo(this.controls.target) / this.planets.get(this.selected)!.size)
      : 0.45;
    this.controls.autoRotate = rotating && (this.view === 'detail' || this.view === 'satellites');
    this.controls.autoRotateSpeed = (1 / 6) * (this.view === 'detail' ? this.controls.rotateSpeed / 0.45 : 1);
    this.controls.update(delta);
    if (this.view === 'satellites') this.satellites.update(this.clock.now(), this.planets.get(this.selected)!.presentation, this.clock.rate, this.camera, this.host.clientHeight);
    this.renderer.render(this.view === 'orbit' ? this.orbitScene : this.scene, this.camera);
    if (this.view === 'detail' && this.surfaceMap.enabled) this.onMapFrame?.(this.surfaceMap.update(this.planets.get(this.selected)!.surface, this.camera, this.host.clientWidth, this.host.clientHeight, bodies[this.selected].radius));
    if (this.view === 'satellites') this.onSatelliteLabels?.(this.satellites.labels(this.camera, this.host.clientWidth, this.host.clientHeight));
    if (this.view === 'orbit') {
      const labels: { id: string; x: number; y: number; visible: boolean }[] = [...this.orbitMarkers].map(([id, marker]) => {
        const point = marker.position.clone().project(this.camera);
        return { id, x: (point.x + 1) * 0.5 * this.host.clientWidth, y: (1 - point.y) * 0.5 * this.host.clientHeight, visible: marker.visible && point.z < 1 };
      });
      if (this.selected === 'earth') {
        const earth = labels.find(label => label.id === 'earth')!;
        const moon = labels.find(label => label.id === 'moon')!;
        if (earth.visible && moon.visible && Math.abs(earth.x - moon.x) < 80 && Math.abs(earth.y - moon.y) < 24) moon.y = earth.y + 26;
      }
      const center = new THREE.Vector3().project(this.camera);
      labels.push({ id: 'center', x: (center.x + 1) * 0.5 * this.host.clientWidth, y: (1 - center.y) * 0.5 * this.host.clientHeight, visible: center.z < 1 });
      this.onLabels?.(labels);
    }
    this.frameCount++;
    if (now - this.frameAnchor > 1200) {
      this.fps = Math.round(this.frameCount / ((now - this.frameAnchor) / 1000));
      this.frameAnchor = now; this.frameCount = 0;
      if (this.quality === 'auto' && !this.transition) {
        this.slowFrames = this.fps < 42 ? this.slowFrames + 1 : 0;
        if (this.slowFrames >= 3 && this.autoPixelRatio > 0.8) {
          this.autoPixelRatio = Math.max(0.8, this.autoPixelRatio - 0.15);
          this.renderer.setPixelRatio(this.autoPixelRatio);
          this.slowFrames = 0;
        }
      }
      this.onStats?.({ fps: this.fps, backend: (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2', triangles: this.renderer.info.render.triangles, resolution: `${this.renderer.domElement.width} × ${this.renderer.domElement.height}` });
    }
  };

  private hit(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    return this.raycaster.intersectObjects([...this.planets.values()].map(p => p.surface), false)[0]?.object.userData.body as BodyId | undefined;
  }
  private pointerDown = (e: PointerEvent) => this.pointerStart.set(e.clientX, e.clientY);
  private pointerUp = (e: PointerEvent) => {
    if (this.pointerStart.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 6) return;
    if (this.view === 'satellites') {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
      const id = this.satellites.hit(this.raycaster);
      if (id) this.onSatelliteSelect?.(id);
      return;
    }
    if (this.view === 'orbit') {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
      const hit = this.raycaster.intersectObjects([...this.orbitMarkers.values()].filter(m => m.visible), false)[0];
      if (hit) this.onSelect?.(hit.object.userData.body);
      return;
    }
    if (this.view !== 'overview') return;
    const body = this.hit(e); if (body) this.onSelect?.(body);
  };
  private pointerMove = (e: PointerEvent) => { this.renderer.domElement.style.cursor = this.view === 'overview' ? this.hit(e) ? 'pointer' : 'default' : 'grab'; };
  private visibilityChange = () => { this.hidden = document.hidden; this.lastFrame = 0; this.frameAnchor = performance.now(); this.frameCount = 0; };

  dispose() {
    this.satellites.dispose();
    this.disposed = true; this.worker.terminate(); this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null); this.controls.dispose();
    document.removeEventListener('visibilitychange', this.visibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.removeEventListener('pointermove', this.pointerMove);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    [this.scene, this.orbitScene].forEach(scene => scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    }));
    // Node texture ownership is tracked by the loader's maps in the materials.
    materials.forEach(m => { for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); m.dispose(); });
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); this.ownedTextures.forEach(t => t.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
