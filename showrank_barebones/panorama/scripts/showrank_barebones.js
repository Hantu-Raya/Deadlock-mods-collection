(function () {
    "use strict";

    var STEAM64_BASE = "76561197960265728";
    var STATLOCKER_MATCHES_URL_PREFIX = "https://statlocker.gg/profile/";
    var STATLOCKER_MATCHES_URL_SUFFIX = "/matches";
    var TEAM_AVERAGE_URL_PREFIX = "https://api.deadlock-api.com/v1/players/rank-predict/image?account_ids=";
    var TEAM_AVERAGE_URL_SUFFIX = "&format=webp";
    var TEAM_AVERAGE_ACCOUNTS = 6;
    var STARTUP_REFRESH_DELAYS = [0.25, 1.0];
    var PROFILE_REFRESH_DELAYS = [0.05, 0.15, 0.3, 0.6, 1.0, 1.5, 2.0];
    var ESCAPE_WITNESS_DELAYS = [0.05, 0.15, 0.3, 0.6];
    var ESCAPE_ROW_DELAYS = [0.25, 1.0, 2.0, 4.0, 8.0];
    var PROFILE_CONTEXT_CLOSE_DELAY = 0.5;
    var PROFILE_CARD_CLASS = "ShowRankBarebonesProfileCard";
    var TOPBAR_PLAYER_CLASS = "ShowRankBarebonesTopbarPlayer";
    var PLAYER_ROW_CLASS = "ShowRankBarebonesPlayerRow";
    var root = $.GetContextPanel();
    var state;

    function isValid(panel) {
        try {
            return !!(panel && panel.IsValid && panel.IsValid());
        } catch (ignore) {
            return false;
        }
    }

    function getDocumentRoot(panel) {
        var current = panel;
        var parent;
        var depth = 0;
        if (!isValid(current)) {
            return null;
        }
        while (depth < 64) {
            try {
                parent = current.GetParent && current.GetParent();
            } catch (ignore) {
                parent = null;
            }
            if (!isValid(parent)) {
                break;
            }
            current = parent;
            depth += 1;
        }
        return current;
    }

    function isEscapeMenuOpen(escapeRoot) {
        var current = escapeRoot;
        var parent;
        var depth = 0;
        while (isValid(current) && depth < 8) {
            try {
                if (current.paneltype === "CitadelHud" && current.id === "Hud") {
                    return !!(current.BHasClass && current.BHasClass("ShowEscapeMenu"));
                }
                parent = current.GetParent && current.GetParent();
            } catch (ignore) {
                return false;
            }
            current = parent;
            depth += 1;
        }
        return false;
    }

    function isHideoutDocumentRoot(documentRoot) {
        try {
            return !!(isValid(documentRoot) && documentRoot.BHasClass &&
                documentRoot.BHasClass("connectedToHideout"));
        } catch (ignore) {
            return false;
        }
    }

    function findChild(panel, id, type) {
        var child;
        try {
            child = panel.FindChildTraverse(id);
            return child && (!type || child.paneltype === type) ? child : null;
        } catch (ignore) {
            return null;
        }
    }

    function findByClass(panel, className) {
        if (!isValid(panel) || !panel.FindChildrenWithClassTraverse) {
            return null;
        }
        try {
            return panel.FindChildrenWithClassTraverse(className) || [];
        } catch (ignore) {
            return null;
        }
    }

    function readText(panel) {
        try {
            return typeof panel.text === "string" ? panel.text : null;
        } catch (ignore) {
            return null;
        }
    }

    function readAttribute(panel, name) {
        try {
            return panel.GetAttributeString(name, "");
        } catch (ignore) {
            return null;
        }
    }

    function normalizeHero(value) {
        if (typeof value !== "string") {
            return "";
        }
        value = value.replace(/^\s+|\s+$/g, "").toLowerCase();
        return value && value !== "#" ? value : "";
    }

    function normalizeAccount(value) {
        if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) ||
                value.length > 10 || (value.length === 10 && value > "4294967295")) {
            return null;
        }
        return value;
    }

    function subtractSteamBase(value) {
        var index;
        var digit;
        var baseDigit;
        var borrow = 0;
        var result = "";
        if (value.length !== STEAM64_BASE.length || value < STEAM64_BASE) {
            return null;
        }
        for (index = value.length - 1; index >= 0; index -= 1) {
            digit = value.charCodeAt(index) - 48 - borrow;
            baseDigit = STEAM64_BASE.charCodeAt(index) - 48;
            if (digit < baseDigit) {
                digit += 10;
                borrow = 1;
            } else {
                borrow = 0;
            }
            result = String.fromCharCode(48 + digit - baseDigit) + result;
        }
        return normalizeAccount(result.replace(/^0+/, ""));
    }

    function normalizeIdentity(value) {
        var steam3;
        if (typeof value !== "string") {
            return null;
        }
        steam3 = /^\[U:1:([1-9][0-9]*)\]$/.exec(value) || /^U:1:([1-9][0-9]*)$/.exec(value);
        if (steam3) {
            return normalizeAccount(steam3[1]);
        }
        if (/^[1-9][0-9]*$/.test(value) && value.length === STEAM64_BASE.length) {
            return subtractSteamBase(value);
        }
        return normalizeAccount(value);
    }

    function setRankImage(record, account) {
        var image;

        if (!record || !isValid(record.rankImage)) {
            return;
        }
        image = record.rankImage;
        try {
            if (!account) {
                if (record.shownAccount !== null || image.visible !== false) {
                    image.SetImage("");
                }
                image.visible = false;
                record.shownAccount = null;
            } else {
                if (record.shownAccount !== account) {
                    image.SetImage("https://api.deadlock-api.com/v1/players/" + account +
                        "/rank-predict/image?format=webp");
                    record.shownAccount = account;
                }
                image.visible = true;
            }
        } catch (ignore) {
            record.shownAccount = null;
        }
    }

    function buildTeamAverageUrl(accounts) {
        var normalized = [];
        var seen = {};
        var index;
        var account;
        if (!accounts || accounts.length !== TEAM_AVERAGE_ACCOUNTS) { return ""; }
        for (index = 0; index < accounts.length; index += 1) {
            account = normalizeAccount(accounts[index]);
            if (!account || seen[account]) {
                return "";
            }
            seen[account] = true;
            normalized.push(account);
        }
        return TEAM_AVERAGE_URL_PREFIX + normalized.join(",") + TEAM_AVERAGE_URL_SUFFIX;
    }

    function setTeamAverageImage(documentRoot, side, accounts) {
        var image = findChild(documentRoot, side === "friendly" ?
            "ShowRankBarebonesAverageFriendlyImage" : "ShowRankBarebonesAverageEnemyImage", "Image");
        var url = buildTeamAverageUrl(accounts);
        if (!isValid(image)) {
            return false;
        }
        try {
            if (!url) {
                if (image.__showrankBarebonesAverageUrl) {
                    image.SetImage("");
                }
                image.__showrankBarebonesAverageUrl = "";
                return false;
            }
            if (image.__showrankBarebonesAverageUrl !== url) {
                image.SetImage(url);
                image.__showrankBarebonesAverageUrl = url;
            }
            return true;
        } catch (ignore) {
            return false;
        }
    }

    function clearTeamAverages(documentRoot) {
        setTeamAverageImage(documentRoot, "friendly");
        setTeamAverageImage(documentRoot, "enemy");
    }

    function updateTeamAverages(shared) {
        var accounts = { friendly: [], enemy: [] };
        var seen = { friendly: {}, enemy: {} };
        var index;
        var record;
        var side;
        var account;
        if (!shared || shared.topbars.length !== 12) {
            clearTeamAverages(shared && shared.documentRoot);
            return false;
        }
        for (index = 0; index < shared.topbars.length; index += 1) {
            record = shared.topbars[index];
            side = record.teamSide;
            account = normalizeAccount(record.shownAccount);
            if ((side !== "friendly" && side !== "enemy") || !account || seen[side][account]) {
                clearTeamAverages(shared.documentRoot);
                return false;
            }
            seen[side][account] = true;
            accounts[side].push(account);
        }
        if (!setTeamAverageImage(shared.documentRoot, "friendly", accounts.friendly) ||
                !setTeamAverageImage(shared.documentRoot, "enemy", accounts.enemy)) {
            clearTeamAverages(shared.documentRoot);
            return false;
        }
        return true;
    }

    function clearCachedTopbars(shared) {
        var index;
        for (index = 0; shared && index < shared.completedTopbars.length; index += 1) {
            setRankImage(shared.completedTopbars[index], null);
        }
    }

    function clearTopbars(shared) {
        var index;
        if (!shared) {
            return;
        }
        for (index = 0; index < shared.topbars.length; index += 1) {
            setRankImage(shared.topbars[index], null);
        }
        clearCachedTopbars(shared);
        clearTeamAverages(shared.documentRoot);
    }

    function resetProbeCache(shared) {
        if (!shared) {
            return;
        }
        clearTopbars(shared);
        shared.probeCompleted = false;
        shared.completedTopbars = [];
        shared.topbars = [];
        shared.escapeOpenLatched = false;
        if (shared.escape) {
            shared.escapeToken += 1;
            shared.escape = null;
        }
    }

    function getState(panel) {
        var documentRoot = getDocumentRoot(panel);
        var shared;
        if (!documentRoot) { return null; }
        try {
            shared = documentRoot.__showrank_barebones_state_v1;
            if (!shared) {
                shared = {
                    documentRoot: documentRoot, escapeToken: 0, escapeOpenLatched: false,
                    escape: null, probeCompleted: false, completedTopbars: [], topbars: []
                };
                documentRoot.__showrank_barebones_state_v1 = shared;
            }
            shared.documentRoot = documentRoot;
            if (isHideoutDocumentRoot(documentRoot)) { resetProbeCache(shared); }
            return shared;
        } catch (ignore) { return null; }
    }

    function resolveProfileAccount(record) {
        var account = null;
        var hidden;
        var accountId;
        var steamId;
        function accept(raw) {
            var normalized;
            if (raw === "") { return true; }
            normalized = normalizeIdentity(raw);
            if (!normalized || (account && account !== normalized)) { return false; }
            account = normalized;
            return true;
        }
        if (!record || !isValid(record.root) || !isValid(record.accountLabel)) { return null; }
        hidden = readText(record.accountLabel);
        accountId = readAttribute(record.root, "accountid");
        steamId = readAttribute(record.root, "steamid");
        if (hidden === null || accountId === null || steamId === null ||
                !accept(hidden) || !accept(accountId) || !accept(steamId)) { return null; }
        return account;
    }

    function openStatlocker(record) {
        var account = resolveProfileAccount(record);
        var url;
        if (!account) { return false; }
        url = STATLOCKER_MATCHES_URL_PREFIX + encodeURIComponent(account) + STATLOCKER_MATCHES_URL_SUFFIX;
        try { $.DispatchEvent("ExternalBrowserGoToURL", url); return true; } catch (ignore) { return false; }
    }

    function copyAccountId(record) {
        var account = resolveProfileAccount(record);
        if (!account) { return false; }
        try { $.DispatchEvent("CopyStringToClipboard", account, account); return true; } catch (ignore) { return false; }
    }

    function refreshProfile(record) {
        if (record && isValid(record.root) && isValid(record.accountLabel) && isValid(record.rankImage)) {
            setRankImage(record, resolveProfileAccount(record));
        }
    }

    function refreshTopbar(record) {
        var hero;
        if (!record || !isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.rankImage)) {
            return "";
        }
        hero = normalizeHero(readText(record.heroLabel));
        if (record.hero !== hero) { setRankImage(record, null); record.hero = hero; }
        return hero;
    }

    function schedule(delay, callback) { $.Schedule(delay, callback); }

    function continueProfileWatch(record, delays, token, index, elapsed) {
        if (index >= delays.length) { return; }
        schedule(delays[index] - elapsed, function () {
            if (token !== record.refreshToken) { return; }
            refreshProfile(record);
            continueProfileWatch(record, delays, token, index + 1, delays[index]);
        });
    }

    function startProfileWatch(record, delays) {
        var token;
        if (!record) { return; }
        token = record.refreshToken + 1;
        record.refreshToken = token;
        refreshProfile(record);
        continueProfileWatch(record, delays, token, 0, 0);
    }

    function startTopbarWatch(record) {
        var index;
        state = getState(record && record.root);
        refreshTopbar(record);
        for (index = 0; index < STARTUP_REFRESH_DELAYS.length; index += 1) {
            schedule(STARTUP_REFRESH_DELAYS[index], function () { refreshTopbar(record); });
        }
    }

    function detectTopbarTeamSide(panel) {
        var current = panel;
        var depth = 0;
        var id;
        while (isValid(current) && depth < 32) {
            id = String(current.id || "");
            if (id === "TeamFriendly") { return "friendly"; }
            if (id === "TeamEnemy") { return "enemy"; }
            try { current = current.GetParent && current.GetParent(); } catch (ignore) { current = null; }
            depth += 1;
        }
        return "";
    }

    function buildProfileRecord(panel) {
        var accountLabel = findChild(panel, "ShowRankBarebonesAccount", "Label");
        return isValid(panel) && isValid(accountLabel) ? { root: panel, accountLabel: accountLabel } : null;
    }

    function buildTopbarRecord(panel) {
        var heroLabels = findByClass(panel, "HeroName");
        var heroLabel = heroLabels && heroLabels.length === 1 ? heroLabels[0] : null;
        var rankImage = findChild(panel, "ShowRankBarebonesTopbarRankImage", "Image");
        return isValid(panel) && isValid(heroLabel) && isValid(rankImage) ? {
            root: panel, heroLabel: heroLabel, rankImage: rankImage, hero: "",
            shownAccount: null, teamSide: detectTopbarTeamSide(panel)
        } : null;
    }

    function buildRowRecord(panel) {
        var heroLabel = findChild(panel, "ShowRankBarebonesRowHero", "Label");
        var mainContents = findChild(panel, "MainContents", "Panel");
        var rankImage = findChild(panel, "ShowRankBarebonesPlayerListRankImage", "Image");
        return isValid(panel) && isValid(heroLabel) && isValid(mainContents) && isValid(rankImage) ? {
            root: panel, heroLabel: heroLabel, mainContents: mainContents,
            rankImage: rankImage, shownAccount: null, account: null
        } : null;
    }

    function scanRecords(documentRoot, className, build) {
        var roots = findByClass(documentRoot, className);
        var records = [];
        var index;
        var record;
        if (roots === null) { return null; }
        for (index = 0; index < roots.length; index += 1) {
            record = build(roots[index]);
            if (record) { records.push(record); }
        }
        return records;
    }

    function scanTopbars(shared) {
        var records = scanRecords(shared && shared.documentRoot, TOPBAR_PLAYER_CLASS, buildTopbarRecord);
        if (records === null) { return false; }
        shared.topbars = records;
        return true;
    }

    function cacheCompletedTopbars(shared) {
        var cached = [];
        var index;
        var record;
        for (index = 0; index < shared.topbars.length; index += 1) {
            record = shared.topbars[index];
            if (isValid(record.root)) {
                cached.push({ root: record.root, rankImage: record.rankImage, hero: record.hero, shownAccount: null });
            }
        }
        shared.completedTopbars = cached;
    }

    function completedTopbarsAreCurrent(shared) {
        var cached = shared && shared.completedTopbars;
        var index;
        var record;
        if (!cached || cached.length === 0 || !scanTopbars(shared) || shared.topbars.length !== cached.length) {
            return false;
        }
        for (index = 0; index < cached.length; index += 1) {
            record = shared.topbars[index];
            if (record.root !== cached[index].root ||
                    normalizeHero(readText(record.heroLabel)) !== cached[index].hero) { return false; }
        }
        return true;
    }

    function currentRowHero(record) {
        return record && isValid(record.root) && isValid(record.heroLabel) && isValid(record.mainContents) ?
            normalizeHero(readText(record.heroLabel)) : "";
    }

    function snapshotProfiles(documentRoot) {
        var profiles = scanRecords(documentRoot, PROFILE_CARD_CLASS, buildProfileRecord) || [];
        var index;
        for (index = 0; index < profiles.length; index += 1) {
            profiles[index].accountAtSnapshot = resolveProfileAccount(profiles[index]);
        }
        return profiles;
    }

    function changedProfileAccount(documentRoot, snapshot) {
        var profiles = scanRecords(documentRoot, PROFILE_CARD_CLASS, buildProfileRecord) || [];
        var index;
        var snapshotIndex;
        var beforeIndex;
        var account;
        var accepted = null;
        var count = 0;
        for (index = 0; index < profiles.length; index += 1) {
            snapshotIndex = -1;
            for (beforeIndex = 0; beforeIndex < snapshot.length; beforeIndex += 1) {
                if (snapshot[beforeIndex].root === profiles[index].root) { snapshotIndex = beforeIndex; break; }
            }
            account = resolveProfileAccount(profiles[index]);
            if (account && (snapshotIndex < 0 || account !== snapshot[snapshotIndex].accountAtSnapshot)) {
                accepted = account;
                count += 1;
                if (count > 1) { return null; }
            }
        }
        return count === 1 ? accepted : null;
    }

    function escapeIsCurrent(session, token) {
        var shared = session && session.shared;
        return !!(shared && shared.escape === session && shared.escapeToken === token &&
            isValid(session.root) && isEscapeMenuOpen(session.root));
    }

    function scheduleEscape(delay, session, token, callback) {
        schedule(delay, function () { if (escapeIsCurrent(session, token)) { callback(); } });
    }

    function closePlayerCards() {
        try {
            if (typeof DismissAllContextMenus === "function") { DismissAllContextMenus(); }
            else { $.DispatchEvent("DismissAllContextMenus"); }
        } catch (ignoreDismiss) {
        }
        try {
            if (typeof DropInputFocus === "function") { DropInputFocus(); }
            else { $.DispatchEvent("DropInputFocus"); }
        } catch (ignoreFocus) {
        }
    }

    function renderTopbarMatches(session, shouldRender) {
        var shared = session.shared;
        var topbarCounts = Object.create(null);
        var rowCounts = Object.create(null);
        var rowByHero = Object.create(null);
        var index;
        var record;
        var hero;
        var required = 0;
        var matched = 0;
        if (!scanTopbars(shared) || !escapeIsCurrent(session, session.token)) { return false; }
        for (index = 0; index < shared.topbars.length; index += 1) {
            record = shared.topbars[index];
            hero = refreshTopbar(record);
            if (hero) { topbarCounts[hero] = (topbarCounts[hero] || 0) + 1; }
        }
        for (index = 0; index < session.rows.length; index += 1) {
            record = session.rows[index];
            hero = currentRowHero(record);
            if (hero) {
                rowCounts[hero] = (rowCounts[hero] || 0) + 1;
                rowByHero[hero] = record;
            }
        }
        for (index = 0; index < shared.topbars.length; index += 1) {
            record = shared.topbars[index];
            hero = record.hero;
            if (hero && topbarCounts[hero] === 1) {
                required += 1;
                if (rowCounts[hero] === 1 && rowByHero[hero].account) {
                    matched += 1;
                    if (shouldRender) { setRankImage(record, rowByHero[hero].account); }
                }
            }
        }
        return (required === 6 || required === 12) && matched === required;
    }

    function finishEscapePass(session) {
        var shared = session.shared;
        var filled;
        if (session.finished || !escapeIsCurrent(session, session.token)) { return; }
        filled = renderTopbarMatches(session, true);
        session.finished = true;
        shared.probeCompleted = filled;
        shared.completedTopbars = [];
        if (filled) {
            cacheCompletedTopbars(shared);
            updateTeamAverages(shared);
        } else { clearTeamAverages(shared.documentRoot); }
        session.rows = [];
        if (shared.escape === session) { shared.escape = null; }
        schedule(PROFILE_CONTEXT_CLOSE_DELAY, function () {
            if (shared.escapeToken === session.token) { closePlayerCards(); }
        });
    }

    function completeRowProbe(session, record, account) {
        if (session.finished || !escapeIsCurrent(session, session.token)) { return; }
        session.index += 1;
        if (account) {
            record.account = account;
            setRankImage(record, account);
            if (renderTopbarMatches(session, false)) { finishEscapePass(session); return; }
        }
        if (session.index >= session.rows.length) { finishEscapePass(session); return; }
        probeNextRow(session);
    }

    function inspectRow(session, record, snapshot, attempt) {
        var account;
        if (session.finished || !escapeIsCurrent(session, session.token)) { return; }
        account = changedProfileAccount(session.shared.documentRoot, snapshot);
        if (account) { completeRowProbe(session, record, account); }
        else if (attempt < ESCAPE_WITNESS_DELAYS.length) {
            scheduleEscape(ESCAPE_WITNESS_DELAYS[attempt], session, session.token, function () {
                inspectRow(session, record, snapshot, attempt + 1);
            });
        } else { completeRowProbe(session, record, null); }
    }

    function probeNextRow(session) {
        var record;
        var snapshot;
        if (session.finished || !escapeIsCurrent(session, session.token)) { return; }
        if (session.index >= session.rows.length) { finishEscapePass(session); return; }
        record = session.rows[session.index];
        record.account = null;
        if (!isValid(record.mainContents)) {
            session.index += 1;
            probeNextRow(session);
            return;
        }
        snapshot = snapshotProfiles(session.shared.documentRoot);
        try { $.DispatchEvent("Activated", record.mainContents, "mouse"); }
        catch (ignore) { session.index += 1; probeNextRow(session); return; }
        scheduleEscape(ESCAPE_WITNESS_DELAYS[0], session, session.token, function () {
            inspectRow(session, record, snapshot, 1);
        });
    }

    function collectEscapeRows(session, attempt) {
        var rows = scanRecords(session.shared.documentRoot, PLAYER_ROW_CLASS, buildRowRecord) || [];
        var index;
        if (!escapeIsCurrent(session, session.token) || session.started) { return; }
        session.rows = [];
        for (index = 0; index < rows.length; index += 1) {
            setRankImage(rows[index], null);
            if (currentRowHero(rows[index])) { session.rows.push(rows[index]); }
        }
        if (session.rows.length > 0 || attempt >= ESCAPE_ROW_DELAYS.length) {
            session.started = true;
            probeNextRow(session);
        } else {
            scheduleEscape(ESCAPE_ROW_DELAYS[attempt], session, session.token, function () {
                collectEscapeRows(session, attempt + 1);
            });
        }
    }

    function startEscapePass(escapeRoot) {
        var shared = getState(escapeRoot);
        var playersTab;
        var session;
        state = shared || state;
        if (!shared || !isValid(escapeRoot) || isHideoutDocumentRoot(shared.documentRoot)) { return; }
        if (!isEscapeMenuOpen(escapeRoot)) {
            shared.escapeOpenLatched = false;
            if (shared.escape) { shared.escapeToken += 1; shared.escape = null; }
            return;
        }
        if (shared.probeCompleted) {
            if (completedTopbarsAreCurrent(shared)) { return; }
            resetProbeCache(shared);
        }
        if (shared.escapeOpenLatched) { return; }
        shared.escapeOpenLatched = true;
        shared.escapeToken += 1;
        session = {
            shared: shared, token: shared.escapeToken, root: escapeRoot, rows: [], index: 0,
            started: false, finished: false
        };
        shared.escape = session;
        clearTopbars(shared);
        playersTab = findChild(escapeRoot, "PlayersTab");
        if (isValid(playersTab)) {
            try { $.DispatchEvent("Activated", playersTab); } catch (ignore) {
            }
        }
        collectEscapeRows(session, 0);
    }

    function resetEscapePassAfterClose(escapeRoot) {
        var shared = getState(escapeRoot) || state;
        if (!shared || isEscapeMenuOpen(escapeRoot)) { return; }
        state = shared;
        shared.escapeOpenLatched = false;
        shared.escapeToken += 1;
        shared.escape = null;
    }

    if (root && root.paneltype === "CitadelProfileCard") {
        var profileRecord = {
            root: root,
            accountLabel: findChild(root, "ShowRankBarebonesAccount", "Label"),
            rankImage: findChild(root, "ShowRankBarebonesRankImage", "Image"),
            shownAccount: null,
            refreshToken: 0
        };
        root.ShowRankBarebonesRefresh = function () { startProfileWatch(profileRecord, PROFILE_REFRESH_DELAYS); };
        root.ShowRankBarebonesOpenStatlocker = function () { return openStatlocker(profileRecord); };
        root.ShowRankBarebonesCopyAccount = function () { return copyAccountId(profileRecord); };
        startProfileWatch(profileRecord, STARTUP_REFRESH_DELAYS);
    } else if (isValid(root) && root.paneltype === "CitadelHudTopBarPlayer") {
        var topbarHeroLabels = findByClass(root, "HeroName");
        var topbarRecord = {
            root: root,
            heroLabel: topbarHeroLabels && topbarHeroLabels.length === 1 ? topbarHeroLabels[0] : null,
            rankImage: findChild(root, "ShowRankBarebonesTopbarRankImage", "Image"),
            hero: "",
            shownAccount: null
        };
        startTopbarWatch(topbarRecord);
    } else if (isValid(root) && root.paneltype === "CitadelHudEscapeMenu") {
        $.ShowRankBarebonesEscapeOpen = function () { startEscapePass(root); };
        $.ShowRankBarebonesEscapeOut = function () {
            schedule(0, function () { resetEscapePassAfterClose(root); });
        };
    }
}());
