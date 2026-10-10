// Player options, persisted per browser.
const KEY = 'shadowweb-settings';
// arach: arachnophobia mode — changes spider-shaped ENEMIES only (never the suit or spider-sense).
const DEFAULTS = { arach: true, invertY: false, sens: 1, vibration: true, tutorial: true };

export const SETTINGS = { ...DEFAULTS };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage blocked */ }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch { /* storage blocked */ }
}
