(function() {
  let container, gameTimeLabel, currentThresholdIndex = 0;
  const thresholds = [
    { sec: 20, opacity: "0.35" },
    { sec: 540, opacity: "1.0" }
  ];

  function init() {
    const root = findRoot($.GetContextPanel());
    container = root.FindChildTraverse("HudEventIndicatorsPanel");
    
    if (!container) {
      $.Schedule(10.0, init);
      return;
    }

    // Cache the game time label
    gameTimeLabel = root.FindChildrenWithClassTraverse?.("GameTime")[0];
    
    // Apply initial opacity
    applyOpacity(container, thresholds[0].opacity);
    currentThresholdIndex = 1; // Start checking from second threshold
    
    // Start watching if we have the label, otherwise retry
    gameTimeLabel ? watchClock() : $.Schedule(10.0, findLabelAndWatch);
  }

  function findLabelAndWatch() {
    gameTimeLabel = findRoot($.GetContextPanel()).FindChildrenWithClassTraverse?.("GameTime")[0];
    gameTimeLabel ? watchClock() : $.Schedule(10.0, findLabelAndWatch);
  }

  function watchClock() {
    // Exit if all thresholds processed
    if (currentThresholdIndex >= thresholds.length) return;
    
    const timeText = gameTimeLabel.text;
    if (!timeText) {
      $.Schedule(10.0, watchClock);
      return;
    }

    const colonIndex = timeText.indexOf(':');
    const sec = colonIndex !== -1 
      ? parseInt(timeText.substring(0, colonIndex)) * 60 + parseInt(timeText.substring(colonIndex + 1))
      : 0;

    // Check current threshold
    if (sec >= thresholds[currentThresholdIndex].sec) {
      applyOpacity(container, thresholds[currentThresholdIndex].opacity);
      currentThresholdIndex++;
      
      // Continue if more thresholds remain
      if (currentThresholdIndex < thresholds.length) {
        $.Schedule(10.0, watchClock);
      }
    } else {
      $.Schedule(10.0, watchClock);
    }
  }

  function applyOpacity(panel, val) {
    panel.style.opacity = val;
    const children = panel.FindChildrenWithClassTraverse?.("*");
    if (children) {
      for (let i = 0; i < children.length; i++) {
        children[i].style.opacity = val;
      }
    }
  }

  function findRoot(p) {
    while (p.GetParent?.()) p = p.GetParent();
    return p;
  }

  init();
})();