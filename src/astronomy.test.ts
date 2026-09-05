import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { orbitSamples, orbitGuideSamples, orbitPosition, physicalState, solarTime, julianDate } from './astronomy';

test('Earth subsolar geometry agrees with the March equinox and June solstice', () => {
  const equinox = physicalState('earth', new Date('2026-03-20T14:46:00Z'));
  const solstice = physicalState('earth', new Date('2026-06-21T08:24:00Z'));
  assert.ok(Math.abs(equinox.subsolarLatitude) < 0.1);
  assert.ok(Math.abs(solstice.subsolarLatitude - 23.44) < 0.15);
  // At Greenwich noon near the equinox the subsolar meridian is close to zero.
  assert.ok(Math.abs(physicalState('earth', new Date('2026-03-20T12:00:00Z')).subsolarLongitude) < 3);
});

test('body frames are orthonormal and mapped texture coordinates face the calculated Sun', () => {
  for (const id of ['earth', 'moon', 'mars'] as const) {
    const s = physicalState(id, new Date('2026-09-05T12:00:00Z'));
    assert.ok(Math.abs(s.orientation.length() - 1) < 1e-10);
    const north = new Vector3(0, 1, 0).applyQuaternion(s.orientation);
    assert.ok(north.distanceTo(s.north) < 1e-10);
    const lat = s.subsolarLatitude * Math.PI / 180, lon = s.subsolarLongitude * Math.PI / 180;
    const normal = new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).applyQuaternion(s.orientation);
    assert.ok(normal.distanceTo(s.sun) < 1e-10);
  }
});

test('orbit paths use physical scales and finite positions', () => {
  const date = new Date('2026-09-05T12:00:00Z');
  for (const id of ['earth', 'moon', 'mars'] as const) {
    const samples = orbitSamples(id, date, 48);
    assert.equal(samples.length, 49);
    const radii = samples.map(p => Math.hypot(...p));
    assert.ok(samples.flat().every(Number.isFinite));
    assert.ok(radii.every(r => id === 'earth' ? r > 3.9 && r < 4.1 : id === 'moon' ? r > 3.4 && r < 4.2 : r > 5.4 && r < 6.8));
  }
});

test('solar time wraps across the date line and epoch uses UTC', () => {
  assert.equal(solarTime(0, 0), '12:00');
  assert.equal(solarTime(180, 0), '00:00');
  assert.equal(solarTime(-180, 0), '00:00');
  assert.equal(julianDate(new Date('2000-01-01T12:00:00Z')), 2451545);
});

test('closed orbit guides meet exactly and pass through the current ephemeris position', () => {
  for (const epoch of ['2026-03-20T12:00:00Z', '2026-09-05T12:00:00Z', '2027-01-01T00:00:00Z']) {
    const date = new Date(epoch);
    for (const id of ['earth', 'moon', 'mars'] as const) {
      const points = orbitGuideSamples(id, date);
      assert.deepEqual(points[0], points.at(-1), `${id}: exact seam closure`);
      assert.ok(points.flat().every(Number.isFinite));
      const current = new Vector3(...orbitPosition(id, date));
      assert.ok(current.distanceTo(new Vector3(...points[0]!)) < 1e-7, `${id}: marker lies on guide`);
      const lengths = points.slice(1).map((p, i) => new Vector3(...p).distanceTo(new Vector3(...points[i]!)));
      assert.ok(Math.max(...lengths) / Math.min(...lengths) < 1.6, `${id}: no long closing chord`);
      // A centered difference around the seam must follow the actual direction of motion.
      const tangent = new Vector3(...points[1]!).sub(new Vector3(...points.at(-2)!)).normalize();
      const velocity = new Vector3(...orbitPosition(id, new Date(date.getTime() + 60000)))
        .sub(new Vector3(...orbitPosition(id, new Date(date.getTime() - 60000)))).normalize();
      assert.ok(tangent.dot(velocity) > 0.9999, `${id}: guide is tangent to the current trajectory`);
    }
  }
});
