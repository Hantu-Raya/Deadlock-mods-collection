(function init() {
  const root      = findUIRoot($.GetContextPanel());
  const clockLab  = root.FindChildrenWithClassTraverse?.("GameTime")?.[0];
  const buffLabel = root.FindChildTraverse("BuffTime");

  if (!clockLab || !buffLabel) {
    return $.Schedule(0.5, init);
  }

  const SYNC_INTERVAL   = 20;    // seconds between clock syncs
  const BUFF_INTERVAL   = 5 * 60; // 300s (5 minutes)
  let counterSec = 0;

  // Initial sync and start loops
  syncFromClock();

  function syncFromClock() {
    // read clock and set counter
    const [m, s] = (clockLab.text || "0:00").split(":").map(Number);
    counterSec = m * 60 + s;
    updateBuff(counterSec);

    // schedule next sync
    $.Schedule(SYNC_INTERVAL, syncFromClock);

    // start internal tick loop if not already running
    if (!syncFromClock.started) {
      syncFromClock.started = true;
      tickLoop();
    }
  }

  function tickLoop() {
    counterSec = (counterSec + 1) % BUFF_INTERVAL;
    updateBuff(counterSec);
    $.Schedule(1.0, tickLoop);
  }

  function updateBuff(elapsed) {
    const rem = BUFF_INTERVAL - (elapsed % BUFF_INTERVAL);
    const mm  = Math.floor(rem / 60);
    const ss  = rem % 60;
    buffLabel.text = `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  }
})();

function findUIRoot(panel) {
  while (panel.GetParent?.()) panel = panel.GetParent();
  return panel;
}