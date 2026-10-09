# Shadow Web

An open-world web-swinging action game in the spirit of *Spider-Man: Web of Shadows*, built with three.js and bundled into **one self-contained `index.html`** (no server, no CDN, works offline).

Open `shadow-web/index.html` in a desktop browser (Chrome, Edge or Firefox) and pick **New Story** (the campaign) or **Free Roam** (every symbiote hive active from the start). **Continue** appears once you have a save.

## What's in it

**City.** A procedurally generated Manhattan-style island: about 1,000 instanced buildings with setbacks and art-deco towers, plus two landmark skyscrapers. Window facades are shader-generated, with lit offices, blinds, storefronts with interiors and neon signs, and an animated billboard district. The rest of the world:

- Streets with lane markings, crosswalks, wet patches and pools of lamp light, and more than 1,300 street lamps.
- About 450 moving cars with headlights. They brake for you and for fights.
- A central park with trees and a pond, rooftop water towers, AC units and blinking aviation lights.
- A suspension bridge with "necklace" lights, a river, and distant shorelines.
- Three times of day (dusk, night, day), with sky, clouds, stars, fog and environment reflections.

**Hero.** A procedurally modelled, sculpted character with a canvas-painted classic suit (embossed web lines, emblems, lenses). The black symbiote suit sweeps across the body with a glowing transition edge.

**Traversal.**
- **Swinging:** pendulum physics with forward pumping, auto-release at the top of the arc and release boosts. The street-follow assist keeps you flowing down avenues.
- **Wall-running:** works on every building, wraps around corners and vaults over the top.
- **Point-zips** to any surface. Zip to a roof edge to perch, then point-launch from it.
- **Air dashes,** a charged super jump, dives, and the superhero landing (with a shockwave).

**Combat.**
- Four-hit strings, with hold-to-launch, air juggles, spikes and dive slams.
- WoS-style zip-strikes: attack a distant enemy, even one in mid-air, and you zip to them.
- Web shots that build up into cocoons; webbed enemies stick to walls.
- Web yank, web bomb, focus-powered finishers and healing.
- Perfect dodges on spider-sense trigger slow-motion and open a counter window.
- The symbiote suit trades speed for heavy, wide tendril attacks: area strings, a grab-and-slam, and an 8-way surge.

**Enemies.**
- Thugs, pipe thugs (they block light hits), and gunners (laser-sight telegraph).
- Wall-leaping symbiote crawlers that dodge light attacks, and armored symbiote brutes (break their guard).
- Attack tokens keep groups fair, and committed attacks have hyper-armor.

## Story mode

A full campaign built on the console *Web of Shadows* plot, with original dialogue: 24 missions across a prologue, four acts and a finale, red/black choices with consequences, four endings and a Deadpool side story. Progress saves automatically at the start of each mission.

- **Prologue — Nightfall:** Harlem, four days into the invasion. You're searching for Mary Jane when a masked stranger knocks you off a roof. Then the story jumps back to "four days earlier".
- **Act 1 — The Symbiote:**
  - Venom attacks the Daily Bugle. Halfway through the fight, the symbiote attaches to your suit and unlocks the black suit.
  - You escort Mary Jane's ambulance to Metro General.
  - You defend the hospital from both gangs, and Luke Cage joins.
- **Act 2 — Harlem:**
  - A turf war between the Rolling 7s and the Park Avenues.
  - Training on the rooftops with Luke (launchers, air combos, perfect dodges, web-strikes).
  - A parley that Kingpin's snipers try to turn into a massacre.
  - **Choice:** talk both gangs down, or take them all out. Taking them out turns Luke cold for the rest of the game.
- **Act 3 — The Kingpin:**
  - Black Cat on top of Fisk Tower, with a **trust/threaten choice**.
  - Kingpin sets **Rhino** on you. Bait his charge into a wall to stun him.
  - Moon Knight joins, and you raid Kingpin's operations together.
  - A rooftop fight with **Vulture**.
  - At the Daily Bugle, the first infected civilians appear. A news helicopter frames you, the police turn on you, and the hives start to grow.
- **Act 4 — The Invasion:**
  - Wolverine fights you, then joins you.
  - Venom seeds the city with pods, and Iron Man flies in to help.
  - At the S.H.I.E.L.D. quarantine with Nick Fury and Black Widow, Electro attacks. Widow shoots him. **Choice:** reprimand her or back her up. Then his sister's symbiote takes him.
  - A breakout at Ryker's to free the Tinkerer.
  - **Choice:** answer S.H.I.E.L.D. and Moon Knight, or Kingpin's crew.
  - **Symbiote Rhino.**
  - At the church, the symbiote takes Wolverine. Nightcrawler rings the bells to free him.
  - The prologue pays off: the masked attacker was **Deadpool**.
  - Mary Jane, now a photographer, leads you to the hive queen: **symbiote Black Cat**.
- **Finale:**
  - **Choice:** destroy the symbiotes, or control them.
  - Moon Knight or Vulture flies you to the Helicarrier, depending on your karma.
  - You plant the device and fight a **five-headed Venom**. Destroy four heads.
  - **Choice:** save Eddie Brock, or let him fall.
- **Endings:** Red (Hero), Red/Black (Anti-hero), Black/Red (Anti-villain) and Black (Villain).
- **Side story — "#1 Fan":** this unlocks after the Bugle mission (follow the red markers).
  - Track a creepy superfan through graffiti, a cardboard cutout and a shrine.
  - Catch him in a rooftop teleport chase.
  - Team up with **Deadpool** against Kingpin's hit squad and **Shocker**.
  - Finishing it changes how the Deadpool reveal plays out later.
- **Ally call-ins:** press **X**, or **L3** on a controller.
  - Red karma brings Luke Cage, Moon Knight, Wolverine or Nightcrawler.
  - Black karma brings Black Cat, Vulture or Black Widow.
  - Deadpool answers either way once you've earned him.
- **Gold markers** lead to the next story mission and **red markers** to side missions. The karma meter sits under your health bar.

**Free roam goal.** Destroy the 6 symbiote hives. Their infestation creeps across the buildings and streets around them. Street crimes, rooftop gangs and outbreaks spawn around the city for XP and levels.

Audio (thwips, impacts, wind, sirens, and an adaptive combat score) is synthesized live with WebAudio. It is fully playable on Xbox, PlayStation and Switch controllers, and has an arachnophobia mode for enemies (see below).

## Controls

Prompts on screen switch automatically to whatever you last touched: keyboard, Xbox, PlayStation or Switch.

| Action | Keyboard / mouse | Xbox | PlayStation |
|---|---|---|---|
| Move / camera | WASD / mouse | Left / right stick | Left / right stick |
| Web-swing (in air), sprint (on ground) | hold **Shift** | RT | R2 |
| Jump (hold for super jump), wall jump, swing-release boost | **Space** | A | ✕ |
| Strike / combo (hold = launcher) | **LMB** (or J) | X | □ |
| Web shot (hold = yank / tendril grab) | **RMB** (or K) | Y | △ |
| Dodge (on danger sense = perfect dodge) | **C** | B | ○ |
| Zip to point / web-strike targeted enemy | **E** | LB | L1 |
| Air web-zip dash | **Q** | RB | R1 |
| Finisher (1 focus) | **F** | LT | L2 |
| Switch suit / heal / web bomb / time of day | **R / H / G / T** | D-pad ↑ ↓ ← → | D-pad ↑ ↓ ← → |
| Call an ally (story) | **X** | LS click | L3 |
| Recenter camera | **V** | RS click | R3 |
| Show controls | **I** | View | Create |
| Pause & options | **Esc** | Menu | Options |

On a Switch Pro controller the buttons in the same positions work: B jumps, Y strikes, X webs, A dodges.

## Controllers

- **Supported:** Xbox (One, Series, 360), PlayStation (DualShock 4, DualSense) and Switch Pro controllers, plus most generic USB/Bluetooth pads. Chrome and Edge report all of these in the standard layout, so that's the most reliable setup. Firefox and Linux sometimes use non-standard layouts, and the game remaps the common Xbox and Sony variants.
- **Fully playable from the pad:** the title screen, pause menu and victory screen all navigate with the D-pad or stick. A/✕ selects and B/○ goes back; on Switch it's A and B in Nintendo's usual positions.
- **Pausing:** unplugging the controller pauses the game.
- **Vibration:** rumble fires on hits, damage, landings, web attaches, perfect dodges, suit switches and hive kills (Chrome and Edge). It can be turned off.
- **Options** (pause menu): invert camera Y, camera sensitivity, vibration, sound.
- **Sound:** browsers only allow audio after a click or key press. If you start with only a controller and hear nothing, click the page once.

## Arachnophobia mode

This is **on by default** and can be toggled on the title screen or in the pause menu. It only ever changes **enemies**:

- Spider imagery on enemies is replaced. Venom's chest symbol becomes a jagged symbiote mark.
- Any spider-shaped enemy added to the game will get a non-spider design while the mode is on.
- **Spider-Man is never changed:** both suits keep the real spider emblem, and spider-sense keeps its name, whichever way the toggle is set.

Regardless of the setting, no regular enemy has more than two arms, two legs and two eyes.

## Building from source

```bash
cd shadow-web
npm install
npm run build      # writes index.html (minified, three.js inlined)
npm run dev        # same, unminified with inline source maps
```

Source lives in `src/`:

- `city.js`: generation, the facade/ground/water shaders, traffic, collision grid and raycasts.
- `character.js`: rig, sculpted geometry, painted suits, pose library and keyframed moves.
- `player.js`: traversal and combat.
- `enemies.js`: AI and encounters.
- `cast.js` and `accessories.js`: named characters (looks, costume pieces, ally AI).
- `bosses.js`: data-driven bosses (Venom, Black Cat, Rhino, Vulture, Wolverine, Electro, Shocker, Deadpool, symbiote variants, the five-headed Venom).
- `props.js`: set pieces (ambulance, gang cars, news and S.H.I.E.L.D. helicopters, quarantine camp, Helicarrier, shrine, billboards).
- `story/`: the campaign.
  - `engine.js` runs missions as generator scripts.
  - `missions.js` has every mission, the endings and the side story.
  - `ui.js` handles subtitles, choices and the boss bar.
  - `save.js` handles saves.
- `renderer.js`: sky, lighting, post-processing.
- `input.js` and `controls.js`: keyboard, mouse and gamepad input, controller profiles, and button prompts.
- `settings.js`: saved options.
- `fx.js`, `audio.js`, `hud.js`, `camera.js`, `main.js`.

URL options: `?q=0|1|2` forces low/medium/high quality. `?test` skips the title screen; it's used by automated playtests, and exposes `window.__game` and `window.__story`. Add `&mode=new` to jump straight into the story.

## Notes

- **Graphics.** It runs on WebGL2. Everything is procedural (no model or texture files), so it aims for a stylised, late-PS3/early-PS4 look rather than photorealism. If your frame rate drops, use **Low** quality.
- **Name and characters.** This is an unofficial, non-commercial fan tribute. Spider-Man and every other Marvel character in it belong to Marvel. All dialogue is original, and every model is built procedurally in code. Keep it non-commercial.
