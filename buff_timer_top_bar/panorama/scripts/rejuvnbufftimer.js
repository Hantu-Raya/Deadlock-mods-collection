(function init() {
  const root = findUIRoot($.GetContextPanel());
  const clockLab = root.FindChildrenWithClassTraverse("GameTime")?.[0];
  const rLab = root.FindChildTraverse("RejuvTime");
  const rNum = root.FindChildTraverse("RejuvNum");
  const rImg = root.FindChildTraverse("RejuvImg");
  const buffLabel = root.FindChildTraverse("BuffTime");

  if (!clockLab || !rLab || !rImg || !rNum || !buffLabel) {
    return $.Schedule(0.5, init);
  }

  const SEQ = [
    { name: 'initial', dur: 600, num: "1" },
    { name: 'firstBuff', dur: 180, num: "1" },
    { name: 'firstCd', dur: 240, num: "2" },
    { name: 'secondBuff', dur: 240, num: "2" },
    { name: 'secondCd', dur: 120, num: "3" },
    { name: 'thirdBuff', dur: 300, num: "3" },
    { name: 'thirdCd', dur: 60, num: "3" }
  ];
  const PLAYERS = ["TopBarPlayer0", "TopBarPlayer5", "TopBarPlayer6", "TopBarPlayer11"];
  
  let idx = 0, counter = 0, phaseStart = 0, buffSec = 0;
  let syncH, tickH, waitH, buffSyncH, buffTickH;
  let lastClock = "", lastBuffClock = "", startupChecked = false;
  let buffStarted = false;

  // Cache frequently accessed properties
  const getClockText = () => clockLab.text || "0:00";
  const getClockSec = () => {
    const [m, s] = getClockText().split(":").map(Number);
    return m * 60 + s;
  };
  
  // Pre-compile format function for better performance
  const format = s => `${(s / 60 | 0).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  startupCheck();
  startBuffTimer();

  function startupCheck() {
    if (getClockSec() > 600 && !startupChecked) {
      startupChecked = true;
      if (findMidBoss()?.BHasClass("active")) {
        showSpawn();
        return waitH = $.Schedule(1, waitForRejuv);
      }
    }
    startPhase();
  }

  function startPhase() {
    clearRejuvTimers();
    const phase = SEQ[idx];
    counter = phase.dur;
    phaseStart = getClockSec();
    
    // Batch DOM updates
    rLab.text = format(counter);
    rNum.text = phase.num;
    updateImage(phase.name);
    
    lastClock = getClockText();
    scheduleSync();
    scheduleTick();
  }

  function updateImage(name) {
    // Batch class operations
    const isBuffPhase = name.endsWith("Buff");
    const isCdPhase = name.endsWith("Cd");
    
    rImg.RemoveClass("rotating");
    rImg.RemoveClass("buff");
    rImg.RemoveClass("reverse");
    rImg.RemoveClass("white");
    
    if (isBuffPhase) {
      rImg.AddClass("buff");
      rImg.AddClass("rotating");
      $.Schedule(0.8, () => rImg.RemoveClass("rotating"));
    } else if (isCdPhase) {
      rImg.AddClass("reverse");
      rImg.AddClass("rotating");
      $.Schedule(0.8, () => rImg.RemoveClass("rotating"));
    }
  }

  function scheduleSync() {
    syncH = $.Schedule(20, () => {
      const elapsed = getClockSec() - phaseStart;
      const phase = SEQ[idx];
      
      if (elapsed >= 0 && elapsed <= phase.dur) {
        counter = phase.dur - elapsed;
      }
      
      rLab.text = counter > 0 ? format(counter) : 
                  (phase.name.endsWith("Cd") ? "Spawn" : "00:00");
      scheduleSync();
    });
  }

  function scheduleTick() {
    tickH = $.Schedule(1, () => {
      const nowText = getClockText();
      if (nowText !== lastClock) {
        lastClock = nowText;
        
        if (--counter <= 0) {
          const phase = SEQ[idx];
          if (!phase.name.indexOf("initial") || phase.name.endsWith("Cd")) {
            showSpawn();
            waitH = $.Schedule(1, waitForRejuv);
          } else {
            ++idx;
            startPhase();
          }
        } else {
          rLab.text = format(counter);
          scheduleTick();
        }
      } else {
        scheduleTick();
      }
    });
  }

  function waitForRejuv() {
    const midBoss = findMidBoss();
    if (!midBoss || midBoss.BHasClass("active")) {
      return waitH = $.Schedule(3, waitForRejuv);
    }

    // Short-circuit evaluation for better performance
    for (let i = 0; i < 4; i++) {
      if (root.FindChildTraverse(PLAYERS[i])?.BHasClass("HasRejuvenator")) {
        idx = SEQ[idx].name === "thirdCd" ? 5 : idx + 1;
        startPhase();
        return;
      }
    }
    waitH = $.Schedule(1, waitForRejuv);
  }

  function showSpawn() {
    // Batch DOM updates
    rLab.text = "Spawn";
    rNum.text = SEQ[idx].num;
    rImg.RemoveClass("buff");
    rImg.RemoveClass("reverse");
    rImg.RemoveClass("rotating");
    rImg.AddClass("white");
    clearRejuvTimers();
  }

  // Optimized timer clearing with early return
  function clearRejuvTimers() {
    syncH && ($.CancelScheduled(syncH), syncH = null);
    tickH && ($.CancelScheduled(tickH), tickH = null);
    waitH && ($.CancelScheduled(waitH), waitH = null);
  }

  function startBuffTimer() {
    lastBuffClock = getClockText();
    buffSync();
  }

  function buffSync() {
    buffSec = getClockSec();
    updateBuff();
    
    if (!buffStarted) {
      buffStarted = true;
      buffTick();
    }
    
    buffSyncH = $.Schedule(20, buffSync);
  }

  function buffTick() {
    buffTickH = $.Schedule(1, () => {
      const nowText = getClockText();
      if (nowText !== lastBuffClock) {
        lastBuffClock = nowText;
        buffSec = (buffSec + 1) % 300;
        updateBuff();
      }
      buffTick();
    });
  }

  // Inline calculation for better performance
  function updateBuff() {
    buffLabel.text = format(300 - (buffSec % 300));
  }

  // Cached and optimized helper functions
  function findMidBoss() {
    return root.FindChildrenWithClassTraverse("mid_boss")?.[0] ||
           root.FindChildrenWithClassTraverse("map_button")?.find(b => b.id?.includes("mid_boss"));
  }

  function findUIRoot(p) {
    while (p.GetParent?.()) p = p.GetParent();
    return p;
  }
})();