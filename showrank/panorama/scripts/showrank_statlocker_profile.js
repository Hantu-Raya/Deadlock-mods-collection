(() => {
  "use strict";

  var STATLOCKER_MATCHES_URL_PREFIX = "https://statlocker.gg/profile/";
  var STATLOCKER_MATCHES_URL_SUFFIX = "/matches";
  var STEAMID3_PATTERN = /\[U:1:(\d+)\]/i;

  function IsPanelValid(panel) {
    if (!panel) return false;
    if (!panel.IsValid) return true;
    try { return panel.IsValid(); } catch (e0) { return false; }
  }

  function FindAccountLabel(root) {
    if (!IsPanelValid(root) || !root.FindChildTraverse) return null;
    var accountPanel = null;
    try { accountPanel = root.FindChildTraverse("AccountID"); } catch (e0) { accountPanel = null; }
    if (!IsPanelValid(accountPanel) || !accountPanel.FindChildrenWithClassTraverse) return null;
    var labels = null;
    try { labels = accountPanel.FindChildrenWithClassTraverse("AccountID"); } catch (e1) { labels = null; }
    if (!labels || labels.length <= 0) return null;
    return IsPanelValid(labels[0]) ? labels[0] : null;
  }

  function ReadVisibleProfileId(root) {
    var label = FindAccountLabel(root);
    if (!IsPanelValid(label)) return "";
    var text = "";
    try { text = String(label.text || ""); } catch (e0) { text = ""; }
    text = text.replace(/^\s+|\s+$/g, "");
    if (!text) return "";
    var match = text.match(STEAMID3_PATTERN);
    if (match && match[1]) return match[1];
    return text.replace(/[^0-9]/g, "");
  }

  function OpenStatLockerUrl(url) {
    try {
      if (typeof SteamOverlayAPI !== "undefined" && SteamOverlayAPI && typeof SteamOverlayAPI.OpenURL === "function") {
        SteamOverlayAPI.OpenURL(url);
        return;
      }
    } catch (e0) {}
    try { $.DispatchEvent("SteamOverlayOpenURL", url); return; } catch (e1) {}
    try { $.DispatchEvent("ExternalBrowserGoToURL", url); } catch (e2) {}
  }

  function OpenStatLockerProfile(rootPanel) {
    var root = rootPanel || ($.GetContextPanel ? $.GetContextPanel() : null);
    var profileId = ReadVisibleProfileId(root);
    if (!profileId) return;
    OpenStatLockerUrl(STATLOCKER_MATCHES_URL_PREFIX + encodeURIComponent(profileId) + STATLOCKER_MATCHES_URL_SUFFIX);
  }

  function OpenDeadlockProfile(rootPanel) {
    var root = rootPanel || ($.GetContextPanel ? $.GetContextPanel() : null);
    var profileId = ReadVisibleProfileId(root);
    if (!profileId) return;
    var accountId = Number(profileId);
    if (!isFinite(accountId) || accountId <= 0) return;

    try {
      if (typeof CitadelShowProfilePageForAccount === "function") {
        CitadelShowProfilePageForAccount(accountId);
        return;
      }
    } catch (e0) {}

    try { $.DispatchEvent("CitadelShowProfilePageForAccount", accountId); } catch (e1) {}
  }

  $.ShowRankOpenStatlockerProfile = OpenStatLockerProfile;
  $.ShowRankOpenDeadlockProfile = OpenDeadlockProfile;

  var contextPanel = $.GetContextPanel ? $.GetContextPanel() : null;
  if (IsPanelValid(contextPanel)) {
    contextPanel.ShowRankOpenStatlockerProfile = OpenStatLockerProfile;
    contextPanel.ShowRankOpenDeadlockProfile = OpenDeadlockProfile;
  }
})();
