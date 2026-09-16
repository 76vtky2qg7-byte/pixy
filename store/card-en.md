# Store card — English

Every field below is ready to use: the contents of each code block are exactly
what goes into the draft form, with no quotes and no commentary. Notes for the
owner are collected at the end and are not part of any field.

---

## Title

```
Sparkscrapper
```

## Short description

```
Pixel arena survivor: collect scrap and build your loadout on a 2×3 panel.
```

73 characters.

## About the game

```
An abandoned reclamation plant. At night the old machines wake up and come for you — a small salvage robot that just wants to finish its shift.

Your weapons fire on their own. Your job is to keep moving, collect scrap, and decide what goes on the equipment panel.

The 2×3 panel is the game. Six cells. A weapon or a support module takes one each. A module only affects the cells directly beside it — diagonals do not count. A Battery next to the Riveter speeds it up. A Coil next to the Buzzsaw makes its hits jump to another machine. A Heatsink next to the Cutter Beam keeps it from overheating.

There is never enough room. Every purchase is the same question: one more weapon, or make the weapon you have better? Rearranging between waves is free, and the interface shows you exactly what is working with what and how the numbers change before you commit.

What's in it:
• 3 contracts across different factory floors, each with its own rules and wave mix
• 6 weapons that genuinely behave differently: single rivets, an orbiting blade, a chaining discharge, a lobbed mortar, a sweeping beam, a close-range slam
• 8 support modules and at least 8 readable combinations
• 6 machine types: chasers, fast and fragile, armoured, telegraphed shooters, delayed exploders, and menders that repair the others
• 2 bosses with phases and clearly telegraphed attacks
• 2 robot frames with different starting conditions
• 8 permanent workshop upgrades
• A tutorial built into the first contract

A contract runs about 7–10 minutes. Lose and you can retry immediately — and a failed attempt still pays credits.
```

## How to play

```
Phone: drag anywhere on the left half of the screen and the robot follows your thumb. The stick appears wherever you touch it. You never need a second finger — the weapons aim and fire themselves. The stick side can be swapped in settings.

Desktop: WASD or arrow keys. Keys are read by physical position, so it works on any keyboard layout. Esc or P to pause.

1. Take a contract and pick a robot frame.
2. Survive until the wave ends. Any machines left shut down on their own.
3. Collect scrap and buy a weapon or a module from stores.
4. Place the module next to a weapon — side by side, not diagonally. A green link between two cells means the combination is live.
5. Watch the heat: an overheated weapon fires at half speed until it cools.
6. A red ring on the floor is a warning. Step out of it before it lands.
7. Reach the boss and survive the shift.
```

## Categories

Primary:

```
Arcade
```

Secondary:

```
Action
Survival
Pixel
```

## Tags

```
pixel art, survivor, arcade, robots, waves, build crafting, singleplayer, portrait, one-handed
```

## Age rating

```
6+
```

Justification, if the form asks for one:

```
Cartoon destruction of machinery. No people, no blood, no gore; the enemies are machines that come apart into parts.
```

## Languages

```
Russian, English
```

## Controls

```
Keyboard, mouse, touchscreen
```

## Orientation

```
Portrait (landscape also works)
```

---

# Notes for the owner — not for any form field

## The name

**Sparkscrapper** is the recommendation: a coined compound, short, no other
brand in it, and it matches what the menu screen and the page `<title>` show.
The Russian card uses «Искролом», the same idea in Russian.

Fallbacks if it is taken: "Sparkscrapper: Night Shift", "Scrapper's Night
Shift".

**Not verified:** whether the name is free in the Yandex Games catalogue. The
catalogue is not reachable from the build environment, so check it by hand when
creating the draft. A general web search turned up no clashes, but that is not
the same as checking the catalogue.

## What else could not be checked

- The form's field limits (title and description lengths) — confirm on the spot.
  The values above are short and sit well inside typical limits.
- The required cover and screenshot dimensions. The actual dimensions of the
  finished files are listed in `store/MEDIA.md`.
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
