# Shadow Web

An open-world web-swinging action game in the spirit of *Spider-Man: Web of Shadows*, built with three.js and bundled into **one self-contained `index.html`** (no server, no CDN, works offline).

Open `shadow-web/index.html` in a desktop browser (Chrome, Edge or Firefox) and click **Play**.

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

**Goal.** Destroy the 6 symbiote hives. Their infestation creeps across the buildings and streets around them. Street crimes, rooftop gangs and outbreaks spawn around the city for XP and levels.

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
- `renderer.js`: sky, lighting, post-processing.
- `input.js` and `controls.js`: keyboard, mouse and gamepad input, controller profiles, and button prompts.
- `settings.js`: saved options.
- `fx.js`, `audio.js`, `hud.js`, `camera.js`, `main.js`.

URL options: `?q=0|1|2` forces low/medium/high quality. `?test` skips the title screen; it's used by automated playtests, and exposes `window.__game`.

## Notes

- **Graphics.** It runs on WebGL2. Everything is procedural (no model or texture files), so it aims for a stylised, late-PS3/early-PS4 look rather than photorealism. If your frame rate drops, use **Low** quality.
- **Name and characters.** This is a fan project. The game uses its own name, but the hero's suits are clearly Spider-Man-inspired. Keep it non-commercial.
