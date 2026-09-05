import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLocalTime } from './place-time';
import { physicalState } from './astronomy';

const newYork = { body: 'earth' as const, latitude: 40.7128, longitude: -74.006 };
test('Earth local time follows the scene date and daylight-saving transitions', () => {
  assert.equal(placeLocalTime(newYork, new Date('2026-01-15T12:00:00Z')).time, '07:00:00');
  assert.equal(placeLocalTime(newYork, new Date('2026-07-15T12:00:00Z')).time, '08:00:00');
  assert.equal(placeLocalTime(newYork, new Date('2026-03-08T06:59:59Z')).time, '01:59:59');
  assert.equal(placeLocalTime(newYork, new Date('2026-03-08T07:00:00Z')).time, '03:00:00');
});

test('local dates cross UTC midnight correctly and preserve fractional-hour offsets', () => {
  const date = new Date('2026-09-05T18:30:45Z');
  const seoul = placeLocalTime({ body: 'earth', latitude: 37.5665, longitude: 126.978 }, date);
  assert.equal(seoul.zone, 'Asia/Seoul');
  assert.equal(seoul.time, '03:30:45');
  assert.match(seoul.detail, /^Sep 06, 2026/);
  const kathmandu = placeLocalTime({ body: 'earth', latitude: 27.7172, longitude: 85.324 }, date);
  assert.equal(kathmandu.time, '00:15:45');
  assert.match(kathmandu.detail, /^Sep 06, 2026/);
});

test('Moon and Mars use solar noon and midnight rather than Earth civil time zones', () => {
  const date = new Date('2026-09-05T12:00:00Z');
  for (const body of ['moon', 'mars'] as const) {
    const sun = physicalState(body, date).subsolarLongitude;
    const noon = placeLocalTime({ body, latitude: 0, longitude: sun }, date);
    const midnight = placeLocalTime({ body, latitude: 0, longitude: sun + 180 }, date);
    assert.equal(noon.label, 'Local solar time');
    assert.equal(noon.time, '12:00');
    assert.equal(midnight.time, '00:00');
    assert.equal(noon.zone, '');
  }
});

test('invalid Earth coordinates never silently use the viewer time zone', () => {
  assert.equal(placeLocalTime({ body: 'earth', latitude: NaN, longitude: 0 }, new Date()).time, 'Unavailable');
});
