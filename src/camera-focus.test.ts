import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { followCameraFocus, rotateAroundSurfaceFocus, updateReleasedCamera } from './camera-focus';

function centered(camera: PerspectiveCamera, point: Vector3) {
  camera.updateMatrixWorld(true);
  const projected = point.clone().project(camera);
  assert.ok(Math.hypot(projected.x, projected.y) < 1e-10);
}
test('Moving focus preserves viewing distance, lens and a centered object', () => {
  const camera = new PerspectiveCamera(35, 1.6, .001, 1000), target = new Vector3(1,2,3);
  camera.position.set(4,5,8); camera.lookAt(target);
  const distance = camera.position.distanceTo(target), offset = camera.position.clone().sub(target);
  followCameraFocus(camera, target, new Vector3(-5,8,2));
  assert.ok(camera.position.distanceTo(target.clone().add(offset)) < 1e-10);
  assert.ok(Math.abs(camera.position.distanceTo(target)-distance)<1e-10);
  assert.equal(camera.fov,35); assert.equal(camera.zoom,1); centered(camera,target);
});
test('Satellite orbital tracking stays outside the planet through a full orbit without changing zoom', () => {
  const camera = new PerspectiveCamera(), center = new Vector3(10,0,0), target = new Vector3(11.1,0,0);
  camera.position.set(11.4,.1,0); camera.lookAt(target);
  const distance=camera.position.distanceTo(target), radius=camera.position.distanceTo(center);
  for(let i=1;i<=360;i++){
    const a=i*Math.PI/180;
    followCameraFocus(camera,target,new Vector3(10+1.1*Math.cos(a),0,1.1*Math.sin(a)),center);
    assert.ok(Math.abs(camera.position.distanceTo(target)-distance)<1e-9);
    assert.ok(Math.abs(camera.position.distanceTo(center)-radius)<1e-9);
    centered(camera,target);
  }
});
test('Surface-centered rotation preserves altitude and keeps a nadir location centered', () => {
  const camera=new PerspectiveCamera(), target=new Vector3(0,0,1), normal=target.clone();
  camera.position.set(0,0,1.2); camera.lookAt(target);
  const before=camera.quaternion.clone();
  for(let i=0;i<90;i++)rotateAroundSurfaceFocus(camera,target,normal,Math.PI/180);
  centered(camera,target);
  assert.ok(Math.abs(camera.position.length()-1.2)<1e-12);
  assert.ok(Math.abs(camera.position.distanceTo(target)-.2)<1e-12);
  assert.ok(Math.abs(before.dot(camera.quaternion))<.8,'Auto-turn still changes the view directly above a location');
});
test('Oblique surface orbit keeps its slant range and never sweeps through the globe',()=>{
  const camera=new PerspectiveCamera(),target=new Vector3(0,1,0);
  camera.position.set(.2,1.3,.4);camera.lookAt(target);
  const radius=camera.position.length(),range=camera.position.distanceTo(target);
  for(let i=0;i<180;i++){
    rotateAroundSurfaceFocus(camera,target,target,Math.PI/90);
    assert.ok(Math.abs(camera.position.length()-radius)<1e-10);
    assert.ok(Math.abs(camera.position.distanceTo(target)-range)<1e-10);centered(camera,target);
  }
});


test('Released drag uses the planet pivot, preserves altitude and no longer centers the old satellite', () => {
  const camera = new PerspectiveCamera(35, 1.6, .001, 1000), center = new Vector3(10, 0, 0);
  const oldSatellite = new Vector3(10.8, .2, 1), controls = new OrbitControls(camera);
  camera.position.set(11, .3, 1.5); controls.target.copy(oldSatellite); camera.lookAt(oldSatellite);
  controls.enableDamping = true;
  const update = controls.update.bind(controls);
  controls.update = delta => updateReleasedCamera(camera, controls.target, center, () => update(delta));
  const position = camera.position.clone(), orientation = camera.quaternion.clone(), target = controls.target.clone();
  const radius = position.distanceTo(center);
  for (let i = 0; i < 10; i++) controls.update();
  assert.ok(camera.position.distanceTo(position) < 1e-10);
  assert.ok(1 - Math.abs(camera.quaternion.dot(orientation)) < 1e-10);
  assert.ok(controls.target.distanceTo(target) < 1e-10);
  controls.rotateLeft(.4); controls.rotateUp(.2);
  for (let i = 0; i < 120; i++) {
    controls.update();
    assert.ok(Math.abs(camera.position.distanceTo(center) - radius) < 1e-9);
  }
  assert.ok(camera.position.distanceTo(position) > .1);
  const oldScreen = oldSatellite.clone().project(camera);
  assert.ok(Math.hypot(oldScreen.x, oldScreen.y) > .01);
  assert.equal(camera.fov, 35); assert.equal(camera.zoom, 1);
  const beforeZoom = camera.position.distanceTo(center);
  controls.dollyIn(.82);
  assert.ok(Math.abs(camera.position.distanceTo(center) - beforeZoom * .82) < 1e-9);
  controls.dollyOut(1 / 1.22);
  assert.ok(Math.abs(camera.position.distanceTo(center) - beforeZoom * .82 * 1.22) < 1e-9);
});
