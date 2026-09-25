# Store card — English

This is the **second** console page, "Описание и продвижение". The first is
"Черновик" — its values are in `store/card-draft.md`; fill that one first.

Fields are in the order the Yandex Games console shows them under
"Описание и продвижение". The contents of each code block are exactly
what goes into the field, no quotes. Limits are taken from the form itself.

---

## Название / Title

`13 / 50` · required

```
Sparkscrapper
```

## Описание для SEO / SEO description

`125 / 160`

```
Pixel arena survivor: collect scrap and build your loadout on a 2×3 panel. A module only boosts the cells directly beside it.
```

## Об игре / About the game

`994 / 1000` · required

```
An abandoned reclamation plant. At night the old machines wake up and come for you — a small salvage robot that just wants to finish its shift.

Your weapons fire on their own. Your job is to keep moving, collect scrap, and decide what goes on the panel.

The 2×3 panel is the game. Six cells; a weapon or a module takes one each. A module only affects the cells directly beside it — diagonals do not count. A Battery next to the Riveter speeds it up. A Coil next to the Buzzsaw makes its hits jump to another machine.

There is never enough room. Every purchase is the same question: one more weapon, or make the weapon you have better? Rearranging between waves is free, and the game shows you how the numbers change before you commit.

3 contracts, 6 weapons, 8 modules, 6 machine types, 2 bosses with phases, 2 robot frames, 8 workshop upgrades. A tutorial inside the first contract.

A contract runs seven to ten minutes. Lose and you can start again at once — a failed attempt still pays.
```

## Короткое описание / Short description

`49 / 70`

```
Pixel survivor: build your loadout on a 2×3 panel
```

## Как играть / How to play

`852 / 1000` · required

```
Phone: drag anywhere on the left half of the screen and the robot follows your thumb. The stick appears wherever you touch it. You never need a second finger — the weapons aim and fire themselves. The stick side can be swapped in settings.

Desktop: WASD or arrow keys. Keys are read by physical position, so any keyboard layout works. Esc or P to pause.

1. Take a contract and pick a robot frame.
2. Survive until the wave ends. Any machines left shut down on their own.
3. Collect scrap and buy a weapon or a module from stores.
4. Place the module next to a weapon — side by side, not diagonally. A green link between two cells means the combination is live.
5. Watch the heat: an overheated weapon fires at half speed until it cools.
6. A red ring on the floor is a warning. Step out of it before it lands.
7. Reach the boss and survive the shift.
```
---

## Icon and cover

The form asks for a **PNG 512×512** icon. The ready file is
`store/icon-512x512.png`, exactly that size.

Covers come one per language, since the artwork carries the name:
`store/cover-800x470-ru.png` and `store/cover-800x470-en.png`, plus the same
artwork wider at `store/cover-1280x720-ru.png` and `-en.png`. Which size the
form wants is visible on the spot; both are ready.

Screenshots are in `store/screenshots/ru/` and `store/screenshots/en/` — six
screens at three sizes: 390×844 and 360×800 portrait, 1366×768 landscape.

Video is in `store/video/`: four clips of 26 seconds, portrait and landscape,
each in Russian and English. The platform caps them at 28. WebM; the MP4
conversion command is in `store/MEDIA.md`.

## Categories and tags

These live in a different section of the console, not under the description.

Primary category:

```
Arcade
```

Secondary:

```
Action
Survival
Pixel
```

Tags:

```
pixel art, survivor, arcade, robots, waves, build crafting, singleplayer, portrait, one-handed
```

Age rating:

```
6+
```

Justification, if the form asks for one:

```
Cartoon destruction of machinery. No people, no blood, no gore; the enemies are machines that come apart into parts.
```

Languages:

```
Russian, English
```

Controls:

```
Keyboard, mouse, touchscreen
```

Orientation:

```
Portrait (landscape also works)
```

---

# Notes for the owner — not for any form field

## The "AI descriptions" toggle

It is switched on in the screenshot of the form. These texts are written by
hand; leaving the toggle on may let the platform generate its own. Your call —
but if you want these texts, turning it off is the consistent choice.

## The name

**Sparkscrapper** is the recommendation: a coined compound, short, no other
brand in it, and it matches what the menu screen and the page title show. The
Russian card uses «Искролом», the same idea in Russian.

Fallbacks if it is taken: "Sparkscrapper: Night Shift", "Scrapper's Night
Shift".

**Not verified:** whether the name is free in the Yandex Games catalogue. The
catalogue is not reachable from the build environment, so check it by hand when
creating the draft. A general web search turned up no clashes, but that is not
the same as checking the catalogue.

## What else to check on the spot

- SDK initialisation in the draft. `/sdk.js` only exists on the platform and has
  never been requested from here. It is the first thing worth seeing work.
- Required cover and screenshot dimensions — the form shows them next to each
  field. The actual dimensions of the finished files are in `store/MEDIA.md`.
- The form's category list may differ from the names above; pick the closest.

## Worth mentioning if the form has fields for it

- No sign-in required.
- Gameplay keeps working with no network once the page has loaded: contracts,
  combat, stores, workshop and settings all open and play with the connection
  off. Reloading the page does, of course, need the network.
- Progress is saved locally; cloud saving needs the platform to be reachable.
- Ads are optional only (doubling your reward) plus one at a natural pause after
  results. No level requires watching an ad.
- Purchases are off in the first release: no catalogue is configured, so the
  section is hidden.

## What needs the platform

Ads, cloud saves and purchases only work with a reachable network and a
reachable Yandex SDK. Without them the game still starts and plays in full:
progress is written locally, ad buttons are hidden or report themselves as
unavailable, and the purchase section does not appear.
