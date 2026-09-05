import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stars, starDirection, starColor } from './star-catalog';

test('bundled catalog contains real naked-eye stars, excludes the Sun, and retains Sirius', () => {
  assert.equal(stars.length, 8920);
  assert.equal(new Set(stars.map(s => s[0])).size, stars.length);
  for (const [id, ra, dec, mag, bv] of stars) {
    assert.ok(id > 0 && ra >= 0 && ra < 24 && Math.abs(dec) <= 90 && mag <= 6.5);
    assert.ok(bv === null || Number.isFinite(bv));
    assert.ok(Math.abs(Math.hypot(...starDirection(ra, dec)) - 1) < 1e-12);
  }
  const sirius = stars.find(s => Math.abs(s[1] - 6.75248) < 0.0001 && Math.abs(s[2] + 16.7161) < 0.001);
  assert.equal(sirius?.[3], -1.44);
});

test('J2000 stars align with the ecliptic Y-up orbit axes', () => {
  const equinox = starDirection(0, 0);
  assert.ok(Math.abs(equinox[0] - 1) < 1e-12);
  assert.ok(Math.abs(equinox[1]) < 1e-12 && Math.abs(equinox[2]) < 1e-12);
  const pole = starDirection(18, 66.5607089);
  assert.ok(pole[1] > 0.999999999 && Math.abs(pole[0]) < 1e-6 && Math.abs(pole[2]) < 1e-6);
});

test('color index preserves blue/red ordering and handles missing colors', () => {
  assert.deepEqual(starColor(null), [1, 1, 1]);
  assert.ok(starColor(-0.3)[2] > starColor(-0.3)[0]);
  assert.ok(starColor(1.8)[0] > starColor(1.8)[2]);
  for (const bv of [-5, -0.4, 0, 0.65, 1.4, 2, 9]) assert.ok(starColor(bv).every(c => Number.isFinite(c) && c >= 0 && c <= 1));
});
