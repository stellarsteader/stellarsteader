import type { Satellite } from './satellites';

export const orbitTypes = ['all', 'leo', 'meo', 'geo', 'gso', 'heo', 'other'] as const;
export type OrbitFilter = typeof orbitTypes[number];
export type OrbitClass = Exclude<OrbitFilter, 'all'>;
export const orbitInfo: Record<OrbitFilter, { name: string; description: string; color: string }> = {
  all: { name: 'All orbits', description: 'All cataloged orbit classes. Zoom out to explore the higher orbits.', color: '#b6d7e7' },
  leo: { name: 'LEO', description: 'Low Earth orbit · entire mean orbit below 2,000 km altitude.', color: '#94d9d2' },
  meo: { name: 'MEO', description: 'Medium Earth orbit · between 2,000 km and the geosynchronous altitude.', color: '#e1c28b' },
  geo: { name: 'GEO', description: 'Near-geostationary · nearly circular, equatorial, and one sidereal day per orbit.', color: '#d0b5f0' },
  gso: { name: 'GSO', description: 'Other geosynchronous · one sidereal day per orbit, but inclined or elliptical.', color: '#aaaaf0' },
  heo: { name: 'HEO', description: 'Highly elliptical · eccentricity at least 0.25, excluding geosynchronous orbits.', color: '#efad99' },
  other: { name: 'Other', description: 'Transfer, high, or boundary-crossing orbits outside these display classes.', color: '#b9c4ce' },
};
const radius = 6371;
const geosynchronousAltitude = 35786;
export function orbitMetrics(s: Pick<Satellite, 'omm'>) {
  const n = Number(s.omm?.MEAN_MOTION), e = Number(s.omm?.ECCENTRICITY);
  const semiMajor = Math.cbrt(398600.4418 / Math.pow(n * 2 * Math.PI / 86400, 2));
  return { perigee: semiMajor * (1 - e) - radius, apogee: semiMajor * (1 + e) - radius,
    inclination: Number(s.omm?.INCLINATION), eccentricity: e, periodMinutes: 1440 / n };
}
// Exclusive visualization classes, derived from mean elements. These tolerances
// are disclosed in Data & credits; they are not official catalog classifications.
export function classifyOrbit(s: Pick<Satellite, 'omm'>): OrbitClass {
  if (!s.omm) return 'other';
  const m = orbitMetrics(s);
  if (!Object.values(m).every(Number.isFinite) || m.perigee < 0) return 'other';
  if (Math.abs(m.periodMinutes - 1436.068) <= 15) return m.eccentricity < 0.01 && m.inclination < 5 ? 'geo' : 'gso';
  if (m.apogee < 2000) return 'leo';
  if (m.eccentricity >= 0.25) return 'heo';
  if (m.perigee >= 2000 && m.apogee < geosynchronousAltitude) return 'meo';
  return 'other';
}
export function matchesOrbit(s: Satellite, filter: OrbitFilter) { return filter === 'all' || classifyOrbit(s) === filter; }
export function matchesSatelliteSearch(s: Satellite, query: string) {
  const aliases = s.catalogId === 20580 ? 'Hubble Space Telescope' : s.catalogId === 48274 ? 'Tiangong Chinese Space Station' : /^NAVSTAR\b/i.test(s.name) ? 'GPS' : '';
  return `${s.name} ${s.catalogId ?? ''} ${aliases}`.toLowerCase().includes(query.trim().toLowerCase());
}
export function orbitCounts(items: Satellite[]) {
  const counts = Object.fromEntries(orbitTypes.map(type => [type, 0])) as Record<OrbitFilter, number>;
  for (const item of items) { counts.all++; counts[classifyOrbit(item)]++; }
  return counts;
}
