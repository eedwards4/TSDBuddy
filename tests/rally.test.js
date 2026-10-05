import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWaypointPlan,
  computePerfectArrivalMinutes,
  createRunState,
  tickRun,
} from '../src/simulation/rally.js';

test('waypoint plan keeps route distances in a realistic range', () => {
  const plan = buildWaypointPlan(['1.10', '3.40', '2.80']);

  assert.ok(plan.length >= 3);
  assert.ok(plan.every((point) => point.mile >= 2));
  assert.ok(plan.every((point) => point.mile <= 20));
  assert.ok(plan[0].mile < plan[plan.length - 1].mile);
});

test('perfect arrival formula calculates checkpoint time from speed segments', () => {
  const elapsed = computePerfectArrivalMinutes({
    checkpointDistance: 4.25,
    startSpeed: 25,
    speedChanges: [
      { distance: 1.50, speed: 30 },
      { distance: 3.25, speed: 36 },
    ],
  });

  assert.ok(elapsed > 0);
  assert.ok(Number.isFinite(elapsed));
  assert.equal(elapsed.toFixed(3), '8.767');
});

test('simulator advances distance and updates checkpoint status', () => {
  const run = createRunState({
    checkpoints: ['2.25'],
    waypoints: ['1.50'],
    speedChanges: [{ distance: 0.00, speed: 25 }],
    startSpeed: 25,
    startTime: '08:30',
  });

  run.running = true;
  tickRun(run, 60);

  assert.ok(run.distance > 0);
  assert.ok(run.elapsedMinutes > 0);
  assert.equal(run.checkpoints.length, 1);
});

test('mileage advances at a realistic rate over a one-second tick', () => {
  const run = createRunState({
    checkpoints: ['3.00'],
    waypoints: ['1.50'],
    speedChanges: [{ distance: 0.00, speed: 25 }],
    startSpeed: 25,
    startTime: '08:30',
  });

  run.running = true;
  tickRun(run, 1);

  assert.ok(run.distance > 0.005);
  assert.ok(run.distance < 0.02);
  assert.ok(run.elapsedMinutes > 0.015);
});
