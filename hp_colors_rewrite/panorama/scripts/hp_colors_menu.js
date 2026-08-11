(function () {
  "use strict";

  var CATEGORY_DEFS = [
    {
      name: "OVERVIEW",
      tabs: [
        {
          name: "STATUS",
          title: "CURRENT CONFIGURATION",
          description:
            "The editor lifecycle is active. Healthbar settings remain unchanged in this build.",
        },
        {
          name: "LAYOUT",
          title: "LAYOUT OWNERSHIP",
          description:
            "Bar width, height, and position will live here after the editor lifecycle passes its in-game smoke.",
        },
      ],
    },
    {
      name: "ENEMY",
      tabs: [
        {
          name: "BAR",
          title: "ENEMY BAR",
          description:
            "Enemy visibility, color mode, thresholds, and exclusions belong to this surface.",
        },
        {
          name: "FEEDBACK",
          title: "DAMAGE FEEDBACK",
          description:
            "Healing and damage-delta colors remain grouped by the healthbar layer they affect.",
        },
        {
          name: "SHIELDS & ICONS",
          title: "SHIELDS & ICONS",
          description:
            "Bullet-shield and ultimate-icon behavior remain separate from the primary fill.",
        },
      ],
    },
    {
      name: "ALLY",
      tabs: [
        {
          name: "BAR",
          title: "ALLY BAR",
          description:
            "Ally colors remain independently controlled from enemy and neutral healthbars.",
        },
        {
          name: "FEEDBACK",
          title: "ALLY FEEDBACK",
          description:
            "Healing and damage-delta colors are owned by the ally healthbar path.",
        },
        {
          name: "SHIELDS",
          title: "ALLY SHIELDS",
          description:
            "Ally bullet-shield styling remains isolated from the primary bar fill.",
        },
      ],
    },
    {
      name: "READOUT",
      tabs: [
        {
          name: "HP NUMBER",
          title: "HP NUMBER",
          description:
            "Visibility, format, size, and text color settings will be owned here.",
        },
        {
          name: "LEVEL & PIPS",
          title: "LEVEL & PIPS",
          description:
            "Level styling and health-pip visibility remain distinct readout concerns.",
        },
        {
          name: "PLACEMENT",
          title: "READOUT PLACEMENT",
          description:
            "Number position and offsets will share one precise placement surface.",
        },
      ],
    },
    {
      name: "EFFECTS",
      tabs: [
        {
          name: "ENEMY PULSE",
          title: "ENEMY PULSE",
          description:
            "Enemy low-health pulse timing, intensity, and color will be configured together.",
        },
        {
          name: "ALLY PULSE",
          title: "ALLY PULSE",
          description:
            "Ally pulse behavior remains independent from the enemy warning path.",
        },
        {
          name: "KILL MARKER",
          title: "KILL MARKER",
          description:
            "Threshold, width, and color will be owned by one marker control group.",
        },
      ],
    },
  ];

  var CATEGORY_BUTTON_IDS = [
    "HPColorsCategoryOverview",
    "HPColorsCategoryEnemy",
    "HPColorsCategoryAlly",
    "HPColorsCategoryReadout",
    "HPColorsCategoryEffects",
  ];

  var context = $.GetContextPanel();
  var state = {
    booted: false,
    open: false,
    peeking: false,
    categoryIndex: 0,
    tabIndex: 0,
  };
  var ui = {
    categoryButtons: [],
    tabButtons: [],
    tabLabels: [],
  };

  function isValid(panel) {
    try {
      return !!(panel && (!panel.IsValid || panel.IsValid()));
    } catch (error) {
      return false;
    }
  }

  function find(id) {
    try {
      return context && context.FindChildTraverse
        ? context.FindChildTraverse(id)
        : null;
    } catch (error) {
      return null;
    }
  }

  function setClass(panel, className, enabled) {
    if (!isValid(panel)) return;
    try {
      panel.SetHasClass(className, !!enabled);
    } catch (error) {}
  }

  function setText(panel, value) {
    if (!isValid(panel)) return;
    try {
      if (panel.text !== value) panel.text = value;
    } catch (error) {}
  }

  function setPanelEvent(panel, eventName, handler) {
    if (!isValid(panel)) return;
    try {
      panel.SetPanelEvent(eventName, handler);
    } catch (error) {}
  }

  function focus(panel) {
    if (!isValid(panel)) return;
    try {
      if (panel.SetFocus) panel.SetFocus();
    } catch (error) {}
  }

  function bindCategory(index) {
    setPanelEvent(ui.categoryButtons[index], "onactivate", function () {
      selectCategory(index);
    });
  }

  function bindTab(index) {
    setPanelEvent(ui.tabButtons[index], "onactivate", function () {
      selectTab(index);
    });
  }

  function renderNavigation() {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category) return;

    setText(ui.headerCategory, category.name);
    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++) {
      setClass(
        ui.categoryButtons[categoryIndex],
        "Selected",
        categoryIndex === state.categoryIndex,
      );
    }

    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++) {
      var tab = category.tabs[tabIndex];
      setClass(ui.tabButtons[tabIndex], "Available", !!tab);
      setClass(
        ui.tabButtons[tabIndex],
        "Selected",
        !!tab && tabIndex === state.tabIndex,
      );
      setText(ui.tabLabels[tabIndex], tab ? tab.name : "");
    }

    var activeTab = category.tabs[state.tabIndex];
    if (!activeTab) return;
    setText(ui.pageEyebrow, category.name + " / " + activeTab.name);
    setText(ui.pageTitle, activeTab.title);
    setText(ui.pageDescription, activeTab.description);
  }

  function selectCategory(index) {
    if (index < 0 || index >= CATEGORY_DEFS.length) return;
    if (state.categoryIndex === index && state.tabIndex === 0) return;
    state.categoryIndex = index;
    state.tabIndex = 0;
    renderNavigation();
  }

  function selectTab(index) {
    var category = CATEGORY_DEFS[state.categoryIndex];
    if (!category || index < 0 || index >= category.tabs.length) return;
    if (state.tabIndex === index) return;
    state.tabIndex = index;
    renderNavigation();
  }

  function endPeek() {
    if (!state.peeking) return;
    state.peeking = false;
    setClass(ui.editorRoot, "Peeking", false);
    focus(ui.peekButton);
  }

  function beginPeek() {
    if (!state.open || state.peeking) return;
    state.peeking = true;
    setClass(ui.editorRoot, "Peeking", true);
    focus(ui.peekCapture);
  }

  function closeEditor() {
    if (!state.open) return;
    endPeek();
    state.open = false;
    setClass(ui.editorRoot, "Open", false);
    setClass(ui.escapeRoot, "EditorOpen", false);
    focus(ui.menuButton);
    $.Msg("[HP Colors Rewrite] menu close");
  }

  function openEditor() {
    if (!state.booted || state.open) return;
    state.open = true;
    state.peeking = false;
    setClass(ui.editorRoot, "Peeking", false);
    setClass(ui.editorRoot, "Open", true);
    setClass(ui.escapeRoot, "EditorOpen", true);
    renderNavigation();
    focus(ui.editorShell);
    $.Msg("[HP Colors Rewrite] menu open");
  }

  function cancel() {
    if (state.open) {
      closeEditor();
      return;
    }
    try {
      if (typeof CitadelResumePlaying === "function") CitadelResumePlaying();
    } catch (error) {
      $.Msg("[HP Colors Rewrite] resume failed: " + String(error));
    }
  }

  function resolvePanels() {
    var marker = find("LeftStripeBlur");
    try {
      ui.escapeRoot =
        marker && marker.GetParent ? marker.GetParent() : context;
    } catch (error) {
      ui.escapeRoot = context;
    }
    ui.menuButton = find("HPColorsMenuButton");
    ui.editorRoot = find("HPColorsEditorRoot");
    ui.editorShell = find("HPColorsEditorShell");
    ui.peekCapture = find("HPColorsPeekCapture");
    ui.peekButton = find("HPColorsPeekButton");
    ui.doneButton = find("HPColorsDoneButton");
    ui.headerCategory = find("HPColorsHeaderCategory");
    ui.pageEyebrow = find("HPColorsPageEyebrow");
    ui.pageTitle = find("HPColorsPageTitle");
    ui.pageDescription = find("HPColorsPageDescription");

    for (var categoryIndex = 0; categoryIndex < CATEGORY_BUTTON_IDS.length; categoryIndex++) {
      ui.categoryButtons.push(find(CATEGORY_BUTTON_IDS[categoryIndex]));
    }
    for (var tabIndex = 0; tabIndex < 3; tabIndex++) {
      ui.tabButtons.push(find("HPColorsTab" + tabIndex));
      ui.tabLabels.push(find("HPColorsTabLabel" + tabIndex));
    }

    return (
      isValid(ui.escapeRoot) &&
      isValid(ui.menuButton) &&
      isValid(ui.editorRoot) &&
      isValid(ui.editorShell) &&
      isValid(ui.peekCapture) &&
      isValid(ui.peekButton) &&
      isValid(ui.doneButton) &&
      isValid(ui.headerCategory) &&
      isValid(ui.pageEyebrow) &&
      isValid(ui.pageTitle) &&
      isValid(ui.pageDescription)
    );
  }

  function boot() {
    if (state.booted) return;
    if (!resolvePanels()) {
      $.Msg("[HP Colors Rewrite] menu boot failed: required panel missing");
      return;
    }

    setPanelEvent(ui.menuButton, "onactivate", openEditor);
    setPanelEvent(ui.doneButton, "onactivate", closeEditor);
    setPanelEvent(ui.peekButton, "onmousedown", beginPeek);
    setPanelEvent(ui.peekButton, "onmouseup", endPeek);
    setPanelEvent(ui.peekCapture, "onactivate", endPeek);
    setPanelEvent(ui.peekCapture, "onmouseup", endPeek);

    for (var categoryIndex = 0; categoryIndex < ui.categoryButtons.length; categoryIndex++) {
      bindCategory(categoryIndex);
    }
    for (var tabIndex = 0; tabIndex < ui.tabButtons.length; tabIndex++) {
      bindTab(tabIndex);
    }

    state.booted = true;
    renderNavigation();
    $.Msg("[HP Colors Rewrite] menu ready");
  }

  $.HPColorsMenuBoot = boot;
  $.HPColorsMenuCancel = cancel;
})();
