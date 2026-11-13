# 43: FEEDBACK button in Credits (Discord)

**Request** (user, 2026-10-25): "for reporting bug you need to add a feedback button that link to my discord at the credits section", with "my discord username hanturaya101 and make sure that the user can click to copy the text". Ships in 3.3.2 (user choice, the version was not yet uploaded).

**Status:** built in 3.3.2; VM-tested; not seen in game.

## What it does
- The Credits dialog gains a line under the credit entries: "Found a bug or have feedback? Message hanturaya101 on Discord. FEEDBACK copies the name." (`HPColorsFeedbackText`).
- Its actions row has FEEDBACK (primary) beside CLOSE (`HPColorsFeedbackCopyButton`). FEEDBACK copies `hanturaya101` through `$.DispatchEvent("CopyStringToClipboard", …)`, the same call preset COPY uses, and the status line under the buttons (`HPColorsFeedbackStatus`) says "Copied hanturaya101. Paste it in Discord's Add Friend.".
- A refused (`false`) or throwing clipboard shows "Could not copy. Add hanturaya101 on Discord."; the name is readable in the dialog either way.
- Opening Credits clears the status. The dialog stays open after a copy; settings, storage, Undo and publication are untouched.
- The button sits in the actions row, not in a credit entry: those set `hittestchildren="false"`.
- A Discord username, not an invite: no invite link exists, and the user asked for the copy.

## Files
- `tools/menu-layout.js` (credits dialog) → regenerated `panorama/layout/hud_escape_menu.xml`, `generated/menu-rows.xml` and the QOLLOCK and ShowRank composed menus.
- `panorama/scripts/hp_colors_v3_menu.js`: `FEEDBACK_DISCORD`, `copyFeedback`, status reset in `openCredits`.

## Tests
- `tests/menu-actions.test.js` "ticket 43: credits FEEDBACK copies the Discord username, and a failed copy keeps it readable": red first (no button). Covers the copied string, the status for success, `false` and a throw, the button's placement outside credit entries, the status reset on reopen and untouched settings/storage/Undo.
- `tests/theme.test.js` "all eight dialogs …": FEEDBACK joins the list of primary dialog buttons (stock layered `InputButtonBorderRadius Fill`).

## Not verified
- In game: that `CopyStringToClipboard` copies here as it does for preset codes, and the dialog's look with the extra line and button.

## Moved to the footer (3.4.0, 2026-10-29)
User screenshot: "feedback should be here", pointing between CREDITS and DONATE under the preview. FEEDBACK is now a footer button (`HPColorsPreviewFeedbackButton`, same look as CREDITS/DONATE) in the order CREDITS, FEEDBACK, DONATE. Hovering says "Found a bug or have feedback? Click to copy hanturaya101 and message it on Discord."; a click copies the name and the tooltip reports "Copied hanturaya101. Paste it in Discord's Add Friend." or "Could not copy. Add hanturaya101 on Discord.". The Credits dialog is back to its 3.3.0 form (credits and CLOSE), so there is one FEEDBACK. Test: `menu-actions.test.js` "ticket 43: footer FEEDBACK ..." (red first: no footer button).
Builds (md5): normal `81fb0813`, debug `346afb0f`, QOLLOCK `0a74b78f`, ShowRank `beb96256` (all 3.4.0). Installed (2026-10-29, game closed, 6821): ShowRank `beb96256` as `addons/pak02_dir.vpk`; previous `0709aee6` in `addons_disabled/pak02_dir.vpk.showrank-greyrows-0709aee6`. Not checked in game.

## Feedback dialog (3.4.0, 2026-10-29)
User, after testing `beb96256`: "fix the feedback not popping to say if you have any feedback you can add me on discord then my discord username and they can copy it by clicking my name underlining". The user saw nothing pop up (the click only reported through a tooltip), so FEEDBACK now opens a FEEDBACK dialog (`HPColorsFeedbackDialog`, stock `icons/icon_feedback.vsvg` header, same paper card as Credits): "If you have any feedback, you can add me on Discord:" (`HPColorsFeedbackText`), then the name `hanturaya101` as an underlined Oracle link with the stock Discord icon (`HPColorsFeedbackNameButton`, `.HPC3FeedbackName`, `text-decoration: underline` as stock `citadel_db_page_home.css`). Clicking the name copies it; the status line (`HPColorsFeedbackStatus`) starts as "Click the name to copy it." and reports "Copied hanturaya101. Paste it in Discord's Add Friend." or "Could not copy. Add hanturaya101 on Discord.". CLOSE, ESC and the backdrop close it and return focus to FEEDBACK. Credits and Feedback close each other and every other dialog (`closeInfo`), and the update notice waits while either is open. The footer tooltip is gone.
Tests (red first): `menu-actions.test.js` "ticket 43: footer FEEDBACK opens the Discord dialog ..." and "ticket 31/43: credits and feedback exclude every dialog/picker and each other ..."; `theme.test.js` "all nine dialogs ...". Not checked in game: the underline and the copy.
Builds (md5): normal `33619a2e`, debug `e244ac2c`, QOLLOCK `54fa9193`, ShowRank `98f5fc32`. Installed (2026-10-29, game closed, 6821): ShowRank `98f5fc32`; `beb96256` in `addons_disabled/pak02_dir.vpk.showrank-v340a-beb96256`.

## Live: name copy failed (2026-10-29, 6821, `98f5fc32`)
User screenshot: the dialog, underline and Discord icon show as designed, but clicking the name gave "Could not copy. Add hanturaya101 on Discord.". Cause, from [ticket 29](29-live-video-menu-bugs.md): in the Escape menu `CopyStringToClipboard` throws "Invalid number of arguments"; the live-proven route is a focused, all-selected TextEntry and `TextEntryCopyToClipboard`. The dialog now carries an unseen entry (`HPColorsFeedbackNameEntry`, opacity 0, no hit test) holding the name; a refused direct copy falls back to it, then focus returns to the name. Tests (red first): `menu-actions.test.js` "FEEDBACK name copy falls back to its TextEntry ..." (throw and false) and "... reports a manual copy when both clipboard routes fail". Not yet checked in game. Builds: normal `a8a1a891`, QOLLOCK `ba3cb99d`, ShowRank `40e41001` (installed 2026-10-29, game closed).
