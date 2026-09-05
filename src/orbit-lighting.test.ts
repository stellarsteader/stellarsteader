import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { orbitLightingState } from './orbit-lighting';
import { orbitPosition, physicalState } from './astronomy';

test('orbit sunlight points toward the Sun and texture noon aligns with it', () => {
  for (const date of [new Date('2026-03-20T12:00Z'), new Date('2026-09-06T00:00Z')]) {
    for (const id of ['earth', 'moon', 'mars'] as const) {
      const light = orbitLightingState(id, date);
      const physical = physicalState(id, date);
      const lat = physical.subsolarLatitude * Math.PI / 180, lon = physical.subsolarLongitude * Math.PI / 180;
      const noon = new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).applyQuaternion(light.orientation);
      assert.ok(noon.distanceTo(light.sun.clone().normalize()) < 1e-10);
      if (id !== 'moon') assert.ok(light.sun.clone().normalize().dot(new Vector3(...orbitPosition(id, date)).normalize()) < -0.99999999);
    }
  }
});

test('Earth and Moon shadows use physical separation independent of diagram scales', () => {
  const date = new Date('2026-09-06T00:00Z');
  const earth = orbitLightingState('earth', date), moon = orbitLightingState('moon', date);
  assert.ok(earth.occluder.length() > 350000 && earth.occluder.length() < 410000);
  assert.ok(earth.occluder.clone().add(moon.occluder).length() < 1e-9);
  assert.equal(earth.occluderRadius, 1737.4);
  assert.equal(moon.occluderRadius, 6371);
  assert.equal(orbitLightingState('mars', date).occluderRadius, 0);
});
