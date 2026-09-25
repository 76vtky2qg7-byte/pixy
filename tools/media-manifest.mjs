/**
 * List every store image with its real dimensions and file size, read from the
 * PNG headers rather than assumed. Writes store/MEDIA.md.
 *
 *   node tools/media-manifest.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE = path.join(ROOT, 'store');

/** Read width/height straight out of the PNG IHDR chunk. */
function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(24);
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function walk(dir, base = '', ext = '.png') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel, ext));
    else if (e.name.endsWith(ext)) out.push({ rel, abs });
  }
  return out;
}

/** Read the video's real dimensions and duration out of the container. */
function videoInfo(file) {
  const FF = process.env.E2E_FFMPEG || '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
  try {
    const out = execFileSync(FF, ['-hide_banner', '-i', file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseFfmpeg(out);
  } catch (err) {
    // ffmpeg exits non-zero when given no output file; its report is on stderr.
    return parseFfmpeg(String(err.stderr ?? ''));
  }
}

function parseFfmpeg(text) {
  const dim = /,\s(\d{2,5})x(\d{2,5})[,\s]/.exec(text);
  const dur = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(text);
  const codec = /Video:\s*([a-z0-9]+)/i.exec(text);
  return {
    width: dim ? +dim[1] : 0,
    height: dim ? +dim[2] : 0,
    seconds: dur ? +(+dur[1] * 3600 + +dur[2] * 60 + +dur[3]).toFixed(1) : 0,
    codec: codec ? codec[1] : '?',
  };
}

const videos = walk(STORE, '', '.webm').map((f) => {
  const info = videoInfo(f.abs);
  return { file: f.rel, ...info, kb: +(fs.statSync(f.abs).size / 1024).toFixed(1) };
}).sort((a, b) => a.file.localeCompare(b.file));

const rows = walk(STORE).map((f) => {
  const size = pngSize(f.abs);
  const bytes = fs.statSync(f.abs).size;
  return {
    file: f.rel,
    format: 'PNG',
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    kb: +(bytes / 1024).toFixed(1),
  };
}).sort((a, b) => a.file.localeCompare(b.file));

const lines = [
  '# Store media inventory',
  '',
  'Measured from the files themselves — dimensions come from each PNG header,',
  'durations out of the video container, sizes from the filesystem.',
  '',
  'Every image is a real render of the built game or is composed from the',
  "game's own generated sprites and font — none are mock-ups.",
  '',
  '## What the platform actually requires',
  '',
  'The Yandex documentation pages are not reachable from the build',
  'environment, so this table separates what has been seen on the real',
  'console from what is still an assumption. Two of these were guessed wrong',
  'before the owner checked the form, which is why the distinction is drawn.',
  '',
  '| Requirement | Limit | How it is known |',
  '|---|---|---|',
  '| Icon | PNG 512x512 | printed beside the field on the console |',
  '| Video length | 28 seconds | reported by the owner from the console |',
  '| Название | 50 characters | counter on the console |',
  '| Описание для SEO | 160 characters | counter on the console |',
  '| Об игре | 1000 characters | counter on the console |',
  '| Короткое описание | 70 characters | counter on the console |',
  '| Как играть | 1000 characters | counter on the console |',
  '| Ключевые слова | 100 characters | counter on the console |',
  '| Cover dimensions | **unverified** | both 800x470 and 1280x720 are provided |',
  '| Screenshot dimensions and count | **unverified** | three sizes provided per language |',
  '| Archive size cap | **unverified** | the build is 1.4 MB unpacked, far below any plausible cap |',
  '',
  'Check anything marked unverified against the form and re-export only what',
  'actually mismatches.',
  '',
  '| File | Format | Width | Height | Size |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| \`${r.file}\` | ${r.format} | ${r.width} | ${r.height} | ${r.kb} KB |`),
  '',
  `Total: ${rows.length} images, ${(rows.reduce((n, r) => n + r.kb, 0) / 1024).toFixed(2)} MB.`,
  '',
  '## Video',
  '',
  'Real screen recordings of the production build, captured in Chromium.',
  'Input goes through the game\'s normal touch path, so the on-screen stick is',
  'visible and the movement is genuine. The run is **staged the way any trailer',
  'is** — it starts at a dense mid-contract wave, the shop is seeded so the',
  'Battery is on offer, and waves are ended on cue instead of played out in',
  'full. The mechanics shown are not staged: the adjacency link, the stat',
  'change and the faster firing afterwards are the game doing its normal job.',
  '',
  '| File | Codec | Width | Height | Duration | Size |',
  '|---|---|---|---|---|---|',
  ...videos.map((v) => `| \`${v.file}\` | ${v.codec} | ${v.width} | ${v.height} | ${v.seconds}s | ${v.kb} KB |`),
  '',
  'Only **WebM/VP8** could be produced here: the ffmpeg bundled with the',
  'browser is a minimal build with no H.264 encoder, so there is no MP4. If the',
  'draft form requires MP4, convert with a full ffmpeg:',
  '',
  '```bash',
  'ffmpeg -i gameplay-landscape-1366x768-ru.webm -c:v libx264 -crf 20 -pix_fmt yuv420p gameplay.mp4',
  '```',
  '',
  'Shot list and timings: `store/VIDEO_SCRIPT.md`.',
  '',
  '## What each one is for',
  '',
  '| File | Purpose |',
  '|---|---|',
  '| `icon-512x512.png` | Game icon. Composed scene: the salvage robot mid-fight. |',
  '| `cover-800x470-*.png` | Catalogue cover with the title and the 2x3 panel, one per language. |',
  '| `cover-1280x720-*.png` | Same artwork at 16:9, if a wider banner is wanted. |',
  '| `screenshots/*/1-menu-*` | Main menu. |',
  '| `screenshots/*/2-combat-*` | Combat on the foundry floor, full six-cell panel. |',
  '| `screenshots/*/3-panel-*` | The equipment panel with live adjacency links, plus stores. |',
  '| `screenshots/*/4-boss-*` | Boss wave with the health bar and a telegraphed attack. |',
  '| `screenshots/*/5-workshop-*` | Permanent upgrades. |',
  '| `screenshots/*/6-contracts-*` | Contract and robot selection. |',
  '',
  'Videos: four clips of 34 seconds, portrait and landscape, each in Russian',
  'and English. Real recordings of the built game - input goes through the',
  'ordinary touch path, so the stick is visible on screen.',
  '',
  'Each screenshot exists twice over: once per interface language',
  '(`screenshots/ru/` and `screenshots/en/`) and at three sizes within each',
  '- `390x844` and `360x800` portrait for phones, `1366x768` landscape for',
  'desktop - so the draft form can be filled with whichever it asks for.',
  '',
];

fs.writeFileSync(path.join(STORE, 'MEDIA.md'), lines.join('\n'));
console.log(`store/MEDIA.md — ${rows.length} images, ${videos.length} videos`);
for (const v of videos) console.log(`  ${v.width}x${v.height}  ${v.seconds}s  ${v.kb} KB  ${v.file} (${v.codec})`);
for (const r of rows) console.log(`  ${String(r.width).padStart(5)}x${String(r.height).padEnd(5)} ${String(r.kb).padStart(7)} KB  ${r.file}`);
