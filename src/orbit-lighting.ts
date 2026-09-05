import { HelioVector, GeoMoon, RotateVector, Rotation_EQJ_ECL, Vector, MakeTime } from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { AU_KM, bodies, physicalState, type BodyId } from './astronomy';

export const SUN_RADIUS_KM = 695700;
const rotation = Rotation_EQJ_ECL();
function toOrbit(v: { x: number; y: number; z: number }) {
  const e = RotateVector(rotation, new Vector(v.x, v.y, v.z, MakeTime(0)));
  return new Vector3(e.x, e.z, -e.y);
}
const frame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  toOrbit(new Vector3(1, 0, 0)), toOrbit(new Vector3(0, 1, 0)), toOrbit(new Vector3(0, 0, 1)),
));

export function orbitLightingState(id: BodyId, date: Date) {
  const center = HelioVector(bodies[id].body, date);
  const sun = toOrbit(center).multiplyScalar(-AU_KM);
  const moon = toOrbit(GeoMoon(date)).multiplyScalar(AU_KM);
  const occluder = id === 'earth' ? moon : id === 'moon' ? moon.negate() : new Vector3(0, 0, 1);
  return {
    sun, occluder,
    occluderRadius: id === 'earth' ? bodies.moon.radius : id === 'moon' ? bodies.earth.radius : 0,
    orientation: frame.clone().multiply(physicalState(id, date).orientation),
  };
}
