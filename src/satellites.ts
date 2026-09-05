import { json2satrec, propagate, eciToEcf, gstime, type OMMJsonObject, type SatRec } from 'satellite.js';
import { Vector3 } from 'three';
import { bodies, physicalState, type BodyId } from './astronomy';
import { classifyOrbit, orbitInfo } from './satellite-orbits';

export type Sample = [number, number, number, number, number, number, number];
export type Satellite = {
  id: string; name: string; parent: BodyId; kind: 'natural' | 'spacecraft'; color: string;
  provider: 'horizons' | 'celestrak'; sourceUrl: string; fetchedAt: string; periodHours: number;
  frame: 'ICRF' | 'TEME'; historical?: boolean; samples?: Sample[]; omm?: OMMJsonObject;
  epoch?: string; coverageStart?: string; coverageEnd?: string; catalogId?: number; target?: number;
};
export type SatelliteCatalog = { schemaVersion: number; fetchedAt: string; scope: string; satellites: Satellite[]; errors: { name: string; message: string }[]; earthFetchedAt?: string; earthError?: string };
export type EarthCatalog = { schemaVersion: number; fetchedAt: string; sourceUrl: string; scope: string; records: OMMJsonObject[] };
export function earthSatellites(catalog: EarthCatalog): Satellite[] {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.records) || !catalog.records.length || !Number.isFinite(Date.parse(catalog.fetchedAt))) throw new Error('Invalid Earth catalog');
  const ids = new Set<number>();
  return catalog.records.map(omm => {
    const catalogId = Number(omm.NORAD_CAT_ID);
    const epoch = omm.EPOCH.endsWith('Z') ? omm.EPOCH : omm.EPOCH + 'Z';
    if (!Number.isSafeInteger(catalogId) || catalogId < 1 || ids.has(catalogId) || typeof omm.OBJECT_NAME !== 'string'
      || !Number.isFinite(Date.parse(epoch)) || !['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR'].every(key => Number.isFinite(Number(omm[key as keyof OMMJsonObject])))
      || Number(omm.MEAN_MOTION) <= 0 || Number(omm.ECCENTRICITY) < 0 || Number(omm.ECCENTRICITY) >= 1) throw new Error('Invalid Earth orbital elements');
    ids.add(catalogId);
    const aliases: Record<number, string> = { 25544: 'iss', 48274: 'tiangong', 20580: 'hubble' };
    return { id: aliases[catalogId] ?? `norad-${catalogId}`, name: omm.OBJECT_NAME, parent: 'earth', kind: 'spacecraft',
      color: orbitInfo[classifyOrbit({ omm })].color, catalogId, provider: 'celestrak', frame: 'TEME', epoch,
      periodHours: 24 / Number(omm.MEAN_MOTION), omm, fetchedAt: catalog.fetchedAt,
      sourceUrl: `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catalogId}&FORMAT=json` };
  });
}
const day = 86400000;
const records = new WeakMap<Satellite, SatRec>();

export function coverage(satellite: Satellite): [number, number] {
  if (satellite.provider === 'celestrak') {
    const epoch = Date.parse(satellite.epoch!);
    // A display guard, not an accuracy guarantee. Never propagate these elements indefinitely.
    return [epoch - 7 * day, epoch + 7 * day];
  }
  return [satellite.samples![0][0], satellite.samples!.at(-1)![0]];
}

export function available(satellite: Satellite, date: Date) {
  const [start, end] = coverage(satellite);
  return date.getTime() >= start && date.getTime() <= end;
}

// Cubic Hermite interpolation uses both position (km) and velocity (km/s).
// No extrapolation; an absent state must never turn into a frozen "live" marker.
export function interpolate(samples: Sample[], time: number): Vector3 | null {
  if (samples.length < 2 || time < samples[0][0] || time > samples.at(-1)![0]) return null;
  let low = 0, high = samples.length - 1;
  while (high - low > 1) { const middle = (low + high) >> 1; if (samples[middle][0] <= time) low = middle; else high = middle; }
  const a = samples[low], b = samples[high];
  const duration = (b[0] - a[0]) / 1000;
  const t = (time - a[0]) / (b[0] - a[0]), t2 = t * t, t3 = t2 * t;
  return new Vector3(...[1, 2, 3].map(i => (2*t3 - 3*t2 + 1)*a[i] + (t3 - 2*t2 + t)*duration*a[i+3]
    + (-2*t3 + 3*t2)*b[i] + (t3 - t2)*duration*b[i+3]) as [number, number, number]);
}

// ECF axes: +X Greenwich, +Y east, +Z north. Globe texture axes differ.
export function ecfToGlobe(ecf: { x: number; y: number; z: number }) { return new Vector3(ecf.x, ecf.z, -ecf.y); }

export function satellitePosition(satellite: Satellite, date: Date): Vector3 | null {
  if (!available(satellite, date)) return null;
  if (satellite.provider === 'horizons') return interpolate(satellite.samples!, date.getTime());
  try {
    let record = records.get(satellite);
    if (!record) { record = json2satrec(satellite.omm!); records.set(satellite, record); }
    const state = propagate(record, date);
    if (!state) return null;
    // SGP4 returns TEME, not J2000. Convert through Earth-fixed coordinates, then
    // through the same IAU Earth orientation used by the globe. Polar motion omitted.
    const fixed = eciToEcf(state.position, gstime(date));
    const position = ecfToGlobe(fixed).applyQuaternion(physicalState('earth', date).orientation);
    return [position.x, position.y, position.z].every(Number.isFinite) ? position : null;
  } catch { return null; }
}

export function satellitePath(satellite: Satellite, date: Date, count = 192): Vector3[] {
  if (!satellitePosition(satellite, date)) return [];
  const [start, stop] = coverage(satellite);
  const duration = satellite.periodHours * 3600000;
  const from = Math.max(start, date.getTime() - duration / 2);
  const to = Math.min(stop, date.getTime() + duration / 2);
  const points: Vector3[] = [];
  for (let i = 0; i <= count; i++) {
    const point = satellitePosition(satellite, new Date(from + (to - from) * i / count));
    if (!point) return []; // Do not bridge invalid samples with an invented segment.
    points.push(point);
  }
  return points;
}

export function dataStatus(satellite: Satellite, date: Date) {
  if (!available(satellite, date)) return satellite.historical ? 'Historical coverage only' : 'Outside data coverage';
  if (satellite.provider === 'celestrak') {
    return Math.abs(date.getTime() - Date.parse(satellite.epoch!)) > 3.5 * day ? 'Older elements · reduced confidence' : 'SGP4 · calculated position';
  }
  return satellite.historical ? 'Historical trajectory' : 'JPL · interpolated ephemeris';
}

export async function loadSatelliteCatalog(): Promise<SatelliteCatalog> {
  const response = await fetch('/data/satellites.json', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Satellite catalog: HTTP ${response.status}`);
  const catalog = await response.json() as SatelliteCatalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.satellites)) throw new Error('Unsupported satellite catalog');
  const ids = new Set<string>();
  for (const s of catalog.satellites) {
    if (!/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !(s.parent in bodies) || !Number.isFinite(s.periodHours) || s.periodHours <= 0) throw new Error('Invalid satellite identity');
    ids.add(s.id);
    if (s.provider === 'horizons') {
      if (s.frame !== 'ICRF' || !s.samples || s.samples.length < 2 || s.samples.some((row, i) => row.length !== 7 || row.some(n => !Number.isFinite(n)) || (i > 0 && row[0] <= s.samples![i - 1][0]))) throw new Error('Invalid ephemeris samples');
    } else if (s.provider === 'celestrak') {
      if (s.frame !== 'TEME' || !s.omm || !Number.isFinite(Date.parse(s.epoch!))) throw new Error('Invalid orbital elements');
    } else throw new Error('Unknown satellite provider');
  }
  try {
    const earthResponse = await fetch('/data/earth-satellites.json', { signal: AbortSignal.timeout(30000) });
    if (!earthResponse.ok) throw new Error(`HTTP ${earthResponse.status}`);
    const earth = await earthResponse.json() as EarthCatalog;
    catalog.satellites = [...earthSatellites(earth), ...catalog.satellites.filter(s => s.parent !== 'earth')];
    catalog.earthFetchedAt = earth.fetchedAt;
  } catch {
    catalog.earthError = 'The expanded Earth catalog could not load. Showing the bundled mission sample.';
  }
  return catalog;
}
