// Player options, persisted per browser.
const KEY = 'shadowweb-settings';
const DEFAULTS = { invertY: false, sens: 1, vibration: true };

export const SETTINGS = { ...DEFAULTS };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* storage blocked */ }
}
