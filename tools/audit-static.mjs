#!/usr/bin/env node
/**
 * Static pre-flight audit.
 *
 * Checks the things that can be decided by reading the source and the built
 * bundle, before anything is uploaded. Exits non-zero on a finding so it can
 * gate a release.
 *
 *   npm run build && node tools/audit-static.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const findings = [];
const notes = [];
const fail = (area, msg) => findings.push(`${area}: ${msg}`);
const note = (area, msg) => notes.push(`${area}: ${msg}`);

const read = (p) => fs.readFileSync(p, 'utf8');
function walk(dir, test) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, test));
    else if (test(e.name)) out.push(abs);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. Localisation completeness                                        */
/* ------------------------------------------------------------------ */
const i18nSrc = read(path.join(ROOT, 'src/ui/i18n.ts'));

const ruBlock = i18nSrc.slice(i18nSrc.indexOf('export const RU = {'), i18nSrc.indexOf('} as const;'));
const enBlock = i18nSrc.slice(i18nSrc.indexOf('export const EN:'), i18nSrc.indexOf('export type Lang'));
const keysOf = (block) => [...block.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]);
const ruKeys = keysOf(ruBlock);
const enKeys = keysOf(enBlock);

const missingEn = ruKeys.filter((k) => !enKeys.includes(k));
const extraEn = enKeys.filter((k) => !ruKeys.includes(k));
if (missingEn.length) fail('i18n', `keys missing from EN: ${missingEn.join(', ')}`);
if (extraEn.length) fail('i18n', `keys in EN that RU does not have: ${extraEn.join(', ')}`);

// Every RU value must actually be Russian where it is prose, not a leftover
// English string. Flag values that contain Latin letters but no Cyrillic.
const ruEntries = [...ruBlock.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'((?:[^'\\]|\\.)*)'/gm)];
const ALLOWED_LATIN = new Set([
  'gameTitle', 'robot_scrap14', 'robot_volt9', 'fps', 'version',
  'purchase_foreman_kit', 'purchase_no_forced_ads',
]);
for (const [, key, value] of ruEntries) {
  const hasLatinWord = /[A-Za-z]{3,}/.test(value);
  const hasCyrillic = /[А-Яа-яЁё]/.test(value);
  if (hasLatinWord && !hasCyrillic && !ALLOWED_LATIN.has(key)) {
    fail('i18n', `RU value for "${key}" looks untranslated: "${value}"`);
  }
}
note('i18n', `${ruKeys.length} keys, RU and EN in sync`);

/* ------------------------------------------------------------------ */
/* 2. Every t()/tk() key used in the UI exists                         */
/* ------------------------------------------------------------------ */
const uiFiles = walk(path.join(ROOT, 'src'), (n) => n.endsWith('.ts'));
const knownKeys = new Set(ruKeys);
for (const file of uiFiles) {
  const src = read(file);
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/g)) {
    if (!knownKeys.has(m[1])) {
      fail('i18n', `${path.relative(ROOT, file)} uses unknown key "${m[1]}"`);
    }
  }
}

// Dynamic keys built by tk(prefix, id): verify every prefix/id pair resolves.
const dynamic = [
  ['gear', ['riveter', 'buzzsaw', 'arc', 'mortar', 'beam', 'hammer',
    'battery', 'heatsink', 'coil', 'targeter', 'feeder', 'piston', 'repair', 'magnet']],
  ['contract', ['night_shift', 'foundry_rush', 'arc_quarantine']],
  ['robot', ['scrap14', 'volt9']],
  ['up', ['hull', 'servos', 'welder', 'grapple', 'fence', 'calibration', 'jumpstart', 'backup']],
  ['combo', ['rapid_rivets', 'scattergun', 'chain_saw', 'siege_mortar',
    'open_beam', 'breaker', 'storm_arc', 'salvage_saw']],
  ['mod', ['overdrive_line', 'hardened']],
  ['arena', ['sorting', 'foundry', 'arc']],
  ['stat', ['damage', 'fireRate', 'range', 'projectiles', 'heatGain',
    'cooling', 'chain', 'knockback', 'armorPierce', 'scrapBonus']],
  ['reward', ['waves', 'kills', 'win', 'tier', 'retreat']],
];
for (const [prefix, ids] of dynamic) {
  for (const id of ids) {
    if (!knownKeys.has(`${prefix}_${id}`)) fail('i18n', `missing key ${prefix}_${id}`);
    // Descriptions exist for gear, contracts, robots and upgrades.
    if (['gear', 'contract', 'robot', 'up'].includes(prefix)
        && !knownKeys.has(`${prefix}_${id}_desc`)) {
      fail('i18n', `missing key ${prefix}_${id}_desc`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3. Characters used must be covered by the bundled font subsets      */
/* ------------------------------------------------------------------ */
// Read the ranges out of style.css rather than keeping a copy here, so this
// check cannot drift from what the CSS actually declares.
//
// Note what this can and cannot tell you: a unicode-range is a promise the
// stylesheet makes about a file, not proof the file keeps it. Upstream
// Pixelify Sans declared the Cyrillic range but shipped no U+041E or U+041F.
// Only rendering catches that, which is what tools/audit-browser.mjs does.
const cssText = read('src/ui/style.css');
const RANGES = [];
for (const decl of cssText.matchAll(/unicode-range:\s*([^;]+);/g)) {
  for (const part of decl[1].split(',')) {
    const m = part.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/);
    if (!m) continue;
    const lo = parseInt(m[1], 16);
    RANGES.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
  }
}
if (!RANGES.length) fail('font', 'no unicode-range declarations found in style.css');
const covered = (cp) => RANGES.some(([a, b]) => cp >= a && cp <= b);

const uiText = new Set();
for (const [, , value] of ruEntries) for (const ch of value) uiText.add(ch);
const enEntries = [...enBlock.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'((?:[^'\\]|\\.)*)'/gm)];
for (const [, , value] of enEntries) for (const ch of value) uiText.add(ch);
// Literal glyphs written directly into screens (arrows, stars, ticks).
for (const file of uiFiles) {
  for (const m of read(file).matchAll(/text:\s*'([^']*)'/g)) for (const ch of m[1]) uiText.add(ch);
  for (const m of read(file).matchAll(/'([★✔✓✕✖←→↑↓·—–«»‹›]+)'/g)) for (const ch of m[1]) uiText.add(ch);
}
const uncovered = [...uiText].filter((ch) => !covered(ch.codePointAt(0)));
if (uncovered.length) {
  fail('font', `characters used by the UI fall outside every declared unicode-range: ${
    uncovered.map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}`);
}

/* ------------------------------------------------------------------ */
/* 4. Nothing embarrassing or non-shippable in the built bundle        */
/* ------------------------------------------------------------------ */
if (!fs.existsSync(DIST)) fail('build', 'dist/ does not exist — run npm run build');
else {
  const bundleFiles = walk(DIST, (n) => n.endsWith('.js') || n.endsWith('.css') || n.endsWith('.html'));
  const bundle = bundleFiles.map(read).join('\n');

  const FORBIDDEN = [
    [/\bclaude\b/i, 'an AI assistant name'],
    [/\banthropic\b/i, 'an AI vendor name'],
    [/lorem ipsum/i, 'placeholder copy'],
    [/\bTODO\b/, 'a TODO marker'],
    [/coming soon/i, 'a "coming soon" placeholder'],
    [/\bFIXME\b/, 'a FIXME marker'],
    [/localhost/i, 'a localhost reference'],
    [/127\.0\.0\.1/, 'a loopback address'],
    [/\bXXX\b/, 'a scratch marker'],
  ];
  for (const [re, what] of FORBIDDEN) {
    if (re.test(bundle)) fail('bundle', `contains ${what} (${re})`);
  }

  /*
   * External URLs.
   *
   * A bundled library legitimately contains URL-shaped strings that are never
   * fetched: XML namespace identifiers, and Phaser's own console banner. Those
   * are allowlisted by host. Anything else in the bundle is a finding here, and
   * the authoritative check — that no request actually leaves the origin — is
   * done at runtime in tools/audit-browser.mjs.
   */
  const urls = [...bundle.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  const ALLOWED_HOSTS = new Set([
    'sdk.games.s3.yandex.net', // documented self-hosted SDK form; unused here
    'www.w3.org',              // XML namespaces (SVG, XHTML), never fetched
    'phaser.io',               // Phaser's console banner text
  ]);
  const external = [];
  for (const u of urls) {
    const host = (() => { try { return new URL(u).host; } catch { return ''; } })();
    if (!ALLOWED_HOSTS.has(host)) fail('bundle', `references an external URL: ${u}`);
    else external.push(host);
  }
  if (!bundle.includes('"/sdk.js"') && !bundle.includes("'/sdk.js'")) {
    fail('bundle', 'does not load the platform SDK from /sdk.js');
  }

  // The archive must carry the font licence.
  if (!fs.existsSync(path.join(DIST, 'fonts/OFL.txt'))) {
    fail('legal', 'the OFL licence for Pixelify Sans is not in the build');
  }
  note('bundle', `${bundleFiles.length} code files scanned; URL-shaped strings only from ${
    [...new Set(external)].join(', ')} (none are fetched)`);
}

/* ------------------------------------------------------------------ */
/* 5. Store text sanity                                                */
/* ------------------------------------------------------------------ */
for (const [file, lang] of [['store/card-ru.md', 'ru'], ['store/card-en.md', 'en']]) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { fail('store', `${file} is missing`); continue; }
  const text = read(p);
  // Each field's literal value is the body of the fenced block that follows
  // its heading, so the check reads exactly what gets pasted into the form.
  const field = (heading) => {
    const m = new RegExp(`##\\s*${heading}[^\\n]*\\n+(?:\`[^\`]*\`[^\\n]*\\n+)?\`\`\`\\n([\\s\\S]*?)\\n\`\`\``).exec(text);
    return m ? m[1] : null;
  };

  // Limits read off the real console form, not guessed. Overrunning any of
  // them means the text cannot be submitted at all.
  const FIELDS = [
    ['Название', 'Title', 50, true],
    ['Описание для SEO', 'SEO description', 160, false],
    ['Об игре', 'About the game', 1000, true],
    ['Короткое описание', 'Short description', 70, false],
    ['Как играть', 'How to play', 1000, true],
  ];
  for (const [ru, en, limit, required] of FIELDS) {
    const raw = field(ru) ?? field(en);
    if (raw === null) {
      fail('store', `${file} has no "${ru}" field`);
      continue;
    }
    const v = raw.trim();
    if (required && !v) fail('store', `${file}: "${ru}" is required and empty`);
    if (v.length > limit) {
      fail('store', `${file}: "${ru}" is ${v.length} characters, over the form's ${limit}`);
    }
    // The stated count next to the heading has to match the text under it,
    // or the document lies about whether it fits.
    const stated = new RegExp(`##\\s*(?:${ru}|${en})[^\\n]*\\n+\`(\\d+) / (\\d+)\``).exec(text);
    if (stated) {
      if (Number(stated[1]) !== v.length) {
        fail('store', `${file}: "${ru}" is labelled ${stated[1]} characters but is ${v.length}`);
      }
      if (Number(stated[2]) !== limit) {
        fail('store', `${file}: "${ru}" is labelled out of ${stated[2]} but the form allows ${limit}`);
      }
    }
  }

  const title = field('Название') ?? field('Title');
  if (title) {
    const value = title.trim();
    // A title carrying a slash, an emoji or a bracketed aside reads as two
    // names at once, which is the sort of thing moderation sends back.
    if (value.includes('\n')) fail('store', `${file} title is not a single line`);
    if (/[\/|]|\p{Extended_Pictographic}/u.test(value)) {
      fail('store', `${file} title contains a separator or emoji: ${value}`);
    }
  }

  // Claims that are not verified must not appear.
  if (/без интернета|works offline\b/i.test(text) && !/после загрузки|once (the page has )?loaded/i.test(text)) {
    fail('store', `${file} claims offline support without scoping it`);
  }
  if (lang === 'ru' && !/[А-Яа-я]/.test(text)) fail('store', 'card-ru.md is not in Russian');
}

/* ------------------------------------------------------------------ */
/* 6. Every declared deliverable exists                                */
/* ------------------------------------------------------------------ */
for (const f of [
  'yandex-build.zip', 'README.md', 'PROJECT_STATE.md', 'BALANCE.md',
  'TEST_REPORT.md', 'ASSET_LICENSES.md', 'store/MEDIA.md',
  'store/OWNER_CHECKLIST.md', 'store/VIDEO_SCRIPT.md',
  'store/card-draft.md', 'store/iskrolom-store-card.docx',
  'store/icon-512x512.png', 'store/cover-800x470.png',
  'store/cover-1280x720.png',
  // Both orientations in both languages: the store card asks for landscape,
  // and moderation checks every language the game claims to support.
  'store/video/gameplay-portrait-390x844-ru.webm',
  'store/video/gameplay-portrait-390x844-en.webm',
  'store/video/gameplay-landscape-1366x768-ru.webm',
  'store/video/gameplay-landscape-1366x768-en.webm',
]) {
  if (!fs.existsSync(path.join(ROOT, f))) fail('deliverables', `${f} is missing`);
}

// Screenshots: six screens at three sizes, in both languages.
const SHOT_SCREENS = ['1-menu', '2-combat', '3-panel', '4-boss', '5-workshop', '6-contracts'];
const SHOT_SIZES = ['390x844', '360x800', '1366x768'];
for (const lang of ['ru', 'en']) {
  const missing = [];
  for (const screen of SHOT_SCREENS) {
    for (const size of SHOT_SIZES) {
      const rel = `store/screenshots/${lang}/${screen}-${size}.png`;
      if (!fs.existsSync(path.join(ROOT, rel))) missing.push(`${screen}-${size}`);
    }
  }
  if (missing.length) {
    fail('deliverables', `store/screenshots/${lang}/ is missing ${missing.length}: ${missing.join(', ')}`);
  }
}

/* ------------------------------------------------------------------ */
console.log('STATIC PRE-FLIGHT AUDIT\n');
for (const n of notes) console.log(`  note  ${n}`);
if (findings.length) {
  console.log('');
  for (const f of findings) console.log(`  FAIL  ${f}`);
  console.log(`\n${findings.length} finding(s)`);
  process.exit(1);
}
console.log('\nno findings');
