// Button prompts for keyboard/mouse, Xbox, PlayStation and Switch controllers.

export const KB = {
  move: 'W A S D', camera: 'Mouse', swing: 'Shift', jump: 'Space', attack: 'LMB', web: 'RMB', zip: 'E', dash: 'Q',
  dodge: 'C', finisher: 'F', heal: 'H', suit: 'R', bomb: 'G', time: 'T', recenter: 'V', help: 'I', pause: 'Esc', callin: 'X',
};
// Index into the W3C "standard" gamepad layout.
export const PAD = { jump: 0, dodge: 1, attack: 2, web: 3, zip: 4, dash: 5, finisher: 6, swing: 7, help: 8, pause: 9, callin: 10, recenter: 11, suit: 12, heal: 13, bomb: 14, time: 15 };

const LABELS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→'],
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→'],
};
LABELS.generic = LABELS.xbox;
const FACE = { xbox: ['xa', 'xb', 'xx', 'xy'], generic: ['xa', 'xb', 'xx', 'xy'], ps: ['pcross', 'pcircle', 'psq', 'ptri'], switch: ['sw', 'sw', 'sw', 'sw'] };
export const DEVICE_NAMES = { kbm: 'Keyboard & mouse', xbox: 'Xbox controller', ps: 'PlayStation controller', switch: 'Switch controller', generic: 'Controller' };

export function glyph(action, device) {
  if (device === 'kbm' || !device) return `<kbd>${KB[action] || action}</kbd>`;
  const L = LABELS[device] || LABELS.xbox;
  if (action === 'move') return `<span class="g stick">${device === 'ps' ? 'L' : 'LS'}</span>`;
  if (action === 'camera') return `<span class="g stick">${device === 'ps' ? 'R' : 'RS'}</span>`;
  const i = PAD[action];
  if (i === undefined) return '';
  if (i < 4) return `<span class="g face ${(FACE[device] || FACE.xbox)[i]}">${L[i]}</span>`;
  if (i < 8) return `<span class="g shoulder">${L[i]}</span>`;
  if (i < 12) return `<span class="g small">${L[i]}</span>`;
  return `<span class="g dpad">✚${L[i]}</span>`;
}

// Text shown in the controls panel and title screen.
export function controlRows() {
  const sense = 'spider-sense';
  return [
    ['move', 'Move'], ['camera', 'Camera'],
    ['swing', 'Hold: web-swing / sprint'], ['jump', 'Jump · hold = super jump'],
    ['attack', 'Strike · hold = launcher'], ['web', 'Web shot · hold = yank'],
    ['zip', 'Zip to point / web strike'], ['dash', 'Air web-zip dash'],
    ['dodge', `Dodge · on ${sense} = perfect`], ['finisher', 'Finisher (focus)'],
    ['heal', 'Heal (focus)'], ['suit', 'Switch suit'],
    ['bomb', 'Web bomb / symbiote surge'], ['time', 'Time of day'],
    ['callin', 'Call an ally (story)'], ['recenter', 'Recenter camera'], ['help', 'Show / hide controls'],
    ['pause', 'Pause & options'],
  ];
}
export const TITLE_ROWS = ['swing', 'attack', 'suit', 'jump', 'web', 'dodge', 'zip', 'dash', 'finisher'];
export const TITLE_LABELS = { swing: 'web-swing', attack: 'strike / combo', suit: 'symbiote suit', jump: 'jump / launch', web: 'web shot / yank', dodge: 'dodge', zip: 'zip to point', dash: 'air dash', finisher: 'finisher' };
