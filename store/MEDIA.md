# Store media inventory

Measured from the files themselves — dimensions come from each PNG header,
sizes from the filesystem. Nothing here is asserted to match the Yandex
draft form: **the required dimensions could not be read from this**
**environment** (see TEST_REPORT.md), so check each field against the form
when filling the draft and re-export only what actually mismatches.

Every image is a real render of the built game or is composed from the
game's own generated sprites and font — none are mock-ups.

| File | Format | Width | Height | Size |
|---|---|---|---|---|
| `cover-1280x720.png` | PNG | 1280 | 720 | 481.8 KB |
| `cover-800x470.png` | PNG | 800 | 470 | 217 KB |
| `icon-512x512.png` | PNG | 512 | 512 | 8.4 KB |
| `screenshots/1-menu-1366x768.png` | PNG | 1366 | 768 | 118.3 KB |
| `screenshots/1-menu-360x800.png` | PNG | 720 | 1600 | 157.1 KB |
| `screenshots/1-menu-390x844.png` | PNG | 1170 | 2532 | 276.3 KB |
| `screenshots/2-combat-1366x768.png` | PNG | 1366 | 768 | 51.6 KB |
| `screenshots/2-combat-360x800.png` | PNG | 720 | 1600 | 61.5 KB |
| `screenshots/2-combat-390x844.png` | PNG | 1170 | 2532 | 89.1 KB |
| `screenshots/3-panel-1366x768.png` | PNG | 1366 | 768 | 67.3 KB |
| `screenshots/3-panel-360x800.png` | PNG | 720 | 1600 | 55 KB |
| `screenshots/3-panel-390x844.png` | PNG | 1170 | 2532 | 85.4 KB |
| `screenshots/4-boss-1366x768.png` | PNG | 1366 | 768 | 42 KB |
| `screenshots/4-boss-360x800.png` | PNG | 720 | 1600 | 62.2 KB |
| `screenshots/4-boss-390x844.png` | PNG | 1170 | 2532 | 92.9 KB |
| `screenshots/5-workshop-1366x768.png` | PNG | 1366 | 768 | 57.5 KB |
| `screenshots/5-workshop-360x800.png` | PNG | 720 | 1600 | 60 KB |
| `screenshots/5-workshop-390x844.png` | PNG | 1170 | 2532 | 90.6 KB |
| `screenshots/6-contracts-1366x768.png` | PNG | 1366 | 768 | 70.9 KB |
| `screenshots/6-contracts-360x800.png` | PNG | 720 | 1600 | 76.6 KB |
| `screenshots/6-contracts-390x844.png` | PNG | 1170 | 2532 | 109.1 KB |

Total: 21 images, 2.28 MB.

## Video

Real screen recordings of the production build, captured in Chromium.
Input goes through the game's normal touch path, so the on-screen stick is
visible and the movement is genuine. The run is **staged the way any trailer
is** — it starts at a dense mid-contract wave, the shop is seeded so the
Battery is on offer, and waves are ended on cue instead of played out in
full. The mechanics shown are not staged: the adjacency link, the stat
change and the faster firing afterwards are the game doing its normal job.

| File | Codec | Width | Height | Duration | Size |
|---|---|---|---|---|---|
| `video/gameplay-desktop-1366x768.webm` | vp8 | 1366 | 768 | 36.2s | 3894.1 KB |
| `video/gameplay-portrait-390x844.webm` | vp8 | 390 | 844 | 36.2s | 3375.4 KB |

Only **WebM/VP8** could be produced here: the ffmpeg bundled with the
browser is a minimal build with no H.264 encoder, so there is no MP4. If the
draft form requires MP4, convert with a full ffmpeg:

```bash
ffmpeg -i gameplay-portrait-390x844.webm -c:v libx264 -crf 20 -pix_fmt yuv420p gameplay.mp4
```

Shot list and timings: `store/VIDEO_SCRIPT.md`.

## What each one is for

| File | Purpose |
|---|---|
| `icon-512x512.png` | Game icon. Composed scene: the salvage robot mid-fight. |
| `cover-800x470.png` | Catalogue cover with the title and the 2x3 panel. |
| `cover-1280x720.png` | Same artwork at 16:9, if a wider banner is wanted. |
| `screenshots/1-menu-*` | Main menu. |
| `screenshots/2-combat-*` | Combat on the foundry floor, full six-cell panel. |
| `screenshots/3-panel-*` | The equipment panel with live adjacency links, plus stores. |
| `screenshots/4-boss-*` | Boss wave with the health bar and a telegraphed attack. |
| `screenshots/5-workshop-*` | Permanent upgrades. |
| `screenshots/6-contracts-*` | Contract and robot selection. |

Screenshots exist at three widths (`360x800`, `390x844`, `1366x768`) so the
draft form can be filled with whichever aspect it asks for.
