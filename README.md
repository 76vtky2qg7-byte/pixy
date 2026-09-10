# Искролом / Sparkscrapper

A pixel-art arena survivor for Yandex Games. You are a small salvage robot on a
night shift at a reclamation plant. Broken machines come for you in short waves;
you collect scrap and build your loadout on a **2×3 equipment panel** between
waves.

The hook is the panel. Weapons and support modules each take one cell, and a
module only affects the cells **orthogonally** next to it — never diagonals. Six
cells is not enough room for everything, so every purchase is a question: one
more weapon, or make the weapon you have better?

- Russian and English, Russian primary
- Phone (portrait-first) and desktop, one-handed controls
- Single player, no server, no mandatory sign-in
- ~7–10 minutes per contract

## Commands

```bash
npm install          # install dependencies (lockfile is committed)

npm run dev          # regenerate art, then start the dev server on :5173
npm run build        # regenerate art, typecheck, and build to dist/
npm run preview      # serve the production build on :4173

npm test             # unit tests (104)
npm run art          # regenerate every sprite from source code
npm run release      # build + verify + write yandex-build.zip
```

Browser checks (Playwright is not a project dependency — it is a large tool and
is installed separately):

```bash
npm run build
npx vite preview --port 4173 --strictPort &

# Playwright, installed outside the project:
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright@1.63.0
cd -  && ln -sfn /tmp/pw/node_modules/playwright node_modules/playwright \
                 && ln -sfn /tmp/pw/node_modules/playwright-core node_modules/playwright-core

node tools/e2e/run.mjs        # 62 end-to-end checks against the built game
node tools/e2e/perf.mjs       # frame-rate measurement
node tools/store-art.mjs      # regenerate the store cover images
npx vite-node tools/sim/report.ts   # regenerate the tables in BALANCE.md
```

`E2E_CHROME` overrides the Chromium binary path if your Playwright install
manages its own browsers.

## Uploading to Yandex Games

1. `npm run release` — builds `dist/` and writes `yandex-build.zip`.
   The packer **verifies the archive** and refuses to write a broken one: it
   checks that `index.html` is at the root, that every path is relative, that no
   sources, maps, secrets or `node_modules` are present, that file names are
   plain ASCII, that no library is fetched from a CDN at runtime, and that the
   contents are inside the size budget.
2. In the Yandex Games developer console, create a draft and upload
   `yandex-build.zip`.
3. Fill the store card from `store/card-ru.md` and `store/card-en.md`.
4. Upload `store/icon-512x512.png` and `store/cover-800x470.png`, plus the
   screenshots in `store/screenshots/`.
   **Check the current required image sizes in the console before uploading** —
   see the note on unverified requirements below.
5. Send for moderation.

### Optional: in-app purchases

The game ships with purchases **switched off by design**. Two non-consumable
products are implemented (`foreman_kit`, `no_forced_ads`), but the purchase UI
only appears when `getCatalog()` returns a non-empty catalogue. Until you
configure those products in the developer console, players see no purchase
section at all — no buttons, no "coming soon". Prices and titles always come
from the SDK, never from a table in the code.

## Project layout

```
src/
  config/     every balance number: gear, enemies, contracts, robots, upgrades
  core/       rng, event bus, fixed-step clock, pause manager, math
  sim/        pure-TypeScript simulation — no Phaser, no DOM
  render/     Phaser scene that draws the simulation
  ui/         DOM screens, i18n, input, the equipment panel
  audio/      Web Audio synthesis
  save/       versioned save format, validation, migration, cloud policy
  platform/   Yandex SDK adapter, dev mock, analytics
  tests/      unit tests
tools/
  pixlib.mjs  PNG encoder + pixel drawing primitives
  art/        the actual sprite artwork, as code
  genart.mjs  regenerates every asset
  sim/        headless balance harness
  e2e/        browser checks against the production build
  pack.mjs    builds and verifies yandex-build.zip
```

The simulation has no dependency on Phaser or the DOM, which is what lets the
balance harness run thousands of waves headlessly and lets the unit tests cover
combat maths directly.

## Notes on what is and is not verified

- **The build, the ZIP and the browser checks are real.** The game was played
  through in Chromium from the unpacked archive, served from a nested path, and
  the results are in `TEST_REPORT.md`.
- **Nothing has been uploaded to Yandex Games.** No account, catalogue,
  moderation or live ad inventory was involved. Anything that needs the real
  platform is listed as outstanding in `TEST_REPORT.md`.
- **The official Yandex documentation could not be read from this environment**
  (`yandex.ru` and `yandex.com` are blocked by the network egress policy). The
  SDK integration is written against the published `@types/ysdk` type
  definitions, which describe the current SDK surface. Before publishing,
  re-check the requirements page, the current archive size limit, and the
  required store image sizes.
- The 20 MB figure used by the packer is an **internal budget**, not a platform
  limit. The build is currently about **1.4 MB unpacked / 425 KB zipped**.
- The name "Искролом" / "Sparkscrapper" has **not** been checked against the
  Yandex Games catalogue for collisions. Treat it as provisional.
