import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, satellitePosition, satellitePath, coverage, ecfToGlobe, dataStatus, type Sample, type SatelliteCatalog } from './satellites';
import { bodies } from './astronomy';

const catalog = JSON.parse(readFileSync(new URL('../public/data/satellites.json', import.meta.url), 'utf8')) as SatelliteCatalog;

test('Hermite respects km/s velocities, exact endpoints, and refuses extrapolation', () => {
  const samples: Sample[] = [[1000, 10, 20, 30, 1, 2, 3], [11000, 20, 40, 60, 1, 2, 3]];
  assert.deepEqual(interpolate(samples, 6000)?.toArray(), [15, 30, 45]);
  assert.deepEqual(interpolate(samples, 1000)?.toArray(), [10, 20, 30]);
  assert.deepEqual(interpolate(samples, 11000)?.toArray(), [20, 40, 60]);
  assert.equal(interpolate(samples, 999), null);
  assert.equal(interpolate(samples, 11001), null);
});

test('Earth-fixed mapping preserves Greenwich, east longitude, and north axes', () => {
  assert.deepEqual(ecfToGlobe({ x: 1, y: 0, z: 0 }).toArray().map(n => n || 0), [1, 0, 0]);
  assert.deepEqual(ecfToGlobe({ x: 0, y: 1, z: 0 }).toArray(), [0, 0, -1]);
  assert.deepEqual(ecfToGlobe({ x: 0, y: 0, z: 1 }).toArray().map(n => n || 0), [0, 1, 0]);
});

test('Downloaded catalog includes artificial satellites at all three bodies and both Martian moons', () => {
  for (const parent of ['earth', 'moon', 'mars']) assert.ok(catalog.satellites.some(s => s.parent === parent && s.kind === 'spacecraft'));
  for (const id of ['phobos', 'deimos']) assert.equal(catalog.satellites.find(s => s.id === id)?.kind, 'natural');
  assert.equal(new Set(catalog.satellites.map(s => s.id)).size, catalog.satellites.length);
});

test('All downloaded trajectories remain finite and outside the parent body at covered epochs', () => {
  for (const s of catalog.satellites) {
    const [start, stop] = coverage(s);
    for (const fraction of [0.25, 0.5, 0.75]) {
      const position = satellitePosition(s, new Date(start + fraction * (stop - start)));
      assert.ok(position, s.id);
      assert.ok(position.length() > bodies[s.parent].radius, `${s.id}: above surface`);
      assert.ok(position.length() < (s.kind === 'natural' ? 25000 : 50000), `${s.id}: local orbit, not a heliocentric vector`);
    }
  }
});

test('Natural-moon radii distinguish Phobos from Deimos and preserve physical scale', () => {
  for (const [id, minimum, maximum] of [['phobos', 9200, 9600], ['deimos', 23000, 24000]] as const) {
    const satellite = catalog.satellites.find(s => s.id === id)!;
    const [start, stop] = coverage(satellite);
    const radius = satellitePosition(satellite, new Date((start + stop) / 2))!.length();
    assert.ok(radius > minimum && radius < maximum, `${id}: ${radius} km`);
  }
});

test('Out-of-coverage spacecraft have neither a marker nor a invented orbital path', () => {
  for (const s of catalog.satellites) {
    const [start, stop] = coverage(s);
    for (const t of [start - 1, stop + 1]) {
      assert.equal(satellitePosition(s, new Date(t)), null, s.id);
      assert.deepEqual(satellitePath(s, new Date(t)), [], s.id);
    }
  }
});

test('MAVEN historical data is labeled historical and cannot be shown at the snapshot scene time', () => {
  const maven = catalog.satellites.find(s => s.id === 'maven');
  assert.ok(maven);
  if (maven.historical) {
    assert.equal(satellitePosition(maven, new Date(catalog.fetchedAt)), null);
    const [start, end] = coverage(maven);
    assert.equal(dataStatus(maven, new Date((start + end) / 2)), 'Historical trajectory');
  }
});
