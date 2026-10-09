// Player options, persisted per browser. Arachnophobia mode is on by default.
const KEY = 'shadowweb-settings';
const DEFAULTS = { arach: true, invertY: false, sens: 1, vibration: true };

export const SETTINGS = { ...DEFAULTS };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* storage blocked */ }
}
