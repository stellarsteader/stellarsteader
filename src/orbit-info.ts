import { HelioState, GeoMoonState, RotateState, Rotation_EQJ_ECL, SearchLunarApsis, NextLunarApsis, SearchPlanetApsis, NextPlanetApsis, ApsisKind } from 'astronomy-engine';
import { Vector3, MathUtils } from 'three';
import { AU_KM, bodies, type BodyId } from './astronomy';

export function orbitalReadout(id: BodyId, date: Date) {
  // Both position and velocity use the same primary and reference plane.
  const state = RotateState(Rotation_EQJ_ECL(), id === 'moon' ? GeoMoonState(date) : HelioState(bodies[id].body, date));
  const position = new Vector3(state.x, state.y, state.z).multiplyScalar(AU_KM);
  const velocity = new Vector3(state.vx, state.vy, state.vz).multiplyScalar(AU_KM / 86400);
  const normal = new Vector3().crossVectors(position, velocity).normalize();
  return {
    distanceKm: position.length(), speedKmS: velocity.length(),
    radialKmS: position.dot(velocity) / position.length(),
    inclinationDeg: Math.acos(MathUtils.clamp(normal.z, -1, 1)) * MathUtils.RAD2DEG,
    primary: id === 'moon' ? 'Earth' : 'Sun', periodDays: bodies[id].period,
  };
}
export type OrbitEvent = { time: number; distanceKm: number; kind: 'closest' | 'farthest'; name: string };
export function nextOrbitEvents(id: BodyId, date: Date): OrbitEvent[] {
  const first = id === 'moon' ? SearchLunarApsis(date) : SearchPlanetApsis(bodies[id].body, date);
  const next = id === 'moon' ? NextLunarApsis(first) : NextPlanetApsis(bodies[id].body, first);
  return [first, next].map(event => {
    const closest = event.kind === ApsisKind.Pericenter;
    return { time: event.time.date.getTime(), distanceKm: event.dist_km, kind: closest ? 'closest' : 'farthest',
      name: id === 'moon' ? closest ? 'Perigee' : 'Apogee' : closest ? 'Perihelion' : 'Aphelion' };
  });
}
