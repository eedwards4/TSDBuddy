export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function formatMinutes(decimalMinutes) {
  const safeValue = Number.isFinite(decimalMinutes) ? decimalMinutes : 0;
  const totalHundredths = Math.max(0, Math.round(safeValue * 100));
  const minutes = Math.floor(totalHundredths / 100);
  const hundredths = totalHundredths % 100;

  return `${String(minutes).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function formatMiles(miles) {
  return `${Number(miles).toFixed(2)} mi`;
}

export function formatMph(speed) {
  return `${Math.round(speed)} mph`;
}

export function addMinutesToClock(clockValue, elapsedMinutes) {
  const [hourText, minuteText] = (clockValue ?? '08:30').split(':');
  const base = new Date();
  base.setHours(Number(hourText) || 8, Number(minuteText) || 30, 0, 0);
  base.setMinutes(base.getMinutes() + Math.floor(elapsedMinutes));
  base.setSeconds(base.getSeconds() + Math.round((elapsedMinutes % 1) * 60));

  const hours = String(base.getHours()).padStart(2, '0');
  const minutes = String(base.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
