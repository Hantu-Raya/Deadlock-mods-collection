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
