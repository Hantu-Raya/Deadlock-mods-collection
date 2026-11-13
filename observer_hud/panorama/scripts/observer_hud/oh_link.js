// Observer HUD lobby link, HUD side (loaded by hud_spectate_bar.xml after oh_host.js). The private-lobby
// page (oh_lobby.js, dashboard context) edits the setup through this script, and $.OHHost stays the only
// writer (decisions/private-lobby-setup-plan.md "Data flow"; live client 6842: both directions of
// ClientUI_FireOutput arrive in the same frame, before any map, during a lobby match and after it).
//
// Lobby -> HUD: "OHL1:" + JSON { k, h, ... }. HUD -> lobby: "OHL1S:" + JSON { h, v, s, c, e, q }:
//   h  host id (random per host lifetime): an op that names another host is from an older session;
//   v  the state version; s the lobby's slice of the state; c the last ended match card (or 0);
//   e  why the last op was refused ("" when it was applied); q the op's request number, echoed;
//   x  the share code, only in the answer to a "share" op ("too long" in e instead when it has none).
// Field ops (set, alias, ban) apply last-writer-wins. Compound ops (swap, clearBans, reset) carry the
// version they were built from and are refused when the state moved on, so a late or repeated swap never
// undoes a newer edit or a match-end series win. "import" replaces the setup with a share code (this PC's
// DEV settings stay), as the editor's SHARE page. Anything on this channel may be forged: every value
// passes the same $.OHState checks as the editor, and a refused op changes nothing.
(() => {
  "use strict";

  const TAG = "[OH-LOBBY]";
  const PREFIX = "OHL1:";
  const REPLY = "OHL1S:";
  const LISTEN_MS = 15000; // echo state changes while the lobby said hello this recently
  const S = $.OHState;
  const H = $.OHHost;
  const MAX_OP = (S ? S.MAX_SHARE : 0) + 1024; // a share code plus the op around it
  const context = $.GetContextPanel();
  if (typeof context.OHLinkStop === "function") context.OHLinkStop();
  if (!S || !H) {
    $.Msg(`${TAG} no host; the lobby link is off`);
    return;
  }
  let stopped = false;
  const hostId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  let heardAt = -1e12;

  function slice(state) {
    const team = (t) => ({ name: t.name, tag: t.tag, logo: { url: t.logo.url }, series: t.series, bans: t.bans.slice() });
    return { amber: team(state.amber), sapphire: team(state.sapphire), bestOf: state.bestOf, banCount: state.banCount, stage: state.stage, players: state.players };
  }
  // The last ended match card (a winner is set), for the lobby's "teams changed sides" offer.
  function endedCard() {
    const card = H.card();
    return card && (card.w === 1 || card.w === 2) ? { a: card.a, b: card.b, t: card.t } : 0;
  }
  function send(error, request, code = "") {
    const reply = { h: hostId, v: H.version(), s: slice(H.getState()), c: endedCard(), e: error, q: request };
    if (code) reply.x = code;
    const text = REPLY + JSON.stringify(reply);
    try {
      $.DispatchEvent("ClientUI_FireOutput", text);
    } catch (e) {
      $.Msg(`${TAG} reply failed`);
    }
  }

  const TEAM_KEYS = ["amber", "sapphire"];
  // Field op: { k: "set", f: field, t: team (name, tag, logo, series, ban with i: slot), x: value };
  // bestOf, banCount and stage name no team.
  // Returns "" or a refusal.
  function applySet(next, op) {
    if (op.f === "bestOf") {
      if (!S.BEST_OF.includes(op.x)) return "format";
      next.bestOf = op.x;
      const cap = S.winsNeeded(op.x);
      for (const key of TEAM_KEYS) next[key].series = Math.min(next[key].series, cap);
      return "";
    }
    if (op.f === "banCount") {
      // How many bans show (2 or 3); a ban past it is kept, so switching back brings it back.
      if (!S.BAN_COUNTS.includes(op.x)) return "bans";
      next.banCount = op.x;
      return "";
    }
    if (op.f === "stage") {
      const text = S.cleanText(op.x, S.LIMITS.stage);
      if (text === null) return "stage too long";
      next.stage = text;
      return "";
    }
    if (!TEAM_KEYS.includes(op.t)) return "team";
    const team = next[op.t];
    if (op.f === "name") {
      const text = S.cleanText(op.x, S.LIMITS.name);
      if (text === null) return "name too long";
      team.name = text;
    } else if (op.f === "tag") {
      const text = S.cleanText(op.x, S.LIMITS.tag);
      if (text === null) return "tag too long";
      team.tag = text.toUpperCase();
    } else if (op.f === "logo") {
      const url = S.cleanUrl(op.x);
      if (url === null) return "logo URL not accepted";
      team.logo = { url: url };
    } else if (op.f === "series") {
      if (!Number.isInteger(op.x) || op.x < 0 || op.x > S.winsNeeded(next.bestOf)) return "series";
      team.series = op.x;
    } else if (op.f === "ban") {
      // A hero is banned once (as the editor's picker): banning it again moves it to this slot.
      if (!Number.isInteger(op.i) || op.i < 0 || op.i >= S.BAN_SLOTS) return "ban";
      if (!Number.isInteger(op.x) || op.x < 0 || op.x > S.MAX_HERO_ID) return "ban";
      S.moveBan(next, op.t, op.i, op.x);
    } else {
      return "field";
    }
    return "";
  }
  // Alias op: { k: "alias", a: account, n: in-game name, x: alias ("" clears) }. The account comes from the
  // lobby slot (live: CitadelFriend#PlayerID.accountid on an .IsPlayer slot), so no pending alias is made.
  function applyAlias(next, op) {
    if (!S.isAccount(op.a)) return "account";
    const name = S.cleanText(op.n, S.LIMITS.gameName);
    const text = S.cleanText(op.x, S.LIMITS.alias);
    if (text === null) return "alias too long";
    if (name) {
      delete next.pending[name];
      delete next.legacy[name];
    }
    if (!text) {
      delete next.players[op.a];
      return "";
    }
    if (!next.players[op.a] && Object.keys(next.players).length >= S.MAX_ALIASES) return "alias list full";
    next.players[op.a] = { a: text, n: name || (next.players[op.a] ? next.players[op.a].n : "") };
    return "";
  }

  function onMessage(raw) {
    if (stopped || typeof raw !== "string" || raw.slice(0, PREFIX.length) !== PREFIX) return;
    if (raw.length > MAX_OP) return;
    let op = null;
    try {
      op = JSON.parse(raw.slice(PREFIX.length));
    } catch (e) {
      return;
    }
    if (!op || typeof op !== "object" || typeof op.k !== "string") return;
    heardAt = Date.now();
    const request = Number.isInteger(op.q) ? op.q : 0;
    if (op.k === "hi") {
      send("", request);
      return;
    }
    // Every edit names the host it was built against: an op from a page that last heard an older host
    // (a restart in between) is refused, and the reply brings the page up to date.
    if (op.h !== hostId) {
      send("stale", request);
      return;
    }
    let next = S.clone(H.getState());
    let error = "";
    if (op.k === "set") {
      error = applySet(next, op);
    } else if (op.k === "alias") {
      error = applyAlias(next, op);
    } else if (op.k === "share") {
      const code = S.encodeShare(H.getState());
      send(code ? "" : "too long", request, code);
      return;
    } else if (op.k === "import") {
      const result = typeof op.c === "string" ? S.decodeShare(op.c.trim()) : { kind: "invalid" };
      if (result.kind !== "valid") {
        error = result.kind === "unsupported" ? "newer code" : "code";
      } else {
        next = S.importShared(result.state, H.getState().dev);
      }
    } else if (op.k === "swap" || op.k === "clearBans" || op.k === "reset") {
      if (op.v !== H.version()) {
        error = "stale";
      } else if (op.k === "swap") {
        const amber = next.amber;
        next.amber = next.sapphire;
        next.sapphire = amber;
      } else if (op.k === "clearBans") {
        for (const key of TEAM_KEYS) next[key].bans = next[key].bans.map(() => 0);
      } else {
        // RESET ALL, as the editor's: every setting back to the defaults, and the save (even a blocked
        // one) is overwritten with them. The editor owns the save, so it runs the reset when it is there.
        applying = true;
        try {
          if (typeof $.OHMenuResetAll === "function") $.OHMenuResetAll();
          else H.setState(S.defaults());
        } finally {
          applying = false;
        }
        send("", request);
        return;
      }
    } else {
      error = "op";
    }
    if (error) {
      send(error, request);
      return;
    }
    // The op's own reply carries its request number; the change listener stays quiet meanwhile.
    applying = true;
    try {
      H.setState(next);
    } finally {
      applying = false;
    }
    send("", request);
  }

  let applying = false;
  H.onChange(() => {
    if (stopped || applying || Date.now() - heardAt > LISTEN_MS) return;
    send("", 0);
  });
  const listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onMessage);
  context.OHLinkStop = () => {
    stopped = true;
    try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); } catch (e) {}
  };
  $.Msg(`${TAG} link ready`);
})();
