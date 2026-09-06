import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

// Translate with the focus; optionally transport the viewing frame along its
// orbit or the planet's rotation so accelerated time cannot carry the camera
// through the parent planet.
export function followCameraFocus(camera: PerspectiveCamera, target: Vector3, next: Vector3, center?: Vector3) {
  const offset = camera.position.clone().sub(target);
  if (center) {
    const from = target.clone().sub(center), to = next.clone().sub(center);
    if (from.lengthSq() > 1e-12 && to.lengthSq() > 1e-12) {
      const turn = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
      offset.applyQuaternion(turn); camera.up.applyQuaternion(turn).normalize();
    }
  }
  target.copy(next); camera.position.copy(next).add(offset); camera.lookAt(target);
}

// Orbit about the local surface normal. This keeps the selected location fixed
// and preserves altitude even when looking straight down (the view then rolls).
export function rotateAroundSurfaceFocus(camera: PerspectiveCamera, target: Vector3, normal: Vector3, angle: number) {
  const turn = new Quaternion().setFromAxisAngle(normal, angle);
  camera.position.sub(target).applyQuaternion(turn).add(target);
  camera.up.applyQuaternion(turn).normalize(); camera.lookAt(target);
}


// OrbitControls normally uses one point for both aiming and orbiting. After
// releasing a selection, retain the aim but apply input around the planet.
// Wrap every update, including the updates made inside pointer/wheel handlers.
export function updateReleasedCamera(camera: PerspectiveCamera, target: Vector3, center: Vector3, update: () => boolean) {
  const radial = camera.position.clone().sub(center);
  const range = radial.length();
  if (range < 1e-12) return update();
  const gaze = target.clone().sub(camera.position), orientation = camera.quaternion.clone();
  target.copy(center);
  const changed = update();
  const nextRadial = camera.position.clone().sub(center);
  const turn = new Quaternion().setFromUnitVectors(radial.divideScalar(range), nextRadial.clone().normalize());
  target.copy(camera.position).add(gaze.applyQuaternion(turn).multiplyScalar(nextRadial.length() / range));
  camera.quaternion.copy(turn.multiply(orientation));
  camera.updateMatrixWorld();
  return changed;
}
