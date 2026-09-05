import { RotateVector, Rotation_EQJ_ECL, Vector, MakeTime } from 'astronomy-engine';
import catalog from './data/stars.json';

/** HYG ID, J2000 RA (hours), declination (degrees), V magnitude, B−V color. */
export type CatalogStar = [number, number, number, number, number | null];
export const stars = catalog as CatalogStar[];
const rotation = Rotation_EQJ_ECL();
const epoch = MakeTime(0);

/** Same J2000 ecliptic, Y-up frame as orbitPosition(). */
export function starDirection(ra: number, dec: number): [number, number, number] {
  const a = ra * Math.PI / 12, d = dec * Math.PI / 180;
  const v = RotateVector(rotation, new Vector(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), epoch));
  return [v.x, v.z, -v.y];
}

/** A restrained visual palette interpolated by measured B−V, neutral if unknown. */
export function starColor(bv: number | null): [number, number, number] {
  if (bv === null) return [1, 1, 1];
  const stops = [
    [-0.4, 0.62, 0.75, 1], [0, 0.83, 0.88, 1],
    [0.65, 1, 0.95, 0.84], [1.4, 1, 0.75, 0.5], [2, 1, 0.57, 0.32],
  ];
  const value = Math.max(-0.4, Math.min(2, bv));
  const end = stops.findIndex((s, i) => i > 0 && value <= s[0]);
  const a = stops[end - 1], b = stops[end], t = (value - a[0]) / (b[0] - a[0]);
  return [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t) as [number, number, number];
}
