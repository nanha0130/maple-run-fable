# MAPLE RUN · 紅葉ラン

**Play it: https://maple-run-fable.vercel.app** (desktop Chrome or Edge, Safari 26+)

A three-track endless runner down a country railway in peak maple season, built with Claude Fable 5.2.

Every runner, and the station master chasing them, is a PINOC Gaussian-splat character driven by PINOC motion clips.
Everything else (trees, track, station, bridge, textures, music) is generated in code at boot.

```
npm install
npm run dev        # http://localhost:5182   (needs WebGPU: desktop Chrome / Edge, Safari 26+)
npm run build      # static build in dist/
```

**Controls:** ←/→ or A/D switch track · ↑/W/Space jump · ↓/S roll (in the air: drop fast and roll on landing) ·
P/Esc pause · M mute. Touch: swipe, tap to jump. On the title screen ←/→ picks a runner, Enter starts.

## What's in the run

- **Barriers** (yellow/black): jump. **Gates** (red/white arm, 頭上注意): roll under.
- **Parked trains** (maroon): change track, or take a wooden **ramp** onto the roofs.
- **Oncoming trains** (green, headlights, horn): they move toward you.
- **Roof runs**: all three tracks blocked, two ramps up.
- **Golden leaves** score 10 × multiplier. The multiplier rises every 1000 m.
- **Power-ups:** 風 wind ride (fly above everything for 7 s) · 寄 leaf magnet · 倍 double score · 守 charm (absorbs one crash).
- Clip the side of a train and you stumble; the station master closes in for 7 s. Stumble again and he catches you.
- Four biomes on an 840 m loop: maple tunnel, harvest paddies with torii, a timber station, a vermilion truss bridge.

## Code map

| file | what |
|---|---|
| `src/main.js` | boot, runner physics and collision, station master, cameras, input, autopilot |
| `src/course.js` | pattern generator (blocks that always leave a way through), trains, leaves, power-ups |
| `src/world.js` | 40 m scenery chunks for the four biomes, maples, sky dome, ridges, river |
| `src/props.js` | train car from `train.glb` (two liveries), barrier, gate, ramp, leaf and power-up meshes |
| `src/stage.js` | scene, lights, fog, post (ACES, bloom, vignette), chunk ring |
| `src/art.js` | every texture, painted on a canvas |
| `src/gfx.js` | geometry accumulator, materials, small maths |
| `src/actors.js` | splat characters and the clip table |
| `src/pinoc.js` | photo to character through the Viggle API (player's own key), local storage of the result |
| `src/fx.js` | tumbling leaves and bursts |
| `src/audio.js` | synthesised music and effects |
| `src/ui.js`, `src/style.css` | title, HUD, pause, game over |

## Debug

`?debug` exposes `G` (state, `G.step(n)` fast-forwards n frames, `G.grant('wind')`, `G.course.train(lane, s, cars, moving)` …)
and is silent unless `&sound` is added. `?auto` runs the autopilot, `?go` skips the title, `?seed=N` fixes the course,
`?lowfx`, `?dpr=1`, `?backend=webgl`, `?nopost`.

## Run as yourself

The last card on the title screen ("YOU") turns one photo into a playable runner:

1. Pick a full-body photo.
2. Paste your own Viggle API key ([get one here](https://portal.viggle.ai/keys); new accounts start with 100 free credits).
3. Press CREATE. A few minutes later your character is on the platform.

One runner costs **30 credits ($0.30)**, charged to the account that owns the key. The finished character is stored in your
browser (IndexedDB), so you only pay once. If you already have a `.vsplat` exported from PINOC, the same panel loads it for free.

How it works (`src/pinoc.js`): `POST /v1/characters` with `type=vsplat` and `joint_set=full`, poll
`GET /v1/characters/{id}`, then `GET /v1/characters/{id}/export?download_type=vsplat`.
See the [Character 3D quickstart](https://docs.viggle.ai/v1/guides/quickstart-character-3d).

**There is no server and no shared key in this project.** The browser calls `apis.viggle.ai` directly with the player's key,
which is kept in `localStorage` on their device and sent nowhere else. If you fork this, keep it that way: never commit a key
and never ship one in the front end. `?mockapi` fakes the API so you can work on the panel without a key.

## License

Code: MIT ([LICENSE](LICENSE)). Characters, portraits and motion clips: see [ASSETS.md](ASSETS.md).
