# Keep QOLLOCK composition downstream of canonical v3

The QOLLOCK lane consumes canonical v3 runtime sources, generated menu pieces and test seams; canonical v3 does not import or stage QOLLOCK. The compatibility pak02 composes the pinned QOLLOCK Escape menu and topbar, while QOLLOCK's pak03 keeps its own HUD and storage.

A copied editor or a canonical runtime full of QOLLOCK branches would make two versions of the same behavior drift. One-way composition instead costs a pinned external-input contract, drift guards and paired release builds, while leaving the normal package independent. A variant is an alternative pak02, not permission to install it over an unrelated pak03. See [PLAN D7](../../PLAN.md#d7-menu-redesigned-generated-variants-composed-later), [ticket 22b](../../issues/22b-qollock-variant.md), [composer](../../../hp_colors_rewrite_v3_qollock/tools/qollock.js) and [pin](../../../hp_colors_rewrite_v3_qollock/vendor/pin.json).
