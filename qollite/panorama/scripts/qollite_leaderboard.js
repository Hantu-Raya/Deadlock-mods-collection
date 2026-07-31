(function () {
  'use strict';

  if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) return;
  var qolLite = GameUI.CustomUIConfig().QolLite;
  if (!qolLite || !qolLite.Runtime) return;

  var runtime = qolLite.Runtime;
  var generation = 0;
  var controls = null;
  var searchInput = null;

  function playerName(row) {
    if (!row || typeof row.FindChildrenWithClassTraverse !== 'function') return '';
    var labels = row.FindChildrenWithClassTraverse('playerRatingName');
    return labels.length ? String(labels[0].text || '') : '';
  }

  function applyFilter() {
    var players = runtime.find('PlayersContainer');
    if (!players) return;

    var query = String(searchInput && searchInput.text || '').toLowerCase();
    for (var index = 0; index < players.GetChildCount(); index += 1) {
      var row = players.GetChild(index);
      var matches = !query || playerName(row).toLowerCase().indexOf(query) !== -1;
      runtime.setClass(row, 'qollite_leaderboard_hidden', !matches);
    }
  }

  function scheduleRefresh(currentGeneration) {
    runtime.schedule('leaderboard', 0.25, function () {
      if (currentGeneration !== generation) return;
      mount();
      scheduleRefresh(currentGeneration);
    });
  }

  function mount() {
    var rating = runtime.find('PlayersRatingContainer');
    var players = runtime.find('PlayersContainer');
    if (!rating || !players || typeof $ === 'undefined' || !$.CreatePanel) return;

    controls = runtime.find('QolLiteLeaderboardSearch', rating);
    if (!controls) {
      controls = $.CreatePanel('Panel', rating, 'QolLiteLeaderboardSearch');
      if (typeof controls.AddClass === 'function') controls.AddClass('qollite_leaderboard_search');
      searchInput = $.CreatePanel('TextEntry', controls, 'QolLiteLeaderboardSearchInput');
      if (typeof searchInput.AddClass === 'function') searchInput.AddClass('qollite_leaderboard_search_input');
      searchInput.placeholder = 'Search players';
      if (typeof searchInput.SetPanelEvent === 'function') {
        searchInput.SetPanelEvent('ontextentrychange', applyFilter);
      }
    } else {
      searchInput = runtime.find('QolLiteLeaderboardSearchInput', controls);
    }
    applyFilter();
  }

  function init() {
    generation += 1;
    runtime.cancel('leaderboard');
    mount();
    scheduleRefresh(generation);
  }

  runtime.register('leaderboard', {
    init: init,
    refresh: mount,
    destroy: function () {
      generation += 1;
      runtime.cancel('leaderboard');
      searchInput = null;
      applyFilter();
      if (controls && typeof controls.DeleteAsync === 'function') controls.DeleteAsync(0);
      controls = null;
    },
  });
})();
