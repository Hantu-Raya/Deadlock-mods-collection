(function () {
    "use strict";

    var STEAM64_BASE = "76561197960265728";
    var STARTUP_REFRESH_DELAYS = [0.25, 1.0];
    var PROFILE_REFRESH_DELAYS = [0.05, 0.15, 0.3, 0.6, 1.0, 1.5, 2.0];
    var ESCAPE_WITNESS_DELAYS = [0.05, 0.15, 0.3, 0.6];
    var ESCAPE_ROW_DELAYS = [0.25, 1.0, 2.0, 4.0, 8.0];
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
        var found;

        if (!isValid(panel) || !panel.FindChildrenWithClassTraverse) {
            return null;
        }

        try {
            found = panel.FindChildrenWithClassTraverse(className);
            return found || [];
        } catch (ignore) {
            return null;
        }
    }
    function trace(message) {
        try {
            $.Msg("[BareRankTrace] " + message);
        } catch (ignore) {
        }
    }



    function readText(panel) {
        try {
            return typeof panel.text === "string" ? panel.text : null;
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


    function readAttribute(panel, name) {
        try {
            return panel.GetAttributeString(name, "");
        } catch (ignore) {
            return null;
        }
    }

    function normalizeAccount(value) {
        if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
            return null;
        }

        if (value.length > 10 || (value.length === 10 && value > "4294967295")) {
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

        result = result.replace(/^0+/, "");
        return normalizeAccount(result);
    }

    function normalizeIdentity(value) {
        var steam3;

        if (typeof value !== "string") {
            return null;
        }

        steam3 = /^\[U:1:([1-9][0-9]*)\]$/.exec(value);
        if (!steam3) {
            steam3 = /^U:1:([1-9][0-9]*)$/.exec(value);
        }
        if (steam3) {
            return normalizeAccount(steam3[1]);
        }

        if (/^[1-9][0-9]*$/.test(value) && value.length === STEAM64_BASE.length) {
            return subtractSteamBase(value);
        }

        return normalizeAccount(value);
    }

    function getState(panel) {
        var documentRoot = getDocumentRoot(panel);
        var shared;

        if (!documentRoot) {
            return null;
        }

        try {
            shared = documentRoot.__showrank_barebones_state_v1;
            if (!shared) {
                shared = {
                    profiles: [],
                    topbars: [],
                    rows: [],
                    documentRoot: null,
                    escapeToken: 0,
                    escapeOpenLatched: false,
                    escape: null
                };
                documentRoot.__showrank_barebones_state_v1 = shared;
            }
            return shared;
        } catch (ignore) {
            return null;
        }
    }

    function register(list, record) {
        var index;

        for (index = list.length - 1; index >= 0; index -= 1) {
            if (!isValid(list[index].root)) {
                list.splice(index, 1);
            } else if (list[index].root === record.root) {
                list[index] = record;
                return record;
            }
        }

        list.push(record);
        return record;
    }
    function registerCurrent(record, listName) {
        var shared;

        if (!record || !isValid(record.root)) {
            return record;
        }

        shared = getState(record.root);
        if (!shared || !shared[listName]) {
            return record;
        }

        state = shared;
        return register(shared[listName], record);
    }


    function clearRankImage(record) {
        if (!record) {
            return;
        }

        try {
            if (isValid(record.rankImage)) {
                record.rankImage.visible = false;
                record.rankImage.SetImage("");
            }
        } catch (ignore) {
        }

        record.shownAccount = null;
    }

    function applyRankImage(record, account) {
        if (!record || !isValid(record.rankImage)) {
            return;
        }

        try {
            record.rankImage.SetImage("https://api.deadlock-api.com/v1/players/" + account + "/rank-predict/image?format=webp");
            record.rankImage.visible = true;
            record.shownAccount = account;
        } catch (ignore) {
            record.shownAccount = null;
        }
    }

    function resolveProfileAccount(record) {
        var account = null;
        var hidden;
        var accountId;
        var steamId;

        function accept(raw) {
            var normalized;

            if (raw === "") {
                return true;
            }

            normalized = normalizeIdentity(raw);
            if (!normalized || (account && account !== normalized)) {
                return false;
            }

            account = normalized;
            return true;
        }

        if (!record || !isValid(record.root) || !isValid(record.accountLabel)) {
            return null;
        }

        hidden = readText(record.accountLabel);
        accountId = readAttribute(record.root, "accountid");
        steamId = readAttribute(record.root, "steamid");
        if (hidden === null || accountId === null || steamId === null) {
            return null;
        }

        if (!accept(hidden) || !accept(accountId) || !accept(steamId)) {
            return null;
        }

        return account;
    }

    function refreshProfile(record) {
        var account;

        if (!record || !isValid(record.root) || !isValid(record.accountLabel) || !isValid(record.rankImage)) {
            return;
        }
        registerCurrent(record, "profiles");

        account = resolveProfileAccount(record);
        if (!account) {
            if (record.shownAccount !== null || record.rankImage.visible !== false) {
                clearRankImage(record);
            }
            return;
        }

        if (record.shownAccount !== account) {
            if (record.shownAccount !== null) {
                clearRankImage(record);
            }
            applyRankImage(record, account);
        }
    }

    function schedule(delay, callback) {
        $.Schedule(delay, callback);
    }
    function scheduleRegistrationRefresh(record, callback, delay) {
        schedule(delay, function () {
            callback(record);
        });
    }

    function startRegistrationWatch(record, callback) {
        var index;

        callback(record);
        for (index = 0; index < STARTUP_REFRESH_DELAYS.length; index += 1) {
            scheduleRegistrationRefresh(record, callback, STARTUP_REFRESH_DELAYS[index]);
        }
    }


    function scheduleProfileRefresh(record, delay, token) {
        schedule(delay, function () {
            if (token === record.refreshToken) {
                refreshProfile(record);
            }
        });
    }

    function startProfileWatch(record, delays) {
        var index;
        var token;

        if (!record) {
            return;
        }

        token = record.refreshToken + 1;
        record.refreshToken = token;
        refreshProfile(record);
        for (index = 0; index < delays.length; index += 1) {
            scheduleProfileRefresh(record, delays[index], token);
        }
    }

    function refreshTopbar(record) {
        var hero;

        if (!record || !isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.rankImage)) {
            return "";
        }
        registerCurrent(record, "topbars");

        hero = normalizeHero(readText(record.heroLabel));
        if (record.hero !== hero) {
            clearRankImage(record);
            record.hero = hero;
        }

        return hero;
    }

    function clearTopbars() {
        var index;
        var record;

        if (!state) {
            return;
        }

        for (index = state.topbars.length - 1; index >= 0; index -= 1) {
            record = state.topbars[index];
            if (!isValid(record.root)) {
                state.topbars.splice(index, 1);
            } else {
                clearRankImage(record);
                record.hero = normalizeHero(readText(record.heroLabel));
            }
        }
    }

    function currentRowHero(record) {
        if (!record || !isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.mainContents)) {
            return "";
        }

        return normalizeHero(readText(record.heroLabel));
    }
    function refreshRow(record) {
        if (!record || !isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.mainContents)) {
            return;
        }

        registerCurrent(record, "rows");
    }


    function scanProfilesFromDocument() {
        var roots;
        var records = [];
        var index;
        var profileRoot;
        var accountLabel;

        if (!state || !isValid(state.documentRoot)) {
            return;
        }

        roots = findByClass(state.documentRoot, PROFILE_CARD_CLASS);
        if (roots === null) {
            return;
        }

        for (index = 0; index < roots.length; index += 1) {
            profileRoot = roots[index];
            accountLabel = findChild(profileRoot, "ShowRankBarebonesAccount", "Label");
            if (isValid(profileRoot) && isValid(accountLabel)) {
                records.push({
                    root: profileRoot,
                    accountLabel: accountLabel,
                    rankImage: findChild(profileRoot, "ShowRankBarebonesRankImage", "Image"),
                    shownAccount: null,
                    refreshToken: 0
                });
            }
        }

        state.profiles = records;
    }

    function scanTopbarsFromDocument() {
        var roots;
        var records = [];
        var index;
        var topbarRoot;
        var heroLabel;
        var rankImage;

        if (!state || !isValid(state.documentRoot)) {
            return;
        }

        roots = findByClass(state.documentRoot, TOPBAR_PLAYER_CLASS);
        if (roots === null) {
            return;
        }

        for (index = 0; index < roots.length; index += 1) {
            topbarRoot = roots[index];
            heroLabel = findChild(topbarRoot, "ShowRankBarebonesTopbarHero", "Label");
            rankImage = findChild(topbarRoot, "ShowRankBarebonesTopbarRankImage", "Image");
            if (isValid(topbarRoot) && isValid(heroLabel) && isValid(rankImage)) {
                records.push({
                    root: topbarRoot,
                    heroLabel: heroLabel,
                    rankImage: rankImage,
                    hero: "",
                    shownAccount: null
                });
            }
        }

        state.topbars = records;
    }

    function scanRowsFromDocument() {
        var roots;
        var records = [];
        var index;
        var rowRoot;
        var heroLabel;
        var mainContents;

        if (!state || !isValid(state.documentRoot)) {
            return;
        }

        roots = findByClass(state.documentRoot, PLAYER_ROW_CLASS);
        if (roots === null) {
            return;
        }

        for (index = 0; index < roots.length; index += 1) {
            rowRoot = roots[index];
            heroLabel = findChild(rowRoot, "ShowRankBarebonesRowHero", "Label");
            mainContents = findChild(rowRoot, "MainContents", "Panel");
            if (isValid(rowRoot) && isValid(heroLabel) && isValid(mainContents)) {
                records.push({
                    root: rowRoot,
                    heroLabel: heroLabel,
                    mainContents: mainContents,
                    hero: "",
                    account: null
                });
            }
        }

        state.rows = records;
    }
    function traceTopbarHover(record) {
        var index;
        var current;
        var sessionRows;

        state = getState(record && record.root);
        if (state) {
            state.documentRoot = getDocumentRoot(record.root);
        }

        trace("hover id=" + String(record && record.root && record.root.id || "") +
            " hero=" + String(record ? normalizeHero(readText(record.heroLabel) || "") : "") +
            " document=" + String(state && state.documentRoot && state.documentRoot.id || "") +
            " classScan=" + String(!!(state && state.documentRoot && state.documentRoot.FindChildrenWithClassTraverse)));

        if (!state || !isValid(state.documentRoot)) {
            trace("shared HUD document unavailable");
            return;
        }

        scanProfilesFromDocument();
        scanTopbarsFromDocument();
        scanRowsFromDocument();
        trace("discovered topbars=" + state.topbars.length +
            " playerListRows=" + state.rows.length +
            " profiles=" + state.profiles.length);

        for (index = 0; index < state.topbars.length; index += 1) {
            current = state.topbars[index];
            trace("topbar[" + index + "] id=" + String(current.root.id || "") +
                " hero=" + String(normalizeHero(readText(current.heroLabel) || "")) +
                " image=" + String(isValid(current.rankImage)));
        }

        for (index = 0; index < state.rows.length; index += 1) {
            current = state.rows[index];
            trace("playerList[" + index + "] id=" + String(current.root.id || "") +
                " hero=" + String(currentRowHero(current)));
        }

        for (index = 0; index < state.profiles.length; index += 1) {
            current = state.profiles[index];
            trace("profile[" + index + "] hidden=" + String(readText(current.accountLabel) || "") +
                " accountid=" + String(readAttribute(current.root, "accountid") || "") +
                " steamid=" + String(readAttribute(current.root, "steamid") || "") +
                " resolved=" + String(resolveProfileAccount(current) || ""));
        }

        sessionRows = state.escape && state.escape.rows ? state.escape.rows : [];
        trace("activePlayerMap rows=" + sessionRows.length +
            " index=" + String(state.escape ? state.escape.index : "") +
            " started=" + String(!!(state.escape && state.escape.started)));
        for (index = 0; index < sessionRows.length; index += 1) {
            current = sessionRows[index];
            trace("activePlayer[" + index + "] hero=" + String(currentRowHero(current)) +
                " account=" + String(current.account || ""));
        }
    }


    function snapshotProfiles() {
        var index;
        var profiles = [];
        var accounts = [];
        var record;
        scanProfilesFromDocument();

        if (!state) {
            return {
                profiles: profiles,
                accounts: accounts
            };
        }

        for (index = state.profiles.length - 1; index >= 0; index -= 1) {
            record = state.profiles[index];
            if (!isValid(record.root)) {
                state.profiles.splice(index, 1);
            } else {
                profiles.push(record);
                accounts.push(resolveProfileAccount(record));
            }
        }

        return {
            profiles: profiles,
            accounts: accounts
        };
    }

    function changedProfileAccount(snapshot) {
        var index;
        var snapshotIndex;
        var record;
        var beforeIndex;
        var account;
        var accepted = null;
        var count = 0;

        scanProfilesFromDocument();

        for (index = 0; state && index < state.profiles.length; index += 1) {
            record = state.profiles[index];
            if (!isValid(record.root)) {
                continue;
            }

            snapshotIndex = -1;
            for (beforeIndex = 0; beforeIndex < snapshot.profiles.length; beforeIndex += 1) {
                if (snapshot.profiles[beforeIndex].root === record.root) {
                    snapshotIndex = beforeIndex;
                    break;
                }
            }

            account = resolveProfileAccount(record);
            if (account && (snapshotIndex < 0 || account !== snapshot.accounts[snapshotIndex])) {
                accepted = account;
                count += 1;
                if (count > 1) {
                    return null;
                }
            }
        }

        return count === 1 ? accepted : null;
    }

    function escapeIsCurrent(session, token) {
        if (!state || state.escape !== session || state.escapeToken !== token || !isValid(session.root)) {
            return false;
        }

        return isEscapeMenuOpen(session.root);
    }

    function scheduleEscape(delay, session, token, callback) {
        schedule(delay, function () {
            if (escapeIsCurrent(session, token)) {
                callback();
            }
        });
    }

    function renderTopbarMatches(session) {
        var topbarCounts = Object.create(null);
        var rowCounts = Object.create(null);
        var rowByHero = Object.create(null);
        var index;
        var record;
        var hero;

        scanTopbarsFromDocument();
        if (!escapeIsCurrent(session, session.token)) {
            return;
        }

        for (index = 0; index < state.topbars.length; index += 1) {
            record = state.topbars[index];
            hero = refreshTopbar(record);
            if (hero) {
                topbarCounts[hero] = (topbarCounts[hero] || 0) + 1;
            }
        }

        for (index = 0; index < session.rows.length; index += 1) {
            record = session.rows[index];
            hero = currentRowHero(record);
            if (hero) {
                rowCounts[hero] = (rowCounts[hero] || 0) + 1;
                rowByHero[hero] = record;
            }
        }

        for (index = 0; index < state.topbars.length; index += 1) {
            record = state.topbars[index];
            hero = record.hero;
            if (hero && topbarCounts[hero] === 1 && rowCounts[hero] === 1) {
                rowByHero[hero].hero = hero;
                if (rowByHero[hero].account) {
                    applyRankImage(record, rowByHero[hero].account);
                }
            }
        }
    }

    function finishEscape(session) {
        if (!escapeIsCurrent(session, session.token)) {
            return;
        }

        renderTopbarMatches(session);
        session.finished = true;
    }

    function inspectRow(session, record, snapshot, attempt) {
        var account;

        if (!escapeIsCurrent(session, session.token)) {
            return;
        }

        account = changedProfileAccount(snapshot);
        if (account) {
            record.account = account;
            session.index += 1;
            probeNextRow(session);
            return;
        }

        if (attempt < ESCAPE_WITNESS_DELAYS.length) {
            scheduleEscape(ESCAPE_WITNESS_DELAYS[attempt], session, session.token, function () {
                inspectRow(session, record, snapshot, attempt + 1);
            });
            return;
        }

        session.index += 1;
        probeNextRow(session);
    }

    function probeNextRow(session) {
        var record;
        var snapshot;

        if (!escapeIsCurrent(session, session.token)) {
            return;
        }

        if (session.index >= session.rows.length) {
            finishEscape(session);
            return;
        }

        record = session.rows[session.index];
        record.account = null;
        record.hero = currentRowHero(record);
        if (!isValid(record.mainContents)) {
            session.index += 1;
            probeNextRow(session);
            return;
        }

        snapshot = snapshotProfiles();
        try {
            $.DispatchEvent("Activated", record.mainContents, "mouse");
        } catch (ignore) {
            session.index += 1;
            probeNextRow(session);
            return;
        }

        scheduleEscape(ESCAPE_WITNESS_DELAYS[0], session, session.token, function () {
            inspectRow(session, record, snapshot, 1);
        });
    }

    function collectEscapeRows(session, attempt) {
        var index;
        var record;

        scanRowsFromDocument();
        if (!escapeIsCurrent(session, session.token) || session.started) {
            return;
        }

        session.rows = [];
        for (index = 0; index < state.rows.length; index += 1) {
            record = state.rows[index];
            if (currentRowHero(record)) {
                session.rows.push(record);
            }
        }

        if (session.rows.length > 0 || attempt >= ESCAPE_ROW_DELAYS.length) {
            session.started = true;
            probeNextRow(session);
            return;
        }

        scheduleEscape(ESCAPE_ROW_DELAYS[attempt], session, session.token, function () {
            collectEscapeRows(session, attempt + 1);
        });
    }


    function startEscapePass(escapeRoot) {
        var playersTab;
        var session;
        state = getState(escapeRoot);
        if (state) {
            state.documentRoot = getDocumentRoot(escapeRoot);
        }
        if (!state || !isValid(escapeRoot)) {
            return;
        }
        if (!isEscapeMenuOpen(escapeRoot)) {
            state.escapeOpenLatched = false;
            if (state.escape) {
                state.escapeToken += 1;
                state.escape = null;
            }
            return;
        }
        if (state.escapeOpenLatched) {
            return;
        }
        state.escapeOpenLatched = true;

        state.escapeToken += 1;
        session = {
            token: state.escapeToken,
            root: escapeRoot,
            rows: [],
            index: 0,
            started: false,
            finished: false
        };
        state.escape = session;
        clearTopbars();

        playersTab = findChild(escapeRoot, "PlayersTab");
        if (isValid(playersTab)) {
            try {
                $.DispatchEvent("Activated", playersTab);
            } catch (ignore) {
            }
        }

        collectEscapeRows(session, 0);
    }
    function resetEscapePassAfterClose(escapeRoot) {
        state = getState(escapeRoot);
        if (!state || isEscapeMenuOpen(escapeRoot)) {
            return;
        }

        state.escapeOpenLatched = false;
        state.escapeToken += 1;
        state.escape = null;
    }


    state = getState(root);

    if (root && root.paneltype === "CitadelProfileCard") {
        var profileRecord = {
            root: root,
            accountLabel: findChild(root, "ShowRankBarebonesAccount", "Label"),
            rankImage: findChild(root, "ShowRankBarebonesRankImage", "Image"),
            shownAccount: null,
            refreshToken: 0
        };

        profileRecord = registerCurrent(profileRecord, "profiles");
        root.ShowRankBarebonesRefresh = function () {
            startProfileWatch(profileRecord, PROFILE_REFRESH_DELAYS);
        };
        startProfileWatch(profileRecord, STARTUP_REFRESH_DELAYS);
    } else if (isValid(root) && root.paneltype === "CitadelHudTopBarPlayer") {
        var topbarRecord = {
            root: root,
            heroLabel: findChild(root, "ShowRankBarebonesTopbarHero", "Label"),
            rankImage: findChild(root, "ShowRankBarebonesTopbarRankImage", "Image"),
            hero: "",
            shownAccount: null
        };

        topbarRecord = registerCurrent(topbarRecord, "topbars");
        root.ShowRankBarebonesTopbarRefresh = function () {
            refreshTopbar(topbarRecord);
            traceTopbarHover(topbarRecord);
        };
        startRegistrationWatch(topbarRecord, refreshTopbar);
    } else if (isValid(root) && root.paneltype === "CitadelPlayersListEntry") {
        var rowRecord = {
            root: root,
            heroLabel: findChild(root, "ShowRankBarebonesRowHero", "Label"),
            mainContents: findChild(root, "MainContents", "Panel"),
            hero: "",
            account: null
        };

        rowRecord = registerCurrent(rowRecord, "rows");
        startRegistrationWatch(rowRecord, refreshRow);
    } else if (isValid(root) && root.paneltype === "CitadelHudEscapeMenu") {
        $.ShowRankBarebonesEscapeOpen = function () {
            startEscapePass(root);
        };
        $.ShowRankBarebonesEscapeOut = function () {
            schedule(0, function () {
                resetEscapePassAfterClose(root);
            });
        };
    }
}());
