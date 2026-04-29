(() => {
  "use strict";

  const TAG = "[MATCH_CLOCK_DEBUG]";
  const RETRY_DELAY_SEC = 0.5;
  const MAX_RETRIES = 20;

  let subscribed = false;
  let attempts = 0;
  let fallbackSubscribed = false;
  let lastWholeSecond = null;
  let lastPaused = null;

  function fmt(seconds) {
    const total = Math.max(0, Number(seconds) || 0) | 0;
    const minutes = (total / 60) | 0;
    const secs = total % 60;
    return minutes + ":" + (secs < 10 ? "0" : "") + secs;
  }

  function log(message) {
    try {
      $.Msg(TAG + " " + message);
    } catch (e) {
    }
  }

  function toJson(value) {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function onMatchClock(ev) {
    const matchTime = Number(ev && ev.match_time);
    const paused = !!(ev && ev.paused);
    const wholeSecond = Math.max(0, matchTime || 0) | 0;

    if (!ev || typeof ev.match_time === "undefined") {
      log("match_clock fired with payload=" + toJson(ev));
      return;
    }

    if (wholeSecond === lastWholeSecond && paused === lastPaused) return;
    lastWholeSecond = wholeSecond;
    lastPaused = paused;

    log("match_clock time=" + fmt(matchTime) + " raw=" + matchTime + " paused=" + paused);
  }

  function subscribeUnhandledEvent() {
    if (fallbackSubscribed) return true;

    if (!($ && typeof $.RegisterForUnhandledEvent === "function")) {
      log("$.RegisterForUnhandledEvent unavailable");
      return false;
    }

    try {
      $.RegisterForUnhandledEvent("match_clock", function (payload) {
        onMatchClock(payload);
      });
      fallbackSubscribed = true;
      log("subscribed to match_clock via RegisterForUnhandledEvent");
      return true;
    } catch (e) {
      log("RegisterForUnhandledEvent subscribe failed: " + String(e && e.message ? e.message : e));
      return false;
    }
  }

  function subscribe() {
    if (subscribed || fallbackSubscribed) return;

    if (typeof GameEvents === "undefined" ||
        !GameEvents ||
        typeof GameEvents.Subscribe !== "function") {
      attempts += 1;
      if (attempts <= MAX_RETRIES) {
        $.Schedule(RETRY_DELAY_SEC, subscribe);
      } else {
        log("GameEvents.Subscribe unavailable after retries, trying RegisterForUnhandledEvent");
        subscribeUnhandledEvent();
      }
      return;
    }

    try {
      GameEvents.Subscribe("match_clock", onMatchClock);
      subscribed = true;
      log("subscribed to match_clock");
    } catch (e) {
      log("subscribe failed: " + String(e && e.message ? e.message : e));
    }
  }

  log("loaded, waiting for match_clock");
  subscribe();
})();
