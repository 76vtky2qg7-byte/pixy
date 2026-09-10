# Assets and licences

## Original assets — created for this project

Every sprite, tile, icon, sound and piece of music in the game was produced for
this project. There are **no third-party graphics or audio files** in the build.

### Graphics

All artwork is generated from source code by `tools/genart.mjs`, which draws
into an in-memory pixel buffer and encodes PNGs with a dependency-free encoder
(`tools/pixlib.mjs`, using only Node's built-in `zlib`). Running `npm run art`
regenerates every file byte-for-byte — the generator is deterministic.

| File | Contents |
|---|---|
| `src/assets/actors.png` | 2 player robots and 6 enemy types, 2 frames each, plus wind-up frames |
| `src/assets/bosses.png` | 2 bosses with idle and telegraph frames |
| `src/assets/tiles.png` | 4 floor tiles for each of 3 arenas |
| `src/assets/props.png` | crate, pipe run, vent, barrel stack |
| `src/assets/pickups.png` | scrap, spark, repair cell |
| `src/assets/proj.png` | rivet, saw, arc, mortar shell, shrapnel, enemy plasma |
| `src/assets/fx_*.png` | hit spark, pickup pop, explosion, upgrade ring, warning ring |
| `src/assets/icons.png` | 6 weapon and 8 module icons |
| `src/assets/glyphs.png` | scrap / credit / hull marks |
| `src/assets/digits.png` | 7x9 number font for in-world damage numbers |
| `src/assets/cover_floor.png` | seamless floor patch used by the store cover |
| `src/assets/store_icon.png` | 512x512 store icon |
| `store/cover-*.png` | store covers, composed from the above by `tools/store-art.mjs` |

- **Author:** created for this project.
- **Licence:** all rights reserved by the project owner; free to publish as
  part of this game.
- **Modifications:** not applicable — these are original works, not derivatives.
- **Source:** `tools/genart.mjs`, `tools/art/*.mjs`, `tools/pixlib.mjs`.

### Audio

All sound effects and music are **synthesised at runtime** in
`src/audio/audio.ts` using the Web Audio API — oscillators, a noise buffer and
biquad filters. No audio files are downloaded or bundled, so the entire sound
design costs zero bytes of download.

- **Author:** created for this project.
- **Licence:** all rights reserved by the project owner.

## Third-party assets

### Pixelify Sans (font)

The only third-party asset in the build.

| | |
|---|---|
| **Name** | Pixelify Sans |
| **Author** | The Pixelify Sans Project Authors |
| **Source** | https://github.com/eifetx/Pixelify-Sans — obtained via Google Fonts (`fonts.gstatic.com`) |
| **Licence** | SIL Open Font License 1.1 |
| **Licence text** | bundled verbatim at `public/fonts/OFL.txt` and shipped in the build at `fonts/OFL.txt` |
| **Copyright** | Copyright 2021 The Pixelify Sans Project Authors |
| **Files** | `public/fonts/pixelify-latin.woff2`, `public/fonts/pixelify-cyrillic.woff2` |
| **Modifications** | None to the font data. Only the Latin and Cyrillic subsets published by Google Fonts are included; the Latin-Extended subset is omitted to save bandwidth. The files are self-hosted rather than loaded from a CDN. |
| **Cyrillic support** | Yes — this is why it was chosen. Covers U+0400–U+045F, U+0490–0491, U+04B0–04B1, U+2116. |

The OFL permits bundling and redistribution with software. The font is not sold
separately, is not renamed, and its licence travels with it in the archive.

## Third-party code

| Package | Version | Licence | Where |
|---|---|---|---|
| `phaser` | 3.90.0 | MIT | bundled into the build (rendering only) |
| `vite` | 7.3.6 | MIT | build tool, not shipped |
| `typescript` | 5.9.3 | Apache-2.0 | build tool, not shipped |
| `vitest` | 5.0.0 | MIT | tests, not shipped |
| `@types/ysdk` | 1.2.0 | MIT (DefinitelyTyped) | type definitions only, erased at compile time |

Phaser is the only dependency that reaches the player, and it is bundled into
the archive. Nothing is fetched from a CDN at runtime — `tools/pack.mjs`
fails the pack if it finds a CDN hostname in the output.
