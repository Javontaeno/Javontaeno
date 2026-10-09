import { CAST } from '../cast.js';
import { glyph } from '../controls.js';

const $ = (id) => document.getElementById(id);

// DOM side of the story: subtitles, letterbox, title cards, choices, boss bar, karma meter, news, credits.
export class StoryUI {
  constructor(game) {
    this.g = game;
    this.el = { dialog: $('dialog'), card: $('card'), choice: $('choice'), boss: $('bossbar'), mtitle: $('mtitle'), news: $('news'), credits: $('credits'), letter: $('letterbox'), karma: document.querySelector('#karma i') };
    this.typing = null;
    this.mtT = 0;
    this.el.choice.querySelectorAll('.opt').forEach((o) => {
      o.addEventListener('mouseenter', () => this.selectChoice(o.dataset.c));
      o.addEventListener('click', () => { this.selectChoice(o.dataset.c); this.choicePick = o.dataset.c; });
    });
  }

  letterbox(on) { this.el.letter.classList.toggle('on', on); this.g.hud.el.hud.style.opacity = on ? '0' : ''; }

  line(who, text) {
    const c = CAST[who] || { name: who, color: '#ddd' };
    const d = this.el.dialog;
    const por = d.querySelector('.por');
    por.textContent = (c.name || '?').replace(/[^A-Za-z?]/g, ' ').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
    por.style.background = c.color;
    d.querySelector('.box').style.color = c.color;
    d.querySelector('.who').textContent = c.name;
    d.querySelector('.txt').textContent = '';
    d.querySelector('.skip').innerHTML = `${glyph('attack', this.g.input.device)} skip`;
    d.classList.add('on');
    if (this.g.hud.helpVisible) this.g.hud.toggleHelp(false);
    this.typing = { text, i: 0, t: 0 };
  }
  updateTyping(dt) {
    const ty = this.typing;
    if (!ty || ty.i >= ty.text.length) return true;
    ty.t += dt * 52;
    const n = Math.min(ty.text.length, Math.floor(ty.t));
    if (n > ty.i) { ty.i = n; this.el.dialog.querySelector('.txt').textContent = ty.text.slice(0, n); }
    return ty.i >= ty.text.length;
  }
  finishTyping() { if (this.typing) { this.typing.i = this.typing.text.length; this.el.dialog.querySelector('.txt').textContent = this.typing.text; } }
  hideLine() { this.el.dialog.classList.remove('on'); this.typing = null; }

  card(title, sub = '') {
    this.el.card.querySelector('h2').textContent = title;
    this.el.card.querySelector('div').textContent = sub;
    this.el.card.classList.add('on');
  }
  hideCard() { this.el.card.classList.remove('on'); }

  choice(cfg) {
    const c = this.el.choice;
    c.querySelector('h3').textContent = cfg.title;
    c.querySelector('.red b').textContent = cfg.red[0]; c.querySelector('.red span').textContent = cfg.red[1];
    c.querySelector('.black b').textContent = cfg.black[0]; c.querySelector('.black span').textContent = cfg.black[1];
    c.classList.add('on');
    this.choicePick = null;
    this.selectChoice('red');
  }
  selectChoice(k) { this.choiceSel = k; this.el.choice.querySelectorAll('.opt').forEach((o) => o.classList.toggle('sel', o.dataset.c === k)); }
  hideChoice() { this.el.choice.classList.remove('on'); }

  boss(b) { this.bossRef = b; this.el.boss.classList.toggle('on', !!b); if (b) this.el.boss.querySelector('.nm').textContent = b.name.toUpperCase(); }
  missionTitle(act, title) {
    this.el.mtitle.querySelector('div').textContent = act;
    this.el.mtitle.querySelector('h2').textContent = title;
    this.el.mtitle.classList.add('on');
    this.mtT = 3.2;
  }
  news(text) { const n = this.el.news; if (!text) { n.classList.remove('on'); return; } n.querySelector('span').textContent = text; n.classList.add('on'); }
  credits(html) { const c = this.el.credits; c.querySelector('.roll').innerHTML = html; c.classList.add('on'); const r = c.querySelector('.roll'); r.style.animation = 'none'; void r.offsetWidth; r.style.animation = ''; }
  hideCredits() { this.el.credits.classList.remove('on'); }

  update(dt, karma) {
    this.mtT -= dt;
    if (this.mtT <= 0) this.el.mtitle.classList.remove('on');
    const b = this.bossRef;
    if (b) {
      const hp = b.hp, max = b.maxHp;
      this.el.boss.querySelector('i').style.width = `${Math.max(0, hp / max) * 100}%`;
      const s = this.el.boss.querySelector('s');
      const end = b.endAt || (b.heads ? 1 / 5 : 0);
      s.style.display = end > 0 ? 'block' : 'none';
      s.style.left = `${end * 100}%`;
    }
    this.el.karma.style.left = `${50 - karma * 5}%`;
  }

  reset() { this.hideLine(); this.hideCard(); this.hideChoice(); this.boss(null); this.letterbox(false); this.news(null); }
}
