# Keep the local save on the hpv2-store `/oh/` page

v1 kept the state for the session only, with share codes to carry it (the user's choice on 2026-10-22; the plan listed a durable save as "later"). v2 adds a local save through a hosted page: `https://hantu-raya.github.io/hpv2-store/oh/` (source `D:/hpv2-store/oh/index.html`, repo `Hantu-Raya/hpv2-store`, commit `125c2db`). It uses the same transport as DLF's `/dlf/` page: a hidden `CitadelHTMLPanel`, request in the URL fragment, reply in `HTMLTitle`.

The page keeps one record under its own key, `hantu.observer_hud.v1/state`, with its own reply prefix `OHS1:`. It never touches the HP Colors, Buff Timer or DLF keys. The plan had proposed `hpv2-store/observer/` with the key `hantu.observer.v1/match`; the shipped page is `/oh/` with the key above.

Consequences:

- The record is `OHS1.<fnv1a32>.<{s:1,state}>`, capped at the page's advertised `m` (8192). Over the cap the logo URLs are dropped from the record and the status says so.
- A damaged or newer save blocks saving; only RESET ALL overwrites it. An offline page leaves the editor working for the session.
- The record is adopted only by a fresh process and only if no edit came first.
- Publishing the page (a push to the repo) needs the user's go-ahead. The validator runs the real page script behind a fake CEF panel (`OH_STORE_PAGE` overrides the path), which proves the protocol, not the served bytes.
- Live 2026-10-22: Bo5 and Night Desk were saved and came back after a game restart ([LIVE-VERIFIED.md](../../LIVE-VERIFIED.md)).

Sources: [PLAN.md](../../PLAN.md) header and phase 6; [SPEC.md](../../SPEC.md#local-save); `observer_hud/panorama/scripts/observer_hud/oh_menu.js`.
