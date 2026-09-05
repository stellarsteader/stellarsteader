import { AU_KM, orbitPosition } from './astronomy';

// Only the Moon's Earth-relative displacement is enlarged; Earth stays at its
// heliocentric position. Both paths use the same J2000 ecliptic display axes.
export const LUNAR_CONTEXT_MAGNIFICATION = 80;
export const LUNAR_CONTEXT_SCALE = LUNAR_CONTEXT_MAGNIFICATION * 4 * 100000 / AU_KM;

export function moonPositionInSolarView(date: Date): [number, number, number] {
  const earth = orbitPosition('earth', date);
  const moon = orbitPosition('moon', date);
  return earth.map((coordinate, axis) => coordinate + moon[axis]! * LUNAR_CONTEXT_SCALE) as [number, number, number];
}
