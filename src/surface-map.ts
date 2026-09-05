import { Matrix4, Vector3, type Camera, type Object3D } from 'three';
import { type BodyId } from './astronomy';

export type Place = {
  id: string; body: BodyId; name: string; kind: string; context: string;
  latitude: number; longitude: number; diameterKm?: number;
  level: number; importance: number; sourceUrl: string;
};
export type PlaceCatalog = { schemaVersion: number; places: Place[]; sources: { body: BodyId; credit: string; url: string; downloadedAt: string }[] };
export type PlaceLabel = { place: Place; x: number; y: number; visible: boolean };
export type MapFrame = { labels: PlaceLabel[]; level: number; altitudeKm: number };
export const mapLevels = ['Global', 'Regional', 'Local', 'Close-up'];

// Matches the existing equirectangular surface: +X Greenwich, +Y north, -Z east.
export function surfacePoint(latitude: number, longitude: number) {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}
export function mapLevel(altitudeInRadii: number) {
  return altitudeInRadii > 2.8 ? 0 : altitudeInRadii > 1.2 ? 1 : altitudeInRadii > 0.45 ? 2 : 3;
}
export function detailDistanceRatio(width: number, height: number) {
  if (width < 760) return 4.6 / (width / height);
  const side = Math.min(310, Math.max(260, width * 0.22)) + 40;
  const diameter = Math.max(220, Math.min(height * 0.68, (width - 2 * side) * 0.95));
  return Math.sqrt(1 + (height / (diameter * Math.tan(17.5 * Math.PI / 180))) ** 2);
}
export type LabelRect = { x: number; y: number; width: number; height: number };
export function overlaps(a: LabelRect, b: LabelRect) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 9 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 8;
}

export class SurfaceMap {
  enabled = false;
  selected = '';
  private entries: { place: Place; point: Vector3 }[] = [];
  private shown: { place: Place; point: Vector3 }[] = [];
  private lastSelection = -Infinity;
  private matrix = new Matrix4();
  private localCamera = new Vector3();

  setPlaces(places: Place[]) {
    this.entries = places.map(place => ({ place, point: surfacePoint(place.latitude, place.longitude) }));
    this.shown = []; this.lastSelection = -Infinity;
  }
  invalidate() { this.lastSelection = -Infinity; }

  update(surface: Object3D, camera: Camera, width: number, height: number, radiusKm: number): MapFrame {
    this.localCamera.copy(camera.position); surface.worldToLocal(this.localCamera);
    const altitudeRatio = Math.max(0, this.localCamera.length() - 1);
    const level = mapLevel(altitudeRatio);
    this.matrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(surface.matrixWorld);
    const mobile = width < 760;
    const left = mobile ? 15 : width * 0.042 + Math.min(240, width * 0.18) + 20;
    const right = mobile ? width - 15 : width - width * 0.042 - Math.min(310, Math.max(260, width * 0.22)) - 16;
    const top = mobile ? 215 : height <= 800 ? 125 : 140;
    const bottom = mobile ? height * 0.55 : height - 145;
    const project = (entry: { place: Place; point: Vector3 }) => {
      const p = entry.point.clone().multiplyScalar(1.002).applyMatrix4(this.matrix);
      const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
      const labelWidth = Math.min(205, entry.place.name.length * 6.4 + 24);
      // Horizon test on a sphere, not just "front hemisphere". This also hides
      // far-side labels at close range where most of the hemisphere is occluded.
      const visible = entry.point.dot(this.localCamera) > 1.015 && p.z > -1 && p.z < 1
        && x - labelWidth / 2 > left && x + labelWidth / 2 < right && y > top && y < bottom;
      return { x, y, visible, width: labelWidth, height: 25 };
    };
    if (performance.now() - this.lastSelection > 130) {
      this.lastSelection = performance.now();
      const candidates = this.entries.filter(entry => (entry.place.level <= level && (entry.place.body === 'earth' || entry.place.level >= level - 1)) || entry.place.id === this.selected)
        .map(entry => ({ entry, rect: project(entry) })).filter(({ rect }) => rect.visible)
        .sort((a, b) => Number(b.entry.place.id === this.selected) - Number(a.entry.place.id === this.selected)
          || displayImportance(b.entry.place) - displayImportance(a.entry.place) || a.entry.place.id.localeCompare(b.entry.place.id));
      const rectangles: LabelRect[] = [];
      this.shown = [];
      for (const { entry, rect } of candidates) {
        if (rectangles.some(other => overlaps(rect, other))) continue;
        rectangles.push(rect); this.shown.push(entry);
        if (this.shown.length >= (mobile ? 7 : 16)) break;
      }
    }
    return { level, altitudeKm: altitudeRatio * radiusKm, labels: this.shown.map(entry => ({ place: entry.place, ...project(entry) })) };
  }
}

// Editorial label priority only; coordinates and measured sizes remain untouched.
const landmarks = new Set(['Olympus Mons', 'Valles Marineris', 'Hellas Planitia', 'Gale', 'Jezero', 'Tycho', 'Copernicus', 'Mare Tranquillitatis']);
function displayImportance(place: Place) { return place.importance + (landmarks.has(place.name) ? 3 : 0); }

export async function loadPlaces(): Promise<PlaceCatalog> {
  const response = await fetch('/data/places.json', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Place catalog HTTP ${response.status}`);
  const catalog = await response.json() as PlaceCatalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.places)) throw new Error('Unsupported place catalog');
  const ids = new Set<string>();
  for (const p of catalog.places) {
    if (!/^(earth|moon|mars)-(ne|usgs)-\d+$/.test(p.id) || ids.has(p.id) || !['earth', 'moon', 'mars'].includes(p.body)
      || !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 || !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180
      || !Number.isInteger(p.level) || p.level < 0 || p.level > 3 || !Number.isFinite(p.importance)) throw new Error('Invalid place catalog entry');
    ids.add(p.id);
  }
  return catalog;
}

// OrbitControls rotates around the globe center; scale drag by altitude so a
// pointer movement covers a comparable portion of the visible surface up close.
export function surfaceDragSpeed(distanceInRadii: number) {
  const altitude = Math.max(0, distanceInRadii - 1);
  return 0.45 * Math.min(1, Math.max(0.025, altitude / 2.5));
}
