# Assets

The MIT license covers the code. The files in `public/` are listed here.

| Files | What | Source | Terms |
|---|---|---|---|
| `public/characters/*.vsplat` | Runners and the station master (Gaussian-splat characters) | Made with [PINOC](https://viggle.ai/pinoc) | Included so the game runs. Not MIT: do not reuse them outside this project. Make your own in PINOC or with the in-game photo upload. |
| `public/portraits/*.jpg` | Roster portraits of those characters | PINOC | Same as the characters. |
| `public/motions/*.glb` | Motion clips. `gen_*` were generated with PINOC text-to-motion; the others come from the free PINOC motion library. | PINOC | Same as the characters. |
| `public/models/train.glb` | The train car | Modelled for this project with a Blender script | MIT, like the code. |

Everything else you see or hear (scenery, textures, music, effects) is generated in code at runtime.

Fonts are loaded from Google Fonts (Shippori Mincho B1, Zen Kaku Gothic New; SIL Open Font License).
The renderer is [PlayCanvas](https://playcanvas.com) (MIT) with `@viggle/splat-engine` (MIT).
