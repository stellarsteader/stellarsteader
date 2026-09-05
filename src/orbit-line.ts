import { Line2NodeMaterial, type ColorRepresentation, type Vector3 } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

/** Screen-space strokes stay legible at every camera distance on both renderer backends. */
export class OrbitLine extends Line2 {
  constructor(private readonly baseColor: ColorRepresentation, selected = false) {
    // Opaque strokes must write depth as well as test it: otherwise a planet
    // drawn later can erase a foreground segment when camera sorting changes.
    super(new LineGeometry(), new Line2NodeMaterial({ depthWrite: true, depthTest: true, worldUnits: false, toneMapped: false, alphaToCoverage: false }));
    this.frustumCulled = false;
    this.visible = false;
    this.setSelected(selected);
  }

  setSelected(selected: boolean) {
    this.material.color.set(selected ? '#ffffff' : this.baseColor);
    if (!selected) this.material.color.multiplyScalar(0.2);
    this.material.linewidth = selected ? 1.5 : 1;
  }

  setPoints(points: readonly Vector3[]) {
    const geometry = new LineGeometry();
    // Keep valid attributes even when a clipped trajectory contains no segments.
    geometry.setPositions(points.length >= 2 ? points.flatMap(p => [p.x, p.y, p.z]) : [0, 0, 0, 0, 0, 0]);
    geometry.instanceCount = Math.max(0, points.length - 1);
    this.geometry.dispose();
    this.geometry = geometry;
    this.visible = points.length >= 2;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
