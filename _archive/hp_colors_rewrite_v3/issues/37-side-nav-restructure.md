# 37: Side nav restructure

**What to build:** reorganize the menu's pages and sub-nav groups so that related settings sit together. The user's report (2026-10-21): the side nav was cluttered, and a setting's close relative often sat several cards further down, so they had to scroll to find it.

**Runs on:** Claude (implementation), debated in two rounds with m1 (GPT-6 Astra, effort med). Briefs: `local://hpv3-nav-restructure-brief.md` and `.scratch/hpv3_nav/round2.md`.

**Status:** done; all six variants built; normal debug `cb92cecb` installed. **Live:** the user reported "so far all looking good" after the 2026-10-21 10:12–10:14 session with `cb92cecb`. Its `console.log` has no JS Exception, Uncaught, Parsing error, FATAL or Failed to parse, and the menu booted and loaded the save.

## What was wrong

- BAR had 10 cards and INDICATORS 12. With INDICATORS open, the rail needed 7×44 + 12×32 = 692 px of buttons.
- Related pairs were far apart:
  - Team high color was in Colors, but Amber and Sapphire were three cards later.
  - The low, middle and high colors were two cards away from their thresholds.
  - The master switch was card 2 and bar style card 8.
  - Damage shake was four cards after Feedback.
  - Pickup colors were two cards before their on switch (*Pickup styling and timers*, in TIMERS).
  - The ultimate badge was far from *Show ultimate progress*, which ultimate size depends on.
  - Anchoring had a one-row card next to Level, and the Pulse HP rows had their own card next to Pulse.

## Decisions

- **Pages:** NEW, BAR, HP TEXT, NAME, INDICATORS, **ICONS** (new), UNITS, PRESETS. ICONS holds the icons attached to the bar: level and ultimate badges, pickups and rejuvenator. m1 preferred ICONS to BADGES because pickups and the rejuvenator are icons, not badges.
- **BAR (7 cards):** General (master switch, bar style), Colors, Shared colors (thresholds, Amber, Sapphire), Feedback (with damage shake), Size and position (Show healthbar first), Outline, Your health bar.
  - m1 objected to my first plan of putting thresholds and team colors in the Colors card. Shared rows render below the sided rows in each fold, so Colors would have had nine Basic rows before its Advanced team high color. Shared colors also keeps the shared scope visible: HP TEXT and stamina use these values too.
- **HP TEXT:** the color source joins the custom colors in a Colors card.
- **INDICATORS (5 cards):** Lines and pips, Kill marker, Stamina (source before color), Pulse (the four Pulse HP rows come first in Advanced), Labels.
- **ICONS (4 cards):** Level and anchoring, Ultimate (*Show ultimate progress* first, with its ring colors), Pickups (*Pickup styling and timers* first), Rejuvenator. The TIMERS card is gone.
- **Names:** *CRITICAL label*, *CRITICAL horizontal offset* and *CRITICAL vertical offset*, and the same for ASSASSINATE and UNKILLABLE. The game's label text stays in capitals; the rest is no longer shouted. *Show level badge* became *Show enemy level badge*, because its card stays visible with Ally selected.
- **NEW:** an Updated item, `icons-tab`, points to ICONS so returning players find the moved settings. The wording is m1's.
- **BAR lead:** the General rows are ungrouped with `lead: 'General'`. An explicit group named General collided with the generator's ids for ungrouped cards (`HPColorsSubNavBarGeneralButton`), as a fixture in `tests/menu.test.js` showed.
- **Not changed:**
  - NAME and UNITS.
  - Every key, slot, level, default and help text.
  - Shared settings that several pages use stay in one place. Their help names the other pages that use them, so no control is duplicated.
- **Reset scope:**
  - Reset page on INDICATORS no longer resets level, ultimate, pickups or the rejuvenator; Reset page on ICONS does.
  - The Feedback card reset now includes damage shake, and the Ultimate card reset includes the progress colors.

## Evidence

- `tests/nav.test.js` pins the whole structure: the tab order, every page's sub-nav labels and card order, and every row's card, fold, column and order. It also checks that every setting appears exactly once, that no card holds one setting, that no page lists more than seven sub-nav entries, the renamed rows, and ICONS reset scope. All 5 tests failed before the change and pass after it.
- **Save and code proof** (`.scratch/hpv3_nav/codes.js`, output `codes.json`): a varied settings object was encoded with the old and new generated settings. The settings code, bundle code, save record and defaults record are byte-identical.
  - `generated/slots.json` and `heroes.json` are unchanged.
  - `defaults.json` is equal apart from key order.
- **Rail height** (buttons only): the worst case is 8×44 + 7×32 = 576 px (BAR), down from 692 px. This does not prove the rail never scrolls: the rail also has padding, the search row and the SHOW BOUNDS footer.
- **Tests updated for the new layout:**
  - Card and sub-nav ids: menu, news, theme, hero-routing.
  - Page lists: menu, news, import-fuzz.
  - Generator and review-fixes mutations now pick a side-aware row by key instead of `rows[0]`.

- **Suites:** canonical 1318/1318; QOLLOCK + ShowRank + v2 storage 90/90; all three generators `--check` current. Builds: staged suites 1316 release / 1317 debug in every variant. Hashes: normal `7f3cff76` / `cb92cecb`, QOLLOCK `2d2ec0f0` / `4ed84c88`, ShowRank `ac3bf9cd` / `5540979d`.

## Not verified

- Not separately confirmed: 1280×720, rail scrolling, and keyboard/controller order through the new cards.
