import { json2satrec, propagate, eciToEcf, gstime, type SatRec } from 'satellite.js';
import { physicalState, bodies } from './astronomy';
import { ecfToGlobe, coverage, type Satellite } from './satellites';

export type PropagationEntry = { record: SatRec | null; start: number; stop: number };
export function prepareEarth(items: Satellite[]): PropagationEntry[] {
  return items.map(s => {
    const [start, stop] = coverage(s);
    try { return { record: json2satrec(s.omm!), start, stop }; }
    catch { return { record: null, start, stop }; }
  });
}
// Packed ICRF positions in Earth radii. Invalid/uncovered entries are NaN, never
// a frozen or synthetic satellite. Earth orientation is computed once per batch.
export function propagateEarth(entries: PropagationEntry[], time: number) {
  const date = new Date(time), sidereal = gstime(date), orientation = physicalState('earth', date).orientation;
  const positions = new Float32Array(entries.length * 3).fill(NaN);
  for (let i = 0; i < entries.length; i++) {
    const { record, start, stop } = entries[i];
    if (!record || time < start || time > stop) continue;
    try {
      const state = propagate(record, date);
      if (!state) continue;
      const fixed = eciToEcf(state.position, sidereal);
      const point = ecfToGlobe(fixed).applyQuaternion(orientation).divideScalar(bodies.earth.radius);
      if (![point.x, point.y, point.z].every(Number.isFinite) || point.lengthSq() < 1) continue;
      point.toArray(positions, i * 3);
    } catch { /* An invalid state stays absent. */ }
  }
  return positions;
}
