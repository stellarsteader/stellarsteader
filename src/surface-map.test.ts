import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Object3D, PerspectiveCamera } from 'three';
import { SurfaceMap, surfacePoint, mapLevel, detailDistanceRatio, surfaceDragSpeed, overlaps, type Place, type PlaceCatalog } from './surface-map';

test('Map coordinates agree with the globe prime meridian, east, poles and date line', () => {
  assert.ok(surfacePoint(0, 0).distanceTo({ x: 1, y: 0, z: 0 }) < 1e-12);
  assert.ok(surfacePoint(0, 90).distanceTo({ x: 0, y: 0, z: -1 }) < 1e-12);
  assert.ok(surfacePoint(90, 32).distanceTo({ x: 0, y: 1, z: 0 }) < 1e-12);
  assert.ok(surfacePoint(0, 180).distanceTo(surfacePoint(0, -180)) < 1e-12);
});

test('Map detail progresses from prominent places to smaller features as altitude decreases', () => {
  assert.deepEqual([5, 2, 0.8, 0.2].map(mapLevel), [0, 1, 2, 3]);
});

const place = (id: string, longitude: number, level = 0): Place => ({ id, body: 'mars', name: id, kind: 'Crater', context: '', latitude: 0, longitude, level, importance: 1, sourceUrl: 'https://planetarynames.wr.usgs.gov/' });
test('Surface label visibility excludes the far side and close-range hidden horizon', () => {
  const surface = new Object3D(); surface.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(35, 1440 / 900, 0.01, 1000);
  camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const map = new SurfaceMap();
  map.setPlaces([place('front', -90), place('back', 90)]);
  assert.deepEqual(map.update(surface, camera, 1440, 900, 3389.5).labels.filter(l => l.visible).map(l => l.place.id), ['front']);
  camera.position.set(0, 0, 1.1); camera.updateMatrixWorld(true);
  map.setPlaces([place('nearby', -90, 3), place('beyond-close-horizon', -60, 3)]);
  assert.deepEqual(map.update(surface, camera, 1440, 900, 3389.5).labels.filter(l => l.visible).map(l => l.place.id), ['nearby']);
});

test('Phone scene labels remain visible in the compact globe viewport', () => {
  const surface = new Object3D(); surface.updateMatrixWorld(true);
  for (const [width, height] of [[390, 354], [320, 260]]) {
    const camera = new PerspectiveCamera(35, width / height, 0.01, 1000);
    camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const map = new SurfaceMap(); map.setPlaces([place('front', -90), place('back', 90)]);
    assert.deepEqual(map.update(surface, camera, width, height, 3389.5).labels.filter(l => l.visible).map(l => l.place.id), ['front']);
  }
});

test('Priority placement suppresses overlapping names at the same location', () => {
  const surface = new Object3D(); surface.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(35, 1.6, 0.01, 1000);
  camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const map = new SurfaceMap(); map.setPlaces([place('one', -90), { ...place('two', -90), importance: 3 }]);
  assert.deepEqual(map.update(surface, camera, 1440, 900, 3389.5).labels.map(l => l.place.id), ['two']);
  assert.equal(overlaps({ x: 0, y: 0, width: 100, height: 25 }, { x: 200, y: 0, width: 100, height: 25 }), false);
});

test('Desktop camera reserves symmetric side space while the globe stays at the screen center', () => {
  for (const [width, height] of [[1440, 900], [1366, 768], [1920, 1080]]) {
    const camera = new PerspectiveCamera(35, width / height, 0.01, 1000);
    camera.position.set(0, 0, detailDistanceRatio(width, height)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const center = surfacePoint(90, 0).set(0, 0, 0).project(camera);
    assert.ok(Math.abs(center.x) < 1e-12 && Math.abs(center.y) < 1e-12);
    const diameterPixels = height / (Math.tan(17.5 * Math.PI / 180) * Math.sqrt(camera.position.z ** 2 - 1));
    assert.ok(diameterPixels <= height * 0.681);
  }
});

test('Downloaded place catalog preserves source IDs, valid coordinates and major landmarks', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/data/places.json', import.meta.url), 'utf8')) as PlaceCatalog;
  assert.equal(new Set(catalog.places.map(p => p.id)).size, catalog.places.length);
  for (const body of ['earth', 'moon', 'mars']) assert.ok(catalog.places.filter(p => p.body === body).length > 1000);
  for (const p of catalog.places) assert.ok(Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && p.sourceUrl.startsWith('https://'));
  const olympus = catalog.places.find(p => p.id === 'mars-usgs-4453')!;
  assert.equal(olympus.name, 'Olympus Mons');
  assert.ok(olympus.latitude > 18 && olympus.latitude < 20 && olympus.longitude > -135 && olympus.longitude < -132);
  assert.ok(catalog.places.some(p => p.body === 'moon' && p.name === 'Tycho'));
  assert.ok(catalog.places.some(p => p.body === 'earth' && p.name === 'Seoul'));
});

test('Close surface navigation slows progressively without stalling', () => {
  const distances = [10, 3.5, 2, 1.5, 1.1, 1.08];
  const speeds = distances.map(surfaceDragSpeed);
  assert.equal(speeds[0], 0.45);
  for (let i = 1; i < speeds.length; i++) {
    assert.ok(speeds[i] <= speeds[i - 1] && speeds[i] > 0);
  }
  assert.ok(speeds.at(-1)! < speeds[0] / 20);
  assert.ok(surfaceDragSpeed(1) > 0);
});
