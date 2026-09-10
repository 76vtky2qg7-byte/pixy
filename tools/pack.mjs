#!/usr/bin/env node
/**
 * Build yandex-build.zip from dist/.
 *
 * The archive is checked, not assumed: index.html must be at the root, every
 * asset reference must be relative, no source, secrets or node_modules may be
 * present, and file names must be safe for the uploader. Anything that fails
 * stops the pack rather than shipping a broken upload.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ZIP = path.join(ROOT, 'yandex-build.zip');

/**
 * Platform limit for the unpacked archive, as relayed by review from the
 * Yandex Games requirements page. That page is not reachable from this build
 * environment, so it could not be re-read first-hand — see TEST_REPORT.md.
 */
const PLATFORM_LIMIT_MB = 100;
/** Our own, much tighter target: a phone on mobile data has to load this. */
const SIZE_BUDGET_MB = 20;

const FORBIDDEN = [
  /(^|\/)node_modules(\/|$)/,
  /\.(ts|tsx|map|env|pem|key|log)$/i,
  /(^|\/)\.(git|env|DS_Store)/i,
  /(^|\/)src(\/|$)/,
  /(^|\/)tools(\/|$)/,
];

/**
 * File and folder names must contain no spaces and no Cyrillic. Restricting to
 * plain ASCII letters, digits, dot, dash and underscore satisfies that and
 * leaves no room for anything else surprising.
 */
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * The single absolute URL the build is allowed to contain.
 *
 * `/sdk.js` is the platform's own endpoint for a ZIP served by Yandex, not a
 * game asset — the relative-path rule exists so OUR files resolve under the
 * game's directory, and this one deliberately must not. `./sdk.js` would point
 * inside the game folder, where nothing is served.
 */
const PLATFORM_SDK_PATH = '/sdk.js';

const fail = (msg) => { console.error(`\n  FAILED: ${msg}\n`); process.exit(1); };

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs, size: fs.statSync(abs).size });
  }
  return out;
}

if (!fs.existsSync(DIST)) fail('dist/ does not exist — run `npm run build` first.');
const files = walk(DIST);
if (!files.length) fail('dist/ is empty.');

/* ---- 1. index.html at the archive root ---- */
if (!files.some((f) => f.rel === 'index.html')) {
  fail('index.html is not at the root of dist/.');
}

/* ---- 2. nothing that must not ship ---- */
for (const f of files) {
  for (const rule of FORBIDDEN) {
    if (rule.test(f.rel)) fail(`${f.rel} matches a forbidden pattern (${rule}).`);
  }
  for (const part of f.rel.split('/')) {
    if (!SAFE_NAME.test(part)) {
      fail(`unsafe file or folder name (no spaces or non-ASCII allowed): ${f.rel}`);
    }
  }
}

/* ---- 3. every reference relative, none absolute or CDN ---- */
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = m[1];
  if (url.startsWith('/')) fail(`index.html references an absolute path: ${url}`);
  if (/^https?:/i.test(url)) fail(`index.html references a remote URL: ${url}`);
}

// The game libraries must be bundled, never fetched at runtime. The only
// external script the game may load is the Yandex SDK itself, and that is
// requested by our adapter at runtime rather than referenced from the HTML.
for (const f of files.filter((f) => f.rel.endsWith('.css'))) {
  const css = fs.readFileSync(f.abs, 'utf8');
  for (const m of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    const url = m[2];
    if (url.startsWith('data:')) continue;
    if (url.startsWith('/')) fail(`${f.rel} references an absolute path: ${url}`);
    if (/^https?:/i.test(url)) fail(`${f.rel} references a remote URL: ${url}`);
  }
}

const jsFiles = files.filter((f) => f.rel.endsWith('.js'));
for (const f of jsFiles) {
  const js = fs.readFileSync(f.abs, 'utf8');
  for (const host of ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com']) {
    if (js.includes(host)) fail(`${f.rel} loads a library from ${host} at runtime.`);
  }
}

/* ---- 3b. the SDK is loaded from the platform root, not bundled or relative ---- */
const bundleText = jsFiles.map((f) => fs.readFileSync(f.abs, 'utf8')).join('\n');
if (!bundleText.includes(`"${PLATFORM_SDK_PATH}"`) && !bundleText.includes(`'${PLATFORM_SDK_PATH}'`)) {
  fail(`the build does not reference the platform SDK at ${PLATFORM_SDK_PATH}.`);
}
if (files.some((f) => f.rel === 'sdk.js')) {
  fail('sdk.js must not be bundled — the platform serves it.');
}
if (bundleText.includes('yandex.ru/games/sdk')) {
  fail('the build still references a legacy SDK endpoint.');
}

/* ---- 4. size ---- */
const total = files.reduce((n, f) => n + f.size, 0);
const totalMB = total / 1048576;
if (totalMB > PLATFORM_LIMIT_MB) {
  fail(`dist/ is ${totalMB.toFixed(1)} MB unpacked, over the ${PLATFORM_LIMIT_MB} MB platform limit.`);
}
if (totalMB > SIZE_BUDGET_MB) {
  fail(`dist/ is ${totalMB.toFixed(1)} MB unpacked, over our own ${SIZE_BUDGET_MB} MB target.`);
}

/* ---- 5. write the archive ---- */
fs.rmSync(ZIP, { force: true });
execFileSync('zip', ['-r', '-q', '-X', ZIP, '.'], { cwd: DIST });

/* ---- 6. verify what actually landed in the archive ---- */
const listing = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean).filter((s) => !s.endsWith('/'));

if (!listing.includes('index.html')) fail('index.html is missing from the archive.');
const missing = files.map((f) => f.rel).filter((r) => !listing.includes(r));
if (missing.length) fail(`files missing from the archive: ${missing.join(', ')}`);
for (const entry of listing) {
  for (const rule of FORBIDDEN) {
    if (rule.test(entry)) fail(`archive contains a forbidden entry: ${entry}`);
  }
}

const zipSize = fs.statSync(ZIP).size;
console.log(`yandex-build.zip  ${(zipSize / 1024).toFixed(0)} KB  (${listing.length} files, ${(total / 1024).toFixed(0)} KB unpacked)`);
console.log('  index.html at root .......... ok');
console.log('  relative paths only ......... ok');
console.log('  no sources / secrets ........ ok');
console.log('  no runtime CDN for libraries. ok');
console.log(`  SDK from ${PLATFORM_SDK_PATH} ............ ok`);
console.log(`  no spaces / non-ASCII names . ok`);
console.log(`  unpacked size ............... ok (${totalMB.toFixed(2)} MB; target ${SIZE_BUDGET_MB} MB, platform limit ${PLATFORM_LIMIT_MB} MB)`);
for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 8)) {
  console.log(`    ${(f.size / 1024).toFixed(0).padStart(6)} KB  ${f.rel}`);
}
