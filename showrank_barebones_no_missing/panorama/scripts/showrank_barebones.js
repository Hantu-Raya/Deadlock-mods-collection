(function () {
    "use strict";
    /* VIEWED_PROFILE_IDENTITY_POLICY: scripts/viewed-profile-identity-policy.js */
    var STATLOCKER_MATCHES_URL_PREFIX = "https://statlocker.gg/profile/";
    var STATLOCKER_MATCHES_URL_SUFFIX = "/matches";
    var RANK_API_BASE_URL = "https://api.deadlock-api.com/v1/players";
    var RANK_IMAGE_FORMAT = "webp";
    var TEAM_AVERAGE_ACCOUNTS = 6;
    var STARTUP_REFRESH_DELAYS = [0.25, 1.0];
    var PROFILE_REFRESH_DELAYS = [0.05, 0.15, 0.3, 0.6, 1.0, 1.5, 2.0];
    var PROFILE_HOVER_FAST_TICKS = 13;
    var PROFILE_HOVER_MAX_TICKS = 56;
    var PROFILE_HOVER_FAST_DELAY = 0.2;
    var PROFILE_HOVER_IDLE_DELAY = 1.0;
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
    function isHideoutDocumentRoot(panel) {
        var documentRoot;
        try {
            if (!isValid(panel)) {
                return false;
            }
            if (panelHasClass(panel, "connectedToHideout") || (panel.BAscendantHasClass &&
                panel.BAscendantHasClass("connectedToHideout"))) {
                return true;
            }
            documentRoot = getDocumentRoot(panel);
            return panelHasClass(documentRoot, "connectedToHideout") ||
                (!(documentRoot.paneltype === "CitadelHud" && documentRoot.id === "Hud") &&
                    panelHasClass(findChild(documentRoot, "Hud"), "connectedToHideout"));
        } catch (ignore) {
            return false;
        }
    }
    function findChild(panel, id, type) {
        var child;
        try {
            child = panel.FindChildTraverse(id);
            return child && (!type || child.paneltype === type) ? child: null;
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
        var text;
        try {
            text = panel.text;
            return typeof text === "string" ? text: null;
        } catch (ignore) {
        }
    }
    function panelHasClass(panel, className) {
        try {
            return !!(isValid(panel) && panel.BHasClass && panel.BHasClass(className));
        } catch (ignore) {
            return false;
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
        return value && value !== "#" ? value: "";
    }
    function canonicalAccountOrNull(value) {
        return viewedProfileIdentityPolicy.canonicalAccount(value) || null;
    }
    function rankImageUrl(account) {
        return RANK_API_BASE_URL + "/" + account + "/rank/image?format=" + RANK_IMAGE_FORMAT;
    }
    function teamAverageImageUrl(accounts) {
        return RANK_API_BASE_URL + "/rank/image?account_ids=" + accounts.join(",") + "&format=" + RANK_IMAGE_FORMAT;
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
                    if (record.shownAccount !== null) {
                        image.visible = false;
                        image.SetImage("");
                    }
                    record.shownAccount = null;
                    image.SetImage(rankImageUrl(account));
                    record.shownAccount = account;
                }
                image.visible = true;
            }
        } catch (ignore) {
            record.shownAccount = null;
        }
    }
    function setTeamAverageImage(documentRoot, side, url) {
        var image = findChild(documentRoot, side === "friendly" ? "ShowRankBarebonesAverageFriendlyImage":
            "ShowRankBarebonesAverageEnemyImage", "Image");
        url = typeof url === "string" ? url: "";
        if (!isValid(image)) {
            return false;
        }
        try {
            if (image.__showrankBarebonesAverageUrl !== url) {
                if (url || image.__showrankBarebonesAverageUrl) {
                    image.SetImage(url);
                }
                image.__showrankBarebonesAverageUrl = url;
            }
            return !!url;
        } catch (ignore) {
            return false;
        }
    }
    function clearTeamAverages(documentRoot) {
        setTeamAverageImage(documentRoot, "friendly");
        setTeamAverageImage(documentRoot, "enemy");
    }
    function rankTarget(panel, id) {
        var rankImage = findChild(panel, id, "Image");
        return isValid(rankImage) ? {
            rankImage: rankImage,
            shownAccount: null
        } : null;
    }
    function clearTopbarRecords(records) {
        var index;
        for (index = 0; records && index < records.length; index += 1) {
            setRankImage(records[index], null);
        }
    }
    function clearTopbars(shared) {
        var roots;
        var index;
        var target;
        if (!shared) {
            return;
        }
        roots = findByClass(shared.documentRoot, TOPBAR_PLAYER_CLASS);
        for (index = 0; roots && index < roots.length; index += 1) {
            target = rankTarget(roots[index], "ShowRankBarebonesTopbarRankImage");
            if (target) {
                setRankImage(target, null);
            }
        }
        clearTeamAverages(shared.documentRoot);
        shared.escapeRendered = false;
    }
    function releaseEscapeSession(shared) {
        var session = shared && shared.escape;
        if (!session) {
            return;
        }
        session.roster = null;
        session.lastPlan = null;
        session.intent = null;
        session.root = null;
        session.shared = null;
        shared.escape = null;
    }
    function resetProbeCache(shared) {
        if (!shared) {
            return;
        }
        if (shared.completedRoster || shared.escape || shared.escapeRendered) {
            clearTopbars(shared);
        }
        shared.completedRoster = null;
        shared.escapeOpenLatched = false;
        shared.escapeRoot = null;
        if (shared.escape) {
            shared.escapeToken += 1;
            releaseEscapeSession(shared);
        }
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
                    escapeToken: 0,
                    escapeOpenLatched: false,
                    escape: null,
                    escapeRoot: null,
                    completedRoster: null,
                    escapeRendered: false
                };
                documentRoot.__showrank_barebones_state_v1 = shared;
            }
            shared.documentRoot = documentRoot;
            if (isHideoutDocumentRoot(documentRoot)) {
                resetProbeCache(shared);
            }
            return shared;
        } catch (ignore) {
            return null;
        }
    }
    function resolveProfileAccount(record) {
        var identity;
        if (!record || !isValid(record.root) || !isValid(record.accountLabel)) {
            return null;
        }
        identity = viewedProfileIdentityPolicy.resolve({
            value: readText(record.accountLabel),
            format: "account"
        }, [
            {
                value: isValid(record.contextAccountLabel) ? readText(record.contextAccountLabel) : "",
                format: "account"
            },
            {
                value: readAttribute(record.root, "accountid"),
                format: "account"
            },
            {
                value: readAttribute(record.root, "steamid"),
                format: "identity"
            }
        ]);
        return identity.state === "valid" ? identity.account : null;
    }
    function openStatlocker(record) {
        var account = resolveProfileAccount(record);
        var url;
        if (!account) {
            return false;
        }
        url = STATLOCKER_MATCHES_URL_PREFIX + encodeURIComponent(account) + STATLOCKER_MATCHES_URL_SUFFIX;
        try {
            $.DispatchEvent("ExternalBrowserGoToURL", url);
            return true;
        } catch (ignore) {
            return false;
        }
    }
    function openPlayerProfile(record) {
        var account = resolveProfileAccount(record);
        if (!account) {
            return false;
        }
        try {
            $.DispatchEvent("CitadelShowProfilePageForAccount", Number(account));
            return true;
        } catch (ignore) {
            return false;
        }
    }
    function copyAccountId(record) {
        var account = resolveProfileAccount(record);
        if (!account) {
            return false;
        }
        try {
            $.DispatchEvent("CopyStringToClipboard", account, account);
            return true;
        } catch (ignore) {
            return false;
        }
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
        if (record.hero !== hero) {
            setRankImage(record, null);
            record.hero = hero;
        }
        return hero;
    }
    function schedule(delay, callback) {
        $.Schedule(delay, callback);
    }
    function startTopbarWatch(record) {
        var index;
        getState(record && record.root);
        refreshTopbar(record);
        for (index = 0; index < STARTUP_REFRESH_DELAYS.length; index += 1) {
            schedule(STARTUP_REFRESH_DELAYS[index], function () {
                refreshTopbar(record);
            });
        }
    }
    function continueProfileWatch(record, delays, token, index, elapsed) {
        if (index >= delays.length) {
            return;
        }
        schedule(delays[index] - elapsed, function () {
            if (token !== record.refreshToken || isHideoutDocumentRoot(record.root)) {
                return;
            }
            refreshProfile(record);
            continueProfileWatch(record, delays, token, index + 1, delays[index]);
        });
    }
    function continueProfileVerification(record, delays, token, index, elapsed) {
        var account;
        if (index >= delays.length) {
            return;
        }
        schedule(delays[index] - elapsed, function () {
            if (token !== record.refreshToken) {
                return;
            }
            account = resolveProfileAccount(record);
            if (account && account === record.stableAccount) {
                record.stableSamples += 1;
                if (record.stableSamples >= 2) {
                    setRankImage(record, account);
                }
            } else {
                if (record.stableAccount && account !== record.stableAccount) {
                    setRankImage(record, null);
                }
                record.stableAccount = account;
                record.stableSamples = account ? 1: 0;
            }
            continueProfileVerification(record, delays, token, index + 1, delays[index]);
        });
    }
    function continueHideoutProfileWatch(record, token, tick) {
        var delay;
        if (tick >= PROFILE_HOVER_MAX_TICKS || !isValid(record.root) || !isValid(record.accountLabel) ||
            !isValid(record.rankImage)) {
            return;
        }
        delay = tick < PROFILE_HOVER_FAST_TICKS ? PROFILE_HOVER_FAST_DELAY: PROFILE_HOVER_IDLE_DELAY;
        schedule(delay, function () {
            var account;
            var nextTick = tick + 1;
            if (token !== record.refreshToken) {
                return;
            }
            account = resolveProfileAccount(record);
            if (account !== record.stableAccount) {
                setRankImage(record, null);
                record.stableAccount = account;
                record.stableSamples = account ? 1: 0;
                nextTick = 0;
            } else if (account) {
                record.stableSamples += 1;
                if (record.stableSamples >= 2) {
                    setRankImage(record, account);
                }
            }
            continueHideoutProfileWatch(record, token, nextTick);
        });
    }
    function startProfileWatch(record, delays, retryOutside) {
        var token;
        if (!record) {
            return;
        }
        token = record.refreshToken + 1;
        record.refreshToken = token;
        if (retryOutside && !isHideoutDocumentRoot(record.root)) {
            refreshProfile(record);
            continueProfileWatch(record, delays, token, 0, 0);
            return;
        }
        record.stableAccount = null;
        record.stableSamples = 0;
        setRankImage(record, null);
        if (isHideoutDocumentRoot(record.root)) {
            continueHideoutProfileWatch(record, token, 0);
            return;
        }
        continueProfileVerification(record, delays, token, 0, 0);
    }
    function detectTopbarTeamSide(panel) {
        var current = panel;
        var depth = 0;
        var id;
        while (isValid(current) && depth < 32) {
            id = String(current.id || "");
            if (id === "TeamFriendly") {
                return "friendly";
            }
            if (id === "TeamEnemy") {
                return "enemy";
            }
            try {
                current = current.GetParent && current.GetParent();
            } catch (ignore) {
                current = null;
            }
            depth += 1;
        }
        return "";
    }
    function buildProfileRecord(panel) {
        var page = panel && panel.paneltype === "CitadelProfilePage";
        var accountLabel = findChild(panel, page ? "ShowRankBarebonesProfilePageAccount":
            "ShowRankBarebonesAccount", "Label");
        var contextAccountLabel = page ? null : findChild(panel, "ProfileStatsCommunityContextAccount", "Label");
        var rankImage = findChild(panel, page ? "ShowRankBarebonesProfilePageRankImage":
            "ShowRankBarebonesRankImage", "Image");
        return isValid(panel) && isValid(accountLabel) && isValid(rankImage) ? {
            root: panel,
            accountLabel: accountLabel,
            contextAccountLabel: contextAccountLabel,
            rankImage: rankImage,
            shownAccount: null,
            refreshToken: 0,
            stableAccount: null,
            stableSamples: 0
        } : null;
    }
    function buildTopbarRecord(panel, rankImage) {
        var heroLabels = findByClass(panel, "HeroName");
        var heroLabel = heroLabels && heroLabels.length === 1 ? heroLabels[0]: null;
        if (rankImage === undefined) {
            rankImage = findChild(panel, "ShowRankBarebonesTopbarRankImage", "Image");
        }
        return isValid(panel) && isValid(heroLabel) && isValid(rankImage) ? {
            root: panel,
            heroLabel: heroLabel,
            rankImage: rankImage,
            hero: "",
            teamSide: "",
            shownAccount: null
        } : null;
    }
    function buildRowRecord(panel) {
        var heroLabel = findChild(panel, "ShowRankBarebonesRowHero", "Label");
        var mainContents = findChild(panel, "MainContents", "Panel");
        var rankImage = findChild(panel, "ShowRankBarebonesPlayerListRankImage", "Image");
        return isValid(panel) && isValid(heroLabel) && isValid(mainContents) && isValid(rankImage) ? {
            root: panel,
            heroLabel: heroLabel,
            mainContents: mainContents,
            rankImage: rankImage,
            shownAccount: null,
            account: null
        } : null;
    }
    function scanRecords(documentRoot, className, build) {
        var roots = findByClass(documentRoot, className);
        var records = [];
        var index;
        var record;
        if (roots === null) {
            return null;
        }
        for (index = 0; index < roots.length; index += 1) {
            record = build(roots[index]);
            if (record) {
                records.push(record);
            }
        }
        return records;
    }
    function currentRowHero(record) {
        return record && isValid(record.root) && isValid(record.heroLabel) && isValid(record.mainContents) &&
            isValid(record.rankImage) ? normalizeHero(readText(record.heroLabel)): "";
    }
    function scanEscapeRows(roots, preservedRows) {
        var rows = [];
        var index;
        var preservedIndex;
        var record;
        var hero;
        var target;
        var account;
        for (index = 0; roots && index < roots.length; index += 1) {
            record = buildRowRecord(roots[index]);
            hero = currentRowHero(record);
            account = null;
            for (preservedIndex = 0; hero && preservedRows && preservedIndex < preservedRows.length; preservedIndex += 1) {
                if (preservedRows[preservedIndex].root === roots[index] &&
                    preservedRows[preservedIndex].hero === hero) {
                    account = canonicalAccountOrNull(preservedRows[preservedIndex].account);
                    break;
                }
            }
            target = rankTarget(roots[index], "ShowRankBarebonesPlayerListRankImage");
            if (target && !account) {
                setRankImage(target, null);
            }
            if (hero) {
                record.hero = hero;
                record.account = account;
                rows.push(record);
            }
        }
        return rows;
    }
    function readTopbarEvidenceSnapshot(roots) {
        var candidates = [];
        var targets = [];
        var heroCounts = Object.create(null);
        var duplicateHeroes = Object.create(null);
        var uniqueHeroCount = 0;
        var index;
        var record;
        var target;
        var hero;
        roots = roots || [];
        for (index = 0; index < roots.length; index += 1) {
            target = rankTarget(roots[index], "ShowRankBarebonesTopbarRankImage");
            if (target) {
                targets.push(target);
            }
            record = buildTopbarRecord(roots[index], target ? target.rankImage: null);
            if (!record) {
                continue;
            }
            hero = refreshTopbar(record);
            record.hero = hero;
            candidates.push(record);
            if (!heroCounts[hero]) {
                heroCounts[hero] = 1;
                if (hero) {
                    uniqueHeroCount += 1;
                }
            } else {
                heroCounts[hero] += 1;
                if (hero) {
                    duplicateHeroes[hero] = true;
                }
            }
        }
        return {
            candidates: candidates,
            targets: targets,
            heroCounts: heroCounts,
            duplicateHeroes: duplicateHeroes,
            uniqueHeroCount: uniqueHeroCount,
            topbarCount: candidates.length,
            teamSideCandidates: {
                "friendly": [],
                "enemy": []
            },
            sideFactsRead: false,
            allTeamSidesKnown: false,
            readiness: {
                rankTargetsReady: candidates.length === roots.length && targets.length === roots.length,
                completeUniqueTopbarRoster: candidates.length > 0 && uniqueHeroCount === candidates.length,
                teamSidesReady: false
            }
        };
    }
    function hydrateTopbarSideEvidence(snapshot) {
        var candidates;
        var index;
        var side;
        if (!snapshot || snapshot.sideFactsRead) {
            return !!(snapshot && snapshot.allTeamSidesKnown);
        }
        snapshot.sideFactsRead = true;
        snapshot.allTeamSidesKnown = true;
        candidates = snapshot.candidates;
        for (index = 0; index < candidates.length; index += 1) {
            side = detectTopbarTeamSide(candidates[index].root);
            candidates[index].teamSide = side;
            if (side === "friendly" || side === "enemy") {
                snapshot.teamSideCandidates[side].push(candidates[index]);
            } else {
                snapshot.allTeamSidesKnown = false;
            }
        }
        snapshot.readiness.teamSidesReady = snapshot.allTeamSidesKnown &&
            snapshot.teamSideCandidates["friendly"].length === TEAM_AVERAGE_ACCOUNTS &&
            snapshot.teamSideCandidates["enemy"].length === TEAM_AVERAGE_ACCOUNTS;
        return snapshot.allTeamSidesKnown;
    }
    function buildRosterReadModel(rows, topbarEvidence, completedRoster, cacheReplay) {
        var rowCounts = Object.create(null);
        var rowsByHero = Object.create(null);
        var seenRowAccounts = Object.create(null);
        var cachedAccounts = Object.create(null);
        var seenCachedAccounts = Object.create(null);
        var matches = [];
        var rowsUnique = true;
        var topbarsUnique = !!(topbarEvidence &&
            topbarEvidence.readiness.completeUniqueTopbarRoster);
        var rowsCoverTopbars = topbarsUnique;
        var cacheValid = !!(cacheReplay && topbarEvidence && completedRoster &&
            topbarEvidence.candidates.length === completedRoster.length);
        var index;
        var hero;
        var account;
        var row;
        var candidate;
        rows = rows || [];
        for (index = 0; index < rows.length; index += 1) {
            row = rows[index];
            hero = row.hero;
            rowCounts[hero] = (rowCounts[hero] || 0) + 1;
            if (rowCounts[hero] > 1) {
                rowsUnique = false;
            } else {
                rowsByHero[hero] = row;
            }
            account = canonicalAccountOrNull(row.account);
            if (account && seenRowAccounts[account]) {
                rowsUnique = false;
            } else if (account) {
                seenRowAccounts[account] = true;
            }
        }
        if (cacheValid) {
            for (index = 0; index < completedRoster.length; index += 1) {
                hero = normalizeHero(completedRoster[index].hero);
                account = canonicalAccountOrNull(completedRoster[index].account);
                if (!hero || !account || cachedAccounts[hero] || seenCachedAccounts[account]) {
                    cacheValid = false;
                    break;
                }
                cachedAccounts[hero] = account;
                seenCachedAccounts[account] = true;
            }
        }
        if (topbarEvidence) {
            for (index = 0; index < topbarEvidence.candidates.length; index += 1) {
                candidate = topbarEvidence.candidates[index];
                hero = candidate.hero;
                row = rowCounts[hero] === 1 ? rowsByHero[hero]: null;
                account = cacheReplay ? canonicalAccountOrNull(cachedAccounts[hero]):
                    canonicalAccountOrNull(row && row.account);
                if (!row && !cacheReplay) {
                    rowsCoverTopbars = false;
                }
                if (cacheReplay && !account) {
                    cacheValid = false;
                }
                matches.push({
                    hero: hero,
                    row: row,
                    topbar: candidate,
                    account: account
                });
            }
        } else {
            topbarsUnique = false;
            rowsCoverTopbars = false;
            cacheValid = false;
        }
        return {
            probes: rows,
            matches: matches,
            evidence: topbarEvidence,
            cacheReplay: !!cacheReplay,
            readiness: {
                available: !!topbarEvidence,
                supported: !!(topbarEvidence && topbarEvidence.readiness.rankTargetsReady &&
                    (topbarEvidence.topbarCount === 6 || topbarEvidence.topbarCount === 12)),
                rowsUnique: rowsUnique,
                topbarsUnique: topbarsUnique,
                rowsCoverTopbars: rowsCoverTopbars,
                cacheValid: cacheValid
            }
        };
    }
    function readRosterModel(shared, preservedRows, completedRoster, cacheReplay) {
        var documentRoot = shared && shared.documentRoot;
        var rowRoots = cacheReplay ? []: findByClass(documentRoot, PLAYER_ROW_CLASS);
        var topbarRoots = findByClass(documentRoot, TOPBAR_PLAYER_CLASS);
        var rows = scanEscapeRows(rowRoots, preservedRows);
        var topbarEvidence = topbarRoots === null ? null: readTopbarEvidenceSnapshot(topbarRoots);
        return buildRosterReadModel(rows, topbarEvidence, completedRoster, cacheReplay);
    }
    function escapeReadinessDecision(source, step) {
        var decision = {
            source: source,
            step: step,
            mayStartPreload: step === "start_preload",
            mayProbeRows: step === "probe_rows",
            shouldReplayCache: step === "replay_cache",
            shouldScheduleRetry: step === "wait_roster",
            shouldFinish: step === "finish",
            shouldStop: step === "source_blocked" || step === "transition_stop"
        };
        decision.mayShowSpinner = false;
        return decision;
    }
    function classifyEscapeReadiness(input) {
        var source = String(input && input.source || "");
        var phase = String(input && input.phase || "");
        var readiness = input && input.rosterReadiness;
        var decision;
        if (source !== "escape_open" && source !== "escape_out" && source !== "escape_continue") {
            source = "passive";
        }
        decision = escapeReadinessDecision(source, "source_blocked");
        if (source === "passive") {
            return decision;
        }
        if (!input || input.transition !== "active") {
            return escapeReadinessDecision(source, "transition_stop");
        }
        if (phase === "open") {
            if (source !== "escape_open") {
                return decision;
            }
            if (input.rootChanged) {
                return escapeReadinessDecision(source, "replace_root");
            }
            if (!input.menuOpen) {
                return escapeReadinessDecision(source, "transition_stop");
            }
            if (input.hasCache) {
                return escapeReadinessDecision(source, "replay_cache");
            }
            if (input.latched) {
                return escapeReadinessDecision(source, "runtime_idle");
            }
            return escapeReadinessDecision(source, "start_preload");
        }
        if (phase === "close") {
            if (source !== "escape_out") {
                return decision;
            }
            return escapeReadinessDecision(source, input.menuOpen ? "runtime_idle": "transition_stop");
        }
        if (source !== "escape_continue") {
            return decision;
        }
        if (phase === "collect") {
            if (input.started) {
                return escapeReadinessDecision(source, "runtime_idle");
            }
            if (Number(input.attempt) >= Number(input.retryLimit) ||
                Number(input.probeCount) > 0 && (!readiness || !readiness.available ||
                    !readiness.supported || readiness.rowsCoverTopbars)) {
                return escapeReadinessDecision(source, "probe_rows");
            }
            return escapeReadinessDecision(source, "wait_roster");
        }
        if (phase === "probe") {
            if (input.finished) {
                return escapeReadinessDecision(source, "runtime_idle");
            }
            if (Number(input.probeIndex) >= Number(input.probeCount)) {
                return escapeReadinessDecision(source, "finish");
            }
            return escapeReadinessDecision(source, "probe_rows");
        }
        if (phase === "result") {
            if (input.invalid || input.complete ||
                Number(input.probeIndex) >= Number(input.probeCount)) {
                return escapeReadinessDecision(source, "finish");
            }
            return escapeReadinessDecision(source, "probe_rows");
        }
        if (phase === "finish") {
            return escapeReadinessDecision(source, "finish");
        }
        return decision;
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
            snapshotIndex = - 1;
            for (beforeIndex = 0; beforeIndex < snapshot.length; beforeIndex += 1) {
                if (snapshot[beforeIndex].root === profiles[index].root) {
                    snapshotIndex = beforeIndex;
                    break;
                }
            }
            account = resolveProfileAccount(profiles[index]);
            if (account && (snapshotIndex < 0 || account !== snapshot[snapshotIndex].accountAtSnapshot)) {
                accepted = account;
                count += 1;
                if (count > 1) {
                    return null;
                }
            }
        }
        return count === 1 ? accepted: null;
    }
    function escapeIsCurrent(session, token) {
        var shared = session && session.shared;
        return !!(shared && shared.escape === session && shared.escapeToken === token &&
            !isHideoutDocumentRoot(shared.documentRoot) && isValid(session.root) && isEscapeMenuOpen(session.root));
    }
    function scheduleEscape(delay, session, token, callback) {
        schedule(delay, function () {
            if (escapeIsCurrent(session, token)) {
                callback();
            }
        });
    }
    function closePlayerCards() {
        try {
            if (typeof DismissAllContextMenus === "function") {
                DismissAllContextMenus();
            } else {
                $.DispatchEvent("DismissAllContextMenus");
            }
        } catch (ignoreDismiss) {
        }
        try {
            if (typeof DropInputFocus === "function") {
                DropInputFocus();
            } else {
                $.DispatchEvent("DropInputFocus");
            }
        } catch (ignoreFocus) {
        }
    }
    function sessionIsCurrent(session) {
        return session.cacheReplay ? isValid(session.root) && isEscapeMenuOpen(session.root) &&
            !isHideoutDocumentRoot(session.root): escapeIsCurrent(session, session.token);
    }
    function rosterTopbarTargets(roster) {
        return roster && roster.evidence ? roster.evidence.targets: null;
    }
    function setRosterAccount(roster, hero, account) {
        var index;
        account = canonicalAccountOrNull(account);
        if (!roster || !hero || !account) {
            return false;
        }
        for (index = 0; index < roster.probes.length; index += 1) {
            if (roster.probes[index].hero === hero) {
                roster.probes[index].account = account;
            }
        }
        for (index = 0; index < roster.matches.length; index += 1) {
            if (roster.matches[index].hero === hero) {
                roster.matches[index].account = account;
            }
        }
        return true;
    }
    function planTeamAverages(roster, writes, documentRoot) {
        var accounts = {
            friendly: [],
            enemy: []
        };
        var seen = {
            friendly: Object.create(null),
            enemy: Object.create(null)
        };
        var index;
        var side;
        var account;
        var friendlyImage;
        var enemyImage;
        if (!roster || roster.matches.length !== 12 || writes.length !== 12) {
            return null;
        }
        if (!hydrateTopbarSideEvidence(roster.evidence) ||
            !roster.evidence.readiness.teamSidesReady) {
            return null;
        }
        for (index = 0; index < writes.length; index += 1) {
            side = writes[index].record.teamSide;
            account = writes[index].account;
            if ((side !== "friendly" && side !== "enemy") || seen[side][account]) {
                return null;
            }
            seen[side][account] = true;
            accounts[side].push(account);
        }
        if (accounts.friendly.length !== TEAM_AVERAGE_ACCOUNTS || accounts.enemy.length !== TEAM_AVERAGE_ACCOUNTS) {
            return null;
        }
        friendlyImage = findChild(documentRoot, "ShowRankBarebonesAverageFriendlyImage", "Image");
        enemyImage = findChild(documentRoot, "ShowRankBarebonesAverageEnemyImage", "Image");
        if (!isValid(friendlyImage) || !isValid(enemyImage)) {
            return null;
        }
        return {
            friendlyImage: friendlyImage,
            enemyImage: enemyImage,
            friendlyUrl: teamAverageImageUrl(accounts.friendly),
            enemyUrl: teamAverageImageUrl(accounts.enemy)
        };
    }
    function cacheRosterWrites(roster, writes, complete) {
        var cached = [];
        var index;
        if (!complete || !roster.readiness.supported) {
            return null;
        }
        for (index = 0; index < writes.length; index += 1) {
            cached.push({
                hero: writes[index].hero,
                account: writes[index].account
            });
        }
        return cached.length === roster.matches.length ? cached: null;
    }
    function planRosterWrites(session, terminal) {
        var roster = session && session.roster;
        var seenAccounts = Object.create(null);
        var writes = [];
        var complete = true;
        var index;
        var match;
        var record;
        var account;
        if (!sessionIsCurrent(session) || !roster || !roster.readiness.available) {
            return {
                stale: true
            };
        }
        if (!roster.readiness.topbarsUnique || !roster.readiness.rowsUnique ||
            roster.cacheReplay && !roster.readiness.cacheValid) {
            return {
                invalid: true
            };
        }
        for (index = 0; index < roster.matches.length; index += 1) {
            match = roster.matches[index];
            record = match.topbar;
            if (!isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.rankImage)) {
                return {
                    stale: true
                };
            }
            account = canonicalAccountOrNull(match.account);
            if (!roster.cacheReplay && !match.row) {
                complete = false;
                continue;
            }
            if (!account) {
                complete = false;
                continue;
            }
            if (seenAccounts[account]) {
                return {
                    invalid: true
                };
            }
            if (!roster.cacheReplay && match.row.account !== account) {
                return {
                    stale: true
                };
            }
            seenAccounts[account] = true;
            writes.push({
                record: record,
                row: match.row,
                hero: match.hero,
                account: account
            });
        }
        if (!terminal && (!complete || !roster.readiness.supported)) {
            return {
                waiting: true
            };
        }
        return {
            writes: writes,
            complete: complete,
            cached: cacheRosterWrites(roster, writes, complete),
            average: complete ? planTeamAverages(roster, writes, session.shared.documentRoot): null
        };
    }
    function rosterPlanIsCurrent(session, plan) {
        var index;
        var record;
        var row;
        if (!sessionIsCurrent(session)) {
            return false;
        }
        for (index = 0; index < plan.writes.length; index += 1) {
            record = plan.writes[index].record;
            row = plan.writes[index].row;
            if (!isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.rankImage) ||
                normalizeHero(readText(record.heroLabel)) !== plan.writes[index].hero ||
                !session.roster.cacheReplay && currentRowHero(row) !== plan.writes[index].hero ||
                plan.average && !session.roster.cacheReplay && detectTopbarTeamSide(record.root) !== record.teamSide) {
                return false;
            }
        }
        return !plan.average || (isValid(plan.average.friendlyImage) && isValid(plan.average.enemyImage));
    }
    function applyRosterPlan(session, terminal) {
        var plan = planRosterWrites(session, terminal);
        var index;
        if (plan.stale || !plan.waiting && !plan.invalid && !rosterPlanIsCurrent(session, plan)) {
            return "stale";
        }
        if (plan.waiting) {
            return "waiting";
        }
        if (plan.invalid) {
            clearTopbarRecords(rosterTopbarTargets(session.roster));
            clearTeamAverages(session.shared.documentRoot);
            return "invalid";
        }
        for (index = 0; index < plan.writes.length; index += 1) {
            setRankImage(plan.writes[index].record, plan.writes[index].account);
        }
        if (plan.average) {
            setTeamAverageImage(session.shared.documentRoot, "friendly", plan.average.friendlyUrl);
            setTeamAverageImage(session.shared.documentRoot, "enemy", plan.average.enemyUrl);
        } else if (terminal) {
            clearTeamAverages(session.shared.documentRoot);
        }
        session.lastPlan = plan;
        if (plan.writes.length) {
            session.shared.escapeRendered = true;
        }
        return "applied";
    }
    function renderRoster(session, terminal) {
        var result = applyRosterPlan(session, terminal);
        var preservedRows;
        if (result !== "stale") {
            return result;
        }
        if (session.stalePlans >= 1) {
            clearTopbarRecords(rosterTopbarTargets(session.roster));
            clearTeamAverages(session.shared.documentRoot);
            return "invalid";
        }
        session.stalePlans += 1;
        preservedRows = !session.cacheReplay && session.roster ? session.roster.probes: null;
        session.roster = session.cacheReplay ?
            readRosterModel(session.shared, null, session.shared.completedRoster, true):
            readRosterModel(session.shared, preservedRows, null, false);
        result = applyRosterPlan(session, terminal);
        if (result === "stale") {
            clearTopbarRecords(rosterTopbarTargets(session.roster));
            clearTeamAverages(session.shared.documentRoot);
            return "invalid";
        }
        return result;
    }
    function finishEscapePass(session) {
        var shared = session.shared;
        var intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "finish",
            transition: !session.finished && escapeIsCurrent(session, session.token) ? "active": "stale"
        });
        var result;
        session.intent = intent;
        if (!intent.shouldFinish) {
            return;
        }
        result = session.lastPlan && session.lastPlan.cached ? "applied": renderRoster(session, true);
        session.finished = true;
        shared.completedRoster = result === "applied" && session.lastPlan && session.lastPlan.cached ?
            session.lastPlan.cached: null;
        if (!shared.completedRoster) {
            clearTeamAverages(shared.documentRoot);
        }
        schedule(PROFILE_CONTEXT_CLOSE_DELAY, function () {
            if (shared.escapeToken === session.token) {
                closePlayerCards();
            }
        });
        releaseEscapeSession(shared);
    }
    function completeRowProbe(session, record, account) {
        var result;
        var intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "probe",
            transition: escapeIsCurrent(session, session.token) ? "active": "stale",
            finished: session.finished,
            probeIndex: session.index,
            probeCount: session.roster.probes.length
        });
        session.intent = intent;
        if (!intent.mayProbeRows) {
            if (intent.shouldFinish) {
                finishEscapePass(session);
            }
            return;
        }
        session.index += 1;
        account = canonicalAccountOrNull(account);
        if (account) {
            setRosterAccount(session.roster, record.hero, account);
            setRankImage(record, account);
            result = renderRoster(session, false);
        }
        intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "result",
            transition: "active",
            invalid: result === "invalid",
            complete: !!(session.lastPlan && session.lastPlan.cached),
            probeIndex: session.index,
            probeCount: session.roster.probes.length
        });
        session.intent = intent;
        if (intent.shouldFinish) {
            finishEscapePass(session);
        } else if (intent.mayProbeRows) {
            probeNextRow(session);
        }
    }
    function inspectRow(session, record, snapshot, attempt) {
        var intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "probe",
            transition: escapeIsCurrent(session, session.token) ? "active": "stale",
            finished: session.finished,
            probeIndex: session.index,
            probeCount: session.roster.probes.length
        });
        var account;
        session.intent = intent;
        if (!intent.mayProbeRows) {
            if (intent.shouldFinish) {
                finishEscapePass(session);
            }
            return;
        }
        account = changedProfileAccount(session.shared.documentRoot, snapshot);
        if (account) {
            completeRowProbe(session, record, account);
        } else if (attempt < ESCAPE_WITNESS_DELAYS.length) {
            scheduleEscape(ESCAPE_WITNESS_DELAYS[attempt], session, session.token, function () {
                inspectRow(session, record, snapshot, attempt + 1);
            });
        } else {
            completeRowProbe(session, record, null);
        }
    }
    function probeNextRow(session) {
        var intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "probe",
            transition: escapeIsCurrent(session, session.token) ? "active": "stale",
            finished: session.finished,
            probeIndex: session.index,
            probeCount: session.roster.probes.length
        });
        var record;
        var snapshot;
        session.intent = intent;
        if (intent.shouldFinish) {
            finishEscapePass(session);
            return;
        }
        if (!intent.mayProbeRows) {
            return;
        }
        record = session.roster.probes[session.index];
        if (!isValid(record.mainContents)) {
            session.index += 1;
            probeNextRow(session);
            return;
        }
        snapshot = snapshotProfiles(session.shared.documentRoot);
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
        var intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "collect",
            transition: escapeIsCurrent(session, session.token) ? "active": "stale",
            started: session.started,
            attempt: attempt,
            retryLimit: ESCAPE_ROW_DELAYS.length,
            probeCount: 0
        });
        var roster;
        session.intent = intent;
        if (intent.shouldStop || intent.step === "runtime_idle") {
            return;
        }
        roster = readRosterModel(session.shared, null, null, false);
        clearTopbarRecords(rosterTopbarTargets(roster));
        session.roster = roster;
        intent = classifyEscapeReadiness({
            source: "escape_continue",
            phase: "collect",
            transition: "active",
            started: false,
            attempt: attempt,
            retryLimit: ESCAPE_ROW_DELAYS.length,
            probeCount: roster.probes.length,
            rosterReadiness: roster.readiness
        });
        session.intent = intent;
        if (intent.mayProbeRows) {
            session.started = true;
            probeNextRow(session);
            return;
        }
        if (intent.shouldScheduleRetry) {
            scheduleEscape(ESCAPE_ROW_DELAYS[attempt], session, session.token, function () {
                collectEscapeRows(session, attempt + 1);
            });
        }
    }
    function reuseCompletedRoster(shared, escapeRoot, intent) {
        var roster = readRosterModel(shared, null, shared.completedRoster, true);
        var session;
        var result;
        if (!roster.readiness.cacheValid || !roster.readiness.topbarsUnique) {
            clearTopbarRecords(rosterTopbarTargets(roster));
            clearTeamAverages(shared.documentRoot);
            shared.completedRoster = null;
            shared.escapeRendered = false;
            return false;
        }
        session = {
            shared: shared,
            root: escapeRoot,
            roster: roster,
            cacheReplay: true,
            stalePlans: 0,
            intent: intent
        };
        result = renderRoster(session, true);
        if (result === "applied" && session.lastPlan && session.lastPlan.cached) {
            return true;
        }
        shared.completedRoster = null;
        clearTopbarRecords(rosterTopbarTargets(session.roster));
        clearTeamAverages(shared.documentRoot);
        shared.escapeRendered = false;
        return false;
    }
    function startEscapePass(escapeRoot) {
        var shared = getState(escapeRoot);
        var transition = !shared || !isValid(escapeRoot) ? "unavailable":
            isHideoutDocumentRoot(shared.documentRoot) ? "hideout": "active";
        var intent = classifyEscapeReadiness({
            source: "escape_open",
            phase: "open",
            transition: transition,
            rootChanged: !!(shared && shared.escapeOpenLatched && shared.escapeRoot !== escapeRoot),
            menuOpen: transition === "active" && isEscapeMenuOpen(escapeRoot),
            hasCache: !!(shared && shared.completedRoster),
            latched: !!(shared && shared.escapeOpenLatched)
        });
        var playersTab;
        var session;
        state = shared || state;
        if (intent.shouldStop && transition !== "active") {
            if (transition === "unavailable") {
                state = null;
            }
            return;
        }
        if (intent.step === "replace_root") {
            shared.escapeToken += 1;
            releaseEscapeSession(shared);
            shared.escapeOpenLatched = false;
            intent = classifyEscapeReadiness({
                source: "escape_open",
                phase: "open",
                transition: "active",
                rootChanged: false,
                menuOpen: isEscapeMenuOpen(escapeRoot),
                hasCache: !!shared.completedRoster,
                latched: false
            });
        }
        if (intent.shouldStop) {
            shared.escapeOpenLatched = false;
            shared.escapeRoot = null;
            if (shared.escape) {
                shared.escapeToken += 1;
                releaseEscapeSession(shared);
            }
            state = null;
            return;
        }
        if (intent.shouldReplayCache) {
            if (reuseCompletedRoster(shared, escapeRoot, intent)) {
                shared.escapeOpenLatched = true;
                shared.escapeRoot = escapeRoot;
                return;
            }
            intent = classifyEscapeReadiness({
                source: "escape_open",
                phase: "open",
                transition: "active",
                rootChanged: false,
                menuOpen: true,
                hasCache: false,
                latched: shared.escapeOpenLatched
            });
        }
        if (!intent.mayStartPreload) {
            return;
        }
        shared.escapeOpenLatched = true;
        shared.escapeRoot = escapeRoot;
        shared.escapeToken += 1;
        session = {
            shared: shared,
            token: shared.escapeToken,
            root: escapeRoot,
            roster: null,
            index: 0,
            started: false,
            finished: false,
            stalePlans: 0,
            lastPlan: null,
            intent: intent
        };
        shared.escape = session;
        clearTeamAverages(shared.documentRoot);
        playersTab = findChild(escapeRoot, "PlayersTab");
        if (isValid(playersTab)) {
            try {
                $.DispatchEvent("Activated", playersTab);
            } catch (ignore) {
            }
        }
        closePlayerCards();
        scheduleEscape(ESCAPE_WITNESS_DELAYS[0], session, session.token, function () {
            collectEscapeRows(session, 0);
        });
    }
    function resetEscapePassAfterClose(escapeRoot) {
        var shared = getState(escapeRoot) || state;
        var intent;
        if (!shared) {
            state = null;
            return;
        }
        intent = classifyEscapeReadiness({
            source: "escape_out",
            phase: "close",
            transition: "active",
            menuOpen: isEscapeMenuOpen(escapeRoot)
        });
        if (!intent.shouldStop) {
            if (shared.escape) {
                shared.escape.intent = intent;
            }
            return;
        }
        shared.escapeOpenLatched = false;
        shared.escapeRoot = null;
        shared.escapeToken += 1;
        releaseEscapeSession(shared);
        state = null;
    }
    function installProfileStatsCommunity() {
        /* PROFILE_STATS_COMMUNITY_RUNTIME: profile_stats_community/panorama/scripts/profile_stats_community.js */
    }
    if (root && (root.paneltype === "CitadelProfileCard" || root.paneltype === "CitadelProfilePage")) {
        var profileRecord = buildProfileRecord(root);
        if (profileRecord) {
            root.ShowRankBarebonesRefresh = function () {
                startProfileWatch(profileRecord, PROFILE_REFRESH_DELAYS);
            };
            root.ShowRankBarebonesOpenStatlocker = function () {
                return openStatlocker(profileRecord);
            };
            root.ShowRankBarebonesOpenPlayerProfile = function () {
                return openPlayerProfile(profileRecord);
            };
            root.ShowRankBarebonesCopyAccount = function () {
                return copyAccountId(profileRecord);
            };
            startProfileWatch(profileRecord, STARTUP_REFRESH_DELAYS, true);
        }
        if (root.paneltype === "CitadelProfilePage") {
            installProfileStatsCommunity();
        }
    } else if (isValid(root) && root.paneltype === "CitadelHudTopBarPlayer") {
        var topbarRecord = buildTopbarRecord(root);
        startTopbarWatch(topbarRecord);
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
}
());
