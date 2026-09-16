# Test report

> **On sources.** `yandex.ru` and `yandex.com` are blocked by this environment's
> network policy, so the official requirements and SDK pages could **not** be
> read here — not at any point, including for this revision. Every statement
> below about platform rules is either (a) taken from the published
> `@types/ysdk` type definitions, which are installable from npm and are in the
> lockfile, or (b) **relayed by external review** of those pages. Relayed facts
> are marked as such and were not independently verified.

Three layers of checking, in order of how much they prove:

1. **129 unit tests** (`npm test`) — adjacency, economy, saves, pause manager,
   and the ad lifecycle.
2. **66 end-to-end checks** (`node tools/e2e/run.mjs`) — the **production
   build**, driven in Chromium, with a fake Yandex SDK injected before boot so
   the **real** shipped adapter is what runs.
3. **Three pre-flight audits** (`npm run audit:static`, `audit:browser`,
   `audit:iframe`) — text and licence sanity, then layout at ten viewport
   sizes in both languages, glyph coverage, dead buttons, console errors and
   network egress against the production build, and finally the game embedded
   in a genuinely cross-origin iframe, including with storage blocked.
4. **Manual inspection of rendered frames** — screenshots read and judged, which
   is how the rendering bugs listed below were found. None of them failed a
   test; they were all visible and only visible.

Everything below was actually executed. Anything requiring the real platform is
in the last section, unrun.

---

## 1. Unit tests — 129 passed

```
src/tests/grid.test.ts      24 passed
src/tests/economy.test.ts   29 passed
src/tests/pause.test.ts     21 passed
src/tests/save.test.ts      30 passed
src/tests/ads.test.ts       25 passed
```

**Adjacency (24)** — orthogonal neighbours only; all four diagonal pairs on a
2×3 grid assert as non-adjacent; symmetry; a module never affects another
module; `resolveGrid` is pure and does not compound when called repeatedly;
stacking respects caps; idle modules are detected; a swap loses nothing;
previewing does not mutate the panel.

**Economy (29)** — shop determinism for a given seed/wave/reroll; no duplicate
offers; reroll pricing; price growth; buying charges exactly once; buying the
same offer twice is refused; a failed purchase leaves the run untouched; a full
panel asks for a target cell and spends nothing; the displaced part is refunded;
**a wave's clear bonus is never paid twice**, while scrap re-collected during a
replay still counts; credit breakdown lines sum to the total; a finished attempt
never pays nothing.

**Pause manager (21)** — reasons are independent flags; closing an ad does not
resume a hidden tab or a closed menu; idempotent set; announcements fire only on
an actual transition; every ordering of set/clear; the clock clamps a 60-second
delta instead of fast-forwarding the fight; `Subscriptions.disposeAll` releases
everything including DOM listeners.

**Ad lifecycle (25)** — these drive the **real adapter** against a **scripted
SDK** whose callbacks the test fires by hand. They prove the adapter's own state
machine. They are **not** a test of live advertising: fill rate, real close
behaviour and ad-blocker interaction can only be checked in a Yandex draft.

The property they exist to protect: **the pause tracks whether an ad is on
screen, never how long the call took.**

| Scenario | Asserted |
|---|---|
| Ad open longer than any watchdog (120s) | still paused, still `adVisible` |
| No `onOpen` inside the open window | promise settles, **nothing is paused** |
| `onOpen` arrives *after* that timeout | pauses anyway, and later resumes |
| `onClose` lost, host emits `game_api_resume` | pause recovers from a real signal |
| `onClose` and resume both lost | released after a long backstop, counted as abandoned |
| Second request while an ad is on screen | refused; only one `showRewardedVideo` call |
| Second request inside the first open window | refused |
| Retry after a timeout | allowed — a silent host must not disable the button |
| Three silent requests, then a real one | the fourth works normally |
| Stale request's `onRewarded` during a new one | the new request still resolves `closed` |
| Stale `onClose` while a fresh ad is up | pause held |
| Stale request opens late alongside a fresh ad | pause held until **both** close |
| `onRewarded` x3, `onClose` x2, late `onError` | resolves once, `rewarded` |
| Duplicated `onOpen` | pauses once, closes once |
| `onClose` with no reward | no grant |
| Host throws synchronously | error, nothing paused, no stuck button |
| Ad closes while the tab is hidden | `hidden` pause survives |
| Ad closes while a menu is open | `menu` pause survives |
| Interstitial `onOffline` | reported as `not_shown`, not an error |
| Interstitial while a rewarded video is up | refused |
| SDK endpoint | `/sdk.js`, not `./sdk.js`, not the legacy URL |

**Saves (30)** — junk input of every shape yields a clean default; unknown gear,
contracts, robots and upgrade ids are dropped; levels clamp to their caps;
volumes clamp to range; a run pointing at a missing contract is dropped; unknown
gear is stripped from a restored panel without dropping the run; rewarded-wave
lists are deduplicated and bounded; a save from a **newer** version keeps
credits but drops its unreadable run; migration never throws; **a failed cloud
write leaves local progress untouched**; conflicts resolve by revision and
**never sum two balances**; a burst of six writes coalesces into one upload.

---

## 2. End-to-end checks — 66 passed, 0 failed

Run against `dist/` served by `vite preview`, in Chromium 1194, at
390×844 dsf 3 (touch), 360×800, 1366×768 and 844×390.

### New player
| Check | Result |
|---|---|
| Boots to the menu with no stuck loading screen | pass |
| `LoadingAPI.ready()` called exactly once | pass |
| Contract list shows all three, later ones locked | pass |
| Prep screen reached | pass |
| Tutorial explains the panel on the first shop visit | pass |
| A pausing hint actually blocks the screen beneath it | pass |
| Wave starts and the simulation runs | pass |
| `GameplayAPI.start()` called | pass |
| Robot survives the opening seconds | pass |

### Equipment panel
| Check | Result |
|---|---|
| Buying installs exactly one part and charges once | pass |
| Three rapid taps on one offer buy it once | pass |
| Tap-tap swaps two cells, losing nothing | pass |
| Cancelling a selection changes nothing | pass |
| An orthogonal pair shows one link and two lit cells | pass |
| A **diagonal** pair shows no link at all | pass |
| A module touching no weapon is flagged | pass |

### Loop stability
| Check | Result |
|---|---|
| **20 consecutive** wave → shop → results transitions leave every button usable | pass |
| No screen nodes leak across those transitions (1 screen in the DOM at the end) | pass |

### Rewarded video — every outcome
Driven through the real adapter with a scripted SDK.

| Outcome | Credits doubled? | Lingering `ad` pause? |
|---|---|---|
| Reward granted | yes | no |
| Closed without reward | no | no |
| SDK reports an error | no | no |
| SDK never calls back at all | no | no — gives up in 6s |
| No ad to show | no | no |
| **Duplicate reward callback** | **yes, exactly once** | no |

The duplicate case also asserts the total is exactly ×2 and that the offer is
closed and disabled afterwards.

### Pause correctness
| Check | Result |
|---|---|
| A hidden tab pauses the wave | pass |
| **Closing an ad while the tab is hidden does not resume combat** | pass |
| Restoring the tab resumes | pass |
| A host `game_api_pause` event pauses independently | pass |
| `game_api_resume` clears only its own reason | pass |

### Saves and resuming
| Check | Result |
|---|---|
| A cleared wave is banked to local storage | pass |
| After a reload the menu offers to continue the shift | pass |
| The resume dialog explains that the wave restarts and rewards are not re-paid | pass |
| Resumed at the right wave with the right scrap | pass |
| **No wave is rewarded twice after a reload** | pass |
| Progress reaches cloud storage via `player.setData` | pass |

### Win, lose, retry, progression
| Check | Result |
|---|---|
| Clearing the final wave wins the contract | pass |
| Results explain the credit breakdown line by line | pass |
| Winning unlocks the next contract | pass |
| The next contract shows as unlocked | pass |
| Losing shows the failure screen | pass |
| Retry goes straight back into the same contract | pass |

### Presentation and input
| Check | Result |
|---|---|
| Language switches to English and back, live | pass |
| Resizing across 360×800 / 390×844 / 1366×768 / 844×390 mid-wave keeps the game running | pass |
| The virtual stick responds to touch | pass |
| **`pointercancel` releases the stick** (residual input 0) | pass |

### Full contract
| Check | Result |
|---|---|
| All six waves of contract 1 played through, with real movement each wave | pass |
| Ends on the results screen | pass |
| **No console errors or unhandled rejections for the whole contract** | pass |

### Offline play
The store card claims the game keeps working with no network, so that claim is
tested. The connection is dropped right after boot, with only the menu visited.

| Check | Result |
|---|---|
| Every screen still opens offline (contracts, prep, wave, results, workshop, settings) | pass |
| No request fails while playing offline | pass |
| Progress is still written locally | pass |
| No console errors offline | pass |

**This claim was false when first written and is now true.** The original build
failed on the very first tap: screens are code-split, so opening the contract
list fetched a chunk that could not be loaded, producing an unhandled rejection
and a dead screen. Two changes fixed it — every screen chunk is now warmed
immediately after boot (~30 KB), and the small sprite sheets are inlined so the
CSS-referenced icon sheet is never a separate request. A screen that still fails
to load now shows a retry instead of nothing.

Scope of the claim: **once the page has loaded.** Reloading the page needs the
network, as does anything platform-side — ads, cloud saves, purchases.

The only network failure observed anywhere is `ERR_TUNNEL_CONNECTION_FAILED` for
`https://yandex.ru/games/sdk/v2`, because this environment blocks `yandex.ru`.
That is the intended degradation path and the game runs fully without the SDK —
which is itself a useful result: **a player whose network blocks the SDK still
gets a working game.**

---

## 3. Pre-flight audits

Three scripts, run against the production build. They exist to catch the things
a moderator sees first and no functional test looks at: text that does not fit,
characters in the wrong font, controls that do nothing, and anything that
leaves the origin.

### `npm run audit:static` — no findings

Reads the source and the built bundle, not a browser.

| Check | Result |
|---|---|
| RU and EN string tables in sync | pass — 222 keys, none missing on either side |
| No Russian left untranslated in the English table | pass |
| Every `t()` / `tk()` key exists | pass |
| Every character the UI shows is inside a declared `unicode-range` | pass — ranges are read from `style.css`, not copied |
| Store card title is a single line, no slash or emoji | pass |
| Store card short description within 100 characters | pass — 70 RU, 73 EN |
| Offline claim scoped to "after the page has loaded" | pass |
| No URL in the bundle that is fetched from another origin | pass — the only URL-shaped strings are a Phaser banner and XML namespaces |
| Font licence present in the build | pass |
| Every promised deliverable exists on disk | pass |

### `npm run audit:browser` — no findings

Ten viewport sizes from 320×568 to 1920×1080, including phone landscape and
tablet portrait, in both languages, across six screens.

| Check | Result |
|---|---|
| Text that overflows its box, is clipped, or runs off screen | pass — 120 screen/size/language combinations |
| Every character renders in the bundled pixel font | pass — compared by rendering to canvas and diffing pixels, not by advance width |
| Buttons that do nothing when pressed | pass — 25 buttons exercised; radio options already selected are excluded, since those are meant to be inert |
| Console errors and uncaught exceptions | pass |
| Requests that leave the origin | pass — none |
| The game still reaches a screen with no SDK, and reports its platform as `none` | pass |

This is the run that found the missing `О` and `П`.

### `npm run audit:iframe` — no findings

Yandex serves a game in a cross-origin iframe, where storage can be
partitioned, keyboard events need frame focus, and the canvas is sized by the
host. The audit runs a small server that embeds the game from a genuinely
different origin (`localhost` framing `127.0.0.1`).

| Check | Result |
|---|---|
| Boots inside a cross-origin iframe | pass |
| Progress is recorded when embedded | pass |
| Keyboard reaches the game after a click into the frame | pass |
| Virtual stick responds to touch, and `pointercancel` releases it | pass — residual input 0 |
| The simulation actually runs | pass |
| The canvas gets a real size | pass — 420×760 |
| Boots and plays with `localStorage` and `sessionStorage` throwing | pass — progress is kept in memory; only persistence across a reload is lost |

The blocked-storage case models a browser set to refuse third-party storage.
It was verified that the block really takes effect, so the pass is not a
vacuous one.

---

## 4. Packaging

| Check | Result |
|---|---|
| `index.html` at the archive root | pass |
| Every path relative — no absolute or remote URLs in HTML, CSS or JS | pass |
| No sources, source maps, `.env`, keys or `node_modules` | pass |
| File names plain ASCII | pass |
| No library fetched from a CDN at runtime | pass |
| No spaces or non-ASCII in any file or folder name | pass |
| SDK referenced at the platform root `/sdk.js`, not bundled, no legacy URL | pass |
| Size within limits | pass — **1.36 MB unpacked, 428 KB zipped** |
| Every `dist/` file present in the archive | pass |
| **Game unpacked from the ZIP and played from a nested path** (`/games/12345/`) | pass — menu, contract, wave, wave cleared, Cyrillic font loaded |
| **The SDK request resolves to the site ROOT, not the game's subdirectory** | pass — served from `/games/12345/`, the browser requested `http://host/sdk.js` |
| Game stays fully playable when that request 404s | pass — falls back to the null platform, wave runs, HP 110 |

Serving from a nested path is what actually proves two separate things at once,
and serving from a domain root would have hidden both:

1. `base: './'` works — every game asset resolves under `/games/12345/`.
2. `/sdk.js` is genuinely absolute — the browser asked for `http://host/sdk.js`,
   at the root, exactly where the platform serves it. Had it been `./sdk.js` the
   request would have gone to `/games/12345/sdk.js`, which does not exist on
   Yandex either. This is the closest available proof that the corrected
   endpoint is right; the endpoint itself still cannot be reached from here.

The local server has no `/sdk.js`, so the request 404s and the game falls back
to the null platform and remains fully playable. That is the intended
degradation, and it doubles as the "a player whose network blocks the SDK still
gets a working game" case.

### Reproducible from a clean clone

The pushed branch was cloned fresh into an empty directory and taken through
`npm ci`, `npm run build`, `npm test` and `node tools/pack.mjs`. All 104 unit
tests pass and the packer produces a byte-identical 426 KB archive, so nothing
in the result depends on state left behind in the development directory.

---

### Archive requirements

Relayed by external review from the Yandex Games requirements page (**not read
from this environment** — see the note at the top):

| Requirement | Status |
|---|---|
| No more than 100 MB unpacked | 1.36 MB — checked by the packer |
| `index.html` at the root of the ZIP | checked by the packer |
| No spaces or Cyrillic in file and folder names | checked by the packer (plain ASCII only) |
| Progress is saved | implemented and tested |
| A finished game, not a demo | release content is complete |
| Monetised by ads or purchases | rewarded video + interstitial; purchases optional |
| Field and media limits live in the draft form | **not verified** — see `store/MEDIA.md` |

The packer enforces both the 100 MB platform limit and our own 20 MB target,
and fails rather than writing an archive that breaks either.

## 5. Screens inspected visually

Screenshots captured and read at **360×800, 390×844 and 1366×768** (menu,
contracts, prep, combat, results). Rendered frames were examined, not just
asserted on.

Confirmed by eye: no clipped text or buttons at any size; the scene is not
shrunk to illegibility on the small phone; the two-column layout on wide screens
puts the panel beside the shop instead of below it; the background stays lower
contrast than anything the player must react to; enemies, hero, scrap, sparks
and hostile projectiles differ in **shape as well as colour**.

---

## Bugs found and fixed

Ordered by how they were caught.

### Found by looking at rendered frames — invisible to every test

1. **The arena floor rendered as green diagonal garbage.** The floor is a
   `TileSprite`, which must sample its source repeatedly; it was given a
   `RenderTexture`, which lives in a framebuffer and cannot be sampled that way.
   It did not error — it rendered noise. Rebuilt as canvas textures, one per
   arena. *Every automated check passed while the game looked like this.*
2. **Every heat gauge was a solid orange block.** A `.heat-chip i` rule also
   matched the icon element, and its `background` shorthand erased the sprite's
   `background-image`. Scoped to `.heat-chip .fill`.
3. **The floor patch tiled visibly**, reading as wallpaper. Enlarged from 4×4 to
   8×8 tiles and weighted toward plain concrete.
4. **The health bar spanned the full width of a desktop screen**, becoming a
   line with no readable shape. Capped at 420px.

### Found by the pre-flight audits

5. **The bundled pixel font had no `О` and no `П`.** Not a subsetting mistake
   on our side — the released Pixelify Sans genuinely ships no glyph for
   U+041E or U+041F, which was confirmed against the upstream file. Those are
   two of the commonest capitals in Russian, so words like **ОПАСНО**,
   **ПОБЕДА**, **ОТМЕНА** and **ПАУЗА** were rendering with a system serif
   substituted mid-word. The CSS `unicode-range` declared the range, so nothing
   that reads the stylesheet could have caught it; only rendering the
   characters and comparing pixels did.

   Fixed in `tools/genfont.py` by deriving the missing glyphs from ones already
   in the font, so they keep its proportions and its weight-axis variation:
   `О` is the Latin `O` outline, `П` is `п` raised to cap height. `→`, `✔` and
   `★` were missing too and are drawn as pixel bitmaps on the font's own grid.
   The result is a derivative, so the internal family name was changed and
   `ASSET_LICENSES.md` records what was altered.

6. **The page title read `Искролом / Sparkscrapper`.** One title carrying two
   names with a slash reads as two games. It now follows the interface
   language — `Искролом` or `Sparkscrapper`, matching the name on each store
   card and on the menu screen — with the Russian name as the static default in
   `index.html`.

The same audits were also wrong twice about the game, and both were fixed in
the audit rather than the code:

- A `/sdk.js` **404 was reported as a console error at every viewport size.**
  It is expected: Yandex serves that file from the host root and nothing off
  the platform can. The audit now tracks failed requests by URL instead of
  pattern-matching the browser's message, which carries no URL, and asserts the
  thing that actually matters — that the game still reaches a screen and
  reports its platform as `none` rather than claiming an SDK it does not have.
- The **language button "Русский" was flagged as doing nothing.** It is a radio
  group, and it was already on Russian; re-selecting the current option is
  meant to be inert. The sweep now skips options with `aria-checked="true"`.

A third rule was replaced outright: glyph coverage was being tested by
comparing advance widths, which agree by coincidence often enough to produce
both false alarms and false silence. It now renders each character to a canvas
twice and compares pixels.

### Found by end-to-end checks

7. **Two screens could be live at once.** Screens are code-split, so `show()`
   mounts asynchronously; two calls in quick succession both appended their
   screen, because the second one's `clear()` ran before the first one's
   `import()` resolved. Mounts now carry a token and a superseded mount tears
   itself down. This is exactly the class of bug the 20-transition check exists
   to catch.
8. **The tutorial silently died after the first screen change.** A screen change
   clears `#ui-root`, detaching an open coach mark; the tutorial still believed
   a step was on screen and refused every later hint for the rest of the
   session. Added a screen-change hook, and a scrim so a pausing hint actually
   blocks what is under it (previously the player could start the wave out from
   under the hint, stranding a pause reason).
9. **Losing wave one paid zero credits**, so the "double your credits" button
   offered to double nothing. Kills now pay, with a floor for any finished
   attempt, and the ad prompt is hidden entirely when there is nothing to
   double.
10. **An SDK that never called back froze the game for 45 seconds.** The pause is
    now taken when the ad *opens*, not when it is *requested*, and a 6-second
    watchdog gives up if it never opens.

### Found while building the video, and worth fixing regardless

11. **Tapping a filled cell explained the wrong thing.** Selecting a cell
    previewed replacing it *with itself*, which produces an empty diff and
    rendered as "not connected to a weapon" — actively misleading for a module
    that was working perfectly. A tap now previews *removing* the part, which
    answers the question a player is actually asking ("what is this doing for
    me?"): selecting the Battery now reads "Without Battery: Riveter · fire
    rate +25% → —". An empty diff also now distinguishes "this module touches
    no weapon" from "this changes nothing".

12. **Hovering a shop card silently overrode an explicit cell selection**, so
    the explanation panel described a part the player had not asked about. An
    explicit tap now outranks a passive hover, and moving off a card restores
    whatever the selection was showing.

13. **The explanation sat below the shop**, so reading it scrolled the panel off
    screen — and on the way, a shop card slid under the cursor and replaced the
    diff. It now renders directly under the panel, so the link and the numbers
    are visible together without scrolling.

### Found by external code review, then fixed and tested here

14. **The SDK was loaded from the wrong URL.** The adapter used
    `https://yandex.ru/games/sdk/v2`. A build served by Yandex from a ZIP
    exposes the SDK at the root path **`/sdk.js`**. This would have failed at
    the first hurdle in a real draft, and no amount of local testing would have
    caught it, because the endpoint is unreachable from here either way. Now
    `/sdk.js`, with the self-hosted form exported alongside it, and the packer
    asserts the built bundle actually references it.

15. **The pause could be released while an ad was still on screen.** A 45-second
    watchdog resolved the promise, and the caller cleared the `ad` pause in a
    `finally`. Any rewarded video longer than 45 seconds would have resumed the
    game — sound, simulation and all — underneath the ad.

16. **A late `onOpen` could freeze the game permanently.** After the 6-second
    open timeout the promise resolved and the caller cleared the `ad` pause. If
    the host then opened the ad, `onOpen` set the pause again with nothing left
    to clear it. The game would sit paused forever.

17. **A finished request released the in-flight guard while its ad was still
    up**, so a second tap could stack a second ad; and a stale request's late
    callbacks could resolve a newer request.

    All three are the same root cause: the ad's *visibility* and the promise's
    *lifetime* were treated as one thing. They are now separate. Each request
    is a session; the pause is driven by `onOpen`/`onClose` hooks and counts how
    many ads are open, so it releases only when the last one closes. The promise
    settles independently so the button never sticks. `game_api_resume` is used
    as a real recovery signal when `onClose` is lost, with a long backstop only
    for a host that provides neither.

18. **The game did not work offline, while the store card said it did.** See the
    offline section above.

### Found by the balance harness

19. **Flat armour reduced fast weapons to 1 damage.** A 4-armour Bulwark turned
    the Cutter Beam's 2.6-damage tick into 1, which reads as the weapon being
    broken rather than as a reason to fit a Piston. Armour now floors at 25% of
    the raw hit.
20. **Boss slams were undodgeable.** Radius 112 with a 1.05s telegraph demands
    117 px/s from a 126 px/s robot — technically possible, practically not.
    Telegraph geometry is now derived from player speed.
21. **The Arc Sovereign's bullet ring had a 1-in-14 gap** the player could not
    find. The gap now widens with the volley count.
22. **Tier scaling was too steep**; contract 3 was gated on maxed permanent
    upgrades rather than on build quality. Reduced.
23. **Scrap left on the floor was lost** when the wave timer expired. It is now
    swept into the total on a clear.

### Found by unit tests

24. Nothing — the unit tests were written after the code and all passed on first
    run, except one case where **the test was wrong** (it assumed the event
    emitter would store the same function reference twice; a `Set` deduplicates
    it). The behaviour is now pinned by a test that documents it.

---

## Not tested — requires the real Yandex platform

None of the following was run. They need a developer account, an uploaded draft
and live inventory, and I will not claim otherwise.

| Area | What still needs checking on the platform |
|---|---|
| **SDK loading** | The adapter now points at `/sdk.js`, which is correct for a ZIP served by Yandex — but that endpoint only exists on the platform, so **it has never actually been fetched**. The adapter was exercised against a scripted SDK matching the published `@types/ysdk` surface. This is the single highest-value thing to check first in a draft. |
| **Documentation** | `yandex.ru` and `yandex.com` are blocked here and were never readable. Everything stated about platform rules is relayed by review. Re-read the requirements and SDK pages, and confirm the **archive size limit** and **required store image dimensions** in the draft form. |
| **Real ads** | No live ad inventory was involved. Fill rate, real close behaviour, real callback ordering and ad-blocker interaction are all unverified. The 25 ad tests use a **scripted** SDK, not a real one. |
| **Long real ads** | The "pause holds for the whole ad" property is proven against a scripted 120-second ad. Confirm it with a real rewarded video, which is exactly what step 5 of `store/OWNER_CHECKLIST.md` is for. |
| **Interstitial pacing** | The rule (results screen only, never the first session, every 2nd contract, 180s cooldown) is implemented and configurable in `src/config/balance.ts`, but must be checked against the platform's current policy. |
| **Purchases** | No catalogue exists, so `getCatalog()` returns empty and the UI hides itself. **Payments are not verified.** Products, prices, entitlement grants and restore-across-devices all need a configured catalogue. |
| **Cloud saves** | Verified against a scripted `player.setData`/`getData`. Real rate limits, the guest-mode slot, and cross-device behaviour are unverified. |
| **Real devices** | Everything reported here is **desktop Chromium with software rendering, emulating phone viewports**. No physical phone or tablet was used. Touch was synthesised — including in the recorded video, where the on-screen stick is driven by synthetic pointer events rather than a thumb. Frame rates on real hardware, especially low-end Android, are unknown. |
| **Leaderboards, shortcuts, reviews** | Not implemented, deliberately, for a first release. |
| **Name availability** | "Искролом" / "Sparkscrapper" has not been checked against the catalogue. |
| **Moderation** | Nothing has been submitted. No claim about passing review. |

## Analytics

Eight events are implemented and stamped with a per-run random attempt id and
`BALANCE_VERSION`, carrying no personal data: `game_ready`,
`tutorial_complete`, `run_start`, `wave_complete`, `run_end`,
`upgrade_purchased`, `gear_purchased`, `rewarded_offer`, `rewarded_complete`.

**No collector is connected.** Events are validated, stamped and buffered
locally; `Analytics.attach(sink)` is the single hook where a real backend would
be wired in. **Nothing is transmitted anywhere by this build.**

## Purchases

Two non-consumable entitlements are implemented (`foreman_kit`,
`no_forced_ads`). With no catalogue configured, `getCatalog()` returns empty and
the purchase section renders nothing at all — no buttons, no placeholder prices,
no "coming soon". That is the intended shipping state: **the first release is
monetised by advertising only.** There is no soft currency and no consumable
item. Real payments and cross-device restore are **unverified** and can only be
checked with a configured catalogue in a draft.

## Video

**Two gameplay videos were recorded** — 34 seconds each, portrait 390x844 and
desktop 1366x768, in `store/video/`.

I previously reported that video capture was not available here. That was
wrong, and it was wrong because I asserted it without checking: Playwright
records video natively and the ffmpeg it needs ships with the browser bundle.

Every frame is the production build running in Chromium. Input goes through the
game's normal touch path — synthesised pointer events driving the on-screen
stick — so the stick is visible and the movement is real, not a camera path.

The run is **staged, the way any trailer is**, and this is worth stating
plainly: it starts at a dense mid-contract wave rather than the quiet first one,
the shop is seeded so the Battery is on offer, and waves are ended on cue
instead of played out in full. What is *not* staged is any mechanic — the
adjacency link, the "+25% fire rate" the panel reports, and the visibly faster
firing in the next wave are all the game doing its ordinary job. No page errors
occurred during either recording.

Only **WebM/VP8** could be produced: the bundled ffmpeg is a minimal build with
no H.264 encoder. `store/MEDIA.md` gives the conversion command if the draft
form needs MP4.

`store/VIDEO_SCRIPT.md` holds the shot list, and `store/MEDIA.md` lists every
image and video with measured dimensions, duration and file size.

## Where to start

`store/OWNER_CHECKLIST.md` is the ordered list of everything that needs a real
draft, beginning with SDK initialisation — the one thing that cannot be checked
from here at all.
