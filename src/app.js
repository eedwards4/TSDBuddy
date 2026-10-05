import {
  DEFAULT_CHECKPOINTS,
  DEFAULT_SPEED_CHANGES,
  DEFAULT_START_TIME,
  DEFAULT_WAYPOINTS,
} from './data/defaults.js';
import { createRunState, adjustOperatingSpeed, tickRun, calculateActualSpeed } from './simulation/rally.js';
import { addMinutesToClock, formatMinutes, formatMiles, formatMph } from './utils/format.js';

const checkpointList = document.querySelector('#checkpoint-list');
const waypointList = document.querySelector('#waypoint-list');
const speedChangeList = document.querySelector('#speed-change-list');
const announcementBox = document.querySelector('#announcement-box');
const logList = document.querySelector('#checkpoints-log');

const distanceValue = document.querySelector('#distance-value');
const speedValue = document.querySelector('#speed-value');
const timeValue = document.querySelector('#time-value');
const clockValue = document.querySelector('#clock-value');

const startButton = document.querySelector('#start-btn');
const pauseButton = document.querySelector('#pause-btn');
const stopButton = document.querySelector('#stop-btn');
const settingsToggle = document.querySelector('#settings-toggle');
const settingsPanel = document.querySelector('#settings-panel');

const appState = {
  run: null,
  lastFrameTime: 0,
};

function buildSingleInputList(container, values, placeholder) {
  container.innerHTML = '';

  values.forEach((value, index) => {
    const row = document.createElement('div');
    row.className = 'field-row';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.placeholder = placeholder;
    input.value = value;
    input.dataset.index = String(index);

    row.appendChild(input);
    container.appendChild(row);
  });
}

function buildSpeedInputs(values) {
  speedChangeList.innerHTML = '';

  values.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'speed-row';

    const distanceInput = document.createElement('input');
    distanceInput.type = 'number';
    distanceInput.step = '0.01';
    distanceInput.min = '0';
    distanceInput.placeholder = 'Miles';
    distanceInput.value = entry.distance;

    const speedInput = document.createElement('input');
    speedInput.type = 'number';
    speedInput.step = '1';
    speedInput.min = '0';
    speedInput.placeholder = 'MPH';
    speedInput.value = entry.speed;

    row.append(distanceInput, speedInput);
    speedChangeList.appendChild(row);
    row.dataset.index = String(index);
  });
}

function readNumericList(container) {
  return Array.from(container.querySelectorAll('input')).map((input) => input.value.trim());
}

function readSpeedRows() {
  return Array.from(speedChangeList.querySelectorAll('.speed-row')).map((row) => {
    const inputs = row.querySelectorAll('input');
    return {
      distance: inputs[0]?.value ?? '',
      speed: inputs[1]?.value ?? '',
    };
  });
}

function fillDefaultInputs() {
  buildSingleInputList(checkpointList, DEFAULT_CHECKPOINTS, '00.00');
  buildSingleInputList(waypointList, DEFAULT_WAYPOINTS, '00.00');
  buildSpeedInputs(DEFAULT_SPEED_CHANGES);
}

function buildConfigFromForm() {
  return {
    checkpoints: readNumericList(checkpointList),
    waypoints: readNumericList(waypointList),
    speedChanges: readSpeedRows(),
    startSpeed: Number.parseFloat(document.querySelector('#start-speed').value) || 25,
    startTime: document.querySelector('#start-time').value || DEFAULT_START_TIME,
  };
}

function resetRouteLog() {
  logList.innerHTML = '';
}

function setAnnouncement(message) {
  announcementBox.textContent = message;
}

function renderCheckpointLog() {
  if (!appState.run) {
    logList.innerHTML = '<li>Run not started.</li>';
    return;
  }

  logList.innerHTML = '';

  for (const checkpoint of appState.run.checkpoints) {
    const item = document.createElement('li');
    if (checkpoint.passed) {
      const diffText = Math.abs(checkpoint.differenceMinutes ?? 0).toFixed(2);
      const descriptor = checkpoint.differenceMinutes < 0 ? 'Early' : 'Late';
      item.textContent = `${checkpoint.label} at ${checkpoint.mile.toFixed(2)} mi: ${descriptor} ${diffText} min`;
    } else if (checkpoint.approached) {
      item.textContent = `${checkpoint.label} approaching at ${checkpoint.mile.toFixed(2)} mi`;
    } else {
      item.textContent = `${checkpoint.label} at ${checkpoint.mile.toFixed(2)} mi`;
    }

    logList.appendChild(item);
  }
}

function renderLiveReadout() {
  if (!appState.run) {
    distanceValue.textContent = '0.00';
    speedValue.textContent = '0';
    timeValue.textContent = '00.00';
    clockValue.textContent = DEFAULT_START_TIME;
    return;
  }

  const elapsedMinutes = appState.run.elapsedMinutes;
  distanceValue.textContent = Number(appState.run.distance).toFixed(2);
  speedValue.textContent = String(Math.round(calculateActualSpeed(appState.run)));
  timeValue.textContent = formatMinutes(elapsedMinutes);
  clockValue.textContent = addMinutesToClock(appState.run.startTime, elapsedMinutes);
}

function startRun() {
  const config = buildConfigFromForm();
  appState.run = createRunState(config);
  appState.run.running = true;
  appState.run.paused = false;
  appState.run.frozen = false;
  appState.lastFrameTime = performance.now();
  appState.run.announcement = 'Run started. Watch the checkpoints.';
  setAnnouncement(appState.run.announcement);
  resetRouteLog();
  renderCheckpointLog();
  renderLiveReadout();
}

function togglePause() {
  if (!appState.run) {
    return;
  }

  appState.run.paused = !appState.run.paused;
  appState.run.running = !appState.run.paused;
  appState.lastFrameTime = performance.now();
  setAnnouncement(appState.run.paused ? 'Run paused.' : 'Run resumed.');
}

function stopRun() {
  appState.run = null;
  appState.lastFrameTime = 0;
  resetRouteLog();
  setAnnouncement('Run stopped. Ready to start again.');
  renderLiveReadout();
  renderCheckpointLog();
}

function toggleSettingsPanel() {
  const isCollapsed = settingsPanel.dataset.collapsed === 'true';
  settingsPanel.dataset.collapsed = String(!isCollapsed);
  settingsToggle.setAttribute('aria-expanded', String(!isCollapsed));
  settingsToggle.title = isCollapsed ? 'Collapse settings' : 'Expand settings';
}

function adjustSpeed(delta) {
  if (!appState.run) {
    return;
  }

  const offset = adjustOperatingSpeed(appState.run, delta);
  setAnnouncement(`Operating speed adjusted to ${offset} mph.`);
}

function onKeyDown(event) {
  const { key } = event;

  if (key === ' ' || event.code === 'Space') {
    event.preventDefault();
    if (appState.run) {
      appState.run.frozen = !appState.run.frozen;
      setAnnouncement(appState.run.frozen ? 'Display frozen. Run continues in background.' : 'Display unfrozen.');
    }
    return;
  }

  if (key === 'ArrowUp' || key === '+') {
    event.preventDefault();
    adjustSpeed(1);
    return;
  }

  if (key === 'ArrowDown' || key === '-') {
    event.preventDefault();
    adjustSpeed(-1);
  }

  if (key.toLowerCase() === 'p') {
    event.preventDefault();
    togglePause();
  }
}

function updateFrame(timestamp) {
  if (appState.run && appState.run.running && !appState.run.paused) {
    const deltaSeconds = appState.lastFrameTime
      ? Math.min((timestamp - appState.lastFrameTime) / 1000, 0.25)
      : 0.016;

    tickRun(appState.run, deltaSeconds);

    if (!appState.run.frozen) {
      renderCheckpointLog();
      renderLiveReadout();
      setAnnouncement(appState.run.announcement);
    }
  }

  appState.lastFrameTime = timestamp;
  window.requestAnimationFrame(updateFrame);
}

startButton.addEventListener('click', startRun);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopRun);
settingsToggle.addEventListener('click', toggleSettingsPanel);
document.addEventListener('keydown', onKeyDown);
document.querySelectorAll('[data-speed-adjust]').forEach((button) => {
  button.addEventListener('click', () => {
    adjustSpeed(Number.parseInt(button.dataset.speedAdjust, 10) || 0);
  });
});

fillDefaultInputs();
resetRouteLog();
setAnnouncement('Ready to start.');
window.requestAnimationFrame(updateFrame);
