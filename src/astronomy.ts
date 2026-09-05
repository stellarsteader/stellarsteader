import { Body, HelioVector, GeoMoon, HelioState, GeoMoonState, RotateState, MassProduct, RotationAxis, Rotation_EQJ_ECL, RotateVector, MakeTime } from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3, MathUtils } from 'three';

export type BodyId = 'earth' | 'moon' | 'mars';
export const AU_KM = 149597870.7;
export const DAY_MS = 86400000;
export const bodies = {
  earth: { name: 'Earth', body: Body.Earth, radius: 6371, period: 365.256, color: '#9fc6d6', ordinal: '01', subtitle: 'Our living world', atmosphere: 'Nitrogen · Oxygen', diameter: '12,742', day: '23h 56m', distanceLabel: 'FROM THE SUN' },
  moon: { name: 'Moon', body: Body.Moon, radius: 1737.4, period: 27.322, color: '#d7d5c9', ordinal: '02', subtitle: 'Our constant companion', atmosphere: 'Tenuous exosphere', diameter: '3,475', day: '27.32 days', distanceLabel: 'FROM EARTH' },
  mars: { name: 'Mars', body: Body.Mars, radius: 3389.5, period: 686.980, color: '#dda990', ordinal: '03', subtitle: 'A world beyond', atmosphere: 'Carbon dioxide', diameter: '6,779', day: '24h 37m', distanceLabel: 'FROM THE SUN' },
} as const;

// Physical vectors remain in EQJ (J2000 mean equator), in AU.
export function physicalState(id: BodyId, date: Date) {
  const planet = HelioVector(bodies[id].body, date);
  const sun = new Vector3(-planet.x, -planet.y, -planet.z).normalize();
  const axis = RotationAxis(bodies[id].body, date);
  const north = new Vector3(axis.north.x, axis.north.y, axis.north.z).normalize();
  const ra = axis.ra * 15 * MathUtils.DEG2RAD;
  const node = new Vector3(-Math.sin(ra), Math.cos(ra), 0);
  const eastAtZero = new Vector3().crossVectors(north, node).normalize();
  const spin = (axis.spin % 360) * MathUtils.DEG2RAD;
  const prime = node.clone().multiplyScalar(Math.cos(spin)).addScaledVector(eastAtZero, Math.sin(spin));
  const east = new Vector3().crossVectors(north, prime).normalize();
  // SphereGeometry: texture centre is +X; east is -Z; north is +Y.
  const orientation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(prime, north, east.negate()));
  const localSun = sun.clone().applyQuaternion(orientation.clone().invert());
  const subsolarLatitude = Math.asin(MathUtils.clamp(localSun.y, -1, 1)) * MathUtils.RAD2DEG;
  const subsolarLongitude = Math.atan2(-localSun.z, localSun.x) * MathUtils.RAD2DEG;
  const distance = id === 'moon' ? GeoMoon(date).Length() * AU_KM : planet.Length() * AU_KM;
  return { sun, north, orientation, subsolarLatitude, subsolarLongitude, distance };
}

export function orbitPosition(id: BodyId, date: Date): [number, number, number] {
  const raw = id === 'moon' ? GeoMoon(date) : HelioVector(bodies[id].body, date);
  const v = RotateVector(Rotation_EQJ_ECL(), raw);
  const scale = id === 'moon' ? AU_KM / 100000 : 4;
  return [v.x * scale, v.z * scale, -v.y * scale];
}

export function orbitSamples(id: BodyId, date: Date, count = 256) {
  const duration = bodies[id].period * DAY_MS;
  // An open sampled trajectory over one nominal period; do not invent a closed ellipse.
  return Array.from({ length: count + 1 }, (_, index) => orbitPosition(id, new Date(date.getTime() + (index / count - 0.25) * duration)));
}

export function formatDistance(id: BodyId, km: number) {
  return id === 'moon' ? `${Math.round(km).toLocaleString('en-US')} km` : `${(km / 1e6).toFixed(2)} M km`;
}

export function solarTime(longitude: number, subsolarLongitude: number) {
  const hours = ((12 + (longitude - subsolarLongitude) / 15) % 24 + 24) % 24;
  return `${Math.floor(hours).toString().padStart(2, '0')}:${Math.floor((hours % 1) * 60).toString().padStart(2, '0')}`;
}

export function julianDate(date: Date) { return MakeTime(date).ut + 2451545; }

export class SceneClock {
  private epoch = Date.now();
  private anchor = performance.now();
  rate = 1;
  live = true;
  now() { return new Date(this.epoch + (performance.now() - this.anchor) * this.rate); }
  setRate(rate: number) {
    this.epoch = this.now().getTime(); this.anchor = performance.now(); this.rate = rate; this.live = false;
  }
  offset(hours: number) {
    this.epoch = this.now().getTime() + hours * 3600000; this.anchor = performance.now(); this.live = false;
  }
  setDate(date: Date) {
    if (!Number.isFinite(date.getTime())) return;
    this.epoch = date.getTime(); this.anchor = performance.now(); this.live = false;
  }
  reset() { this.epoch = Date.now(); this.anchor = performance.now(); this.rate = 1; this.live = true; }
}

/** Closed two-body guide tangent to the current ephemeris state, not a timed future trajectory. */
export function orbitGuideSamples(id: BodyId, date: Date, count = 512): [number, number, number][] {
  const state = RotateState(Rotation_EQJ_ECL(), id === 'moon' ? GeoMoonState(date) : HelioState(bodies[id].body, date));
  const r = new Vector3(state.x, state.y, state.z);
  const v = new Vector3(state.vx, state.vy, state.vz);
  const mu = MassProduct(id === 'moon' ? Body.Earth : Body.Sun) + MassProduct(bodies[id].body);
  const h = new Vector3().crossVectors(r, v);
  const p = h.lengthSq() / mu;
  const x = r.clone().normalize();
  const y = new Vector3().crossVectors(h.clone().normalize(), x);
  const eccentricity = new Vector3().crossVectors(v, h).divideScalar(mu).sub(x);
  const scale = id === 'moon' ? AU_KM / 100000 : 4;
  const segments = Math.max(16, Math.floor(count));
  const points: [number, number, number][] = Array.from({ length: segments }, (_, i) => {
    const angle = i * 2 * Math.PI / segments;
    const direction = x.clone().multiplyScalar(Math.cos(angle)).addScaledVector(y, Math.sin(angle));
    const position = direction.clone().multiplyScalar(p * scale / (1 + eccentricity.dot(direction)));
    return [position.x, position.z, -position.y];
  });
  points.push([...points[0]!]);
  return points;
}
