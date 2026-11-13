// Old Main Menu dashboard script: what the Jul 2025 dashboard engine code did that the current client does not,
// plus the two hooks the forked pak04's Heroes page relies on.
// 1. Movies: menu_streets_intro plays once with the menu hidden (introMovieActive), then the street loop runs and
//    the menu fades in. Sources are set here because the resource compiler rejects file:// webm references in XML.
//    The class is only added here, so a script failure still leaves a working menu (on a black background).
// 2. Music: the stock Music.MainMenu loop plays on the menu and stops while connected to a game.
// 3. Heroes: RestoreMenu_OpenHeroes(showAll) opens the Heroes page; right-click or Shift+click lists every hero.
//    Its Hero Sandbox button loads new_player_basics and leaves the hero here; it is picked 3 s after loading.
// Attribute names (restoremenu_*) are the Heroes page's contract with the forked pak04; keep them.
(() => {
  "use strict";

  const INTRO = "file://{resources}/videos/main_menu/menu_streets_intro.webm";
  const LOOP = "file://{resources}/videos/main_menu/menu_streets_loop2.webm";
  const HEROES_PAGE = "file://{resources}/layout/citadel_db_page_heroes.xml";
  const INTRO_SECONDS = 10.5; // the intro is 10.219 s; fallback if the end event never arrives
  const MUSIC_EVENT = "Music.MainMenu";
  const TICK_SECONDS = 1;
  const SANDBOX_TICKS = 3;
  const SHIFT_STALE_MS = 15000;

  const db = $.GetContextPanel();
  const UI = { intro: db.FindChildTraverse("intro_movie"), loop: db.FindChildTraverse("dashboard_movie") };
  let _introDone = false;
  let _music = null; // handle from PlayUISoundEvent, or true when it returns none
  let _musicWanted = null;
  let _shiftAt = 0;
  let _heroesSeq = 0;

  function api(name) {
    const fn = globalThis[name] ?? $[name];
    return typeof fn === "function" ? fn : null;
  }

  function play(movie, src) {
    if (!movie?.IsValid?.() || typeof movie.SetMovie !== "function") return false;
    try {
      movie.SetMovie(src);
      movie.Play?.();
      return true;
    } catch (e) {
      $.Msg("[OMM] movie " + movie.id + ": " + e);
      return false;
    }
  }

  function finishIntro() {
    if (_introDone) return;
    _introDone = true;
    play(UI.loop, LOOP);
    db.RemoveClass("introMovieActive");
  }

  function startMovies() {
    if (db.BHasClass("connectedToGame") || !play(UI.intro, INTRO)) {
      finishIntro();
      return;
    }
    db.AddClass("introMovieActive");
    $.RegisterEventHandler("MoviePlayerPlaybackEnded", UI.intro, finishIntro);
    $.Schedule(INTRO_SECONDS, finishIntro);
  }

  function setMusic(on) {
    if (on === _musicWanted) return;
    _musicWanted = on;
    try {
      if (on) {
        const start = api("PlayUISoundEvent");
        if (!start) return $.Msg("[OMM] no PlayUISoundEvent; menu music off");
        _music = start(MUSIC_EVENT) ?? true;
      } else if (_music !== null) {
        api("StopUISoundEvent")?.(_music === true ? MUSIC_EVENT : _music);
        _music = null;
      }
    } catch (e) {
      $.Msg("[OMM] music " + (on ? "start" : "stop") + ": " + e);
    }
  }

  function pendingSandboxHero(inGame) {
    const hero = db.GetAttributeString("restoremenu_sandbox_hero", "");
    if (!hero) return;
    if (!inGame) return db.SetAttributeInt("restoremenu_sandbox_ticks", 0);
    const ticks = db.GetAttributeInt("restoremenu_sandbox_ticks", 0) + 1;
    db.SetAttributeInt("restoremenu_sandbox_ticks", ticks);
    if (ticks < SANDBOX_TICKS) return;
    db.SetAttributeString("restoremenu_sandbox_hero", "");
    $.DispatchEvent("CitadelConCommand", "selecthero " + hero);
  }

  function tick() {
    if (!db?.IsValid?.()) return;
    const inGame = db.BHasClass("connectedToGame");
    setMusic(!inGame);
    pendingSandboxHero(inGame);
    $.Schedule(TICK_SECONDS, tick);
  }

  function bindShift() {
    for (const key of ["key_lshift", "key_rshift"]) {
      for (const [bind, down] of [[key, true], ["mod_shift+" + key, true], [key + "(up)", false], ["mod_shift+" + key + "(up)", false]]) {
        try {
          $.RegisterKeyBind("", bind, () => { _shiftAt = down ? Date.now() : 0; });
        } catch (e) {
          $.Msg("[OMM] bind " + bind + ": " + e);
        }
      }
    }
  }

  globalThis.RestoreMenu_OpenHeroes = (forceAll) => {
    const all = forceAll === true || (_shiftAt > 0 && Date.now() - _shiftAt < SHIFT_STALE_MS);
    db.SetAttributeString("restoremenu_heroes_showall", all ? "1" : "0");
    db.SetAttributeInt("restoremenu_heroes_seq", ++_heroesSeq);
    $.DispatchEvent("CitadelShowCustomLayoutPage", HEROES_PAGE);
  };

  startMovies();
  bindShift();
  tick();
})();
