"use strict";

function QolLiteLeaderboardFilterPlayers() {
    var searchInput = $.FindChildInContext("#PlayerSearchInput");
    if (!searchInput) return;

    var searchText = String(searchInput.text || "").toLowerCase();
    var playersContainer = $.FindChildInContext("#PlayersContainer");
    if (!playersContainer) return;

    for (var i = 0; i < playersContainer.GetChildCount(); i++) {
        var playerPanel = playersContainer.GetChild(i);
        if (!playerPanel) continue;

        var nameLabel = null;
        var labels = playerPanel.FindChildrenWithClassTraverse
            ? (playerPanel.FindChildrenWithClassTraverse("playerRatingName") || [])
            : [];
        if (labels.length > 0) {
            nameLabel = labels[0];
        } else if (playerPanel.GetChildCount && playerPanel.GetChildCount() > 0) {
            var infoRow = playerPanel.GetChild(0);
            if (infoRow && infoRow.GetChildCount && infoRow.GetChildCount() > 2) {
                nameLabel = infoRow.GetChild(2);
            }
        }

        if (nameLabel && typeof nameLabel.text === "string") {
            var playerName = nameLabel.text.toLowerCase();
            playerPanel.visible = (searchText.length === 0 || playerName.indexOf(searchText) !== -1);
        } else {
            playerPanel.visible = true;
        }
    }
}
