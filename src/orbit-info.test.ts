import test from 'node:test';
import assert from 'node:assert/strict';
import { orbitalReadout, nextOrbitEvents } from './orbit-info';
import { physicalState, orbitPosition, AU_KM } from './astronomy';

const epoch = new Date('2026-09-05T12:00:00Z');
test('Orbit readouts use the same positions as the rendered trajectories and convert velocities to km/s', () => {
  for (const id of ['earth', 'moon', 'mars'] as const) {
    const state = orbitalReadout(id, epoch);
    assert.ok(Math.abs(state.distanceKm - physicalState(id, epoch).distance) < .001);
    assert.equal(state.primary, id === 'moon' ? 'Earth' : 'Sun');
    const earlier = orbitPosition(id, new Date(+epoch - 30000));
    const later = orbitPosition(id, new Date(+epoch + 30000));
    const scaleKm = id === 'moon' ? 100000 : AU_KM / 4;
    const finiteDifferenceSpeed = Math.hypot(...later.map((n, i) => (n - earlier[i]) * scaleKm / 60));
    assert.ok(Math.abs(finiteDifferenceSpeed - state.speedKmS) < .005, `${id}: ${finiteDifferenceSpeed} versus ${state.speedKmS}`);
    const change = (orbitalReadout(id, new Date(+epoch + 30000)).distanceKm - orbitalReadout(id, new Date(+epoch - 30000)).distanceKm) / 60;
    assert.ok(Math.abs(change - state.radialKmS) < .005);
    assert.ok(Number.isFinite(state.inclinationDeg) && state.inclinationDeg >= 0 && state.inclinationDeg < 6);
  }
  assert.ok(orbitalReadout('earth', epoch).speedKmS > 29);
  assert.ok(orbitalReadout('moon', epoch).speedKmS < 1.3);
});

test('Upcoming extrema are chronological, alternate kinds and match local distance extrema', () => {
  for (const id of ['earth', 'moon', 'mars'] as const) {
    const events = nextOrbitEvents(id, epoch);
    assert.equal(events.length, 2);
    assert.ok(events[0].time > +epoch && events[1].time > events[0].time);
    assert.notEqual(events[0].kind, events[1].kind);
    for (const event of events) {
      const at = orbitalReadout(id, new Date(event.time)).distanceKm;
      assert.ok(Math.abs(event.distanceKm - at) < 1);
      for (const direction of [-1, 1]) {
        const near = orbitalReadout(id, new Date(event.time + direction * 6 * 3600000)).distanceKm;
        assert.ok(event.kind === 'closest' ? at < near : at > near, `${id} ${event.name}`);
      }
    }
  }
});
