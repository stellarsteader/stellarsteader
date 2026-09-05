import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Rotation_EQJ_ECL } from 'astronomy-engine';
import { orbitPosition, orbitGuideSamples, physicalState, type SceneClock } from './astronomy';

/** A separate local scale leaves the Sun-centered diagram's distances intact. */
export class EarthMoonPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-8, 8, 5.2, -5.2, .1, 50);
  private geometry = new THREE.SphereGeometry(1, 40, 24);
  private earth = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial());
  private moon = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial());
  private line = new Line2(new LineGeometry(), new LineMaterial({ color: '#aeb2b6', linewidth: 1.5, depthWrite: false }));
  private textures: THREE.Texture[] = [];
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private inView = true;
  private active = false;
  private disposed = false;
  private frame = 0;
  private lastDraw = 0;
  private pathEpoch = NaN;
  private orientation: THREE.Quaternion;

  constructor(private host: HTMLElement, private label: HTMLElement, private clock: SceneClock) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Magnified Earth–Moon system at the scene time, with the Moon’s orbit around Earth. Body sizes enlarged.');
    host.prepend(this.renderer.domElement);
    this.camera.position.set(0, 6, 8); this.camera.lookAt(0, 0, 0);
    this.earth.scale.setScalar(.42); this.moon.scale.setScalar(.18);
    this.scene.add(this.earth, this.moon, this.line);
    const r = Rotation_EQJ_ECL().rot;
    this.orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(r[0][0], r[0][2], -r[0][1]),
      new THREE.Vector3(r[1][0], r[1][2], -r[1][1]),
      new THREE.Vector3(r[2][0], r[2][2], -r[2][1]),
    ));
    const loader = new THREE.TextureLoader();
    for (const [mesh, file] of [[this.earth, 'earth-day.webp'], [this.moon, 'moon-day.webp']] as const) {
      const texture = loader.load(`/textures/${file}`, () => {
        if (this.disposed) { texture.dispose(); return; }
        mesh.material.map = texture; mesh.material.needsUpdate = true;
      });
      texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture);
    }
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.intersectionObserver = new IntersectionObserver(([entry]) => { this.inView = entry!.isIntersecting; });
    this.intersectionObserver.observe(host);
    this.resize();
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active; cancelAnimationFrame(this.frame);
    if (active) { this.resize(); this.lastDraw = 0; this.frame = requestAnimationFrame(this.tick); }
  }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.left = -5.2 * w / h; this.camera.right = 5.2 * w / h; this.camera.updateProjectionMatrix();
    this.line.material.resolution.set(w, h);
  }
  private tick = (time: number) => {
    if (!this.active || this.disposed) return;
    if (!document.hidden && this.inView && time - this.lastDraw > 100) {
      this.lastDraw = time;
      const date = this.clock.now();
      if (!Number.isFinite(this.pathEpoch) || Math.abs(date.getTime() - this.pathEpoch) > 300000) {
        this.pathEpoch = date.getTime();
        this.line.geometry.dispose();
        this.line.geometry = new LineGeometry().setPositions(orbitGuideSamples('moon', date).flat());
      }
      this.moon.position.set(...orbitPosition('moon', date));
      this.earth.quaternion.copy(this.orientation).multiply(physicalState('earth', date).orientation);
      this.moon.quaternion.copy(this.orientation).multiply(physicalState('moon', date).orientation);
      this.renderer.render(this.scene, this.camera);
      const point = this.moon.position.clone().project(this.camera);
      this.label.style.left = `${(point.x + 1) * this.host.clientWidth / 2}px`;
      this.label.style.top = `${(1 - point.y) * this.host.clientHeight / 2}px`;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect(); this.intersectionObserver.disconnect();
    this.geometry.dispose(); this.earth.material.dispose(); this.moon.material.dispose();
    this.line.geometry.dispose(); this.line.material.dispose(); this.textures.forEach(t => t.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
