import * as THREE from 'three';
import { L } from '../city.js';
import { Ambulance, GangCar, Helicopter, Camp, Helicarrier, Billboard, Shrine, roadPath } from '../props.js';
import { Character } from '../character.js';
import { glyph } from '../controls.js';

// The campaign. Every mission is a generator: it yields commands (talk, go somewhere, fight) and
// the story engine runs each one until it finishes. Dialogue is original to this game.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AVX = (i) => L.X0 + i * L.PX + L.AVE / 2; // avenue centre line
const STZ = (j) => L.Z0 + j * L.PZ + L.ST / 2; // street centre line
const X = (i, j) => V(AVX(i), 0, STZ(j)); // intersection
const AV = (i, j) => V(AVX(i), 0, STZ(j) + L.PZ / 2); // mid-block on an avenue
const PARK = () => V((L.PARK_RECT.x0 + L.PARK_RECT.x1) / 2, 0, (L.PARK_RECT.z0 + L.PARK_RECT.z1) / 2);
const key = (S, a) => glyph(a, S.g.input.device);

const gang = (name, n, mix = ['thug', 'thug', 'pipe', 'gunner']) => Array.from({ length: n }, (_, k) => [mix[k % mix.length], { gang: name }]);
const goons = (n, mix = ['henchman', 'henchman', 'hgun']) => Array.from({ length: n }, (_, k) => mix[k % mix.length]);
const infected = (n, brutes = 0) => [...Array(n).fill('infected'), ...Array(brutes).fill('brute')];
const crawlers = (n) => Array(n).fill('crawler');

// Conversation with automatic coverage: each line frames whoever is talking.
function talk(A, who, lines, o = {}) {
  let flip = 1;
  return A.say(lines.map(([id, text, cam]) => {
    if (cam !== undefined) return [id, text, cam];
    const a = id === 'spidey' ? 'spidey' : who[id];
    flip = -flip;
    return [id, text, a ? () => A.shot(a, { side: 0.55 * flip, ...(o.shot || {}) }) : null];
  }), o);
}

function* wave(A, list, center, label, o = {}) {
  const grp = A.group(list, center, { r: o.r || 7, alerted: true, opts: o.opts });
  yield A.defeat(grp, label);
  return grp;
}

// Keep a training drill going until the stat counter climbs by n.
function* drill(A, S, stat, n, spawn, label) {
  const base = S.g.player.stats[stat];
  let grp = spawn();
  yield A.until(() => {
    const done = S.g.player.stats[stat] - base;
    S.objective = `${label} (${Math.min(n, done)}/${n})`;
    if (done >= n) return true;
    if (grp.alive === 0) grp = spawn();
    return false;
  });
  for (const e of grp.enemies) if (e.alive) { e.hp = 0; e.ko(V(0, 0, 0), { kb: 2 }); }
}

// Fly a character (and optionally the player, hanging below) from a to b.
function flight(A, S, carrier, a, b, dur, o = {}) {
  const pl = S.g.player;
  const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + (o.arc || 40);
  return A.scene((t) => {
    const k = Math.min(1, t / dur), s = k * k * (3 - 2 * k);
    const p = a.clone().multiplyScalar((1 - s) * (1 - s)).addScaledVector(mid, 2 * s * (1 - s)).addScaledVector(b, s * s);
    const ahead = a.clone().multiplyScalar((1 - s - 0.02) ** 2).addScaledVector(mid, 2 * (s + 0.02) * (1 - s - 0.02)).addScaledVector(b, (s + 0.02) ** 2);
    carrier.pos.copy(p);
    carrier.face(ahead);
    if (o.player) { pl.pos.copy(p).setY(p.y - 2.2); pl.vel.set(0, 0, 0); pl.state = 'air'; pl.yaw = pl.yawVis = carrier.yaw; }
    const behind = V(-Math.sin(carrier.yaw) * 14, 5, -Math.cos(carrier.yaw) * 14);
    A.cam(p.clone().add(behind), p, { k: 4, fov: 62, snap: true, key: false });
    return k >= 1;
  }, { max: dur + 1, keepCine: o.keepCine });
}

function cutout(g, pos, yaw) {
  const c = new Character('hero');
  c.root.position.copy(pos); c.root.rotation.y = yaw;
  c.root.scale.set(1, 1, 0.06);
  g.scene.add(c.root);
  return { update() {}, remove() { c.dispose(); } };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
const P = (S) => S.g.city.places;
const harlemRoof = (S) => S.api().roof(AVX(1) + 45, STZ(1) + 20, { max: 80 });
const mjRoof = (S) => S.api().roof(AVX(7) + 30, STZ(1) + 20, { max: 80 });
const hkStreet = (S) => AV(1, 9);

// ---------------------------------------------------------------------------
// PROLOGUE
// ---------------------------------------------------------------------------
const MISSIONS = [];
const M = (o) => MISSIONS.push(o);

M({
  id: 'nightfall', act: 'PROLOGUE', title: 'Nightfall', hives: true,
  start: harlemRoof,
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const r = harlemRoof(S);
    A.place(r, Math.PI);
    A.cam(r.clone().add(V(40, 45, 70)), r.clone().add(V(-60, 0, -140)), { snap: true, fov: 58, k: 0.5 });
    yield A.card('SPIDER-MAN', 'WEB OF SHADOWS', 3.4);
    yield A.say([
      ['spidey', "New York, four days from now. Half the city's wearing black goo, my spider-sense won't stop screaming, and nobody can find Mary Jane."],
      ['spidey', 'Last anyone heard, she was in Harlem. So Harlem is where I start.'],
    ]);
    A.toast(`Hold ${key(S, 'swing')} in the air to web-swing &middot; ${key(S, 'suit')} switches suits`, 7);
    const spot = mjRoof(S);
    yield A.goto(spot, 9, 'Search Harlem for Mary Jane', { dy: 8, short: 'MJ' });
    A.bark([['spidey', "Her camera bag. She was here... and so is the welcoming committee."]]);
    yield* wave(A, infected(5), spot, 'Fight off the infected');
    const luke = A.actor('luke', spot.clone().add(V(-6, 0, 3)), { pose: 'stance' });
    A.faceEachOther('spidey', luke);
    yield talk(A, { luke }, [
      ['luke', "Spider-Man! You're late. Harlem's been under for an hour."],
      ['spidey', 'Where is she, Luke?'],
      ['luke', "MJ went after the big hive with that camera of hers. Told her to wait. She doesn't wait."],
      ['spidey', "No. She really doesn't."],
    ]);
    // the stranger in the dark
    const fig = A.actor('deadpool', spot.clone().add(V(10, 0, -8)), { pose: 'stance' });
    fig.face(g.player.pos);
    A.cam(fig.pos.clone().add(V(-2, 1.2, 9)), fig.pos.clone().setY(fig.pos.y + 1.2), { snap: true, k: 3, fov: 40 });
    yield A.say([['figure', "Evening, gentlemen. Nobody move. Except you, Spidey. You come with me."]], { keepCine: true });
    let hit = false;
    yield A.scene((t) => {
      if (t < 0.6) A.walk(fig, g.player.pos, 14);
      A.cam(g.player.pos.clone().add(V(3, 2, 4)), g.player.pos.clone().setY(g.player.pos.y + 1.2), { k: 6, fov: 50 });
      if (t > 0.6 && !hit) { hit = true; g.fx.ring(g.player.pos, 4, 0.3); g.fx.hitSpark(g.player.chestPos(V()), true, false); g.audio.punch(true, false); g.cam.shake(0.8); g.damageFlash(); }
      return t > 1.1;
    });
    yield A.card('FOUR DAYS EARLIER', '', 2.8);
  },
});

// ---------------------------------------------------------------------------
// ACT 1 — The Symbiote
// ---------------------------------------------------------------------------
M({
  id: 'venom', act: 'ACT 1', title: 'Symbiotic', chain: true, lockBlack: true, lockMsg: "YOU DON'T HAVE THAT SUIT YET",
  start: (S) => S.api().roof(AVX(4) + 30, STZ(4), { max: 90 }),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('day', true);
    const top = A.roof(AVX(4) + 30, STZ(4), { max: 90 });
    A.place(top, Math.PI);
    A.toast(`Hold ${key(S, 'swing')} in the air to swing &middot; ${key(S, 'jump')} on a wall to wall-jump &middot; ${key(S, 'zip')} to zip`, 7);
    A.bark([
      ['mj', "Tiger? Are you swinging? You sound like you're swinging."],
      ['spidey', "I'm multitasking. What's up?"],
      ['mj', "Something huge just tore through the street outside the Bugle. Black, lots of teeth. I'm getting pictures."],
      ['spidey', 'Please do not get pictures.'],
      ['mj', 'Too late. Hurry.'],
    ]);
    const street = P(S).bugle.street.clone();
    yield A.goto(street, 14, 'Get to the Daily Bugle', { short: 'BUGLE' });
    const mj = A.actor('mj', street.clone().add(V(-9, 0, 4)), { pose: 'cross' });
    const b = A.boss('venom', street.clone().add(V(6, 0, -6)));
    A.faceEachOther('spidey', b);
    mj.face(b.pos);
    yield talk(A, { venom: b, mj }, [
      ['venom', 'Parker. We have been looking all over for you.'],
      ['spidey', "Eddie. You know there are support groups for this kind of thing."],
      ['venom', "We are not sick. We are hungry. And you're the main course."],
      ['mj', 'Pete, he came out of the sewer grates. There are more of those things down there.'],
      ['spidey', 'MJ — get back. Way back.'],
    ]);
    mj.walkTo = mj.pos.clone().add(V(-10, 0, 6));
    A.toast(`${key(S, 'attack')} strike &middot; ${key(S, 'dodge')} dodge when spider-sense flashes &middot; ${key(S, 'web')} web`, 7);
    yield A.fight(b, 'Defeat Venom', { endAt: 0.55 });
    // the symbiote jumps ship
    yield A.scene((t) => {
      A.cam(pl.pos.clone().add(V(4, 2.2, 4)), pl.pos.clone().setY(pl.pos.y + 1.1), { k: 4, fov: 48, snap: t === 0 });
      if (Math.random() < 0.5) g.fx.tendril(b.chest(V()), pl.chestPos(V()), 0.15);
      if (t > 1.2 && !pl.black) { A.lockBlack(false); A.forceSuit(true); }
      return t > 2.4;
    }, { keepCine: true });
    yield talk(A, { venom: b }, [
      ['venom', 'A piece of us... now a piece of you. Feel it, Parker. Feel how strong we are.'],
      ['spidey', "Get it off! Get it — whoa. Okay. That's... a lot of power."],
      ['venom', 'Use it. We want to see.'],
    ]);
    A.toast(`<b>SYMBIOTE SUIT</b> &mdash; heavier hits and tendrils. ${key(S, 'suit')} to switch back any time.`, 6);
    b.defeated = false; b.endAt = 0.2; b.setState('idle');
    yield A.fight(b, 'Drive Venom off', { endAt: 0.2 });
    yield talk(A, { venom: b }, [
      ['venom', "Enough. Keep our gift. Soon the whole city will wear it."],
    ]);
    g.fx.dark.emit(b.chest(V()), 90, { speed: 10, up: 6, color: [0.02, 0, 0.03], life: 1.2, size: 0.4 });
    b.remove();
    mj.pose = 'injured';
    mj.walkTo = null;
    A.cam(mj.pos.clone().add(V(2.5, 1.6, 2.5)), mj.pos.clone().setY(mj.pos.y + 0.4), { snap: true, k: 3, fov: 45 });
    yield A.say([
      ['spidey', 'MJ!'],
      ['mj', "I'm fine. My leg is less fine. Did you see him? Did you see what that thing did to you?"],
      ['spidey', "Ambulance is coming. I'll be right behind it. Literally."],
    ]);
    A.dismiss(mj);
  },
});

M({
  id: 'ambulance', act: 'ACT 1', title: 'Code Red', chain: true,
  start: (S) => P(S).bugle.street.clone(),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('day', true);
    const from = P(S).bugle.street.clone();
    const to = P(S).hospital.bay.clone();
    const amb = A.prop(new Ambulance(g));
    const path = roadPath(from, to);
    amb.drive(path, 13);
    let ambushed = false, grp = null, car = null;
    A.watch(() => (pl.pos.distanceTo(amb.pos) > 170 ? 'YOU LOST THE AMBULANCE' : null));
    A.bark([['spidey', 'Stay with the ambulance. Easy job. Nothing ever goes wrong with easy jobs.']]);
    yield A.until(() => {
      S.marker = amb.pos; S.markerLabel = 'MJ';
      if (!ambushed && amb.i >= 1) {
        ambushed = true;
        amb.paused = true;
        const p = amb.pos.clone().add(V(Math.sin(amb.yaw) * 14, 0, Math.cos(amb.yaw) * 14));
        car = A.prop(new GangCar(g, 0x8a1414));
        car.pos.copy(p); car.group.rotation.y = amb.yaw + Math.PI / 2;
        grp = A.group(gang('r7', 6), p, { r: 6, alerted: true });
        A.bark([['spidey', "Rolling 7s, blocking an ambulance? Even for a gang that's a new low."]]);
      }
      if (grp) {
        S.objective = grp.alive ? `Clear the road (${grp.alive} left)` : 'Follow the ambulance';
        if (!grp.alive && amb.paused) { amb.paused = false; car.remove(); }
      } else S.objective = 'Follow the ambulance';
      return amb.done;
    });
    S.marker = null;
    A.watch(null);
  },
});

M({
  id: 'hospital', act: 'ACT 1', title: 'Metro General', chain: true,
  start: (S) => P(S).hospital.bay.clone(),
  *run(A, S) {
    const g = S.g;
    A.time('dusk', true);
    const bay = P(S).hospital.bay.clone().add(V(0, 0, -10));
    yield A.say([
      ['spidey', "MJ's inside. Good. And so is half of Harlem's worst. Bad."],
    ], { cine: false });
    yield* wave(A, [...gang('pa', 4), ...gang('r7', 3)], bay, 'Defend Metro General', { r: 9 });
    const luke = A.ally('luke', bay.clone().add(V(-6, 0, -4)));
    A.bark([['luke', "Sweet Christmas! Somebody finally showed up to help."]]);
    yield* wave(A, [...gang('r7', 4), ['leader', { gang: 'r7', name: '7s Enforcer' }]], bay, 'Defend Metro General', { r: 10 });
    yield* wave(A, [...gang('pa', 5), ['leader', { gang: 'pa', name: 'Avenues Muscle' }]], bay, 'Defend Metro General', { r: 10 });
    luke.mode = 'npc'; luke.pose = 'idle';
    A.faceEachOther('spidey', luke);
    yield talk(A, { luke }, [
      ['luke', "You fight like you mean it. Who's the tailor? You look like Spider-Man's goth cousin."],
      ['spidey', "Long story. It involves teeth. What are two Harlem gangs doing at a hospital?"],
      ['luke', "Rolling 7s and Park Avenues. Been at war all week. Somebody keeps handing them better guns than they can afford."],
      ['spidey', 'Somebody with deep pockets.'],
      ['luke', "That's what I'm thinking. I want my neighborhood back. You in?"],
      ['spidey', "I'm in. Just let me check on MJ first."],
    ]);
  },
});

// ---------------------------------------------------------------------------
// ACT 2 — Harlem
// ---------------------------------------------------------------------------
M({
  id: 'turf', act: 'ACT 2', title: 'Turf War',
  start: () => X(1, 2),
  *run(A, S) {
    A.time('dusk', true);
    const luke = A.ally('luke', X(1, 2).add(V(3, 0, 3)));
    A.bark([['luke', "Three corners. Three crews. We hit them hard and fast, they don't get to regroup."]]);
    const spots = [X(0, 1), X(2, 3), X(7, 1)];
    const comps = [[...gang('r7', 5)], [...gang('pa', 4), ...gang('r7', 2)], [...gang('pa', 5), ['leader', { gang: 'pa', name: 'Avenues Lieutenant' }]]];
    for (let k = 0; k < spots.length; k++) {
      yield A.goto(spots[k], 22, `Break up the turf war (${k}/3)`, { short: 'GANG' });
      yield* wave(A, comps[k], spots[k], `Break up the turf war (${k}/3)`, { r: 8 });
      if (k === 0) A.bark([['luke', "These boys used to play ball on this corner. Now look at 'em."]]);
      if (k === 1) A.bark([['spidey', "Every one of them has a brand-new piece. Gangs don't buy in bulk."], ['luke', 'Somebody does.']]);
    }
    luke.mode = 'npc';
    A.faceEachOther('spidey', luke);
    yield talk(A, { luke }, [
      ['luke', "That's three corners. They'll be back tomorrow with more."],
      ['spidey', 'Then we get better.'],
      ['luke', "Now you're talking. Meet me on the roof by my place. I'll show you how Harlem fights."],
    ]);
  },
});

M({
  id: 'training', act: 'ACT 2', title: 'Cage Match',
  start: harlemRoof,
  *run(A, S) {
    A.time('dusk', true);
    const r = harlemRoof(S);
    const luke = A.actor('luke', r.clone().add(V(-5, 0, -4)), { pose: 'cross' });
    A.place(r.clone().add(V(0, 0, 3)), Math.PI);
    A.faceEachOther('spidey', luke);
    yield talk(A, { luke }, [
      ['luke', "Got some 7s who'd rather spar with you than sit in a cell. Don't break 'em too bad."],
      ['spidey', 'So... training montage?'],
      ['luke', "Training montage. First lesson: get 'em off their feet. Hold strike to launch."],
    ]);
    const spawn = (list) => () => A.group(list, r, { r: 6, alerted: true });
    yield* drill(A, S, 'launches', 3, spawn(gang('r7', 3, ['thug'])), `Launch enemies — hold ${key(S, 'attack')}`);
    A.bark([['luke', "Good. Now keep 'em up there. Follow them up and don't let 'em land."]]);
    yield* drill(A, S, 'airHits', 8, spawn(gang('r7', 3, ['thug'])), 'Land air combo hits');
    A.bark([['luke', "When your head starts buzzing, dodge right then. Not early. Not late. Then."]]);
    yield* drill(A, S, 'perfect', 2, spawn(gang('r7', 3, ['pipe', 'thug'])), `Perfect dodge — ${key(S, 'dodge')} on spider-sense`);
    A.bark([['luke', "Guns at range? Close the gap. Look at 'em and zip."]]);
    yield* drill(A, S, 'webStrikes', 3, () => A.group(gang('r7', 3, ['gunner']), r, { r: 12, alerted: true }), `Web-strike — ${key(S, 'zip')} at a far enemy`);
    luke.pose = 'idle';
    A.faceEachOther('spidey', luke);
    yield talk(A, { luke }, [
      ['luke', "Not bad, for a guy in pajamas."],
      ['spidey', "They're not pajamas. They're... alive, apparently."],
      ['luke', "Here's the thing. Tomorrow night, the 7s and the Avenues meet on neutral ground. A parley. I'm going to keep the peace."],
      ['spidey', "And I'm coming to make sure nobody breaks it."],
    ]);
  },
});

M({
  id: 'parley', act: 'ACT 2', title: 'The Parley',
  start: (S) => P(S).warehouse.street.clone(),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const W = P(S).warehouse;
    yield A.goto(W.roof.clone(), 14, 'Get to the parley on the warehouse roof', { dy: 3, short: 'PARLEY' });
    const c = W.roof.clone();
    const r7 = A.actor('r7boss', c.clone().add(V(-5, 0, 0)), { pose: 'cross' });
    const pa = A.actor('paboss', c.clone().add(V(5, 0, 0)), { pose: 'cross' });
    const luke = A.actor('luke', c.clone().add(V(0, 0, 5)), { pose: 'idle' });
    r7.face(pa.pos); pa.face(r7.pos); luke.face(c);
    yield talk(A, { r7boss: r7, paboss: pa, luke }, [
      ['r7boss', "You brought the spider? This was supposed to be just us."],
      ['luke', "He's here to make sure everybody walks out. That includes you."],
      ['paboss', 'Your boys shot up my block on Tuesday.'],
      ['r7boss', "Your boys hit my store Monday. With guns nicer than mine. Where's a corner crew get toys like that?"],
      ['spidey', "Funny. I was about to ask you the same thing — you've both got them."],
    ]);
    // shots from the dark
    g.fx.tracer(c.clone().add(V(30, 10, 30)), c.clone().setY(c.y + 1.4));
    g.audio.gun(30); g.cam.shake(0.3);
    yield A.say([['spidey', 'Sniper! Everybody down!']], { keepCine: false });
    r7.pose = 'kneel'; pa.pose = 'kneel';
    const snipers = W.corners.map(([x, z]) => A.group(['assassin'], V(x, S.g.city.groundAt(x, z, 60), z), { r: 0.5, alerted: true }));
    yield A.defeat(snipers, 'Take out the snipers');
    yield A.goto(snipers[0].enemies[0].pos.clone(), 5, 'Search the sniper', { short: 'SEARCH' });
    yield A.say([
      ['spidey', "Earpiece... somebody's still talking. 'Fisk wants both crews dead by morning.'"],
      ['spidey', "Fisk. The Kingpin's been arming both sides so they'd wipe each other out."],
    ], { cine: false });
    yield A.goto(c.clone(), 5, 'Return to the parley', { dy: 3 });
    r7.pose = 'cross'; pa.pose = 'cross';
    A.faceEachOther('spidey', r7);
    yield talk(A, { r7boss: r7, paboss: pa, luke }, [
      ['paboss', "That was your people! You set this up!"],
      ['r7boss', 'My people? Those were pros. Not mine.'],
      ['luke', 'Spider-Man. Your call. These two will listen to you now, or never.'],
    ]);
    const pick = yield A.choice('THE PARLEY', ['TALK THEM DOWN', 'Tell both crews the truth: Fisk played them. End the war tonight.'], ['TAKE THEM ALL DOWN', "They chose this war. Put every last one of them on the ground."]);
    S.choices.parley = pick;
    if (pick === 'red') {
      A.karma(3);
      yield talk(A, { r7boss: r7, paboss: pa, luke }, [
        ['spidey', "Kingpin's been selling you both the bullets. Every body on your corners made him richer."],
        ['paboss', '...Fisk.'],
        ['r7boss', "Then the war's over. For now."],
        ['luke', "Hell of a thing, man. Thank you."],
      ]);
    } else {
      A.karma(-3);
      yield talk(A, { r7boss: r7, paboss: pa, luke }, [
        ['spidey', "You want a war? Here's your war."],
        ['luke', "Spider-Man, don't—"],
      ]);
      A.dismiss(r7); A.dismiss(pa);
      const grp = A.group([...gang('r7', 3), ...gang('pa', 3), ['leader', { gang: 'r7', name: 'Rolling 7s Boss', look: { jacket: '#8a1414' } }], ['leader', { gang: 'pa', name: 'Park Avenues Boss' }]], c, { r: 7, alerted: true });
      yield A.defeat(grp, 'Take down both crews');
      luke.face(S.g.player.pos);
      yield talk(A, { luke }, [
        ['luke', "That ain't how I do things. That ain't how you used to do things."],
        ['spidey', "It worked, didn't it?"],
        ['luke', "Maybe. Don't call me for a while."],
      ]);
    }
  },
});

// ---------------------------------------------------------------------------
// ACT 3 — The Kingpin
// ---------------------------------------------------------------------------
M({
  id: 'fisk', act: 'ACT 3', title: 'Fisk Tower',
  start: (S) => P(S).fisk.street.clone(),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const F = P(S).fisk;
    A.bark([['spidey', "Kingpin's office is at the top of the tallest tower downtown. Of course it is."]]);
    yield A.goto(F.roof.clone(), 14, 'Climb Fisk Tower', { dy: 6, short: 'FISK' });
    const cat = A.boss('cat', F.roof.clone().add(V(4, 0, -5)));
    A.faceEachOther('spidey', cat);
    yield talk(A, { cat }, [
      ['cat', "Well, well. My favourite arachnid, in black. It's a very good look on you, spider."],
      ['spidey', "Felicia. What are you doing on Wilson Fisk's roof?"],
      ['cat', "Shopping. His safe has terrible taste in locks. Dance with me first and maybe I'll share."],
    ]);
    yield A.fight(cat, 'Defeat Black Cat', { endAt: 0.3 });
    yield talk(A, { cat }, [
      ['cat', "Okay! Okay. Fisk hired the snipers. He wants Harlem burning so he can buy it for pennies when the smoke clears."],
      ['spidey', 'And you just happened to be robbing him tonight.'],
      ['cat', "A girl has to diversify. So — are you going to let me go, or are we doing this the hard way?"],
    ]);
    const pick = yield A.choice('BLACK CAT', ['LET HER GO', "Trust her. She gave you Fisk; she's earned a head start."], ['MAKE HER TALK', 'Pin her down and squeeze out everything she knows.']);
    S.choices.cat = pick;
    if (pick === 'red') { A.karma(1); yield talk(A, { cat }, [['cat', "Trust. How sweet. Watch your back, spider — Fisk keeps a very large pet."]]); }
    else { A.karma(-1); yield talk(A, { cat }, [['cat', "Ow! Fine — he's got a bodyguard. Grey, horned, roughly the size of a bus. Happy?"]]); }
    g.fx.dark.emit(cat.chest(V()), 30, { speed: 4, color: [0.05, 0.05, 0.06], life: 0.6, size: 0.3 });
    cat.remove();
  },
});

M({
  id: 'rhino', act: 'ACT 3', title: 'Horns', chain: true,
  start: (S) => P(S).fisk.street.clone(),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('night', true);
    const F = P(S).fisk;
    A.place(F.roof.clone(), 0);
    A.cam(F.roof.clone().add(V(6, 3, 8)), F.roof.clone().setY(F.roof.y + 1.2), { snap: true, fov: 50 });
    yield A.say([
      ['kingpin', 'Spider-Man. You are trespassing on private property. Allow me to introduce my head of security.'],
      ['spidey', "Let me guess. Big guy. Grey. Horns."],
      ['rhino', 'NOBODY STOPS THE RHINO!'],
    ]);
    // tackled off the roof — a long way down
    const street = F.street.clone().add(V(0, 0, 4));
    let landed = false;
    const edge = V(street.x, F.roof.y + 2, street.z);
    yield A.scene((t) => {
      if (t < 0.5) pl.pos.lerpVectors(F.roof, edge, t / 0.5);
      else { const k = Math.min(1, (t - 0.5) / 1.7); pl.pos.lerpVectors(edge, street, k * k); }
      const k = t < 0.5 ? 0 : Math.min(1, (t - 0.5) / 1.7);
      pl.state = 'air'; pl.vel.set(0, -30, 0);
      A.cam(pl.pos.clone().add(V(8, 6, 14)), pl.pos.clone(), { k: 8, fov: 70, snap: t === 0 });
      if (k >= 1 && !landed) { landed = true; g.cam.shake(1); g.fx.ring(street, 9, 0.6); g.audio.boom(); }
      return t > 2.6;
    });
    A.place(street, Math.PI);
    const b = A.boss('rhino', street.clone().add(V(0, 0, 16)));
    b.yaw = Math.PI;
    A.toast(`Rhino shrugs off most hits. <b>Bait his charge into a wall</b> to stun him, then strike.`, 7);
    yield A.fight(b, 'Defeat the Rhino', { endAt: 0.12 });
    const moon = A.actor('moon', street.clone().add(V(-7, 0, 6)), { pose: 'stance' });
    g.fx.add.emit(moon.chest(V()), 30, { speed: 5, color: [1.6, 1.7, 2], life: 0.5, size: 0.15 });
    moon.face(b.pos);
    yield talk(A, { moon, rhino: b }, [
      ['moon', 'Khonshu watches the night, and the night has watched Fisk for a long time.'],
      ['rhino', "Nobody... stops... the Rhino..."],
      ['moon', 'Sleep.'],
    ]);
    b.remove();
    A.faceEachOther('spidey', moon);
    yield talk(A, { moon }, [
      ['spidey', "Moon Knight. I'd say thanks, but you're kind of terrifying."],
      ['moon', "Fisk funds his war through operations across Midtown. Tomorrow we take two of them apart. Together."],
      ['spidey', "Is this a team-up? It feels like a team-up."],
      ['moon', 'It is a hunt.'],
    ]);
  },
});

M({
  id: 'moonlight', act: 'ACT 3', title: 'Moonlighting',
  start: () => AV(5, 10),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const moon = A.ally('moon', AV(5, 10).add(V(3, 0, 2)));
    A.bark([['moon', 'First: a shipment of guns bound for Harlem. Second: the men who count Fisk\'s money.']]);
    const op1 = AV(6, 11);
    yield A.goto(op1, 24, 'Raid the gun shipment', { short: 'RAID' });
    const truck = A.prop(new GangCar(g, 0x1a1a1e));
    truck.pos.copy(op1.clone().add(V(3, 0, 0))); truck.group.rotation.y = 0.2;
    yield* wave(A, goons(7, ['henchman', 'henchman', 'hgun', 'pipe']), op1, 'Raid the gun shipment', { r: 9 });
    A.bark([['moon', 'Good. Now the counting house. Rooftop, two blocks east.']]);
    const op2 = A.roof(AVX(7) + 30, STZ(12), { max: 90 });
    yield A.goto(op2, 10, "Hit Fisk's counting house", { dy: 6, short: 'RAID' });
    yield* wave(A, [...goons(6), ['leader', { name: 'Fisk Accountant', look: { jacket: '#141418', topKind: 'suit', tie: '#5b2a7a' } }]], op2, "Hit Fisk's counting house", { r: 8 });
    moon.mode = 'npc';
    A.faceEachOther('spidey', moon);
    yield talk(A, { moon }, [
      ['spidey', "Two for two. Fisk's going to be in a mood."],
      ['moon', 'He will not come himself. He sends hired wings.'],
    ]);
  },
});

M({
  id: 'vulture', act: 'ACT 3', title: 'Birds of Prey',
  start: (S) => S.api().roof(AVX(5), STZ(11), { max: 90 }),
  *run(A, S) {
    const g = S.g;
    A.time('day', true);
    const r = A.roof(AVX(5), STZ(11), { max: 90 });
    const b = A.boss('vulture', r.clone().add(V(0, 12, -12)));
    A.cam(b.pos.clone().add(V(-6, 2, 10)), b.pos, { snap: true, fov: 48 });
    yield A.say([
      ['vulture', "Fisk pays by the feather, Spider-Man. I intend to retire on you."],
      ['spidey', "Adrian. Shouldn't you be feeding pigeons in a park somewhere?"],
      ['vulture', 'I AM the thing pigeons fear.'],
    ]);
    A.toast(`Vulture flies. <b>Web him 3 times</b> (${key(S, 'web')}) or hit him in mid-air to ground him.`, 7);
    yield A.fight(b, 'Defeat the Vulture', { endAt: 0.15 });
    yield A.say([['vulture', "Fisk's money isn't worth dying for. Another day, bug."]], { cine: false });
    b.remove();
  },
});

M({
  id: 'bugle', act: 'ACT 3', title: 'Extra! Extra!',
  start: (S) => P(S).bugle.street.clone(),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('day', true);
    const st = P(S).bugle.street.clone();
    const mj = A.actor('mj', st.clone().add(V(-4, 0, -2)), { pose: 'talk' });
    A.faceEachOther('spidey', mj);
    yield talk(A, { mj }, [
      ['mj', "There you are. I sold the Bugle my photos from the Venom attack. Look — Fisk's guys were at the sewer grate, before Venom ever came up."],
      ['spidey', "So Fisk knows about the symbiote."],
      ['mj', "Fisk is feeding it. And I'm guessing he'd like these pictures back."],
      ['spidey', 'Behind me. Now.'],
    ]);
    mj.walkTo = st.clone().add(V(-14, 0, -6)); mj.pose = 'cross';
    yield* wave(A, goons(6, ['henchman', 'hgun', 'pipe']), st, 'Protect the Daily Bugle', { r: 9 });
    yield* wave(A, [...goons(5), ['leader', { name: 'Fisk Enforcer', look: { jacket: '#141418', topKind: 'suit' } }]], st, 'Protect the Daily Bugle', { r: 9 });
    // the first outbreak
    yield A.say([['spidey', "The goo... it's in people now. Those are civilians!"]], { cine: false });
    const heli = A.prop(new Helicopter(g, 'CHANNEL 7'));
    heli.center.copy(st); heli.radius = 26; heli.height = 22; heli.target = pl.pos;
    heli.pos.copy(st).add(V(60, 40, 0));
    yield* wave(A, infected(7), st, 'Stop the infected', { r: 10 });
    A.news('BREAKING: SPIDER-MAN ATTACKS CIVILIANS OUTSIDE DAILY BUGLE  ·  POLICE ASK PUBLIC TO STAY INDOORS  ·  "HE\'S A MONSTER," SAYS WITNESS  ·');
    const cops = [A.actor('cop', st.clone().add(V(8, 0, 8)), { pose: 'aim' }), A.actor('cop', st.clone().add(V(11, 0, 4)), { pose: 'aim' })];
    for (const c of cops) c.face(pl.pos);
    yield talk(A, { anchor: null, cop: cops[0], mj }, [
      ['anchor', "Shocking footage from Midtown: Spider-Man, in a new black costume, beating civilians in broad daylight."],
      ['cop', "Freeze, web-head! Hands where I can see 'em!"],
      ['spidey', 'They were infected! I was helping!'],
      ['mj', "Go! I'll get the real story out. Go!"],
    ]);
    A.time('night');
    A.hives(true);
    const away = A.roof(st.x + 120, st.z - 90, { max: 100 });
    yield A.goto(away, 10, 'Lose the police — get to the rooftops', { dy: 8, short: 'ESCAPE' });
    yield A.say([
      ['spidey', "Hero to public enemy in one news cycle. And the night sky's... wrong. Something's growing on the rooftops."],
    ], { cine: false });
    A.news(null);
  },
});

// ---------------------------------------------------------------------------
// ACT 4 — The Invasion
// ---------------------------------------------------------------------------
M({
  id: 'logan', act: 'ACT 4', title: "Hell's Kitchen", hives: true,
  start: hkStreet,
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const st = hkStreet(S);
    yield A.goto(st, 12, "Investigate the outbreak in Hell's Kitchen", { short: 'HK' });
    const b = A.boss('wolverine', st.clone().add(V(0, 0, 9)));
    A.faceEachOther('spidey', b);
    yield talk(A, { wolverine: b }, [
      ['wolverine', "Saw you on the news, bub. Black suit. Beating on folks who couldn't fight back."],
      ['spidey', "Logan, wait. You don't know what you saw."],
      ['wolverine', 'I know what I smell. And you smell like that goo.'],
    ]);
    yield A.fight(b, 'Defeat Wolverine', { endAt: 0.35 });
    yield talk(A, { wolverine: b }, [
      ['wolverine', "Hold on. You've got it on you, but faint. Like a coat, not a skin. The people on the news — they reeked of it."],
      ['spidey', 'They were infected. Venom is spreading it.'],
      ['wolverine', "Then I hit the wrong guy. Happens. Let's go find the right ones."],
    ]);
  },
});

M({
  id: 'hunt', act: 'ACT 4', title: 'The Hunt', chain: true, hives: true,
  start: hkStreet,
  *run(A, S) {
    A.time('night', true);
    const st = hkStreet(S);
    const b = S.g.enemies.find((e) => e.bossId === 'wolverine'); if (b) b.remove();
    const logan = A.ally('wolverine', st.clone().add(V(2, 0, 2)));
    const spots = [AV(0, 8), X(1, 10), AV(2, 7)];
    for (let k = 0; k < spots.length; k++) {
      yield A.goto(spots[k], 22, `Hunt the infected (${k}/3)`, { short: 'NEST' });
      yield* wave(A, k === 2 ? [...infected(5), ...crawlers(2), 'brute'] : [...infected(5), ...crawlers(1)], spots[k], `Hunt the infected (${k}/3)`, { r: 9 });
      if (k === 0) A.bark([['wolverine', "They're civilians under there. Hit 'em hard enough and the goo lets go."]]);
      if (k === 1) A.bark([['wolverine', 'Smell that? Something big, nesting up high.']]);
    }
    logan.mode = 'npc';
    A.faceEachOther('spidey', logan);
    yield talk(A, { wolverine: logan }, [
      ['wolverine', "This ain't a few strays. Something's seeding the whole city."],
      ['spidey', "Venom. And I think I know where he'll be."],
    ]);
  },
});

M({
  id: 'pods', act: 'ACT 4', title: 'Seeds', hives: true,
  start: (S) => S.api().roof(AVX(4), STZ(9), { max: 110 }),
  *run(A, S) {
    const g = S.g, city = g.city;
    A.time('night', true);
    const r = A.roof(AVX(4), STZ(9), { max: 110 });
    yield A.goto(r, 10, 'Find Venom', { dy: 6, short: 'VENOM' });
    const v = A.actor('venom', r.clone().add(V(0, 0, -9)), { pose: 'stance' });
    A.faceEachOther('spidey', v);
    yield talk(A, { venom: v }, [
      ['venom', 'Do you feel them, Parker? Our children. On every rooftop. Under every street.'],
      ['spidey', "That's not a family, Eddie. That's an infestation."],
      ['venom', "Join us, or be eaten by us. Those are the choices."],
    ]);
    g.fx.dark.emit(v.chest(V()), 80, { speed: 10, up: 6, color: [0.02, 0, 0.03], life: 1.2, size: 0.4 });
    A.dismiss(v);
    A.hives(true);
    A.hiveEvents(true);
    const iron = A.actor('ironman', r.clone().add(V(10, 14, 0)), { turret: { height: 12, r: 14 }, fly: true, life: 70 });
    A.bark([
      ['ironman', "Stark Industries emergency response. That's me. I'm the response."],
      ['spidey', 'Tony! Great timing.'],
      ['ironman', "I'll keep them off your back for a minute, then I'm needed at the bridges. Kill those pods."],
    ]);
    const alive = () => city.hives.filter((h) => h.alive).length;
    const start = alive(), need = Math.min(3, start);
    yield A.until(() => {
      const done = start - alive();
      S.objective = `Destroy the symbiote hives (${done}/${need})`;
      const near = city.hives.filter((h) => h.alive).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
      S.marker = near ? new THREE.Vector3(near.pos.x, near.roof.y1, near.pos.z) : null; S.markerLabel = 'HIVE';
      return done >= need;
    });
    S.marker = null;
    A.hiveEvents(false);
    A.bark([['venom', "Three seeds burned. There are always more seeds, Parker."]]);
    yield A.wait(3);
  },
});

M({
  id: 'camp', act: 'ACT 4', title: 'Quarantine', hives: true,
  start: () => PARK().add(V(0, 0, 40)),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('dusk', true);
    const c = PARK();
    A.prop(new Camp(g, c.clone().setY(g.city.groundAt(c.x, c.z, 10))));
    yield A.goto(c.clone().add(V(0, 0, 18)), 10, 'Report to the S.H.I.E.L.D. camp in the park', { short: 'S.H.I.E.L.D.' });
    const fury = A.actor('fury', c.clone().add(V(-3, 0, 8)), { pose: 'cross' });
    const widow = A.actor('widow', c.clone().add(V(3, 0, 9)), { pose: 'idle' });
    const agents = [A.actor('agent', c.clone().add(V(-9, 0, 4)), { pose: 'aim' }), A.actor('agent', c.clone().add(V(9, 0, 4)), { pose: 'aim' })];
    for (const a of agents) a.face(c);
    A.faceEachOther('spidey', fury); widow.face(pl.pos);
    yield talk(A, { fury, widow }, [
      ['fury', "Spider-Man. You're either the problem or the solution. Manhattan's locked down until I find out which."],
      ['widow', 'He is wearing their suit, Director.'],
      ['spidey', "It's a fashion choice. A bad one, I'm told."],
      ['fury', "Fashion I can forgive. What I need is the man who started this — and a way to kill something that lives in a hundred thousand bodies."],
    ]);
    g.fx.lightning(c.clone().add(V(20, 30, -20)), c.clone().add(V(2, 0, -2)), 0.4);
    g.audio.boom(); g.cam.shake(0.5);
    const b = A.boss('electro', c.clone().add(V(0, 0, -14)));
    yield talk(A, { electro: b, fury }, [
      ['electro', "Fences and floodlights? You're going to need a bigger power bill, Fury."],
      ['fury', 'Max Dillon. Of course.'],
      ['electro', "My sister is in your little camp. She's sick. Give her to me, or I light up every tent in the park."],
    ]);
    widow.mode = 'ally';
    b.yaw = Math.atan2(pl.pos.x - b.pos.x, pl.pos.z - b.pos.z);
    yield A.fight(b, 'Defeat Electro', { endAt: 0.25 });
    widow.mode = 'npc'; widow.place(b.pos.clone().add(V(-6, 0, 4)));
    // Widow doesn't wait
    g.fx.tracer(widow.char.handWorld('R', V()), b.chest(V()));
    g.audio.gun(6);
    widow.pose = 'aim'; widow.face(b.pos);
    yield talk(A, { widow, electro: b }, [
      ['electro', 'Gah — !'],
      ['widow', 'Threat neutralised.'],
      ['spidey', 'He was DOWN!'],
    ]);
    const pick = yield A.choice('BLACK WIDOW', ['REPRIMAND HER', "He was beaten. We don't shoot people who can't fight back."], ['BACK HER UP', 'He threatened a camp full of sick people. She did what had to be done.']);
    S.choices.widow = pick;
    if (pick === 'red') { A.karma(2); yield talk(A, { widow, fury }, [['spidey', "We're supposed to be better than them."], ['widow', 'Then be better somewhere I am not, spider.'], ['fury', 'Enough. Both of you.']]); }
    else { A.karma(-2); yield talk(A, { widow, fury }, [['spidey', 'He had it coming.'], ['widow', 'Finally. Someone practical.'], ['fury', "Don't get comfortable, either of you."]]); }
    const sis = A.actor('sister', c.clone().add(V(-8, 0, -8)), { pose: 'idle' });
    sis.walkTo = b.pos.clone(); sis.walkSpeed = 5;
    sis.face(b.pos);
    yield talk(A, { sister: sis, electro: b }, [
      ['sister', 'Max! Max, hold on —'],
      ['spidey', "Ma'am, don't touch him! You're infected!"],
    ]);
    yield A.scene((t) => {
      A.cam(b.pos.clone().add(V(4, 2, 5)), b.pos.clone().setY(b.pos.y + 1), { k: 3, fov: 45, snap: t === 0 });
      if (Math.random() < 0.4) g.fx.tendril(sis.char.handWorld('R', V()), b.chest(V()), 0.15);
      g.fx.dark.emit(b.chest(V()), 4, { speed: 3, color: [0.02, 0, 0.03], life: 0.6, size: 0.3 });
      return t > 2.6;
    });
    yield A.say([['electro', "...Oh. Oh, that's better. That's SO much better. See you around, spider."]]);
    g.fx.lightning(b.chest(V()), b.pos.clone().add(V(0, 60, 0)), 0.5);
    b.remove(); A.dismiss(sis);
    yield talk(A, { fury }, [
      ['fury', "Wonderful. Now the walking power grid has a symbiote. Parker — you and I need to talk about a man named Tinkerer."],
    ]);
  },
});

M({
  id: 'rykers', act: 'ACT 4', title: 'Breakout', hives: true,
  start: (S) => P(S).rykers.bridgeStart.clone(),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const R = P(S).rykers;
    A.bark([
      ['fury', "Phineas Mason. The Tinkerer. He's the only one who can build a weapon against the symbiote, and he's in Ryker's."],
      ['fury', "Ryker's went dark an hour ago. Get him out alive."],
    ]);
    yield A.goto(R.gate.clone(), 14, "Cross the causeway to Ryker's", { short: "RYKER'S" });
    yield* wave(A, [...infected(5), ...crawlers(2)], R.yard.clone(), 'Fight through the yard', { r: 10 });
    yield* wave(A, [...infected(5, 1)], R.yard.clone(), 'Fight through the yard', { r: 10 });
    const cell = R.cell.clone();
    yield A.goto(cell, 6, 'Reach the cell block', { dy: 4, short: 'CELLS' });
    const tink = A.actor('tinkerer', cell.clone().add(V(2, 0, 2)), { pose: 'cross' });
    A.faceEachOther('spidey', tink);
    yield talk(A, { tinkerer: tink }, [
      ['tinkerer', "Spider-Man. Of course. Fury sends a bug to fetch his genius."],
      ['spidey', "You're welcome to stay. The goo-people seem friendly."],
      ['tinkerer', 'Hmph. Get me to a workbench and I will build you something that makes that slime scream.'],
    ]);
    const heli = A.prop(new Helicopter(g, 'S.H.I.E.L.D.'));
    heli.center.copy(cell); heli.radius = 6; heli.height = 12; heli.target = cell;
    heli.pos.copy(cell).add(V(80, 40, 0));
    yield A.wait(3);
    yield A.say([
      ['fury', "Evac's on site. Good work. Tinkerer goes to the park, you go back to work."],
    ], { cine: false });
    A.dismiss(tink);
  },
});

M({
  id: 'support', act: 'ACT 4', title: 'Calls for Help', hives: true,
  start: (S) => AV(5, 12),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const pick = yield A.choice('CALLS FOR HELP', ['S.H.I.E.L.D. & MOON KNIGHT', 'The quarantine camp and Moon Knight are overrun. Help the people holding the line.'], ["KINGPIN'S CREW", "Fisk's men are trapped in Midtown. Save them, and Fisk owes you."]);
    S.choices.support = pick;
    if (pick === 'red') {
      A.karma(2);
      const c = PARK();
      A.prop(new Camp(g, c.clone().setY(g.city.groundAt(c.x, c.z, 10))));
      yield A.goto(c.clone().add(V(0, 0, 18)), 14, 'Defend the S.H.I.E.L.D. camp', { short: 'CAMP' });
      const widow = A.ally('widow', c.clone().add(V(4, 0, 10)));
      A.bark([['widow', 'Late again, spider. Left flank.']]);
      yield* wave(A, [...infected(6), ...crawlers(2)], c.clone().add(V(0, 0, 10)), 'Defend the S.H.I.E.L.D. camp', { r: 12 });
      yield* wave(A, [...infected(4, 1), ...crawlers(2)], c.clone().add(V(0, 0, 10)), 'Defend the S.H.I.E.L.D. camp', { r: 12 });
      A.dismiss(widow);
      const r = A.roof(AVX(6) + 40, STZ(10), { max: 90 });
      yield A.goto(r, 10, 'Help Moon Knight on the rooftops', { dy: 6, short: 'MOON KNIGHT' });
      const moon = A.ally('moon', r.clone().add(V(3, 0, 3)));
      A.bark([['moon', 'They came from the dark. They will return to it.']]);
      yield* wave(A, [...crawlers(5), 'brute'], r, 'Help Moon Knight', { r: 8 });
      A.dismiss(moon);
    } else {
      A.karma(-2);
      S.choices.vultureAlly = true;
      const st = AV(5, 12);
      yield A.goto(st, 18, "Rescue Kingpin's crew", { short: 'FISK CREW' });
      const men = [A.actor('kingpin', st.clone().add(V(0, 0, -4)), { pose: 'cross' })];
      for (let k = 0; k < 3; k++) { const m = A.actor('goon', st.clone().add(V(-4 + k * 4, 0, -1.5)), { pose: 'aim' }); m.face(st.clone().add(V(0, 0, 10))); }
      A.faceEachOther('spidey', men[0]);
      yield talk(A, { kingpin: men[0] }, [
        ['kingpin', "Spider-Man. I confess I did not expect you to answer."],
        ['spidey', "Don't make it weird, Fisk."],
      ]);
      yield* wave(A, [...infected(6), ...crawlers(2)], st, "Protect Kingpin's crew", { r: 10 });
      yield* wave(A, [...infected(4, 1), ...crawlers(2)], st, "Protect Kingpin's crew", { r: 10 });
      const vul = A.actor('vulture', st.clone().add(V(6, 0, 4)), { pose: 'idle' });
      A.faceEachOther('spidey', men[0]); vul.face(men[0].pos);
      yield talk(A, { kingpin: men[0], vulture: vul }, [
        ['kingpin', 'I pay my debts. Mr. Toomes will answer when you call.'],
        ['vulture', "I'll be in the sky, bug. Try not to need me."],
      ]);
    }
  },
});

M({
  id: 'symrhino', act: 'ACT 4', title: 'Unstoppable', hives: true,
  start: () => AV(3, 11),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const st = AV(3, 11);
    yield A.goto(st, 16, 'Something is smashing through Midtown', { short: '???' });
    const b = A.boss('symrhino', st.clone().add(V(0, 0, 14)));
    b.yaw = Math.PI;
    A.cam(b.pos.clone().add(V(-4, 2, -7)), b.chest(V()), { snap: true, fov: 45 });
    yield A.say([
      ['rhino', 'Rhino... feels... STRONGER!'],
      ['spidey', "Oh, come on. Who gave the goo to the RHINO?"],
    ]);
    A.toast('Same trick: bait the charge into a wall.', 5);
    yield A.fight(b, 'Defeat Symbiote Rhino', { endAt: 0.05 });
    g.fx.dark.emit(b.chest(V()), 90, { speed: 10, up: 6, color: [0.02, 0, 0.03], life: 1.2, size: 0.4 });
    yield A.say([
      ['rhino', 'Head... hurts. Where... am I?'],
      ['fury', "Nice work. We'll collect the big guy. Symbiotes seem to hate loud noises, by the way — Tinkerer's working on it."],
    ]);
    b.remove();
  },
});

M({
  id: 'church', act: 'ACT 4', title: 'Sanctuary', hives: true,
  start: (S) => P(S).church.front.clone(),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('night', true);
    const ch = P(S).church;
    A.bark([['wolverine', "Spider. Church on the west side. The crawlers keep circling it but won't go in. Get over here."]]);
    yield A.goto(ch.front.clone(), 10, "Meet Wolverine at the church", { short: 'CHURCH' });
    const logan = A.actor('wolverine', ch.front.clone().add(V(-3, 0, 2)), { pose: 'idle' });
    const kurt = A.actor('nightcrawler', ch.front.clone().add(V(3, 0, 2)), { pose: 'idle' });
    kurt.poof(true);
    A.faceEachOther('spidey', kurt); logan.face(pl.pos);
    yield talk(A, { wolverine: logan, nightcrawler: kurt }, [
      ['nightcrawler', 'Guten Abend, Spider-Man. Welcome to sanctuary. The creatures will not cross the threshold.'],
      ['spidey', 'Nightcrawler! Why not?'],
      ['nightcrawler', 'I have a theory. The bells. Every hour they ring, the creatures flee.'],
      ['wolverine', 'Theory later. Something just moved in the—'],
    ]);
    // the symbiote takes Logan
    yield A.scene((t) => {
      A.cam(logan.pos.clone().add(V(3.5, 1.8, 3)), logan.pos.clone().setY(logan.pos.y + 1), { k: 3, fov: 45, snap: t === 0 });
      g.fx.dark.emit(logan.chest(V()), 6, { speed: 3, color: [0.02, 0, 0.03], life: 0.6, size: 0.3 });
      if (Math.random() < 0.3) g.fx.tendril(logan.pos.clone().add(V(0, -1, 2)), logan.chest(V()), 0.2);
      return t > 2.4;
    });
    const p = logan.pos.clone();
    A.dismiss(logan);
    const b = A.boss('symwolv', p);
    A.faceEachOther('spidey', b);
    yield talk(A, { symwolv: b, nightcrawler: kurt }, [
      ['symwolv', 'We... have... CLAWS.'],
      ['nightcrawler', 'Hold him off! I will get to the bell tower!'],
    ]);
    kurt.poof(); A.dismiss(kurt);
    yield A.fight(b, 'Hold off Symbiote Wolverine', { endAt: 0.3 });
    const k2 = A.actor('nightcrawler', ch.spire.clone(), { pose: 'perch', fly: true });
    k2.poof(true);
    let rung = 0;
    yield A.scene((t) => {
      A.cam(ch.front.clone().add(V(0, 6, 22)), ch.spire.clone(), { k: 2, fov: 55, snap: t === 0 });
      if (t > rung * 0.7 && rung < 4) { rung++; g.fx.ring(ch.spire.clone(), 10 + rung * 4, 0.8, [2, 1.8, 1.4]); g.audio.tone({ freq: 196, dur: 1.4, gain: 0.25, type: 'sine' }); g.audio.tone({ freq: 392, dur: 1.2, gain: 0.12, type: 'sine' }); g.cam.shake(0.2); }
      return t > 3;
    });
    g.fx.dark.emit(b.chest(V()), 90, { speed: 10, up: 6, color: [0.02, 0, 0.03], life: 1.2, size: 0.4 });
    const bp = b.pos.clone();
    b.remove();
    const freed = A.actor('wolverine', bp, { pose: 'kneel' });
    k2.fly = false; k2.place(bp.clone().add(V(3, 0, 1))); k2.pose = 'idle'; k2.poof(true);
    A.faceEachOther('spidey', freed);
    yield talk(A, { wolverine: freed, nightcrawler: k2 }, [
      ['wolverine', "Gah. Felt like drowning in tar. Thanks, elf."],
      ['nightcrawler', 'Sound, my friends. They cannot bear it. This is the weapon.'],
      ['spidey', "I'll tell the Tinkerer. Kurt — if I need you?"],
      ['nightcrawler', "Call, and I will be there in a puff of smoke. Literally."],
    ]);
  },
});

M({
  id: 'uptown', act: 'ACT 4', title: 'Uptown', hives: true,
  start: harlemRoof,
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('night', true);
    const r = harlemRoof(S);
    const cold = S.choices.parley === 'black';
    const luke = A.actor('luke', r.clone().add(V(-5, 0, 3)), { pose: cold ? 'cross' : 'idle' });
    A.place(r, Math.PI);
    A.faceEachOther('spidey', luke);
    yield talk(A, { luke }, cold ? [
      ['spidey', "Luke. I know we're not exactly friends right now."],
      ['luke', "We're not. But MJ came up here alone, and Harlem's crawling. So we work. Then we're done."],
    ] : [
      ['luke', "Harlem's been under for an hour. MJ went after the big hive with that camera of hers."],
      ['spidey', "Four days ago I'd have said she's crazy. Now I just want to find her."],
    ]);
    yield talk(A, { luke }, [['spidey', "Wait. I've stood right here before. Like... a really specific déjà vu."]]);
    // the attacker from the prologue, unmasked
    const dp = A.actor('deadpool', r.clone().add(V(10, 0, -8)), { pose: 'stance' });
    dp.face(pl.pos); dp.poof(true);
    const friend = !!S.sideDone.teamup;
    if (friend) {
      yield talk(A, { deadpool: dp, luke }, [
        ['deadpool', "WEBS! Buddy! Pal! Okay so the other night when I punched you off this roof — not my best work. I was trying to warn you."],
        ['spidey', 'Wade. Warn me about WHAT?'],
        ['deadpool', "Fisk put out a new contract. Not on you this time. On Mary Jane. Who, by the way, is four rooftops that way, looking extremely brave."],
        ['luke', "Then we move. Now."],
      ]);
    } else {
      yield talk(A, { deadpool: dp, luke }, [
        ['deadpool', "And we're back! Nothing personal, Spidey. Okay, a little personal. Kingpin's paying double and I have a lot of tacos to buy."],
        ['spidey', "It was YOU. The guy who jumped me."],
        ['deadpool', "Spoiler alert, yes. Also round two. Ding ding!"],
      ]);
      A.dismiss(dp);
      const b = A.boss('deadpool', r.clone().add(V(8, 0, -6)));
      yield A.fight(b, 'Defeat Deadpool', { endAt: 0.3 });
      yield talk(A, { deadpool: b, luke }, [
        ['deadpool', "Okay! Uncle! Truth? I'm a fan. Huge fan. I have your lunchbox. Fisk didn't just want you — he wants Mary Jane. I was going to tell you. Eventually. Dramatically."],
        ['spidey', 'Where is she?'],
        ['deadpool', "Four roofs that way. Brave lady. I'll help. Least I can do after the face-punching."],
      ]);
      const p = b.pos.clone(); b.remove();
      A.dismiss(dp);
      S.choices.deadpoolJoined = true;
      void p;
    }
    A.dismiss(dp);
    const spot = mjRoof(S);
    yield A.goto(spot, 9, 'Find Mary Jane', { dy: 8, short: 'MJ' });
    const mj = A.actor('mj', spot.clone().add(V(-3, 0, -2)), { pose: 'talk' });
    A.faceEachOther('spidey', mj);
    yield talk(A, { mj }, [
      ['mj', "Pete! Look — I've got the whole hive on camera. Every tendril leads back to one rooftop. Something's controlling it."],
      ['spidey', 'MJ, there is a contract out on you.'],
      ['mj', "Then you'd better stay close, tiger. And give me something to hit with."],
    ]);
    mj.mode = 'ally';
    luke.mode = 'ally'; luke.place(spot.clone().add(V(3, 0, 3))); luke.poof(true);
    A.ally('deadpool', spot.clone().add(V(-3, 0, 3))).poof(true);
    A.bark([['deadpool', "Team-up! Team-up! I call 'the funny one'."]]);
    const spots = [spot.clone(), A.roof(spot.x - 60, spot.z + 30, { max: 80 })];
    yield* wave(A, [...infected(6), ...crawlers(2)], spots[0], 'Clear Harlem', { r: 8 });
    yield A.goto(spots[1], 10, 'Clear Harlem', { dy: 8, short: 'NEST' });
    yield* wave(A, [...crawlers(5), 'brute', 'brute'], spots[1], 'Clear Harlem', { r: 8 });
    yield A.say([
      ['mj', "The hive's centre is close. There's a woman in the middle of it — white hair. Pete... I think it's Black Cat."],
    ], { cine: false });
  },
});

M({
  id: 'queen', act: 'ACT 4', title: 'Queen of the Hive', hives: true,
  start: (S) => queenSpot(S),
  *run(A, S) {
    const g = S.g;
    A.time('night', true);
    const q = queenSpot(S);
    yield A.goto(q, 14, 'Reach the heart of the hive', { dy: 8, short: 'HIVE' });
    const b = A.boss('symcat', q.clone().add(V(4, 0, -4)));
    A.faceEachOther('spidey', b);
    yield talk(A, { symcat: b }, [
      ['symcat', "Spider... you came. We wondered if you would. Do you like what we've built?"],
      ['spidey', "Felicia, fight it. This isn't you."],
      ['symcat', 'It is now. Venom gave us a crown. Come and take it off.'],
    ]);
    A.hiveEvents(true);
    yield A.fight(b, 'Defeat the Hive Queen', { endAt: 0.25 });
    A.hiveEvents(false);
    const h = g.city.hives.filter((x) => x.alive).sort((a, c) => a.pos.distanceTo(q) - c.pos.distanceTo(q))[0];
    if (h && h.pos.distanceTo(q) < 60) g.damageHive(h, 99999);
    g.fx.dark.emit(b.chest(V()), 90, { speed: 10, up: 6, color: [0.02, 0, 0.03], life: 1.2, size: 0.4 });
    const p = b.pos.clone(); b.remove();
    const cat = A.actor('cat', p, { pose: 'kneel' });
    A.faceEachOther('spidey', cat);
    yield talk(A, { cat }, [
      ['cat', "Ugh. Tell me I didn't say 'crown'."],
      ['spidey', 'You said crown.'],
      ['cat', "...Thanks, spider. I owe you. Don't tell anyone I said that either."],
      ['fury', "Parker, Fury. Tinkerer's done. The device is ready. Get to the park."],
    ]);
  },
});

M({
  id: 'crossroads', act: 'ACT 4', title: 'Crossroads', hives: true,
  start: () => PARK().add(V(0, 0, 40)),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('dusk', true);
    const c = PARK();
    A.prop(new Camp(g, c.clone().setY(g.city.groundAt(c.x, c.z, 10))));
    yield A.goto(c.clone().add(V(0, 0, 18)), 10, 'Return to the S.H.I.E.L.D. camp', { short: 'S.H.I.E.L.D.' });
    const fury = A.actor('fury', c.clone().add(V(-3, 0, 8)), { pose: 'cross' });
    const tink = A.actor('tinkerer', c.clone().add(V(2, 0, 9)), { pose: 'talk' });
    const reed = A.actor('fantastic', c.clone().add(V(5, 0, 7)), { pose: 'idle' });
    const widow = A.actor('widow', c.clone().add(V(-6, 0, 6)), { pose: 'idle' });
    for (const a of [fury, tink, reed, widow]) a.face(pl.pos);
    A.faceEachOther('spidey', tink);
    yield talk(A, { fury, tinkerer: tink, fantastic: reed, widow }, [
      ['tinkerer', "Behold. A resonance emitter, tuned to the exact frequency the symbiote hates. With a little help from Richards."],
      ['fantastic', "'A little.' I rewrote the harmonic model twice. Peter — it works. But it's tied to your suit's piece of the symbiote. You'll hold the key."],
      ['tinkerer', "Which means you choose what it does. Destroy every symbiote in Manhattan..."],
      ['fantastic', "...or reverse the signal and command them. Every last one, obeying you."],
      ['widow', "A weapon like that, in one man's hands."],
      ['fury', "It's your call, Parker. Make it fast."],
    ]);
    const pick = yield A.choice('THE DEVICE', ['DESTROY THEM', 'Purge every symbiote in the city. Free everyone it has taken.'], ['CONTROL THEM', 'Take command of the symbiote army. Nobody will ever threaten this city again — except you.']);
    S.choices.device = pick;
    A.karma(pick === 'red' ? 3 : -3);
    g.audio.boom(); g.cam.shake(0.4);
    yield talk(A, { fury }, [
      ['fury', "...Hill, repeat that. Venom is ON my Helicarrier? He's dragging it down over the river!"],
      ['spidey', "Of course he is. How do I get up there?"],
    ]);
    const red = S.karma >= 0;
    const flyer = A.actor(red ? 'moon' : 'vulture', c.clone().add(V(0, 0, 14)), { pose: red ? 'idle' : 'hover', fly: !red });
    flyer.face(pl.pos);
    yield talk(A, red ? { moon: flyer } : { vulture: flyer }, red ? [
      ['moon', 'Khonshu sent me. Hold on to my cape, and do not let go.'],
    ] : [
      ['vulture', "Fisk wants his city in one piece. I'll fly you. You'll owe me, bug."],
    ]);
  },
});

// ---------------------------------------------------------------------------
// FINALE
// ---------------------------------------------------------------------------
function carrierPos() { return V(L.ISLAND.x1 + 160, 150, 40); }

M({
  id: 'helicarrier', act: 'FINALE', title: 'The Helicarrier', chain: true, hives: true,
  start: () => PARK().add(V(0, 0, 14)),
  *run(A, S) {
    const g = S.g, pl = g.player;
    A.time('dusk', true);
    const hc = A.prop(new Helicarrier(g, carrierPos()));
    const red = S.karma >= 0;
    const c = PARK().add(V(0, 0, 14));
    c.y = g.city.groundAt(c.x, c.z, 10);
    const flyer = A.actor(red ? 'moon' : 'vulture', c.clone().add(V(0, 3, 0)), { fly: true, pose: 'hover' });
    A.cine(true);
    yield flight(A, S, flyer, c.clone().add(V(0, 3, 0)), hc.stern.clone().add(V(0, 6, 0)), 9, { player: true, arc: 90, keepCine: true });
    A.place(hc.stern.clone(), 0);
    A.dismiss(flyer);
    A.cine(false);
    A.watch(() => (pl.pos.y < hc.deckY - 25 && pl.state !== 'swing' ? 'YOU FELL FROM THE HELICARRIER' : null));
    A.bark([[red ? 'moon' : 'vulture', red ? 'The moon is with you.' : "Don't fall. I'm not coming back for you."]]);
    const deck = hc.stern.clone().add(V(0, 0, 30));
    yield* wave(A, [...crawlers(4), ...infected(3)], deck, 'Clear the flight deck', { r: 10 });
    yield* wave(A, [...crawlers(4), 'brute'], deck.clone().add(V(0, 0, 30)), 'Clear the flight deck', { r: 10 });
    yield A.goto(hc.core.clone(), 4, "Plant Tinkerer's device at the reactor core", { short: 'CORE' });
    yield A.scene((t) => { A.cam(pl.pos.clone().add(V(3, 2, 3)), pl.pos.clone().setY(pl.pos.y + 0.8), { k: 4, fov: 45, snap: t === 0 }); return t > 1.6; });
    yield A.say([
      ['spidey', "Device armed. Now I just need Venom close enough to feel it."],
      ['venom', 'CLOSE ENOUGH, PARKER?'],
    ]);
    const h = A.hydra(hc.bow.clone());
    A.cam(hc.bow.clone().add(V(0, 12, -38)), hc.bow.clone().setY(hc.deckY + 8), { snap: true, fov: 60, k: 1 });
    yield A.say([
      ['venom', 'We are legion. We are the city. FIVE heads, Parker, and every one of them hungry.'],
      ['spidey', "Okay. That's new. That is extremely new."],
    ]);
    A.toast('Dodge the slams on spider-sense, then hit the heads while they\'re down. Destroy four.', 7);
    yield A.fight(h, 'Destroy four of Venom\'s heads');
    h.defeated = true;
    h.remove();
    const eddie = A.actor('eddie', hc.bow.clone().add(V(0, 0, -6)), { pose: 'injured' });
    A.faceEachOther('spidey', eddie);
    yield talk(A, { eddie }, [
      ['eddie', "Peter... it's coming apart. It's coming apart and it's trying to take me with it."],
      ['spidey', 'Grab my hand, Eddie.'],
      ['eddie', "You don't owe me anything. Maybe it's better if I go over the side. Take it with me."],
    ]);
    const pick = yield A.choice('EDDIE BROCK', ['SAVE EDDIE', 'Pull him out. Nobody gets left behind — not even him.'], ['LET HIM FALL', 'Let Eddie and the symbiote go over the side together. It ends here.']);
    S.choices.eddie = pick;
    A.karma(pick === 'red' ? 2 : -2);
    A.watch(null);
    if (pick === 'red') yield talk(A, { eddie }, [['spidey', 'Got you. I got you.'], ['eddie', '...Thank you.']]);
    else {
      yield talk(A, { eddie }, [['spidey', "Goodbye, Eddie."]]);
      yield A.scene((t) => { eddie.pos.y -= t * 0.6; A.cam(hc.bow.clone().add(V(6, 4, -10)), eddie.pos.clone(), { k: 3, fov: 50 }); return t > 2.5; });
    }
    A.dismiss(eddie);
    yield* ending(A, S, hc);
  },
});

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------
const CREDITS = `<h1>SPIDER-MAN</h1><h2>WEB OF SHADOWS</h2><p>a Shadow Web fan tribute</p>
<h3>Design, Code, Story, Models</h3><p>Generated live with Claude</p>
<h3>Cast</h3><p>Spider-Man &middot; Mary Jane &middot; Luke Cage &middot; Black Cat &middot; Moon Knight &middot; Vulture &middot; Kingpin &middot; Rhino &middot; Wolverine &middot; Nightcrawler &middot; Black Widow &middot; Nick Fury &middot; Electro &middot; Tinkerer &middot; Mr. Fantastic &middot; Iron Man &middot; Shocker &middot; Deadpool &middot; Venom</p>
<h3>Built with</h3><p>three.js &middot; esbuild &middot; a lot of procedural canvas painting</p>
<p style="margin-top:60px">Spider-Man and related characters are property of Marvel.<br>This is an unofficial, non-commercial fan project.</p>
<h2 style="margin-top:80px">THANKS FOR PLAYING</h2>`;

function* ending(A, S, hc) {
  const g = S.g;
  const d = S.choices.device === 'black', e = S.choices.eddie === 'black';
  const kind = !d && !e ? 'hero' : !d && e ? 'antihero' : d && !e ? 'antivillain' : 'villain';
  S.choices.ending = kind;
  A.hiveEvents(false);
  // the device fires
  yield A.scene((t) => {
    A.cam(hc.core.clone().add(V(10, 8, 14)), hc.core.clone(), { k: 2, fov: 55, snap: t === 0 });
    if (t < 2.5 && Math.random() < 0.3) g.fx.ring(hc.core.clone(), 20 + t * 40, 1, d ? [1.2, 0.3, 2.4] : [2.4, 1.6, 1.2]);
    return t > 3;
  });
  hc.remove();
  const top = A.roof(AVX(5), STZ(7), { min: 60, max: 140 });
  A.place(top, Math.PI);
  if (kind === 'hero' || kind === 'antihero') A.hives(false, true);
  A.time(kind === 'hero' ? 'day' : kind === 'antihero' ? 'night' : 'dusk', true);
  if (kind === 'hero') {
    A.forceSuit(false);
    const mj = A.actor('mj', top.clone().add(V(-2, 0, -2)), { pose: 'idle' });
    const luke = A.actor('luke', top.clone().add(V(4, 0, 2)), { pose: 'cross' });
    const moon = A.actor('moon', top.clone().add(V(-5, 0, 3)), { pose: 'idle' });
    A.faceEachOther('spidey', mj); luke.face(top); moon.face(top);
    yield talk(A, { mj, luke, moon }, [
      ['mj', "The goo's gone. All of it. People are walking out of the hives like they just woke up."],
      ['luke', "Harlem's already arguing about who gets to throw the block party."],
      ['moon', 'The night is clean again. For tonight.'],
      ['spidey', "And Eddie's in a hospital bed instead of a Helicarrier. I'll take it."],
      ['mj', "Come on, hero. Somebody owes me a very long dinner."],
    ]);
    yield A.card('ENDING: RED', 'THE HERO', 4);
  } else if (kind === 'antihero') {
    A.forceSuit(false);
    A.cam(top.clone().add(V(6, 3, 9)), top.clone().setY(top.y + 1.2), { snap: true, fov: 45 });
    yield A.say([
      ['anchor', "...the symbiote is gone. Manhattan wakes up tonight to a quiet city, and one question: who saved it?"],
      ['spidey', "The city's clean. Eddie's gone. And I'm the one who let go."],
      ['mj', "(voicemail) Pete, it's me. Everyone's out celebrating and you're... not here. Call me back. Please. I don't care what happened up there."],
      ['spidey', "...I'll call her tomorrow."],
    ]);
    yield A.card('ENDING: RED / BLACK', 'THE ANTI-HERO', 4);
  } else if (kind === 'antivillain') {
    A.forceSuit(true);
    const crawl = [0, 1, 2, 3].map((k) => A.actor('venom', top.clone().add(V(-6 + k * 4, 0, -6)), { pose: 'kneel' }));
    for (const c of crawl) c.face(top);
    A.cam(top.clone().add(V(0, 4, 10)), top.clone().setY(top.y + 1.5), { snap: true, fov: 55 });
    yield A.say([
      ['spidey', "No more gangs. No more Kingpin. No more anybody. The symbiotes watch every street now, and they answer to me."],
      ['fury', "Parker. That's a lot of power for one man."],
      ['spidey', "That's why it's mine. Eddie's alive. The city's safe. Nobody gets hurt unless I say so."],
      ['widow', "That's the part that worries us."],
    ]);
    yield A.card('ENDING: BLACK / RED', 'THE ANTI-VILLAIN', 4);
  } else {
    A.forceSuit(true);
    const cat = A.actor('symcat', top.clone().add(V(2.5, 0, -1)), { pose: 'idle' });
    cat.face(top.clone().add(V(0, 0, -10)));
    A.cam(top.clone().add(V(-3, 3, 8)), top.clone().setY(top.y + 1.4), { snap: true, fov: 45 });
    yield A.say([
      ['symcat', 'Look at them down there, spider. All of them, ours.'],
      ['spidey', "Mine. Every street, every rooftop. Let them try to take it back."],
    ], { keepCine: true });
    const lab = A.roof(AVX(2), STZ(12), { max: 120 });
    const kp = A.actor('kingpin', lab.clone().add(V(-2, 0, 0)), { pose: 'cross' });
    const tk = A.actor('tinkerer', lab.clone().add(V(2, 0, 0)), { pose: 'talk' });
    const bw = A.actor('widow', lab.clone().add(V(0, 0, 2)), { pose: 'aim' });
    const sw = A.actor('symwolv', lab.clone().add(V(0, 0, -4)), { pose: 'kneel' });
    for (const a of [kp, tk, bw]) a.face(sw.pos);
    A.cam(lab.clone().add(V(5, 2.5, 7)), lab.clone().setY(lab.y + 1.2), { snap: true, fov: 45 });
    yield A.say([
      ['kingpin', "The spider made himself a king. Kings fall."],
      ['tinkerer', 'The containment held. The specimen is... stable. Ish.'],
      ['widow', "Then let's see how the king handles claws. Open it."],
      ['symwolv', '...SPIDER.'],
    ]);
    yield A.card('ENDING: BLACK', 'THE VILLAIN', 4);
  }
  S.ui.credits(CREDITS);
  yield A.wait(26);
  S.ui.hideCredits();
  A.toast('<b>THE END</b> &mdash; the city is yours to roam. Side missions and outbreaks remain.', 8);
}

// ---------------------------------------------------------------------------
// SIDE STORY — #1 Fan (Deadpool)
// ---------------------------------------------------------------------------
const SIDE = [];
const fanStart = () => AV(4, 9).add(V(-6, 0, 0));
const hideout = () => AV(0, 11);

SIDE.push({
  id: 'fanmail', act: 'SIDE STORY', title: '#1 Fan', next: 'chase',
  unlock: (S) => S.index >= MISSIONS.findIndex((m) => m.id === 'logan'),
  start: fanStart,
  *run(A, S) {
    const g = S.g;
    const st = fanStart();
    const wall = A.prop(new Billboard(g, 'SPIDEY\nI AM YOUR\n#1 FAN', st.clone().add(V(-4.6, 4, 0)), Math.PI / 2, 7, 4.5, { color: '#ff2030' }));
    void wall;
    yield A.goto(st, 6, 'Investigate the strange graffiti', { short: '???' });
    yield A.say([
      ['spidey', "'Spidey, I am your number one fan.' In red spray paint. Ten feet tall. That's... flattering? No. That's creepy."],
      ['figure', "(phone) Do you like it? I did the letters myself. The exclamation point is my favourite part."],
      ['spidey', 'Who is this? How did you get this number?'],
      ['figure', "I'm everywhere, Spidey. Like you! Go look up. Top of the old bank."],
    ], { cine: false });
    const r1 = A.roof(st.x + 70, st.z - 40, { max: 90 });
    const cut = A.prop(cutout(g, r1.clone(), 0));
    void cut;
    A.prop(new Billboard(g, 'BEST FRIENDS!', r1.clone().add(V(0, 2.6, 0.2)), 0, 2.4, 0.6, { color: '#ffffff', bg: '#c41a1a', font: 'bold 70px Impact, sans-serif' }));
    yield A.goto(r1, 5, 'Check the rooftop', { dy: 6, short: '???' });
    yield A.say([
      ['spidey', "A life-size cardboard me. With a speech bubble. 'Best friends.' I need a restraining order. I need several."],
      ['figure', "(phone) Ooh, you found Cardboard Spidey! He's a great listener. Last stop — the alley behind the deli. I made you a shrine!"],
    ], { cine: false });
    const alley = AV(5, 8).add(V(-8, 0, 0));
    A.prop(new Shrine(g, alley.clone().setY(g.city.groundAt(alley.x, alley.z, 2))));
    A.prop(new Billboard(g, 'MEET ME ON THE\nTALLEST ROOF\nCOME ALONE. BRING SNACKS', alley.clone().add(V(-0.2, 2.2, -0.6)), 0, 2.4, 1.2, { color: '#111', bg: '#f2ead8', font: 'bold 52px Arial, sans-serif' }));
    yield A.goto(alley, 4, 'Find the shrine', { short: '???' });
    yield A.say([
      ['spidey', "Candles. Photos of me. That's me eating a hot dog — when was that taken?! And a note. 'Meet me on the tallest roof.'"],
      ['spidey', "Okay, number one fan. Let's meet."],
    ], { cine: false });
  },
});

SIDE.push({
  id: 'chase', act: 'SIDE STORY', title: 'Catch Me If You Can', chained: true,
  unlock: () => false,
  start: fanStart,
  *run(A, S) {
    const g = S.g, pl = g.player;
    let r = A.roof(AVX(4) + 40, STZ(7) - 10, { min: 60, max: 160 });
    const dp = A.actor('deadpool', r.clone(), { pose: 'stance' });
    yield A.goto(r, 9, 'Find your "number one fan"', { dy: 8, short: '???' });
    dp.face(pl.pos);
    A.faceEachOther('spidey', dp);
    yield talk(A, { deadpool: dp }, [
      ['deadpool', "SPIDEY! You came! Did you bring snacks? You didn't bring snacks. That's fine. I'm fine."],
      ['spidey', "Deadpool. Of course it's Deadpool."],
      ['deadpool', "You know my name! Okay, now you have to catch me. That's how friendship works. Tag, you're it!"],
    ]);
    const hops = [[110, -60], [-90, -110], [-130, 40], [70, 120]];
    const taunts = [
      [['deadpool', 'Too slow! Is that the symbiote making you sluggish? Black is SO slimming though.']],
      [['deadpool', "Over here! No, here! I'm like a really violent game of hide and seek."]],
      [['deadpool', "Okay you're actually good at this. That's hot. I mean — heroic. Heroic is what I meant."]],
      [['deadpool', 'Last one! I promise. Pinky swear. My pinky grows back, so it\'s a low-stakes swear.']],
    ];
    for (let k = 0; k < hops.length; k++) {
      dp.poof();
      r = A.roof(r.x + hops[k][0], r.z + hops[k][1], { min: 25, max: 140 });
      dp.place(r.clone()); dp.poof(true);
      A.bark(taunts[k]);
      yield A.until(() => {
        S.marker = dp.pos; S.markerLabel = 'DEADPOOL';
        S.objective = `Catch Deadpool (${k}/${hops.length})`;
        dp.face(pl.pos);
        return pl.pos.distanceTo(dp.pos) < 6 && pl.state !== 'swing';
      });
    }
    S.marker = null;
    A.faceEachOther('spidey', dp);
    yield talk(A, { deadpool: dp }, [
      ['deadpool', "Okay, okay, you got me. Can I be honest? Kingpin hired me to kill you."],
      ['spidey', 'You WHAT?'],
      ['deadpool', "But you're SPIDER-MAN. I have your lunchbox. I have your bedsheets. I can't take that contract. So I'm going to break it, very publicly, and Fisk is going to be so mad."],
      ['deadpool', "Come by my place in Hell's Kitchen. I'll show you the contract. Then we punch his goons together. Like besties."],
    ]);
    dp.poof(); A.dismiss(dp);
  },
});

SIDE.push({
  id: 'teamup', act: 'SIDE STORY', title: 'Team-Up',
  unlock: (S) => !!S.sideDone.chase,
  start: hideout,
  *run(A, S) {
    const g = S.g, pl = g.player;
    const st = hideout();
    yield A.goto(st, 8, "Meet Deadpool at his hideout", { short: 'DEADPOOL' });
    const dp = A.actor('deadpool', st.clone().add(V(-3, 0, 2)), { pose: 'talk' });
    A.prop(new Billboard(g, 'CONTRACT\nTARGET: SPIDER-MAN\n$$$ — W. FISK', st.clone().add(V(-5.5, 2.4, 2)), Math.PI / 2, 2.2, 1.6, { color: '#111', bg: '#f2ead8', font: 'bold 48px Arial, sans-serif' }));
    A.faceEachOther('spidey', dp);
    yield talk(A, { deadpool: dp }, [
      ['deadpool', "Behold! One contract, signed by Wilson Fisk. Notarized, even. That man loves paperwork."],
      ['spidey', "So what happens when you don't deliver?"],
      ['deadpool', "Fisk sends insurance. I'd say any minute now — oh look, it's now."],
    ]);
    dp.mode = 'ally';
    yield* wave(A, goons(6, ['henchman', 'hgun', 'pipe']), st, "Fight off Fisk's hit squad", { r: 9 });
    yield* wave(A, ['assassin', 'assassin', ...goons(4)], st, "Fight off Fisk's hit squad", { r: 12 });
    const b = A.boss('shocker', st.clone().add(V(0, 0, 14)));
    dp.mode = 'npc';
    A.faceEachOther('spidey', b); dp.face(b.pos);
    yield talk(A, { shocker: b, deadpool: dp }, [
      ['shocker', "Wade. Fisk said you'd go soft. I'm here to collect both of you."],
      ['deadpool', "Herman! Love the quilt. Did your grandma knit you for battle?"],
      ['shocker', "It's a vibration-dampening suit, you lunatic!"],
    ]);
    dp.mode = 'ally';
    yield A.fight(b, 'Defeat the Shocker');
    dp.mode = 'npc';
    A.faceEachOther('spidey', dp);
    yield talk(A, { deadpool: dp }, [
      ['spidey', "Okay. I'll admit it. That was a good team-up."],
      ['deadpool', "BEST team-up. Listen — you need me, just yell. I'm usually close. Like, creepy close. Like right now I'm standing very close."],
      ['spidey', 'Yes. You are.'],
    ]);
    S.choices.deadpool = true;
    dp.poof(); A.dismiss(dp);
  },
});

// Who answers a call for help. Karma decides which side of the city picks up the phone.
function ALLIES(S) {
  const at = (id) => S.index > MISSIONS.findIndex((m) => m.id === id) || S.done;
  const red = [], black = [], any = [];
  if (at('hospital') && S.choices.parley !== 'black') red.push('luke');
  if (at('rhino')) red.push('moon');
  if (at('hunt')) red.push('wolverine');
  if (at('church')) red.push('nightcrawler');
  if (at('fisk') && S.choices.cat === 'red') black.push('cat');
  if (at('queen')) black.push('cat');
  if (S.choices.vultureAlly) black.push('vulture');
  if (S.choices.widow === 'black') black.push('widow');
  if (S.choices.deadpool || S.choices.deadpoolJoined) any.push('deadpool');
  const side = S.karma >= 0 ? red : black;
  const pool = [...new Set([...side, ...any])];
  return pool.length ? pool : [...new Set([...red, ...black])];
}

function queenSpot(S) {
  const w = P(S).warehouse;
  const h = S.g.city.hives.filter((x) => x.alive).sort((a, b) => Math.hypot(a.pos.x - w.cx, a.pos.z - w.cz) - Math.hypot(b.pos.x - w.cx, b.pos.z - w.cz))[0];
  if (h) {
    const t = h.roof;
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    const dir = new THREE.Vector3(cx - h.pos.x, 0, cz - h.pos.z);
    if (dir.lengthSq() < 1) dir.set(1, 0, 0);
    dir.normalize();
    const x = Math.min(t.x1 - 2.5, Math.max(t.x0 + 2.5, h.pos.x + dir.x * 9)), z = Math.min(t.z1 - 2.5, Math.max(t.z0 + 2.5, h.pos.z + dir.z * 9));
    return new THREE.Vector3(x, t.y1, z);
  }
  return S.api().roof(w.cx, w.cz + 60, { max: 90 });
}

export { MISSIONS, SIDE, ALLIES };
