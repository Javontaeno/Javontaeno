// Campaign progress, saved at the start of every mission.
const KEY = 'shadowweb-save';

export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.v === 1 ? s : null; } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...data })); } catch { /* storage blocked */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
