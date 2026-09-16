#!/usr/bin/env node
/**
 * Build the single archive the owner actually uploads from.
 *
 * yandex-build.zip is the game; everything else on the store form - icon,
 * covers, screenshots, video - is uploaded separately, and the texts are
 * typed in by hand. Collecting all of it in one place saves hunting through
 * the repo while a draft form is open in the other tab.
 *
 *   node tools/pack-delivery.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STAGE = '/tmp/iskrolom-delivery';
const OUT = path.join(ROOT, 'iskrolom-yandex-upload.zip');

fs.rmSync(STAGE, { recursive: true, force: true });
const upload = path.join(STAGE, 'upload');
fs.mkdirSync(upload, { recursive: true });

const copy = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(STAGE, to), { recursive: true });

copy('yandex-build.zip', 'upload/yandex-build.zip');
copy('store/icon-512x512.png', 'upload/icon-512x512.png');
copy('store/cover-800x470.png', 'upload/cover-800x470.png');
copy('store/cover-1280x720.png', 'upload/cover-1280x720.png');
copy('store/screenshots', 'upload/screenshots');
copy('store/video', 'upload/video');
copy('store/iskrolom-store-card.docx', 'iskrolom-store-card.docx');

fs.writeFileSync(path.join(STAGE, 'ЧИТАТЬ ПЕРВЫМ.txt'), [
  'Искролом / Sparkscrapper — что загружать в Яндекс Игры',
  '',
  'Откройте iskrolom-store-card.docx — там все тексты карточки на русском',
  'и английском. Серые блоки в нём вставляются в поля формы как есть.',
  '',
  'Папка upload:',
  '',
  '  yandex-build.zip        сам билд. Грузится целиком, распаковывать не нужно.',
  '  icon-512x512.png        иконка',
  '  cover-800x470.png       обложка',
  '  cover-1280x720.png      обложка побольше, если форма попросит такую',
  '  screenshots/            18 штук: 6 экранов в трёх размерах',
  '  video/                  два ролика по 34 секунды, WebM',
  '',
  'Название в каталоге на занятость я проверить не мог — каталог из среды',
  'сборки недоступен. Проверьте вручную, когда будете создавать черновик.',
  '',
].join('\n'));

fs.rmSync(OUT, { force: true });
execFileSync('zip', ['-qr', OUT, '.'], { cwd: STAGE });

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(STAGE);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);

console.log(`${path.basename(OUT)}  ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
console.log(`  ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB unpacked`);
