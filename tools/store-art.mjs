/**
 * Render the store cover from the real game assets and the real game font, by
 * screenshotting a page rather than hand-assembling a PNG. Run after a build:
 *   node tools/store-art.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store');
const CHROME = process.env.E2E_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(OUT, { recursive: true });

const b64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString('base64');
const png = (p) => `data:image/png;base64,${b64(p)}`;
const woff = (p) => `data:font/woff2;base64,${b64(p)}`;

const page = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(${woff('public/fonts/pixelify-latin.woff2')}) format('woff2');
  unicode-range:U+0000-00FF,U+2000-206F;font-display:block}
@font-face{font-family:P;src:url(${woff('public/fonts/pixelify-cyrillic.woff2')}) format('woff2');
  unicode-range:U+0301,U+0400-045F;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:#0b1018;
  font-family:P,sans-serif;color:#dbe6f7;image-rendering:pixelated}
.sp{image-rendering:pixelated;position:absolute}
</style>${body}`;

/* ---------------- cover 800x470 ---------------- */
// A staged scene: factory floor, the robot mid-fight, machines closing in,
// and the equipment panel that the game is actually about.
const tile = png('src/assets/cover_floor.png');
const actors = png('src/assets/actors.png');
const icons = png('src/assets/icons.png');
const propsPng = png('src/assets/props.png');
const fxBoom = png('src/assets/fx_boom.png');
const projPng = png('src/assets/proj.png');

// Sprite helper: crop one frame from a sheet and scale it.
const frame = (src, fw, fh, index, cols, scale, x, y, extra = '') => {
  const col = index % cols, row = Math.floor(index / cols);
  return `<div class="sp" style="left:${x}px;top:${y}px;width:${fw * scale}px;height:${fh * scale}px;
    background-image:url(${src});background-repeat:no-repeat;
    background-size:${cols * fw * scale}px auto;
    background-position:${-col * fw * scale}px ${-row * fh * scale}px;${extra}"></div>`;
};

const coverBody = `<body>
<div style="position:absolute;inset:0;background-image:url(${tile});background-size:256px 256px;
  background-position:0 0;opacity:.9;image-rendering:pixelated"></div>
<div style="position:absolute;inset:0;background:
  radial-gradient(120% 90% at 32% 62%, rgba(196,122,44,.30), transparent 58%),
  linear-gradient(180deg, rgba(5,8,15,.86), rgba(5,8,15,.30) 46%, rgba(5,8,15,.92))"></div>

${frame(propsPng, 40, 28, 3, 4, 3, 596, 250)}
${frame(propsPng, 40, 28, 0, 4, 3, 60, 300)}
${frame(actors, 32, 32, 8, 8, 3.4, 516, 214)}
${frame(actors, 32, 32, 4, 8, 3.2, 632, 300)}
${frame(actors, 32, 32, 6, 8, 3.0, 470, 330)}
${frame(fxBoom, 40, 40, 1, 6, 2.6, 560, 250)}
${frame(actors, 32, 32, 0, 8, 4.6, 300, 246)}
${frame(projPng, 20, 20, 2, 6, 3.2, 430, 292)}
${frame(projPng, 20, 20, 0, 6, 2.6, 404, 300)}

<div style="position:absolute;left:44px;top:44px">
  <!-- The drop shadow is kept shorter than a stroke is thick. At 5px it
       filled the opening in the С, and the title read as ИОКРОЛОМ. -->
  <div style="font-size:62px;letter-spacing:.11em;color:#ffd06a;line-height:1;
    text-shadow:0 3px 0 #3d2109, 0 0 34px rgba(237,164,63,.4)">ИСКРОЛОМ</div>
  <div style="font-size:21px;letter-spacing:.19em;color:#8fa2bf;margin-top:9px">SPARKSCRAPPER</div>
  <div style="font-size:19px;color:#dbe6f7;margin-top:18px;max-width:330px;line-height:1.4">
    Собери оборудование<br>на панели 2&times;3
  </div>
</div>

<!-- The 2x3 panel, with a lit adjacency link: the game's actual hook. -->
<div style="position:absolute;right:40px;top:104px;display:grid;
  grid-template-columns:repeat(2,60px);gap:9px">
  ${[0, 6, 1, 8, 3, 9].map((ic, i) => `
    <div style="position:relative;width:60px;height:60px;border-radius:5px;
      background:#141c2e;border:3px solid ${[0, 2, 4].includes(i) ? '#8f5220' : '#18a5c9'};
      ${i < 2 ? 'box-shadow:0 0 0 3px #2f9e63 inset;' : ''}">
      ${frame(icons, 20, 20, ic, 7, 2.6, 4, 4)}
    </div>`).join('')}
</div>
<!-- The link bar sits in the 9px gutter between the two lit cells, which is
     exactly how the game draws adjacency in the panel. -->
<div style="position:absolute;right:100px;top:130px;width:9px;height:7px;
  background:#59d98d;border-radius:2px;box-shadow:0 0 10px rgba(89,217,141,.9)"></div>
<div style="position:absolute;right:40px;bottom:34px;font-size:15px;color:#59d98d;letter-spacing:.04em">
  Батарея ускоряет соседнее оружие
</div>
</body>`;

/* ---------------- icon 512x512 (already generated as art) ---------------- */

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function shoot(name, w, h, body) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(page(w, h, body), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(220);
  await p.screenshot({ path: path.join(OUT, name) });
  await ctx.close();
  console.log(`store/${name}  ${w}x${h}`);
}

await shoot('cover-800x470.png', 800, 470, coverBody);
// A 16:9 variant, for wherever a wide banner is wanted.
await shoot('cover-1280x720.png', 1280, 720, coverBody.replace('left:44px;top:44px', 'left:70px;top:110px'));

fs.copyFileSync(path.join(ROOT, 'src/assets/store_icon.png'), path.join(OUT, 'icon-512x512.png'));
console.log('store/icon-512x512.png  512x512');

await browser.close();
