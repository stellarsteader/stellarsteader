import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AU_KM, orbitGuideSamples, orbitPosition } from './astronomy';
import { LUNAR_CONTEXT_MAGNIFICATION, LUNAR_CONTEXT_SCALE, moonPositionInSolarView } from './orbit-layout';

test('magnified Moon preserves its Earth-relative direction and follows Earth across scene dates', () => {
  for (const epoch of ['2026-09-06T00:00:00Z', '2026-09-20T12:00:00Z', '2027-03-01T00:00:00Z']) {
    const date = new Date(epoch);
    const earth = new Vector3(...orbitPosition('earth', date));
    const moon = new Vector3(...moonPositionInSolarView(date));
    const relative = moon.clone().sub(earth);
    const physical = new Vector3(...orbitPosition('moon', date));
    assert.ok(relative.clone().normalize().dot(physical.clone().normalize()) > 1 - 1e-12);
    const physicalSolarScale = physical.length() * 100000 / AU_KM * 4;
    assert.ok(Math.abs(relative.length() / physicalSolarScale - LUNAR_CONTEXT_MAGNIFICATION) < 1e-10);
    assert.ok(relative.length() > 0.7 && relative.length() < 0.9);
    const guide = orbitGuideSamples('moon', date).map(p => new Vector3(...p).multiplyScalar(LUNAR_CONTEXT_SCALE).add(earth));
    assert.ok(guide[0]!.distanceTo(moon) < 1e-7, 'Moon lies on the enlarged guide at its epoch');
    assert.deepEqual(guide[0], guide.at(-1), 'enlargement preserves exact loop closure');
  }
});
