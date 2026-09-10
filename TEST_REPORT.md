# Test report

Three layers of checking, in order of how much they prove:

1. **104 unit tests** (`npm test`) — adjacency, economy, saves, pause manager.
2. **62 end-to-end checks** (`node tools/e2e/run.mjs`) — the **production
   build**, driven in Chromium, with a fake Yandex SDK injected before boot so
   the **real** shipped adapter is what runs.
3. **Manual inspection of rendered frames** — screenshots read and judged, which
   is how the rendering bugs listed below were found. None of them failed a
   test; they were all visible and only visible.

Everything below was actually executed. Anything requiring the real platform is
in the last section, unrun.

---

## 1. Unit tests — 104 passed

```
src/tests/grid.test.ts      24 passed
src/tests/economy.test.ts   29 passed
src/tests/pause.test.ts     21 passed
src/tests/save.test.ts      30 passed
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

**Saves (30)** — junk input of every shape yields a clean default; unknown gear,
contracts, robots and upgrade ids are dropped; levels clamp to their caps;
volumes clamp to range; a run pointing at a missing contract is dropped; unknown
gear is stripped from a restored panel without dropping the run; rewarded-wave
lists are deduplicated and bounded; a save from a **newer** version keeps
credits but drops its unreadable run; migration never throws; **a failed cloud
write leaves local progress untouched**; conflicts resolve by revision and
**never sum two balances**; a burst of six writes coalesces into one upload.

---

## 2. End-to-end checks — 62 passed, 0 failed

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

The only network failure observed anywhere is `ERR_TUNNEL_CONNECTION_FAILED` for
`https://yandex.ru/games/sdk/v2`, because this environment blocks `yandex.ru`.
That is the intended degradation path and the game runs fully without the SDK —
which is itself a useful result: **a player whose network blocks the SDK still
gets a working game.**

---

## 3. Packaging

| Check | Result |
|---|---|
| `index.html` at the archive root | pass |
| Every path relative — no absolute or remote URLs in HTML, CSS or JS | pass |
| No sources, source maps, `.env`, keys or `node_modules` | pass |
| File names plain ASCII | pass |
| No library fetched from a CDN at runtime | pass |
| Size within budget | pass — 1.35 MB unpacked, **425 KB zipped** |
| Every `dist/` file present in the archive | pass |
| **Game unpacked from the ZIP and played from a nested path** (`/games/12345/`) | pass — menu, contract, wave, wave cleared, Cyrillic font loaded, zero console errors |

Serving from a nested path is what actually proves `base: './'` works; serving
from a domain root would have hidden an absolute-path bug.

### Reproducible from a clean clone

The pushed branch was cloned fresh into an empty directory and taken through
`npm ci`, `npm run build`, `npm test` and `node tools/pack.mjs`. All 104 unit
tests pass and the packer produces a byte-identical 426 KB archive, so nothing
in the result depends on state left behind in the development directory.

---

## 4. Screens inspected visually

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

### Found by end-to-end checks

5. **Two screens could be live at once.** Screens are code-split, so `show()`
   mounts asynchronously; two calls in quick succession both appended their
   screen, because the second one's `clear()` ran before the first one's
   `import()` resolved. Mounts now carry a token and a superseded mount tears
   itself down. This is exactly the class of bug the 20-transition check exists
   to catch.
6. **The tutorial silently died after the first screen change.** A screen change
   clears `#ui-root`, detaching an open coach mark; the tutorial still believed
   a step was on screen and refused every later hint for the rest of the
   session. Added a screen-change hook, and a scrim so a pausing hint actually
   blocks what is under it (previously the player could start the wave out from
   under the hint, stranding a pause reason).
7. **Losing wave one paid zero credits**, so the "double your credits" button
   offered to double nothing. Kills now pay, with a floor for any finished
   attempt, and the ad prompt is hidden entirely when there is nothing to
   double.
8. **An SDK that never called back froze the game for 45 seconds.** The pause is
   now taken when the ad *opens*, not when it is *requested*, and a 6-second
   watchdog gives up if it never opens.

### Found by the balance harness

9. **Flat armour reduced fast weapons to 1 damage.** A 4-armour Bulwark turned
   the Cutter Beam's 2.6-damage tick into 1, which reads as the weapon being
   broken rather than as a reason to fit a Piston. Armour now floors at 25% of
   the raw hit.
10. **Boss slams were undodgeable.** Radius 112 with a 1.05s telegraph demands
    117 px/s from a 126 px/s robot — technically possible, practically not.
    Telegraph geometry is now derived from player speed.
11. **The Arc Sovereign's bullet ring had a 1-in-14 gap** the player could not
    find. The gap now widens with the volley count.
12. **Tier scaling was too steep**; contract 3 was gated on maxed permanent
    upgrades rather than on build quality. Reduced.
13. **Scrap left on the floor was lost** when the wave timer expired. It is now
    swept into the total on a clear.

### Found by unit tests

14. Nothing — the unit tests were written after the code and all passed on first
    run, except one case where **the test was wrong** (it assumed the event
    emitter would store the same function reference twice; a `Set` deduplicates
    it). The behaviour is now pinned by a test that documents it.

---

## Not tested — requires the real Yandex platform

None of the following was run. They need a developer account, an uploaded draft
and live inventory, and I will not claim otherwise.

| Area | What still needs checking on the platform |
|---|---|
| **SDK loading** | `https://yandex.ru/games/sdk/v2` is blocked from this environment. The adapter was exercised against a scripted SDK matching the published `@types/ysdk` surface, never against the real script. |
| **Documentation** | `yandex.ru` and `yandex.com` are both blocked here. Re-read the requirements page, the SDK pages, and confirm the **current archive size limit** and **required store image dimensions** before uploading. |
| **Real ads** | No live ad inventory was involved. Fill rate, real close behaviour, and how the SDK behaves with an ad blocker are all unverified. |
| **Interstitial pacing** | The rule (results screen only, never the first session, every 2nd contract, 180s cooldown) is implemented and configurable in `src/config/balance.ts`, but must be checked against the platform's current policy. |
| **Purchases** | No catalogue exists, so `getCatalog()` returns empty and the UI hides itself. **Payments are not verified.** Products, prices, entitlement grants and restore-across-devices all need a configured catalogue. |
| **Cloud saves** | Verified against a scripted `player.setData`/`getData`. Real rate limits, the guest-mode slot, and cross-device behaviour are unverified. |
| **Real devices** | Everything reported here is **desktop Chromium with software rendering, emulating phone viewports**. No physical phone or tablet was used. Touch was synthesised. Frame rates on real hardware — especially low-end Android — are unknown. |
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

## Video

**No gameplay video was recorded.** Video capture was not available in this
environment. The still screenshots in `store/screenshots/` are real captures of
the built game, not mock-ups; a video will need to be recorded separately.
