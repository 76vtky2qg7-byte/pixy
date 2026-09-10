/**
 * Russian and English strings. Russian is the primary language.
 *
 * Every key must exist in both tables — the type of EN is derived from RU, so
 * a missing translation is a compile error rather than a blank button.
 */
export const RU = {
  // --- app ---
  gameTitle: 'ИСКРОЛОМ',
  gameSubtitle: 'ночная смена на перерабатывающем заводе',
  loading: 'Загрузка…',
  tapToStart: 'Нажмите, чтобы начать',

  // --- main menu ---
  play: 'Играть',
  continueRun: 'Продолжить смену',
  workshop: 'Мастерская',
  settings: 'Настройки',
  contracts: 'Контракты',
  back: 'Назад',
  close: 'Закрыть',
  credits: 'Кредиты',
  scrap: 'Лом',

  // --- contracts ---
  chooseContract: 'Выбор контракта',
  chooseRobot: 'Выбор робота',
  locked: 'Закрыто',
  lockedHint: 'Завершите предыдущий контракт',
  waves: 'Волн',
  arena: 'Цех',
  difficulty: 'Сложность',
  bestResult: 'Лучший результат',
  startContract: 'Принять контракт',
  contractRules: 'Особые условия',
  noRules: 'Без особых условий',

  contract_night_shift: 'Ночная смена',
  contract_night_shift_desc: 'Сортировочный цех. Спокойное начало и первый босс — Пресс-Мать.',
  contract_foundry_rush: 'Литейный аврал',
  contract_foundry_rush_desc: 'Литейная. Машины быстрее, но и лома больше.',
  contract_arc_quarantine: 'Дуговой карантин',
  contract_arc_quarantine_desc: 'Дуговой зал. Укреплённые машины и два босса за смену.',

  mod_overdrive_line: 'Машины на 20% быстрее, лома на 30% больше',
  mod_hardened: 'У машин на 12% больше прочности. Вы начинаете с 30 лома и модулем «Радиатор»',

  arena_sorting: 'Сортировочный цех',
  arena_foundry: 'Литейная',
  arena_arc: 'Дуговой зал',

  // --- robots ---
  robot_scrap14: 'СКРАП-14',
  robot_scrap14_desc: 'Гусеничный корпус. Прочнее и медленнее. Начинает с одним «Клёпальником».',
  robot_volt9: 'ВОЛЬТ-9',
  robot_volt9_desc: 'Шагающий корпус. Хрупче и быстрее. Начинает с «Клёпальником» и «Батареей» рядом.',
  unlockFor: 'Открыть за',
  unlocked: 'Открыт',

  // --- prep / shop ---
  preparation: 'Подготовка',
  nextWave: 'Волна',
  bossWave: 'БОСС',
  shop: 'Склад',
  reroll: 'Обновить',
  rerollFree: 'Обновить (бесплатно)',
  buy: 'Купить',
  sold: 'Куплено',
  sell: 'Продать',
  notEnoughScrap: 'Не хватает лома',
  panelFull: 'Панель заполнена — выберите ячейку для замены',
  chooseCell: 'Выберите ячейку',
  cancel: 'Отмена',
  startWave: 'Начать волну',
  equipment: 'Оборудование',
  effect: 'Что изменится',
  emptyCell: 'Пустая ячейка',
  tapToPlace: 'Коснитесь модуля, затем ячейки',
  swapHint: 'Ячейка занята. Коснитесь — предметы поменяются местами.',
  replaceHint: 'В ячейке «{name}». Купить сюда — старое вернётся за {refund} лома.',
  idleModule: 'Не соединён с оружием',
  weapons: 'Оружие',
  needWeapon: 'Нужно хотя бы одно оружие — иначе робот безоружен',
  modules: 'Модули',

  // --- gear ---
  gear_riveter: 'Клёпальник',
  gear_riveter_desc: 'Часто бьёт одиночными заклёпками по ближайшей машине.',
  gear_buzzsaw: 'Дисковая пила',
  gear_buzzsaw_desc: 'Диск вращается вокруг робота и режет всё, чего касается.',
  gear_arc: 'Дуговой разрядник',
  gear_arc_desc: 'Мгновенный разряд, перескакивает на соседние машины.',
  gear_mortar: 'Шрапнельная мортира',
  gear_mortar_desc: 'Навесной выстрел по самой плотной группе. Взрыв и осколки.',
  gear_beam: 'Резак-луч',
  gear_beam_desc: 'Непрерывный луч, медленно обходит робота по кругу. Сильно греется.',
  gear_hammer: 'Магнитный молот',
  gear_hammer_desc: 'Удар по кругу вплотную. Большой урон и сильный отброс.',

  gear_battery: 'Батарея',
  gear_battery_desc: 'Соседнее оружие бьёт на 25% чаще.',
  gear_heatsink: 'Радиатор',
  gear_heatsink_desc: 'Соседнее оружие греется на 45% меньше и остывает быстрее.',
  gear_coil: 'Катушка',
  gear_coil_desc: 'Попадания соседнего оружия перескакивают ещё на одну машину.',
  gear_targeter: 'Прицельный блок',
  gear_targeter_desc: 'Соседнее оружие бьёт на 20% сильнее и на 25% дальше.',
  gear_feeder: 'Податчик',
  gear_feeder_desc: 'Соседнее оружие выпускает на один снаряд больше, но на 12% слабее.',
  gear_piston: 'Ударный поршень',
  gear_piston_desc: 'Соседнее оружие сильнее отбрасывает и пробивает 4 единицы брони.',
  gear_repair: 'Ремонтный контур',
  gear_repair_desc: 'Корпус чинится сам и становится крепче. Соседнее оружие на 5% слабее.',
  gear_magnet: 'Магнитный захват',
  gear_magnet_desc: 'Лом притягивается издалека. Соседнее оружие приносит на 20% больше лома.',

  // --- stats ---
  stat_damage: 'Урон',
  stat_fireRate: 'Скорострельность',
  stat_range: 'Дальность',
  stat_projectiles: 'Снарядов',
  stat_heatGain: 'Нагрев',
  stat_cooling: 'Охлаждение',
  stat_chain: 'Переходов',
  stat_knockback: 'Отброс',
  stat_armorPierce: 'Пробитие брони',
  stat_scrapBonus: 'Лом',

  // --- combos ---
  combos: 'Сочетания',
  combo_rapid_rivets: 'Шквал заклёпок',
  combo_scattergun: 'Картечь',
  combo_chain_saw: 'Цепная пила',
  combo_siege_mortar: 'Осадная мортира',
  combo_open_beam: 'Открытый резак',
  combo_breaker: 'Бронелом',
  combo_storm_arc: 'Грозовая дуга',
  combo_salvage_saw: 'Сборочная пила',
  comboActive: 'Работает',
  comboHint: 'Поставьте рядом по стороне',

  // --- HUD ---
  waveLabel: 'Волна',
  timeLeft: 'До конца',
  overdrive: 'Разгон',
  overheated: 'ПЕРЕГРЕВ',
  pause: 'Пауза',
  resume: 'Продолжить',
  quitToMenu: 'Выйти в меню',
  quitConfirm: 'Выйти? Прогресс смены сохранится, волну придётся начать заново.',
  boss: 'БОСС',

  // --- results ---
  waveCleared: 'Волна пройдена',
  contractComplete: 'Контракт выполнен',
  contractFailed: 'Смена прервана',
  results: 'Итоги',
  scrapCollected: 'Собрано лома',
  clearBonus: 'Премия за волну',
  wavesSurvived: 'Пройдено волн',
  machinesScrapped: 'Уничтожено машин',
  creditsEarned: 'Начислено кредитов',
  reward_waves: 'За пройденные волны',
  reward_kills: 'За уничтоженные машины',
  reward_win: 'За выполненный контракт',
  reward_tier: 'Надбавка за сложность',
  reward_retreat: 'Половина за прерванную смену',
  doubleCredits: 'Удвоить кредиты за рекламу',
  doubleCreditsHint: 'Показать рекламный ролик и получить вдвое больше кредитов. Один раз за контракт.',
  doubled: 'Кредиты удвоены',
  adNotAvailable: 'Реклама сейчас недоступна',
  adNoReward: 'Ролик закрыт — награда не начислена',
  retry: 'Повторить',
  nextContract: 'Следующий контракт',
  toMenu: 'В меню',
  alreadyClaimed: 'Уже получено',

  // --- workshop ---
  workshopTitle: 'Мастерская',
  workshopHint: 'Постоянные улучшения. Сохраняются между сменами.',
  buyUpgrade: 'Улучшить',
  maxLevel: 'Максимум',
  level: 'Уровень',
  robots: 'Роботы',
  lifetimeRuns: 'Смен отработано',
  lifetimeKills: 'Машин уничтожено',

  up_hull: 'Усиленный корпус',
  up_hull_desc: '+9 к прочности за уровень',
  up_servos: 'Сервоприводы',
  up_servos_desc: '+4% к скорости за уровень',
  up_welder: 'Аварийный сварщик',
  up_welder_desc: '+0,18 починки в секунду за уровень',
  up_grapple: 'Магнитный захват',
  up_grapple_desc: '+13% к радиусу подбора за уровень',
  up_fence: 'Скупщик',
  up_fence_desc: '+8% к добыче лома за уровень',
  up_calibration: 'Калибровка',
  up_calibration_desc: '+4% к урону оружия за уровень',
  up_jumpstart: 'Пусковой заряд',
  up_jumpstart_desc: '+12 лома в начале смены за уровень',
  up_backup: 'Резервный блок',
  up_backup_desc: 'Один подъём за контракт с 40% прочности',

  // --- settings ---
  language: 'Язык',
  music: 'Музыка',
  soundEffects: 'Звуки',
  screenShake: 'Тряска экрана',
  showDamage: 'Показывать урон',
  stickSide: 'Джойстик',
  stickLeft: 'Слева',
  stickRight: 'Справа',
  on: 'Вкл',
  off: 'Выкл',
  resetProgress: 'Сбросить прогресс',
  resetConfirm: 'Удалить весь прогресс? Это нельзя отменить.',
  confirm: 'Подтвердить',
  version: 'Версия',

  // --- purchases ---
  purchases: 'Покупки',
  purchase_foreman_kit: 'Набор бригадира',
  purchase_foreman_kit_desc: 'Косметический набор: альтернативная окраска корпусов.',
  purchase_no_forced_ads: 'Без обязательной рекламы',
  purchase_no_forced_ads_desc: 'Убирает рекламу между контрактами. Добровольные ролики за награду остаются.',
  owned: 'Куплено',
  restorePurchases: 'Восстановить покупки',

  // --- save / cloud ---
  resumeFound: 'Найдена незавершённая смена',
  resumeExplain: 'Волна {wave} начнётся заново. Награды за уже пройденные волны сохранены и повторно не начисляются.',
  resumeStart: 'Продолжить',
  resumeDiscard: 'Начать заново',
  cloudConflict: 'Разные сохранения',
  cloudConflictExplain: 'На этом устройстве и в облаке разный прогресс. Выберите, какой оставить.',
  keepLocal: 'Оставить это устройство',
  keepCloud: 'Взять из облака',
  cloudLocal: 'Это устройство',
  cloudCloud: 'Облако',
  saveMigrated: 'Сохранение обновлено до новой версии.',

  // --- tutorial ---
  tut_move: 'Ведите пальцем по левой части экрана, чтобы идти. Оружие стреляет само.',
  tut_moveDesktop: 'WASD или стрелки — движение. Оружие стреляет само.',
  tut_collect: 'Подбирайте лом — на него покупают оборудование.',
  tut_survive: 'Продержитесь до конца волны. Оставшиеся машины отключатся сами.',
  tut_shop: 'Это склад. Купите модуль и поставьте его РЯДОМ с оружием — по стороне, не по диагонали.',
  tut_adjacency: 'Батарея рядом с «Клёпальником» ускоряет его. Подсветка показывает, что с чем работает.',
  tut_rearrange: 'Между волнами перестановка бесплатна. Коснитесь модуля, затем ячейки.',
  tut_heat: 'Оружие греется. Перегретое стреляет вдвое медленнее, пока не остынет.',
  tut_boss: 'Красное кольцо — предупреждение об ударе. Успейте выйти из него.',
  tutorialSkip: 'Пропустить обучение',
  next: 'Далее',
  gotIt: 'Понятно',

  // --- misc ---
  fps: 'Кадры',
  paused: 'Пауза',
  adLoading: 'Реклама…',
  seconds: 'с',
} as const;

export type StringKey = keyof typeof RU;

export const EN: Record<StringKey, string> = {
  gameTitle: 'SPARKSCRAPPER',
  gameSubtitle: 'night shift at the reclamation plant',
  loading: 'Loading…',
  tapToStart: 'Tap to start',

  play: 'Play',
  continueRun: 'Continue shift',
  workshop: 'Workshop',
  settings: 'Settings',
  contracts: 'Contracts',
  back: 'Back',
  close: 'Close',
  credits: 'Credits',
  scrap: 'Scrap',

  chooseContract: 'Choose a contract',
  chooseRobot: 'Choose a frame',
  locked: 'Locked',
  lockedHint: 'Finish the previous contract',
  waves: 'Waves',
  arena: 'Floor',
  difficulty: 'Difficulty',
  bestResult: 'Best result',
  startContract: 'Accept contract',
  contractRules: 'Special terms',
  noRules: 'No special terms',

  contract_night_shift: 'Night Shift',
  contract_night_shift_desc: 'Sorting floor. A calm opening and your first boss — the Press Mother.',
  contract_foundry_rush: 'Foundry Rush',
  contract_foundry_rush_desc: 'The foundry. Machines move faster, but the scrap is worth more.',
  contract_arc_quarantine: 'Arc Quarantine',
  contract_arc_quarantine_desc: 'The arc hall. Hardened machines and two bosses in one shift.',

  mod_overdrive_line: 'Machines are 20% faster, scrap is worth 30% more',
  mod_hardened: 'Machines have 12% more hull. You start with 30 scrap and a Heatsink',

  arena_sorting: 'Sorting floor',
  arena_foundry: 'Foundry',
  arena_arc: 'Arc hall',

  robot_scrap14: 'SCRAP-14',
  robot_scrap14_desc: 'Tracked chassis. Tougher and slower. Starts with a single Riveter.',
  robot_volt9: 'VOLT-9',
  robot_volt9_desc: 'Legged chassis. Frailer and faster. Starts with a Riveter and a Battery beside it.',
  unlockFor: 'Unlock for',
  unlocked: 'Unlocked',

  preparation: 'Preparation',
  nextWave: 'Wave',
  bossWave: 'BOSS',
  shop: 'Stores',
  reroll: 'Refresh',
  rerollFree: 'Refresh (free)',
  buy: 'Buy',
  sold: 'Bought',
  sell: 'Sell',
  notEnoughScrap: 'Not enough scrap',
  panelFull: 'Panel is full — pick a cell to replace',
  chooseCell: 'Pick a cell',
  cancel: 'Cancel',
  startWave: 'Start wave',
  equipment: 'Equipment',
  effect: 'What changes',
  emptyCell: 'Empty cell',
  tapToPlace: 'Tap a part, then a cell',
  swapHint: 'Cell is taken. Tap it and the two parts swap places.',
  replaceHint: 'This cell holds {name}. Buying here sells it back for {refund} scrap.',
  idleModule: 'Not touching a weapon',
  weapons: 'Weapons',
  needWeapon: 'You need at least one weapon — the robot cannot fight without one',
  modules: 'Modules',

  gear_riveter: 'Riveter',
  gear_riveter_desc: 'Fires quick single rivets at the nearest machine.',
  gear_buzzsaw: 'Buzzsaw',
  gear_buzzsaw_desc: 'A blade orbits your frame and cuts whatever it touches.',
  gear_arc: 'Arc Emitter',
  gear_arc_desc: 'An instant discharge that jumps to nearby machines.',
  gear_mortar: 'Shrapnel Mortar',
  gear_mortar_desc: 'Lobs a shell at the densest group. Blast plus shrapnel.',
  gear_beam: 'Cutter Beam',
  gear_beam_desc: 'A steady beam that sweeps around you. Runs very hot.',
  gear_hammer: 'Mag Hammer',
  gear_hammer_desc: 'Slams everything at close range. Heavy damage and knockback.',

  gear_battery: 'Battery',
  gear_battery_desc: 'Adjacent weapons fire 25% faster.',
  gear_heatsink: 'Heatsink',
  gear_heatsink_desc: 'Adjacent weapons build 45% less heat and cool faster.',
  gear_coil: 'Coil',
  gear_coil_desc: 'Hits from adjacent weapons jump to one more machine.',
  gear_targeter: 'Targeter',
  gear_targeter_desc: 'Adjacent weapons hit 20% harder and 25% further.',
  gear_feeder: 'Feeder',
  gear_feeder_desc: 'Adjacent weapons fire one more projectile, at 12% less damage.',
  gear_piston: 'Impact Piston',
  gear_piston_desc: 'Adjacent weapons knock back harder and pierce 4 armour.',
  gear_repair: 'Repair Loop',
  gear_repair_desc: 'Your frame self-repairs and gains hull. Adjacent weapons are 5% weaker.',
  gear_magnet: 'Mag Grapple',
  gear_magnet_desc: 'Scrap is pulled from further away. Adjacent weapons yield 20% more scrap.',

  stat_damage: 'Damage',
  stat_fireRate: 'Fire rate',
  stat_range: 'Range',
  stat_projectiles: 'Projectiles',
  stat_heatGain: 'Heat',
  stat_cooling: 'Cooling',
  stat_chain: 'Jumps',
  stat_knockback: 'Knockback',
  stat_armorPierce: 'Armour pierce',
  stat_scrapBonus: 'Scrap',

  combos: 'Combinations',
  combo_rapid_rivets: 'Rivet Storm',
  combo_scattergun: 'Scattergun',
  combo_chain_saw: 'Chain Saw',
  combo_siege_mortar: 'Siege Mortar',
  combo_open_beam: 'Open Beam',
  combo_breaker: 'Armour Breaker',
  combo_storm_arc: 'Storm Arc',
  combo_salvage_saw: 'Salvage Saw',
  comboActive: 'Active',
  comboHint: 'Place them side by side',

  waveLabel: 'Wave',
  timeLeft: 'Time',
  overdrive: 'Overdrive',
  overheated: 'OVERHEATED',
  pause: 'Pause',
  resume: 'Resume',
  quitToMenu: 'Quit to menu',
  quitConfirm: 'Quit? Shift progress is kept, but this wave restarts.',
  boss: 'BOSS',

  waveCleared: 'Wave cleared',
  contractComplete: 'Contract complete',
  contractFailed: 'Shift cut short',
  results: 'Results',
  scrapCollected: 'Scrap collected',
  clearBonus: 'Wave bonus',
  wavesSurvived: 'Waves survived',
  machinesScrapped: 'Machines scrapped',
  creditsEarned: 'Credits earned',
  reward_waves: 'For waves survived',
  reward_kills: 'For machines scrapped',
  reward_win: 'For completing the contract',
  reward_tier: 'Difficulty bonus',
  reward_retreat: 'Half rate for a cut-short shift',
  doubleCredits: 'Double credits — watch an ad',
  doubleCreditsHint: 'Watch a video ad and receive twice the credits. Once per contract.',
  doubled: 'Credits doubled',
  adNotAvailable: 'No ad available right now',
  adNoReward: 'Ad closed — no reward given',
  retry: 'Try again',
  nextContract: 'Next contract',
  toMenu: 'Menu',
  alreadyClaimed: 'Already claimed',

  workshopTitle: 'Workshop',
  workshopHint: 'Permanent upgrades. They persist between shifts.',
  buyUpgrade: 'Upgrade',
  maxLevel: 'Maxed',
  level: 'Level',
  robots: 'Frames',
  lifetimeRuns: 'Shifts worked',
  lifetimeKills: 'Machines scrapped',

  up_hull: 'Reinforced Hull',
  up_hull_desc: '+9 hull per level',
  up_servos: 'Servos',
  up_servos_desc: '+4% move speed per level',
  up_welder: 'Field Welder',
  up_welder_desc: '+0.18 repair per second per level',
  up_grapple: 'Grapple Coil',
  up_grapple_desc: '+13% pickup radius per level',
  up_fence: 'Fence',
  up_fence_desc: '+8% scrap gained per level',
  up_calibration: 'Calibration',
  up_calibration_desc: '+4% weapon damage per level',
  up_jumpstart: 'Jumpstart',
  up_jumpstart_desc: '+12 scrap at the start of a shift per level',
  up_backup: 'Backup Cell',
  up_backup_desc: 'One recovery per contract at 40% hull',

  language: 'Language',
  music: 'Music',
  soundEffects: 'Sound',
  screenShake: 'Screen shake',
  showDamage: 'Show damage numbers',
  stickSide: 'Stick side',
  stickLeft: 'Left',
  stickRight: 'Right',
  on: 'On',
  off: 'Off',
  resetProgress: 'Reset progress',
  resetConfirm: 'Delete all progress? This cannot be undone.',
  confirm: 'Confirm',
  version: 'Version',

  purchases: 'Purchases',
  purchase_foreman_kit: 'Foreman Kit',
  purchase_foreman_kit_desc: 'Cosmetic set: alternative chassis paintwork.',
  purchase_no_forced_ads: 'No forced ads',
  purchase_no_forced_ads_desc: 'Removes ads between contracts. Optional reward videos stay.',
  owned: 'Owned',
  restorePurchases: 'Restore purchases',

  resumeFound: 'Unfinished shift found',
  resumeExplain: 'Wave {wave} will start over. Rewards for waves you already cleared are kept and are not paid twice.',
  resumeStart: 'Continue',
  resumeDiscard: 'Start over',
  cloudConflict: 'Two different saves',
  cloudConflictExplain: 'This device and the cloud hold different progress. Choose which to keep.',
  keepLocal: 'Keep this device',
  keepCloud: 'Take from cloud',
  cloudLocal: 'This device',
  cloudCloud: 'Cloud',
  saveMigrated: 'Save updated to a new version.',

  tut_move: 'Drag on the left of the screen to move. Your weapons fire on their own.',
  tut_moveDesktop: 'WASD or arrow keys to move. Your weapons fire on their own.',
  tut_collect: 'Pick up scrap — it buys equipment.',
  tut_survive: 'Stay alive until the wave ends. Any machines left shut down on their own.',
  tut_shop: 'This is stores. Buy a module and place it NEXT to a weapon — side by side, not diagonally.',
  tut_adjacency: 'A Battery beside the Riveter speeds it up. The highlight shows what is working with what.',
  tut_rearrange: 'Rearranging between waves is free. Tap a part, then a cell.',
  tut_heat: 'Weapons build heat. An overheated weapon fires at half speed until it cools.',
  tut_boss: 'A red ring is a warning. Step out of it before it lands.',
  tutorialSkip: 'Skip tutorial',
  next: 'Next',
  gotIt: 'Got it',

  fps: 'FPS',
  paused: 'Paused',
  adLoading: 'Ad…',
  seconds: 's',
};

export type Lang = 'ru' | 'en';

const TABLES: Record<Lang, Record<StringKey, string>> = { ru: RU, en: EN };

let current: Lang = 'ru';
const listeners = new Set<(lang: Lang) => void>();

export const getLang = (): Lang => current;

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate. `vars` fills {placeholders}. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = TABLES[current][key] ?? TABLES.ru[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Build a dynamic key like `gear_riveter` without losing type safety. */
export const tk = (prefix: string, id: string, vars?: Record<string, string | number>): string =>
  t(`${prefix}_${id}` as StringKey, vars);

/** Pick the starting language from the host, then the browser, then Russian. */
export function detectLang(hostLang?: string): Lang {
  const raw = (hostLang ?? globalThis.navigator?.language ?? 'ru').toLowerCase();
  return raw.startsWith('en') ? 'en' : 'ru';
}
