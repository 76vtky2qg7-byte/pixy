// Asset URLs go through Vite so they are hashed, copied and referenced
// relatively in the build. Nothing is fetched from a CDN at runtime.
import actorsUrl from '../assets/actors.png';
import bossesUrl from '../assets/bosses.png';
import digitsUrl from '../assets/digits.png';
import fxBoomUrl from '../assets/fx_boom.png';
import fxHitUrl from '../assets/fx_hit.png';
import fxPopUrl from '../assets/fx_pop.png';
import fxUpgradeUrl from '../assets/fx_upgrade.png';
import fxWarnUrl from '../assets/fx_warn.png';
import glyphsUrl from '../assets/glyphs.png';
import iconsUrl from '../assets/icons.png';
import pickupsUrl from '../assets/pickups.png';
import projUrl from '../assets/proj.png';
import propsUrl from '../assets/props.png';
import tilesUrl from '../assets/tiles.png';

export interface SheetSpec {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

export const SHEETS: SheetSpec[] = [
  { key: 'actors', url: actorsUrl, frameWidth: 32, frameHeight: 32 },
  { key: 'bosses', url: bossesUrl, frameWidth: 64, frameHeight: 64 },
  { key: 'pickups', url: pickupsUrl, frameWidth: 16, frameHeight: 16 },
  { key: 'proj', url: projUrl, frameWidth: 20, frameHeight: 20 },
  { key: 'fx_hit', url: fxHitUrl, frameWidth: 16, frameHeight: 16 },
  { key: 'fx_pop', url: fxPopUrl, frameWidth: 16, frameHeight: 16 },
  { key: 'fx_boom', url: fxBoomUrl, frameWidth: 40, frameHeight: 40 },
  { key: 'fx_upgrade', url: fxUpgradeUrl, frameWidth: 48, frameHeight: 48 },
  { key: 'fx_warn', url: fxWarnUrl, frameWidth: 64, frameHeight: 64 },
  { key: 'tiles', url: tilesUrl, frameWidth: 32, frameHeight: 32 },
  { key: 'props', url: propsUrl, frameWidth: 40, frameHeight: 28 },
  { key: 'icons', url: iconsUrl, frameWidth: 20, frameHeight: 20 },
  { key: 'glyphs', url: glyphsUrl, frameWidth: 14, frameHeight: 14 },
  { key: 'digits', url: digitsUrl, frameWidth: 7, frameHeight: 9 },
];

/** Frame index of a projectile kind in assets/proj.png. */
export const PROJ_FRAMES = {
  rivet: 0,
  saw: [1, 2, 3, 4],
  arc: [5, 6],
  shell: 7,
  shard: 8,
  plasma: [9, 10],
} as const;

export const PICKUP_FRAMES = { scrap: [0, 1], spark: [2, 3], cell: [4, 5] } as const;

/** Characters in assets/digits.png, in sheet order. */
export const DIGIT_CHARS = '0123456789+-!x';

export { iconsUrl, glyphsUrl, actorsUrl };
