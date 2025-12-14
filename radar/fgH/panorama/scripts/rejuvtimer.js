(function init() {
  const root     = findUIRoot($.GetContextPanel());
  const clockLab = root.FindChildrenWithClassTraverse("GameTime")?.[0];
  const rLab     = root.FindChildTraverse("RejuvTime");
  const rNum     = root.FindChildTraverse("RejuvNum");
  const rImg     = root.FindChildTraverse("RejuvImg");
  if (!clockLab || !rLab || !rImg || !rNum) return $.Schedule(0.5, init);

  const SYNC = 20;
  const SEQ = [
    { name: 'initial',     dur: 600, num: "1" },
    { name: 'firstBuff',   dur: 180, num: "1" },
    { name: 'firstCd',     dur: 240, num: "2" },
    { name: 'secondBuff',  dur: 240, num: "2" },
    { name: 'secondCd',    dur: 120, num: "3" },
    { name: 'thirdBuff',   dur: 300, num: "3" },
    { name: 'thirdCd',     dur: 60,  num: "3" }
  ];

  let idx = 0, counter = 0;
  let syncH, tickH, waitH;
  let phaseStartTime = 0;
  let startupChecked = false;

  startupCheck();

  function startupCheck() {
    const now = getClockSec();
    if (now > SEQ[0].dur && !startupChecked) {
      startupChecked = true;
      const midBoss = findMidBoss(root);
      if (midBoss?.BHasClass("active")) {
        rLab.text = "Spawn";
        waitH = $.Schedule(1.0, waitForRejuv);
        return;
      }
    }
    startPhase();
  }

  function startPhase() {
    clearTimers();
    const phase = SEQ[idx];
    counter = phase.dur;
    phaseStartTime = getClockSec();
    rLab.text = format(counter);
    rNum.text = phase.num || "";
  
    rImg.RemoveClass("rotating");
    rImg.RemoveClass("buff");
    rImg.RemoveClass("reverse");
    rImg.RemoveClass("white");
  
    if (phase.name.endsWith("Buff")) {
      rImg.AddClass("buff");
      rImg.AddClass("rotating");
      $.Schedule(0.8, () => rImg.RemoveClass("rotating"));
    } else if (phase.name.endsWith("Cd")) {
      rImg.AddClass("reverse");
      rImg.AddClass("rotating");
      $.Schedule(0.8, () => rImg.RemoveClass("rotating"));
    }
  
    scheduleSync();
    scheduleTick();
  }
    
  function scheduleSync() {
    syncH = $.Schedule(SYNC, () => {
      const elapsed = getClockSec() - phaseStartTime;
      if (elapsed >= 0 && elapsed <= SEQ[idx].dur) {
        counter = SEQ[idx].dur - elapsed;
      }
      rLab.text = (counter > 0) ? format(counter) : getLabelFor(idx);
      scheduleSync();
    });
  }

  function scheduleTick() {
    tickH = $.Schedule(1.0, () => {
      if (--counter <= 0) {
        const name = SEQ[idx].name;

        if (name === 'initial' || name.endsWith('Cd')) {
          rLab.text = "Spawn";
          rImg.RemoveClass("buff");
          rImg.RemoveClass("reverse");
          rImg.AddClass("white");
          clearTimers();
          waitH = $.Schedule(1.0, waitForRejuv);
          return;
        }

        idx++;
        startPhase();
      } else {
        rLab.text = format(counter);
        scheduleTick();
      }
    });
  }

  function waitForRejuv() {
    const midBoss = findMidBoss(root);
    if (!midBoss || midBoss.BHasClass("active")) {
      waitH = $.Schedule(3.0, waitForRejuv);
      return;
    }

    const found = ["TopBarPlayer0", "TopBarPlayer5", "TopBarPlayer6", "TopBarPlayer11"]
      .some(id => root.FindChildTraverse(id)?.BHasClass("HasRejuvenator"));

    if (found) {
      if (SEQ[idx].name === 'thirdCd') {
        idx = SEQ.findIndex(p => p.name === 'thirdBuff');
      } else {
        idx = (idx + 1) % SEQ.length;
      }
      startPhase();
    } else {
      waitH = $.Schedule(1.0, waitForRejuv);
    }
  }

  function clearTimers() {
    [syncH, tickH, waitH].forEach(h => h && $.CancelScheduled(h));
    syncH = tickH = waitH = null;
  }

  function getLabelFor(i) {
    return SEQ[i].name.endsWith("Cd") ? "Spawn" : "00:00";
  }

  function format(s) {
    const mm = String(Math.floor(s / 60)).padStart(2, "0"),
          ss = String(s % 60).padStart(2, "00");
    return `${mm}:${ss}`;
  }

  function getClockSec() {
    const [m, s] = (clockLab.text || "0:00").split(":").map(Number);
    return m * 60 + s;
  }

  function findMidBoss(root) {
    return root.FindChildrenWithClassTraverse("mid_boss")?.[0]
      || root.FindChildrenWithClassTraverse("map_button")?.find(p => p.id.includes("mid_boss"));
  }

  function findUIRoot(p) {
    while (p.GetParent?.()) p = p.GetParent();
    return p;
  }
})();
