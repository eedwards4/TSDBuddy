import { clamp } from '../utils/format.js';

export function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

export function buildWaypointPlan(rawValues = []) {
  const normalized = rawValues
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (normalized.length === 0) {
    return [
      { id: 'wp-1', mile: 2.40 },
      { id: 'wp-2', mile: 5.10 },
      { id: 'wp-3', mile: 8.90 },
    ];
  }

  let cursor = 0;
  return normalized.map((value, index) => {
    const nextValue = value > 0 ? value : randomBetween(2, 5);
    const safeDistance = Math.max(2, Math.min(5, nextValue));
    cursor += index === 0 ? safeDistance : safeDistance;

    return {
      id: `wp-${index + 1}`,
      mile: Number(cursor.toFixed(2)),
    };
  });
}

export function buildSpeedSchedule(rawEntries = []) {
  const sorted = rawEntries
    .map((entry) => ({
      distance: Number.parseFloat(entry.distance ?? entry.position ?? entry.mile ?? 0),
      speed: Number.parseFloat(entry.speed ?? entry.mph ?? 0),
    }))
    .filter((entry) => Number.isFinite(entry.distance) && Number.isFinite(entry.speed) && entry.speed > 0)
    .sort((left, right) => left.distance - right.distance);

  return sorted;
}

export function getTargetSpeedAt(distance, speedSchedule = [], defaultSpeed = 25) {
  if (!Array.isArray(speedSchedule) || speedSchedule.length === 0) {
    return defaultSpeed;
  }

  let activeSpeed = defaultSpeed;
  for (const change of speedSchedule) {
    if (distance >= change.distance) {
      activeSpeed = change.speed;
    }
  }

  return activeSpeed;
}

export function computePerfectArrivalMinutes({
  checkpointDistance,
  startSpeed = 25,
  speedChanges = [],
  stops = [],
}) {
  const sortedChanges = [...speedChanges]
    .map((change) => ({
      distance: Number.parseFloat(change.distance ?? change.mile ?? 0),
      speed: Number.parseFloat(change.speed ?? change.mph ?? startSpeed),
    }))
    .filter((change) => Number.isFinite(change.distance) && Number.isFinite(change.speed))
    .sort((left, right) => left.distance - right.distance);

  const sortedStops = [...stops]
    .map((stop) => ({
      distance: Number.parseFloat(stop.distance ?? stop.mile ?? 0),
      durationMinutes: Number.parseFloat(stop.durationMinutes ?? stop.minutes ?? 0),
    }))
    .filter((stop) => Number.isFinite(stop.distance) && Number.isFinite(stop.durationMinutes))
    .sort((left, right) => left.distance - right.distance);

  const markers = [
    ...sortedChanges.map((change) => ({ distance: change.distance, type: 'speed', value: change.speed })),
    ...sortedStops.map((stop) => ({ distance: stop.distance, type: 'stop', value: stop.durationMinutes })),
  ].sort((left, right) => left.distance - right.distance);

  let elapsedMinutes = 0;
  let cursorDistance = 0;
  let currentSpeed = Number.isFinite(startSpeed) ? startSpeed : 25;

  for (const marker of markers) {
    if (marker.distance <= 0 || marker.distance > checkpointDistance) {
      continue;
    }

    const distanceTraveled = marker.distance - cursorDistance;
    if (distanceTraveled > 0) {
      elapsedMinutes += (distanceTraveled / currentSpeed) * 60;
    }

    cursorDistance = marker.distance;

    if (marker.type === 'speed') {
      currentSpeed = marker.value;
    }

    if (marker.type === 'stop') {
      elapsedMinutes += marker.value;
    }
  }

  const finalDistance = checkpointDistance - cursorDistance;
  if (finalDistance > 0) {
    elapsedMinutes += (finalDistance / currentSpeed) * 60;
  }

  return Number(elapsedMinutes.toFixed(3));
}

export function buildRouteFromInputs({
  checkpoints = [],
  waypoints = [],
  speedChanges = [],
  startSpeed = 25,
}) {
  const normalizedCheckpoints = checkpoints
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((mile, index) => ({
      id: `cp-${index + 1}`,
      label: `CP ${index + 1}`,
      mile: Number(mile.toFixed(2)),
    }))
    .sort((left, right) => left.mile - right.mile);

  const routeWaypoints = buildWaypointPlan(waypoints);
  const routeSpeedChanges = buildSpeedSchedule(speedChanges);

  return {
    checkpoints: normalizedCheckpoints,
    waypoints: routeWaypoints,
    speedSchedule: routeSpeedChanges,
    startSpeed,
  };
}

export function createRunState(config = {}) {
  const route = buildRouteFromInputs(config);

  return {
    route,
    running: false,
    paused: false,
    frozen: false,
    distance: 0,
    elapsedMinutes: 0,
    operatorSpeedOffset: 0,
    targetSpeed: config.startSpeed ?? 25,
    actualSpeed: config.startSpeed ?? 25,
    startTime: config.startTime ?? '08:30',
    announcement: 'Ready to start.',
    notes: [],
    checkpoints: route.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      approached: false,
      passed: false,
      differenceMinutes: null,
      status: 'pending',
    })),
  };
}

export function adjustOperatingSpeed(runState, delta) {
  if (!runState) {
    return 0;
  }

  runState.operatorSpeedOffset = clamp(runState.operatorSpeedOffset + delta, -20, 20);
  return runState.operatorSpeedOffset;
}

export function calculateActualSpeed(runState) {
  if (!runState) {
    return 0;
  }

  const targetSpeed = getTargetSpeedAt(runState.distance, runState.route.speedSchedule, runState.route.startSpeed);
  const turnPenalty = runState.route.waypoints.some((waypoint) => Math.abs(runState.distance - waypoint.mile) < 0.25)
    ? 5
    : 0;
  const drift = Math.sin((runState.elapsedMinutes * 60 + runState.distance * 10) / 11) * 4.25;
  const nextSpeed = targetSpeed + drift + runState.operatorSpeedOffset - turnPenalty;

  runState.targetSpeed = targetSpeed;
  runState.actualSpeed = clamp(nextSpeed, 0, 90);
  return runState.actualSpeed;
}

export function tickRun(runState, secondsDelta = 0) {
  if (!runState || !runState.running || runState.paused) {
    return runState;
  }

  const safeDelta = Number.isFinite(secondsDelta) ? Math.max(0, secondsDelta) : 0;
  runState.elapsedMinutes = Number((runState.elapsedMinutes + safeDelta / 60).toFixed(6));

  const currentSpeed = calculateActualSpeed(runState);
  const distanceDelta = (currentSpeed / 3600) * safeDelta;
  runState.distance = Number(Math.max(0, runState.distance + distanceDelta).toFixed(4));

  for (const checkpoint of runState.checkpoints) {
    const checkpointDistance = checkpoint.mile;

    if (!checkpoint.approached && runState.distance >= checkpointDistance - 0.25 && runState.distance < checkpointDistance) {
      checkpoint.approached = true;
      checkpoint.status = 'approaching';
      runState.announcement = `Checkpoint ${checkpoint.label} approaching in ${Math.max(0.1, checkpointDistance - runState.distance).toFixed(2)} miles.`;
      runState.notes.unshift({ kind: 'approach', text: `${checkpoint.label} approaching` });
    }

    if (!checkpoint.passed && runState.distance >= checkpointDistance) {
      const perfectTime = computePerfectArrivalMinutes({
        checkpointDistance,
        startSpeed: runState.route.startSpeed,
        speedChanges: runState.route.speedSchedule,
      });
      const differenceMinutes = runState.elapsedMinutes - perfectTime;
      checkpoint.passed = true;
      checkpoint.status = differenceMinutes < 0 ? 'early' : 'late';
      checkpoint.differenceMinutes = differenceMinutes;

      const directionLabel = differenceMinutes < 0 ? 'Early' : 'Late';
      const signedAbs = Math.abs(differenceMinutes).toFixed(2);
      runState.announcement = `${checkpoint.label} passed: ${directionLabel} ${signedAbs} minutes.`;
      runState.notes.unshift({ kind: 'passage', text: `${checkpoint.label}: ${directionLabel} ${signedAbs} min` });
    }
  }

  return runState;
}
