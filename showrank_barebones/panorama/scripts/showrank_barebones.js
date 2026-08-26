(function () {
    "use strict";
    var STEAM64_BASE = "76561197960265728";
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
    var MISSING_WINDOW_END_SECONDS = 8 * 60;
    var MISSING_WINDOW_RETRY_INTERVAL = 0.5;
    var MISSING_BACKUP_INTERVAL = 1.0;
    var MISSING_WINDOW_MAX_RETRIES = 1800;
    var MISSING_WINDOW_CLASS = "ShowRankBarebonesMissingWindowExpired";
    var MISSING_NOTIFICATION_ROOT_ID = "ShowRankBarebonesNotificationRoot";
    var MISSING_TOAST_ID = "ShowRankBarebonesMissingToast";
    var MISSING_TOAST_VISIBLE_CLASS = "ShowRankBarebonesToastVisible";
    var MISSING_TOAST_EXPIRED_CLASS = "ShowRankBarebonesToastExpired";
    var MISSING_TOAST_AGED_CLASS = "ShowRankBarebonesToastAged";
    var MISSING_TOAST_REVEAL_DELAY = 0.03;
    var MISSING_TOAST_DURATION = 3.0;
    var MISSING_TOAST_DELETE_DELAY = 0.4;
    var MISSING_HERO_ICON_URL_PREFIX = "s2r://panorama/images/heroes/";
    var MISSING_HERO_ICON_FILES = {
        "abrams": "bull_sm_psd.vtex",
        "apollo": "fencer_sm_psd.vtex",
        "bebop": "bebop_sm_psd.vtex",
        "billy": "punkgoat_sm_psd.vtex",
        "cadence": "cadence_sm_psd.vtex",
        "calico": "nano_sm_psd.vtex",
        "celeste": "unicorn_sm_psd.vtex",
        "drifter": "drifter_sm_psd.vtex",
        "dynamo": "sumo_sm_psd.vtex",
        "fathom": "slork_sm_psd.vtex",
        "fortuna": "fortuna_sm_psd.vtex",
        "generic person": "genericperson_sm_psd.vtex",
        "graf": "graf_sm_psd.vtex",
        "graves": "necro_sm_psd.vtex",
        "grey talon": "archer_sm_psd.vtex",
        "gunslinger": "gunslinger_sm_psd.vtex",
        "haze": "haze_sm_psd.vtex",
        "holliday": "astro_sm_psd.vtex",
        "infernus": "inferno_sm_psd.vtex",
        "ivy": "tengu_sm_psd.vtex",
        "kali": "kali_sm_psd.vtex",
        "kelvin": "kelvin_sm_psd.vtex",
        "lady geist": "spectre_sm_psd.vtex",
        "lash": "lash_sm_psd.vtex",
        "mcginnis": "engineer_sm_psd.vtex",
        "mina": "vampirebat_sm_psd.vtex",
        "mirage": "mirage_sm_psd.vtex",
        "mo & krill": "digger_sm_psd.vtex",
        "paige": "bookworm_sm_psd.vtex",
        "paradox": "chrono_sm_psd.vtex",
        "pocket": "synth_sm_psd.vtex",
        "raven": "operative_sm_psd.vtex",
        "rem": "familiar_sm_psd.vtex",
        "rutger": "rutger_sm_psd.vtex",
        "seven": "gigawatt_sm_psd.vtex",
        "shiv": "shiv_sm_psd.vtex",
        "silver": "werewolf_sm_psd.vtex",
        "sinclair": "magician_sm_psd.vtex",
        "skyrunner": "skyrunner_sm_psd.vtex",
        "swan": "swan_sm_psd.vtex",
        "targetdummy": "targetdummy_sm_psd.vtex",
        "the boss": "yakuza_sm_psd.vtex",
        "the doorman": "doorman_sm_psd.vtex",
        "thumper": "thumper_sm_psd.vtex",
        "tokamak": "tokamak_sm_psd.vtex",
        "trapper": "trapper_sm_psd.vtex",
        "vandal": "vandal_sm_psd.vtex",
        "venator": "priest_sm_psd.vtex",
        "victor": "frank_sm_psd.vtex",
        "vindicta": "hornet_sm_psd.vtex",
        "viscous": "viscous_sm_psd.vtex",
        "vyper": "kali_sm_psd.vtex",
        "warden": "warden_sm_psd.vtex",
        "wraith": "wraith_sm_psd.vtex",
        "wrecker": "wrecker_sm_psd.vtex",
        "yamato": "yamato_sm_psd.vtex"
    };
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
    function setPanelClass(panel, className, enabled) {
        try {
            if (!isValid(panel)) {
                return;
            }
            if (enabled && panel.AddClass) {
                panel.AddClass(className);
            } else if (panel.RemoveClass) {
                panel.RemoveClass(className);
            }
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
    function normalizeAccount(value) {
        if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) || value.length > 10 ||
            (value.length === 10 && value > "4294967295")) {
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
        var scan;
        if (!shared) {
            return;
        }
        scan = scanEscapeTopbars(findByClass(shared.documentRoot, TOPBAR_PLAYER_CLASS));
        clearTopbarRecords(scan.targets);
        clearTeamAverages(shared.documentRoot);
        shared.escapeRendered = false;
    }
    function releaseEscapeSession(shared) {
        var session = shared && shared.escape;
        if (!session) {
            return;
        }
        session.rows = [];
        session.roster = null;
        session.accountByHero = null;
        session.lastPlan = null;
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
        var shared, c, name, t;
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
                    escapeRendered: false,
                    missingSessionToken: 0,
                    missingLeaderToken: 0,
                    missingLeaderPulse: 0,
                    missingRunning: false,
                    missingChecks: 0,
                    missingLeaderRoot: null,
                    missingRecords: [],
                    missingNotificationRoot: null
                };
                documentRoot.__showrank_barebones_state_v1 = shared;
            }
            t = Object.prototype.toString;
            c = {
                missingSessionToken: 0,
                missingLeaderToken: 0,
                missingLeaderPulse: 0,
                missingChecks: 0
            };
            for (name in c)if (typeof shared[name] !== "number" || !isFinite(shared[name])) {
                shared[name] = 0;
            }
            if (typeof shared.missingRunning !== "boolean") {
                shared.missingRunning = false;
            }
            if (!shared.missingRecords || t.call(shared.missingRecords) !== "[object Array]") {
                shared.missingRecords = [];
            }
            if (!isValid(shared.missingLeaderRoot)) {
                shared.missingLeaderRoot = null;
            }
            if (!isValid(shared.missingNotificationRoot)) {
                shared.missingNotificationRoot = null;
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
        var account = null;
        var hidden;
        var contextHidden;
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
        contextHidden = isValid(record.contextAccountLabel) ? readText(record.contextAccountLabel) : "";
        accountId = readAttribute(record.root, "accountid");
        steamId = readAttribute(record.root, "steamid");
        if (hidden === null || contextHidden === null || accountId === null || steamId === null ||
            !accept(hidden) || !accept(contextHidden) || !accept(accountId) ||
            !accept(steamId)) {
            return null;
        }
        return account;
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
    function getMissingNotificationRoot(shared) {
        var root;
        if (!shared) {
            return null;
        }
        root = shared.missingNotificationRoot;
        if (!isValid(root)) {
            root = shared.documentRoot;
            if (isValid(root) && root.id !== MISSING_NOTIFICATION_ROOT_ID) {
                root = findChild(root, MISSING_NOTIFICATION_ROOT_ID);
            }
            shared.missingNotificationRoot = isValid(root) ? root: null;
        }
        return shared.missingNotificationRoot;
    }
    function getMissingToastState(root) {
        var state;
        if (!isValid(root)) {
            return null;
        }
        try {
            state = root.__showrank_barebones_missing_toast_state_v2;
            if (!state) {
                state = {
                    refreshScheduled: false,
                    refreshProminent: false,
                    activeHeroes: [],
                    activeHeroKeys: Object.create(null),
                    toastToken: 0,
                    toast: null
                };
                root.__showrank_barebones_missing_toast_state_v2 = state;
            }
            return state;
        } catch (ignore) {
            return null;
        }
    }
    function missingToastIsCurrent(root, state, toast, token) {
        try {
            return !!(isValid(root) && root.__showrank_barebones_missing_toast_state_v2 === state &&
                state.toast === toast && state.toastToken === token && isValid(toast.panel));
        } catch (ignore) {
            return false;
        }
    }
    function setMissingToastIcons(toast, heroes) {
        var icons = toast.icons;
        var index;
        var icon;
        var file;
        for (index = 0; index < icons.length; index += 1) {
            try {
                if (isValid(icons[index]) && icons[index].DeleteAsync) {
                    icons[index].DeleteAsync(0);
                }
            } catch (ignore) {
            }
        }
        toast.icons = [];
        for (index = 0; index < heroes.length; index += 1) {
            file = MISSING_HERO_ICON_FILES[heroes[index]];
            if (!file) {
                continue;
            }
            try {
                icon = $.CreatePanel("Image", toast.iconRow, "");
                icon.AddClass("ShowRankBarebonesMissingToastIcon");
                icon.hittest = false;
                icon.SetImage(MISSING_HERO_ICON_URL_PREFIX + file);
                toast.icons.push(icon);
            } catch (ignore) {
                try {
                    if (isValid(icon) && icon.DeleteAsync) {
                        icon.DeleteAsync(0);
                    }
                } catch (ignoreDelete) {
                }
            }
        }
        try {
            toast.iconRow.visible = toast.icons.length > 0;
        } catch (ignore) {
        }
    }
    function hideMissingToast(root, state, release) {
        var toast = state && state.toast;
        var token;
        if (!isValid(toast && toast.panel)) {
            if (state) {
                state.toast = null;
            }
            if (release && isValid(root)) {
                root.__showrank_barebones_missing_toast_state_v2 = null;
            }
            return;
        }
        state.toastToken += 1;
        token = state.toastToken;
        setPanelClass(toast.panel, MISSING_TOAST_AGED_CLASS, false);
        setPanelClass(toast.panel, MISSING_TOAST_EXPIRED_CLASS, true);
        schedule(MISSING_TOAST_DELETE_DELAY, function () {
            if (!missingToastIsCurrent(root, state, toast, token)) {
                return;
            }
            try {
                if (isValid(toast.panel) && toast.panel.DeleteAsync) {
                    toast.panel.DeleteAsync(0);
                }
            } catch (ignore) {
            }
            state.toast = null;
            if (release) {
                try {
                    root.__showrank_barebones_missing_toast_state_v2 = null;
                } catch (ignoreRelease) {
                }
            }
        });
    }
    function showMissingToast(root, state, heroes, prominent) {
        var toast = state.toast;
        var token;
        var title;
        if (!isValid(toast && toast.panel)) {
            try {
                toast = {
                    panel: $.CreatePanel("Panel", root, MISSING_TOAST_ID),
                    icons: []
                };
                toast.panel.AddClass("GenericAnnouncement");
                toast.panel.hittest = false;
                title = $.CreatePanel("Label", toast.panel, "");
                title.AddClass("AnnouncementTitle");
                title.text = "ENEMY MISSING";
                toast.iconRow = $.CreatePanel("Panel", toast.panel, "");
                toast.iconRow.AddClass("ShowRankBarebonesMissingToastIcons");
                state.toast = toast;
                prominent = true;
            } catch (ignore) {
                state.toast = null;
                return;
            }
        }
        setMissingToastIcons(toast, heroes);
        setPanelClass(toast.panel, MISSING_TOAST_EXPIRED_CLASS, false);
        if (!prominent) {
            return;
        }
        state.toastToken += 1;
        token = state.toastToken;
        setPanelClass(toast.panel, MISSING_TOAST_AGED_CLASS, false);
        if (!panelHasClass(toast.panel, MISSING_TOAST_VISIBLE_CLASS)) {
            schedule(MISSING_TOAST_REVEAL_DELAY, function () {
                if (missingToastIsCurrent(root, state, toast, token)) {
                    setPanelClass(toast.panel, MISSING_TOAST_VISIBLE_CLASS, true);
                }
            });
        }
        schedule(MISSING_TOAST_DURATION, function () {
            if (missingToastIsCurrent(root, state, toast, token)) {
                setPanelClass(toast.panel, MISSING_TOAST_AGED_CLASS, true);
            }
        });
    }
    function scheduleMissingToastRefresh(root, state, prominent) {
        state.refreshProminent = state.refreshProminent || !!prominent;
        if (state.refreshScheduled) {
            return;
        }
        state.refreshScheduled = true;
        schedule(0, function () {
            var show;
            if (!isValid(root) || root.__showrank_barebones_missing_toast_state_v2 !== state ||
                !state.refreshScheduled) {
                return;
            }
            state.refreshScheduled = false;
            show = state.refreshProminent;
            state.refreshProminent = false;
            if (state.activeHeroes.length) {
                showMissingToast(root, state, state.activeHeroes, show);
            } else {
                hideMissingToast(root, state, false);
            }
        });
    }
    function rememberMissingHero(record, hero) {
        record.missingActiveKey = hero;
        try {
            record.root.__showrank_barebones_missing_active_key = hero;
        } catch (ignore) {
        }
    }
    function removeMissingHero(state, hero) {
        var index;
        if (!state.activeHeroKeys[hero]) {
            return false;
        }
        delete state.activeHeroKeys[hero];
        for (index = state.activeHeroes.length - 1; index >= 0; index -= 1) {
            if (state.activeHeroes[index] === hero) {
                state.activeHeroes.splice(index, 1);
            }
        }
        return true;
    }
    function activateMissingHero(shared, record) {
        var root = getMissingNotificationRoot(shared);
        var state = getMissingToastState(root);
        var heroes = findByClass(record && record.root, "HeroName");
        var hero = heroes && heroes.length === 1 ? normalizeHero(readText(heroes[0])): "";
        if (!state || !hero) {
            return;
        }
        rememberMissingHero(record, hero);
        if (!state.activeHeroKeys[hero]) {
            state.activeHeroKeys[hero] = true;
            state.activeHeroes.push(hero);
        }
        scheduleMissingToastRefresh(root, state, true);
    }
    function deactivateMissingHero(shared, record) {
        var hero = record && record.missingActiveKey;
        var root;
        var state;
        if (!hero && record && isValid(record.root)) {
            try {
                hero = record.root.__showrank_barebones_missing_active_key || "";
            } catch (ignore) {
            }
        }
        if (!hero) {
            return;
        }
        rememberMissingHero(record, "");
        root = getMissingNotificationRoot(shared);
        state = getMissingToastState(root);
        if (state && removeMissingHero(state, hero)) {
            scheduleMissingToastRefresh(root, state, false);
        }
    }
    function setMissingActive(shared, record, active) {
        if (active) {
            activateMissingHero(shared, record);
        } else {
            deactivateMissingHero(shared, record);
        }
    }
    function parseGameClockSeconds(text) {
        var match;
        if (typeof text !== "string") {
            return null;
        }
        match = /^(-)?([0-9]+):([0-5][0-9])$/.exec(text.replace(/^\s+|\s+$/g, ""));
        return match ? match[1] ? 0: (Number(match[2]) * 60) + Number(match[3]): null;
    }
    function readMissingWindowSeconds(record) {
        var current = record && record.root;
        var parent;
        var clocks;
        var candidate;
        var index;
        var seconds;
        var depth = 0;
        if (!isValid(current)) {
            return null;
        }
        candidate = record.gameClockPanel;
        if (isValid(candidate)) {
            seconds = parseGameClockSeconds(readText(candidate));
            if (seconds !== null) {
                return seconds;
            }
        }
        while (isValid(current) && depth < 64) {
            candidate = findChild(current, "GameTime", "Label");
            clocks = candidate ? [candidate]: findByClass(current, "GameTime") || [];
            for (index = 0; index < clocks.length; index += 1) {
                seconds = parseGameClockSeconds(readText(clocks[index]));
                if (seconds !== null) {
                    record.gameClockPanel = clocks[index];
                    return seconds;
                }
            }
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
        record.gameClockPanel = null;
        return null;
    }
    function resetMissingPlayer(shared, record, expired) {
        if (!record) {
            return;
        }
        expired = !!expired;
        if (isValid(record.root) && record.missingWindowExpired !== expired) {
            record.missingWindowExpired = expired;
            setPanelClass(record.root, MISSING_WINDOW_CLASS, expired);
        }
        setMissingActive(shared, record, false);
        record.missingHealthArmed = record.missingHealthWasVisible = false;
    }
    function refreshMissingPlayer(shared, record, seconds) {
        var visible;
        var unavailable;
        if (!record || !record.active || !isValid(record.root)) {
            return false;
        }
        if (isHideoutDocumentRoot(shared.documentRoot) || seconds === null) {
            resetMissingPlayer(shared, record, false);
            return true;
        }
        if (seconds >= MISSING_WINDOW_END_SECONDS) {
            resetMissingPlayer(shared, record, true);
            return true;
        }
        if (record.missingWindowExpired !== false) {
            record.missingWindowExpired = false;
            setPanelClass(record.root, MISSING_WINDOW_CLASS, false);
        }
        visible = panelHasClass(record.root, "HealthVisible");
        unavailable = panelHasClass(record.root, "Dead") || panelHasClass(record.root, "Disconnected");
        if (visible || unavailable) {
            setMissingActive(shared, record, false);
        }
        if (visible) {
            record.missingHealthArmed = true;
            record.missingHealthWasVisible = true;
        } else if (!unavailable && record.missingHealthArmed && record.missingHealthWasVisible) {
            record.missingHealthWasVisible = false;
            setMissingActive(shared, record, true);
        }
    }
    function compactMissingRecords(shared) {
        var records = shared && shared.missingRecords;
        var index = 0;
        var record;
        while (records && index < records.length) {
            record = records[index];
            if (record && record.active && isValid(record.root)) {
                index += 1;
                continue;
            }
            if (record) {
                setMissingActive(shared, record, false);
                record.active = false;
            }
            records.splice(index, 1);
        }
        return records || [];
    }
    function stopMissingSession(shared) {
        var records;
        var root;
        var state;
        var index;
        if (!shared) {
            return;
        }
        records = shared.missingRecords || [];
        root = getMissingNotificationRoot(shared);
        for (index = 0; index < records.length; index += 1) {
            resetMissingPlayer(shared, records[index], records[index].missingWindowExpired === true);
        }
        state = getMissingToastState(root);
        if (state) {
            state.refreshScheduled = false;
            hideMissingToast(root, state, true);
        }
        shared.missingRecords = [];
        shared.missingNotificationRoot = null;
        shared.missingLeaderRoot = null;
        shared.missingRunning = false;
        shared.missingChecks = 0;
        shared.missingLeaderPulse = 0;
        shared.missingSessionToken += 1;
        shared.missingLeaderToken += 1;
    }
    function refreshMissingSession(shared) {
        var records = compactMissingRecords(shared);
        var leader;
        var seconds;
        var index;
        if (!shared || !isValid(shared.documentRoot) || !records.length) {
            stopMissingSession(shared);
            return false;
        }
        leader = isValid(shared.missingLeaderRoot) ? null: records[0];
        for (index = 0; !leader && index < records.length; index += 1) {
            if (records[index].root === shared.missingLeaderRoot) {
                leader = records[index];
            }
        }
        seconds = readMissingWindowSeconds(leader || records[0]);
        if (!isHideoutDocumentRoot(shared.documentRoot) && seconds !== null && seconds >= MISSING_WINDOW_END_SECONDS) {
            for (index = 0; index < records.length; index += 1) {
                resetMissingPlayer(shared, records[index], true);
            }
            stopMissingSession(shared);
            return false;
        }
        for (index = 0; index < records.length; index += 1) {
            refreshMissingPlayer(shared, records[index], seconds);
        }
        return shared.missingRunning;
    }
    function missingSessionIsCurrent(s, t) {
        return !!(s && s.missingRunning && s.missingSessionToken === t);
    }
    function startMissingLeader(shared) {
        var session = shared.missingSessionToken;
        var token = shared.missingLeaderToken;
        var root = shared.missingLeaderRoot;
        schedule(MISSING_WINDOW_RETRY_INTERVAL, function () {
            if (!missingSessionIsCurrent(shared, session) || shared.missingLeaderToken !== token ||
                shared.missingLeaderRoot !== root) {
                return;
            }
            if (!isValid(root)) {
                promoteMissingLeader(shared);
                return;
            }
            shared.missingChecks += 1;
            shared.missingLeaderPulse += 1;
            if (!refreshMissingSession(shared) || shared.missingChecks >= MISSING_WINDOW_MAX_RETRIES) {
                if (shared.missingRunning) {
                    stopMissingSession(shared);
                }
                return;
            }
            if (missingSessionIsCurrent(shared, session) && shared.missingLeaderToken === token &&
                shared.missingLeaderRoot === root) {
                startMissingLeader(shared);
            }
        });
    }
    function promoteMissingLeader(shared) {
        var records = compactMissingRecords(shared);
        var index;
        if (!shared || !shared.missingRunning || !records.length) {
            stopMissingSession(shared);
            return;
        }
        for (index = 0; index < records.length; index += 1) {
            if (isValid(records[index].root)) {
                shared.missingLeaderRoot = records[index].root;
                shared.missingLeaderToken += 1;
                shared.missingLeaderPulse += 1;
                startMissingLeader(shared);
                return;
            }
        }
        stopMissingSession(shared);
    }
    function scheduleMissingBackup(shared, record) {
        var session = shared.missingSessionToken;
        schedule(MISSING_BACKUP_INTERVAL, function () {
            var changed;
            if (!missingSessionIsCurrent(shared, session) || !record.active) {
                return;
            }
            if (!isValid(record.root)) {
                setMissingActive(shared, record, false);
                record.active = false;
                compactMissingRecords(shared);
                if (!shared.missingRecords.length) {
                    stopMissingSession(shared);
                } else if (!isValid(shared.missingLeaderRoot)) {
                    promoteMissingLeader(shared);
                }
                return;
            }
            if (!isValid(shared.missingLeaderRoot)) {
                promoteMissingLeader(shared);
            } else {
                changed = record.observedLeaderToken !== shared.missingLeaderToken ||
                    record.observedLeaderPulse !== shared.missingLeaderPulse;
                record.observedLeaderToken = shared.missingLeaderToken;
                record.observedLeaderPulse = shared.missingLeaderPulse;
                record.staleLeaderChecks = changed ? 0: record.staleLeaderChecks + 1;
                if (record.staleLeaderChecks >= 1) {
                    promoteMissingLeader(shared);
                }
            }
            if (missingSessionIsCurrent(shared, session) && record.active) {
                scheduleMissingBackup(shared, record);
            }
        });
    }
    function newMissingRecord(shared, root) {
        return {
            root: root,
            active: true,
            staleLeaderChecks: 0
        };
    }
    function registerMissingRecord(shared, root) {
        var records;
        var record;
        var index;
        if (!shared || !isValid(root)) {
            return;
        }
        if (!shared.missingRunning) {
            shared.missingSessionToken += 1;
            shared.missingRunning = true;
            shared.missingChecks = 0;
            shared.missingNotificationRoot = null;
            shared.missingLeaderRoot = root;
            shared.missingLeaderToken += 1;
            shared.missingLeaderPulse += 1;
            record = newMissingRecord(shared, root);
            shared.missingRecords = [record];
            if (!refreshMissingSession(shared)) {
                return;
            }
            startMissingLeader(shared);
            scheduleMissingBackup(shared, record);
            return;
        }
        records = compactMissingRecords(shared);
        if (!records.length) {
            stopMissingSession(shared);
            registerMissingRecord(shared, root);
            return;
        }
        for (index = 0; index < records.length; index += 1) {
            if (records[index].root === root) {
                record = records[index];
                resetMissingPlayer(shared, record, false);
                record.active = true;
                record.observedLeaderToken = shared.missingLeaderToken;
                record.observedLeaderPulse = shared.missingLeaderPulse;
                record.staleLeaderChecks = 0;
                refreshMissingSession(shared);
                return;
            }
        }
        record = newMissingRecord(shared, root);
        records.push(record);
        shared.missingRecords = records;
        if (refreshMissingSession(shared) && record.active) {
            scheduleMissingBackup(shared, record);
        }
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
    function buildTopbarRecord(panel) {
        var heroLabels = findByClass(panel, "HeroName");
        var heroLabel = heroLabels && heroLabels.length === 1 ? heroLabels[0]: null;
        var rankImage = findChild(panel, "ShowRankBarebonesTopbarRankImage", "Image");
        return isValid(panel) && isValid(heroLabel) && isValid(rankImage) ? {
            root: panel,
            heroLabel: heroLabel,
            rankImage: rankImage,
            hero: "",
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
        var counts = Object.create(null);
        var index;
        var preservedIndex;
        var record;
        var hero;
        var target;
        var account;
        for (index = 0; roots && index < roots.length; index += 1) {
            account = null;
            for (preservedIndex = 0; preservedRows && preservedIndex < preservedRows.length; preservedIndex += 1) {
                if (preservedRows[preservedIndex].root === roots[index]) {
                    account = normalizeAccount(preservedRows[preservedIndex].account);
                    break;
                }
            }
            target = rankTarget(roots[index], "ShowRankBarebonesPlayerListRankImage");
            if (target && !account) {
                setRankImage(target, null);
            }
            record = buildRowRecord(roots[index]);
            hero = currentRowHero(record);
            if (hero) {
                record.hero = hero;
                rows.push(record);
                counts[hero] = (counts[hero] || 0) + 1;
            }
        }
        return {
            rows: rows,
            counts: counts
        };
    }
    function scanEscapeTopbars(roots) {
        var topbars = [];
        var targets = [];
        var index;
        var record;
        var target;
        for (index = 0; roots && index < roots.length; index += 1) {
            target = rankTarget(roots[index], "ShowRankBarebonesTopbarRankImage");
            if (target) {
                targets.push(target);
            }
            record = buildTopbarRecord(roots[index]);
            if (record) {
                topbars.push(record);
            }
        }
        return {
            records: topbars,
            targets: targets
        };
    }
    function indexTopbarHeroes(topbars, rowCounts, accounts) {
        var counts = Object.create(null);
        var unique = topbars.length > 0;
        var index;
        var hero;
        for (index = 0; index < topbars.length; index += 1) {
            hero = refreshTopbar(topbars[index]);
            if (!hero || counts[hero] || accounts && !accounts[hero]) {
                unique = false;
            }
            counts[hero] = (counts[hero] || 0) + 1;
        }
        if (!unique || !rowCounts) {
            return {
                counts: counts,
                unique: unique,
                rowsCoverTopbars: false
            };
        }
        for (hero in counts) {
            if (Object.prototype.hasOwnProperty.call(counts, hero) && rowCounts[hero] !== 1) {
                return {
                    counts: counts,
                    unique: true,
                    rowsCoverTopbars: false
                };
            }
        }
        return {
            counts: counts,
            unique: true,
            rowsCoverTopbars: true
        };
    }
    function readEscapeRoster(shared, preservedRows) {
        var documentRoot = shared && shared.documentRoot;
        var rowRoots = findByClass(documentRoot, PLAYER_ROW_CLASS);
        var topbarRoots = findByClass(documentRoot, TOPBAR_PLAYER_CLASS);
        var rowScan = scanEscapeRows(rowRoots, preservedRows);
        var topbarScan;
        var topbarIndex;
        if (topbarRoots === null) {
            return {
                rows: rowScan.rows,
                topbars: null,
                topbarTargets: null,
                supported: false,
                topbarsUnique: false,
                rowsCoverTopbars: false
            };
        }
        topbarScan = scanEscapeTopbars(topbarRoots);
        topbarIndex = indexTopbarHeroes(topbarScan.records, rowScan.counts);
        return {
            rows: rowScan.rows,
            topbars: topbarScan.records,
            topbarTargets: topbarScan.targets,
            supported: topbarScan.records.length === 6 || topbarScan.records.length === 12,
            topbarsUnique: topbarIndex.unique,
            rowsCoverTopbars: topbarIndex.rowsCoverTopbars
        };
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
    function hydrateRosterAccounts(session) {
        var rows = session.roster && session.roster.rows;
        var index;
        var hero;
        for (index = 0; rows && index < rows.length; index += 1) {
            hero = rows[index].hero;
            rows[index].account = normalizeAccount(session.accountByHero[hero]);
        }
    }
    function planTeamAverages(session, writes) {
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
        if (!session.roster || session.roster.topbars.length !== 12 || writes.length !== 12) {
            return null;
        }
        for (index = 0; index < writes.length; index += 1) {
            side = detectTopbarTeamSide(writes[index].record.root);
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
        friendlyImage = findChild(session.shared.documentRoot, "ShowRankBarebonesAverageFriendlyImage", "Image");
        enemyImage = findChild(session.shared.documentRoot, "ShowRankBarebonesAverageEnemyImage", "Image");
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
    function indexRosterRows(session, roster) {
        var rowsByHero = Object.create(null);
        var rowCounts = Object.create(null);
        var seenAccounts = Object.create(null);
        var index;
        var record;
        var hero;
        var account;
        if (session.cacheReplay) {
            return {
                rowsByHero: rowsByHero,
                rowCounts: rowCounts
            };
        }
        for (index = 0; index < roster.rows.length; index += 1) {
            record = roster.rows[index];
            hero = currentRowHero(record);
            if (!hero || hero !== record.hero) {
                return {
                    status: "stale"
                };
            }
            if (rowCounts[hero]) {
                return {
                    status: "invalid"
                };
            }
            rowCounts[hero] = 1;
            account = normalizeAccount(record.account);
            if (account && seenAccounts[account]) {
                return {
                    status: "invalid"
                };
            }
            if (account) {
                seenAccounts[account] = true;
            }
            rowsByHero[hero] = record;
        }
        return {
            rowsByHero: rowsByHero,
            rowCounts: rowCounts
        };
    }
    function currentTopbarHero(record) {
        return isValid(record.root) && isValid(record.heroLabel) && isValid(record.rankImage) ?
            normalizeHero(readText(record.heroLabel)): "";
    }
    function appendRosterWrite(session, state, record) {
        var hero = currentTopbarHero(record);
        var account;
        if (!hero || hero !== record.hero) {
            return "stale";
        }
        if (state.seenHeroes[hero]) {
            return "invalid";
        }
        state.seenHeroes[hero] = true;
        account = normalizeAccount(session.accountByHero[hero]);
        if (!session.cacheReplay && state.rowCounts[hero] !== 1) {
            if (state.rowCounts[hero] > 1) {
                return "invalid";
            }
            state.complete = false;
            return "";
        }
        if (!account || state.seenAccounts[account]) {
            if (account && state.seenAccounts[account]) {
                return "invalid";
            }
            state.complete = false;
            return "";
        }
        if (!session.cacheReplay && state.rowsByHero[hero].account !== account) {
            return "stale";
        }
        state.seenAccounts[account] = true;
        state.writes.push({
            record: record,
            hero: hero,
            account: account
        });
        return "";
    }
    function cacheRosterWrites(roster, writes, complete) {
        var cached = [];
        var index;
        if (!complete || !roster.supported) {
            return null;
        }
        for (index = 0; index < writes.length; index += 1) {
            cached.push({
                hero: writes[index].hero,
                account: writes[index].account
            });
        }
        return cached.length === roster.topbars.length ? cached: null;
    }
    function planRosterWrites(session, terminal) {
        var roster = session && session.roster;
        var rowIndex;
        var state;
        var index;
        var status;
        if (!sessionIsCurrent(session) || !roster || roster.topbars === null) {
            return {
                stale: true
            };
        }
        if (!roster.topbarsUnique) {
            return {
                invalid: true
            };
        }
        rowIndex = indexRosterRows(session, roster);
        if (rowIndex.status) {
            return rowIndex.status === "stale" ? {
                stale: true
            } : {
                invalid: true
            };
        }
        state = {
            rowsByHero: rowIndex.rowsByHero,
            rowCounts: rowIndex.rowCounts,
            seenHeroes: Object.create(null),
            seenAccounts: Object.create(null),
            writes: [],
            complete: true
        };
        for (index = 0; index < roster.topbars.length; index += 1) {
            status = appendRosterWrite(session, state, roster.topbars[index]);
            if (status) {
                return status === "stale" ? {
                    stale: true
                } : {
                    invalid: true
                };
            }
        }
        if (!terminal && (!state.complete || !roster.supported)) {
            return {
                waiting: true
            };
        }
        return {
            writes: state.writes,
            complete: state.complete,
            cached: cacheRosterWrites(roster, state.writes, state.complete),
            average: state.complete ? planTeamAverages(session, state.writes): null
        };
    }
    function rosterPlanIsCurrent(session, plan) {
        var index;
        var record;
        if (!sessionIsCurrent(session)) {
            return false;
        }
        for (index = 0; index < plan.writes.length; index += 1) {
            record = plan.writes[index].record;
            if (!isValid(record.root) || !isValid(record.heroLabel) || !isValid(record.rankImage) ||
                normalizeHero(readText(record.heroLabel)) !== plan.writes[index].hero) {
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
            clearTopbarRecords(session.roster.topbarTargets || session.roster.topbars);
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
        if (result !== "stale") {
            return result;
        }
        if (session.stalePlans >= 1) {
            clearTopbarRecords(session.roster && (session.roster.topbarTargets || session.roster.topbars));
            clearTeamAverages(session.shared.documentRoot);
            return "invalid";
        }
        session.stalePlans += 1;
        session.roster = readEscapeRoster(session.shared, session.rows);
        session.rows = session.roster.rows;
        hydrateRosterAccounts(session);
        result = applyRosterPlan(session, terminal);
        if (result === "stale") {
            clearTopbarRecords(session.roster && (session.roster.topbarTargets || session.roster.topbars));
            clearTeamAverages(session.shared.documentRoot);
            return "invalid";
        }
        return result;
    }
    function finishEscapePass(session) {
        var shared = session.shared;
        var result;
        if (session.finished || !escapeIsCurrent(session, session.token)) {
            return;
        }
        result = renderRoster(session, true);
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
        if (session.finished || !escapeIsCurrent(session, session.token)) {
            return;
        }
        session.index += 1;
        account = normalizeAccount(account);
        if (account) {
            record.account = account;
            session.accountByHero[record.hero] = account;
            setRankImage(record, account);
            result = renderRoster(session, false);
            if (result === "invalid") {
                finishEscapePass(session);
                return;
            }
            if (session.lastPlan && session.lastPlan.cached) {
                finishEscapePass(session);
                return;
            }
        }
        if (session.index >= session.rows.length) {
            finishEscapePass(session);
            return;
        }
        probeNextRow(session);
    }
    function inspectRow(session, record, snapshot, attempt) {
        var account;
        if (session.finished || !escapeIsCurrent(session, session.token)) {
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
        var record;
        var snapshot;
        if (session.finished || !escapeIsCurrent(session, session.token)) {
            return;
        }
        if (session.index >= session.rows.length) {
            finishEscapePass(session);
            return;
        }
        record = session.rows[session.index];
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
        var roster;
        if (!escapeIsCurrent(session, session.token) || session.started) {
            return;
        }
        roster = readEscapeRoster(session.shared);
        clearTopbarRecords(roster.topbarTargets || roster.topbars);
        session.roster = roster;
        session.rows = roster.rows;
        hydrateRosterAccounts(session);
        if (attempt >= ESCAPE_ROW_DELAYS.length || roster.rows.length > 0 && (roster.topbars === null ||
            !roster.supported || roster.rowsCoverTopbars)) {
            session.started = true;
            probeNextRow(session);
            return;
        }
        scheduleEscape(ESCAPE_ROW_DELAYS[attempt], session, session.token, function () {
            collectEscapeRows(session, attempt + 1);
        });
    }
    function readCompletedTopbars(shared) {
        var roots = findByClass(shared.documentRoot, TOPBAR_PLAYER_CLASS);
        var scan;
        var cached = shared.completedRoster;
        var accounts = Object.create(null);
        var seenAccounts = Object.create(null);
        var index;
        var hero;
        var account;
        var records;
        var topbarTargets;
        if (roots === null) {
            return {
                topbars: null,
                topbarTargets: null,
                accounts: null
            };
        }
        scan = scanEscapeTopbars(roots);
        records = scan.records;
        topbarTargets = scan.targets;
        if (!cached || records.length !== cached.length) {
            return {
                topbars: records,
                topbarTargets: topbarTargets,
                accounts: null
            };
        }
        for (index = 0; index < cached.length; index += 1) {
            hero = normalizeHero(cached[index].hero);
            account = normalizeAccount(cached[index].account);
            if (!hero || !account || accounts[hero] || seenAccounts[account]) {
                return {
                    topbars: records,
                    topbarTargets: topbarTargets,
                    accounts: null
                };
            }
            accounts[hero] = account;
            seenAccounts[account] = true;
        }
        if (!indexTopbarHeroes(records, null, accounts).unique) {
            return {
                topbars: records,
                topbarTargets: topbarTargets,
                accounts: null
            };
        }
        return {
            topbars: records,
            topbarTargets: topbarTargets,
            accounts: accounts
        };
    }
    function reuseCompletedRoster(shared, escapeRoot) {
        var current = readCompletedTopbars(shared);
        var session;
        var result;
        if (!current.accounts) {
            clearTopbarRecords(current.topbarTargets || current.topbars);
            clearTeamAverages(shared.documentRoot);
            shared.completedRoster = null;
            shared.escapeRendered = false;
            return false;
        }
        session = {
            shared: shared,
            root: escapeRoot,
            roster: {
                rows: [],
                topbars: current.topbars,
                topbarTargets: current.topbarTargets,
                supported: true,
                topbarsUnique: true
            },
            accountByHero: current.accounts,
            cacheReplay: true,
            stalePlans: 0
        };
        result = renderRoster(session, true);
        if (result === "applied" && session.lastPlan && session.lastPlan.cached) {
            return true;
        }
        shared.completedRoster = null;
        clearTopbarRecords(session.roster.topbarTargets || session.roster.topbars);
        clearTeamAverages(shared.documentRoot);
        shared.escapeRendered = false;
        return false;
    }
    function startEscapePass(escapeRoot) {
        var shared = getState(escapeRoot);
        var playersTab;
        var session;
        state = shared || state;
        if (!shared || !isValid(escapeRoot) || isHideoutDocumentRoot(shared.documentRoot)) {
            if (!shared || !isValid(escapeRoot)) {
                state = null;
            }
            return;
        }
        if (shared.escapeOpenLatched && shared.escapeRoot !== escapeRoot) {
            shared.escapeToken += 1;
            releaseEscapeSession(shared);
            shared.escapeOpenLatched = false;
        }
        if (!isEscapeMenuOpen(escapeRoot)) {
            shared.escapeOpenLatched = false;
            shared.escapeRoot = null;
            if (shared.escape) {
                shared.escapeToken += 1;
                releaseEscapeSession(shared);
            }
            state = null;
            return;
        }
        if (shared.completedRoster && reuseCompletedRoster(shared, escapeRoot)) {
            shared.escapeOpenLatched = true;
            shared.escapeRoot = escapeRoot;
            return;
        }
        if (shared.escapeOpenLatched) {
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
            rows: [],
            accountByHero: Object.create(null),
            index: 0,
            started: false,
            finished: false,
            stalePlans: 0,
            lastPlan: null
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
        if (!shared) {
            state = null;
            return;
        }
        if (isEscapeMenuOpen(escapeRoot)) {
            return;
        }
        shared.escapeOpenLatched = false;
        shared.escapeRoot = null;
        shared.escapeToken += 1;
        releaseEscapeSession(shared);
        state = null;
    }
    function installProfileStatsCommunity() {
        /* PROFILE_STATS_COMMUNITY_MODULE_START */
(function () {
    "use strict";

    var BRIDGE_URL = "https://hantu-raya.github.io/deadlock-stats-bridge/bridge.html";
    var BRIDGE_ORIGIN_PATH = "https://hantu-raya.github.io/deadlock-stats-bridge/bridge.html";
    var SUPPORTER_TICKER_URL = "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/";
    var STATLOCKER_PROFILE_URL_PREFIX = "https://statlocker.gg/profile/";
    var STATLOCKER_PROFILE_URL_SUFFIX = "/matches";
    var BRIDGE_TITLE_PREFIX = "DLSTATS2:";
    var BRIDGE_TITLE_MAX_LENGTH = 2048;
    var BRIDGE_URL_MAX_LENGTH = 4096;
    var BRIDGE_FRAGMENT_MAX_LENGTH = 4096;
    var DEFAULT_MATCH_LIMIT = 50;
    var MATCH_LIMITS = {
        "50": true,
        "100": true,
        "150": true
    };
    var MATCH_MODES = {
        "ranked": true,
        "standard": true
    };
    var COMPARISON_MODES = {
        "community": true,
        "percentile": true
    };
    var AUTHORITY_NAMES = ["accountid", "steamid"];
    var CACHE_TTL_MS = 10 * 60 * 1000;
    var CONTEXT_CHECK_SECONDS = 0.5;
    var BRIDGE_ASSIGN_DELAY_SECONDS = 0.25;
    var REQUEST_TIMEOUT_SECONDS = 25;
    var MAX_HERO_ROWS = 64;
    var MAX_GENERATED_LENGTH = 64;
    var MAX_ERROR_MESSAGE_LENGTH = 160;
    var MAX_PLAYER_NAME_LENGTH = 64;
    var STATE_STOCK = "stock";
    var STATE_LOADING = "loading";
    var STATE_READY = "ready";
    var STATE_ERROR = "error";
    var STATE_DISABLED = "disabled";

    var GROUPS = [
        {
            id: "combat",
            metrics: ["kd", "kda"]
        },
        {
            id: "kills",
            metrics: ["average_kills", "average_assists"]
        },
        {
            id: "survival",
            metrics: ["average_deaths", "damage_taken_per_minute"]
        },
        {
            id: "damage",
            metrics: ["player_damage_per_minute", "accuracy", "critical_hit_rate", "boss_damage_per_minute"]
        },
        {
            id: "economy",
            metrics: ["net_worth_per_minute"]
        },
        {
            id: "sustain",
            metrics: ["healing_per_minute"]
        }
    ];

    var METRIC_PANELS = {
        "kd": ["PSCMetricKdPlayer", "PSCMetricKdCommunity", "PSCMetricKdPercentile"],
        "kda": ["PSCMetricKdaPlayer", "PSCMetricKdaCommunity", "PSCMetricKdaPercentile"],
        "average_kills": ["PSCMetricAverageKillsPlayer", "PSCMetricAverageKillsCommunity", "PSCMetricAverageKillsPercentile"],
        "average_assists": ["PSCMetricAverageAssistsPlayer", "PSCMetricAverageAssistsCommunity", "PSCMetricAverageAssistsPercentile"],
        "average_deaths": ["PSCMetricAverageDeathsPlayer", "PSCMetricAverageDeathsCommunity", "PSCMetricAverageDeathsPercentile"],
        "damage_taken_per_minute": ["PSCMetricDamageTakenPerMinutePlayer", "PSCMetricDamageTakenPerMinuteCommunity", "PSCMetricDamageTakenPerMinutePercentile"],
        "player_damage_per_minute": ["PSCMetricPlayerDamagePerMinutePlayer", "PSCMetricPlayerDamagePerMinuteCommunity", "PSCMetricPlayerDamagePerMinutePercentile"],
        "accuracy": ["PSCMetricAccuracyPlayer", "PSCMetricAccuracyCommunity", "PSCMetricAccuracyPercentile"],
        "critical_hit_rate": ["PSCMetricCriticalHitRatePlayer", "PSCMetricCriticalHitRateCommunity", "PSCMetricCriticalHitRatePercentile"],
        "net_worth_per_minute": ["PSCMetricNetWorthPerMinutePlayer", "PSCMetricNetWorthPerMinuteCommunity", "PSCMetricNetWorthPerMinutePercentile"],
        "boss_damage_per_minute": ["PSCMetricBossDamagePerMinutePlayer", "PSCMetricBossDamagePerMinuteCommunity", "PSCMetricBossDamagePerMinutePercentile"],
        "healing_per_minute": ["PSCMetricHealingPerMinutePlayer", "PSCMetricHealingPerMinuteCommunity", "PSCMetricHealingPerMinutePercentile"]
    };

    var GROUP_PERCENTILE_PANELS = {
        "combat": "PSCGroupCombatPercentile",
        "kills": "PSCGroupKillsPercentile",
        "survival": "PSCGroupSurvivalPercentile",
        "damage": "PSCGroupDamagePercentile",
        "economy": "PSCGroupEconomyPercentile",
        "sustain": "PSCGroupSustainPercentile"
    };

    var PERCENTILE_TOP_CLASS = "ProfileStatsCommunityPercentileTop";
    var PERCENTILE_BOTTOM_CLASS = "ProfileStatsCommunityPercentileBottom";
    var PERCENTILE_UNAVAILABLE_CLASS = "ProfileStatsCommunityPercentileUnavailable";
    var VALUE_UNAVAILABLE_CLASS = "ProfileStatsCommunityValueUnavailable";

    var ERROR_CODES = {
        "invalid_query": true,
        "network_error": true,
        "upstream_error": true,
        "rate_limit": true,
        "empty_sample": true,
        "invalid_payload": true,
        "payload_too_large": true,
        "internal_error": true
    };

    var ERROR_TEXT = {
        "invalid_query": "The community request was rejected.",
        "network_error": "The community service could not be reached.",
        "upstream_error": "The community service is unavailable.",
        "rate_limit": "The community service is rate-limited. Try again later.",
        "empty_sample": "No community sample is available for this profile yet.",
        "invalid_payload": "The community response was invalid.",
        "payload_too_large": "The community response was too large.",
        "internal_error": "The community service returned an internal error."
    };

    var root = null;
    var heroList = null;
    var statsBlock = null;
    var stockTitle = null;
    var stockLeft = null;
    var stockRight = null;
    var stockSectionName = null;
    var communityButton = null;
    var customPanel = null;
    var selfNamePanel = null;
    var titleLabel = null;
    var statLockerButton = null;
    var playerHeadingLeft = null;
    var playerHeadingRight = null;
    var accountWitness = null;
    var statusLabel = null;
    var metricsPanel = null;
    var metadataPanel = null;
    var sampleLabel = null;
    var generatedLabel = null;
    var retryButton = null;
    var bridgePanel = null;
    var supporterTicker = null;
    var matchCountDropdown = null;
    var rankedTab = null;
    var standardTab = null;
    var displayCommunityTab = null;
    var displayPercentileTab = null;
    var communityHeadingLeft = null;
    var percentileHeadingLeft = null;
    var communityHeadingRight = null;
    var percentileHeadingRight = null;
    var metricRefs = {};
    var stockSectionSignature = "";
    var stockRowSignature = "";

    var currentIdentity = null;
    var currentDisplayName = "";
    var lifecycleState = STATE_STOCK;
    var requestGeneration = 0;
    var watcherGeneration = 0;
    var watcherHandle = null;
    var watcherPending = false;
    var watcherCallback = null;
    var bridgeAssignmentHandle = null;
    var nonceSerial = 0;
    var requestState = null;
    var memoryCache = null;
    var rateLimitUntil = 0;
    var rateLimitBlocked = false;
    var initialized = false;
    var selectedMatches = DEFAULT_MATCH_LIMIT;
    var selectedMode = "ranked";
    var selectedComparison = "percentile";

    function isCallable(value) {
        return typeof value === "function";
    }


    function isCustomActive() {
        return lifecycleState === STATE_LOADING || lifecycleState === STATE_READY || lifecycleState === STATE_ERROR;
    }

    function enterState(nextState) {
        if (lifecycleState !== nextState) {
            lifecycleState = nextState;
        }
    }

    function isValidPanel(panel) {
        if (!panel) {
            return false;
        }
        try {
            if (isCallable(panel.IsValid)) {
                return !!panel.IsValid();
            }
        } catch (error) {
            return false;
        }
        return true;
    }

    function findPanel(id) {
        if (!isValidPanel(root) || !id) {
            return null;
        }
        try {
            return root.FindChildTraverse(id);
        } catch (error) {
            return null;
        }
    }

    function findDirectChildByClass(panel, className) {
        var count;
        var index;
        var child;
        if (!isValidPanel(panel) || !className) {
            return null;
        }
        try {
            count = Math.min(panel.GetChildCount(), 8);
        } catch (error) {
            return null;
        }
        for (index = 0; index < count; index += 1) {
            try {
                child = panel.GetChild(index);
            } catch (error2) {
                return null;
            }
            if (!isValidPanel(child)) {
                continue;
            }
            try {
                if (isCallable(child.BHasClass) && child.BHasClass(className)) {
                    return child;
                }
            } catch (error3) {
                continue;
            }
        }
        return null;
    }

    function setPanelEvent(panel, eventName, handler) {
        if (!isValidPanel(panel) || !isCallable(handler)) {
            return false;
        }
        try {
            panel.SetPanelEvent(eventName, handler);
            return true;
        } catch (error) {
            return false;
        }
    }

    function registerPanelEvent(panel, eventName, handler) {
        if (!isValidPanel(panel) || !isCallable(handler) || !isCallable($.RegisterEventHandler)) {
            return false;
        }
        try {
            $.RegisterEventHandler(eventName, panel, handler);
            return true;
        } catch (error) {
            return false;
        }
    }


    function setStyle(panel, propertyName, value) {
        if (!isValidPanel(panel)) {
            return;
        }
        try {
            if (panel.style) {
                panel.style[propertyName] = value;
            }
        } catch (error) {
            return;
        }
    }

    function setVisibility(panel, visible) {
        setStyle(panel, "visibility", visible ? "visible" : "collapse");
    }

    function setVisibleProperty(panel, visible) {
        if (!isValidPanel(panel)) {
            return;
        }
        try {
            panel.visible = !!visible;
        } catch (error) {
            return;
        }
    }

    function setText(panel, value) {
        if (!isValidPanel(panel)) {
            return;
        }
        try {
            panel.text = value === null || value === undefined ? "" : String(value);
        } catch (error) {
            return;
        }
    }

    function setClass(panel, className, enabled) {
        if (!isValidPanel(panel) || !className) {
            return;
        }
        try {
            if (enabled && isCallable(panel.AddClass)) {
                panel.AddClass(className);
            } else if (!enabled && isCallable(panel.RemoveClass)) {
                panel.RemoveClass(className);
            }
        } catch (error) {
            return;
        }
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function textOf(panel) {
        if (!isValidPanel(panel)) {
            return "";
        }
        try {
            return panel.text === null || panel.text === undefined ? "" : String(panel.text);
        } catch (error) {
            return "";
        }
    }

    function normalizeDisplayName(value) {
        var normalized = trim(String(value || "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " "));
        if (normalized.length > MAX_PLAYER_NAME_LENGTH) {
            normalized = normalized.substring(0, MAX_PLAYER_NAME_LENGTH);
        }
        return normalized;
    }

    function readDisplayName() {
        var displayName;
        var count;
        var index;
        var child;
        if (!isValidPanel(selfNamePanel)) {
            selfNamePanel = findPanel("SelfName");
        }
        displayName = normalizeDisplayName(textOf(selfNamePanel));
        if (displayName) {
            return displayName;
        }
        try {
            count = Math.min(selfNamePanel.GetChildCount(), 8);
        } catch (error) {
            return "";
        }
        for (index = 0; index < count; index += 1) {
            try {
                child = selfNamePanel.GetChild(index);
            } catch (error2) {
                return "";
            }
            displayName = normalizeDisplayName(textOf(child));
            if (displayName) {
                return displayName;
            }
        }
        return "";
    }

    function renderViewedName() {
        var displayName = readDisplayName() || "PLAYER";
        if (displayName === currentDisplayName) {
            return;
        }
        currentDisplayName = displayName;
        setText(titleLabel, displayName + " VS COMMUNITY");
        setText(playerHeadingLeft, displayName);
        setText(playerHeadingRight, displayName);
    }

    function openStatLockerProfile() {
        var identity;
        var url;
        if (!isCustomActive()) {
            return;
        }
        identity = readIdentity();
        if (identity.state !== "valid" || !identity.account) {
            return;
        }
        url = STATLOCKER_PROFILE_URL_PREFIX + encodeURIComponent(identity.account) + STATLOCKER_PROFILE_URL_SUFFIX;
        try {
            if (isCallable($.DispatchEvent)) {
                $.DispatchEvent("ExternalBrowserGoToURL", url);
            }
        } catch (error) {
            return;
        }
    }

    function readRootAuthority(name) {
        var value;
        if (!isValidPanel(root)) {
            return "";
        }
        try {
            if (isCallable(root.GetAttributeString)) {
                value = root.GetAttributeString(name, "");
                return value === null || value === undefined ? "" : String(value);
            }
        } catch (error) {
            return "";
        }
        try {
            if (root[name] !== undefined && root[name] !== null) {
                return String(root[name]);
            }
        } catch (error2) {
            return "";
        }
        return "";
    }

    function stripLeadingZeroes(value) {
        var result = String(value).replace(/^0+/, "");
        return result || "0";
    }

    function normalizeDigits(value) {
        var normalized = trim(value);
        if (!/^\d{1,20}$/.test(normalized)) {
            return "";
        }
        normalized = stripLeadingZeroes(normalized);
        if (normalized === "0") {
            return "";
        }
        return normalized;
    }

    function safeAccountNumber(value) {
        if (!finiteNumber(value) || Math.floor(value) !== value || value <= 0 || value > 9007199254740991) {
            return null;
        }
        return value;
    }

    function safeAccountText(value) {
        var number = Number(value);
        return safeAccountNumber(number) !== null && String(number) === value;
    }

    function payloadAccountMatches(value, accountText) {
        var account = safeAccountNumber(value);
        return account !== null && String(account) === accountText;
    }

    function compareDecimal(left, right) {
        left = stripLeadingZeroes(left);
        right = stripLeadingZeroes(right);
        if (left.length !== right.length) {
            return left.length < right.length ? -1 : 1;
        }
        if (left === right) {
            return 0;
        }
        return left < right ? -1 : 1;
    }

    function subtractDecimal(left, right) {
        var output = "";
        var borrow = 0;
        var index = left.length - 1;
        var rightIndex = right.length - 1;
        var digit;
        var rightDigit;
        var difference;
        if (compareDecimal(left, right) < 0) {
            return "";
        }
        while (index >= 0) {
            digit = parseInt(left.charAt(index), 10) - borrow;
            rightDigit = rightIndex >= 0 ? parseInt(right.charAt(rightIndex), 10) : 0;
            difference = digit - rightDigit;
            if (difference < 0) {
                difference += 10;
                borrow = 1;
            } else {
                borrow = 0;
            }
            output = String(difference) + output;
            index -= 1;
            rightIndex -= 1;
        }
        return stripLeadingZeroes(output);
    }

    function normalizeAuthority(value, name) {
        var normalized = normalizeDigits(value);
        var steamBase = "76561197960265728";
        if (!normalized) {
            return "";
        }
        if (name === "steamid" && normalized.length > 10) {
            normalized = subtractDecimal(normalized, steamBase);
            return normalizeDigits(normalized);
        }
        return normalized;
    }

    function readIdentity() {
        var witness;
        var witnessAccount;
        var authorityNames = AUTHORITY_NAMES;
        var index;
        var authority;
        if (!isValidPanel(accountWitness)) {
            accountWitness = findPanel("ProfileStatsCommunityAccount");
        }
        witness = accountWitness;
        witnessAccount = normalizeDigits(textOf(witness));
        if (!witnessAccount || !safeAccountText(witnessAccount)) {
            return {
                state: "missing",
                account: "",
                message: "The viewed profile account is unavailable."
            };
        }
        for (index = 0; index < authorityNames.length; index += 1) {
            authority = readRootAuthority(authorityNames[index]);
            if (trim(authority) !== "") {
                authority = normalizeAuthority(authority, authorityNames[index]);
                if (!authority || authority !== witnessAccount) {
                    return {
                        state: "mismatch",
                        account: witnessAccount,
                        message: "The viewed profile account witness does not match the profile root."
                    };
                }
            }
        }
        return {
            state: "valid",
            account: witnessAccount,
            message: ""
        };
    }

    function sameIdentity(left, right) {
        if (!left || !right) {
            return false;
        }
        return left.state === right.state && left.account === right.account;
    }


    function isAscii(value) {
        var index;
        var code;
        for (index = 0; index < value.length; index += 1) {
            code = value.charCodeAt(index);
            if (code < 32 || code > 126) {
                return false;
            }
        }
        return true;
    }

    function isPlainMessage(value) {
        return typeof value === "string" && value.length > 0 && value.length <= MAX_ERROR_MESSAGE_LENGTH && isAscii(value);
    }

    function finiteNumber(value) {
        return typeof value === "number" && isFinite(value);
    }

    function isArray(value) {
        return Object.prototype.toString.call(value) === "[object Array]";
    }

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function exactKeys(object, required, optional) {
        var allowed = {};
        var keys;
        var index;
        var key;
        if (!object || typeof object !== "object" || isArray(object)) {
            return false;
        }
        optional = optional || [];
        for (index = 0; index < required.length; index += 1) {
            allowed[required[index]] = true;
        }
        for (index = 0; index < optional.length; index += 1) {
            allowed[optional[index]] = true;
        }
        keys = Object.keys(object);
        for (index = 0; index < keys.length; index += 1) {
            key = keys[index];
            if (!hasOwn(allowed, key)) {
                return false;
            }
        }
        for (index = 0; index < required.length; index += 1) {
            if (!hasOwn(object, required[index])) {
                return false;
            }
        }
        return true;
    }

    function expectedMetric(groupIndex, metricIndex) {
        return GROUPS[groupIndex].metrics[metricIndex];
    }
    function validMatchLimit(value) {
        return finiteNumber(value) && Math.floor(value) === value && hasOwn(MATCH_LIMITS, String(value));
    }

    function validMatchMode(value) {
        return typeof value === "string" && hasOwn(MATCH_MODES, value);
    }
    function validComparisonMode(value) {
        return typeof value === "string" && hasOwn(COMPARISON_MODES, value);
    }

    function validateIdentityFields(payload, request) {
        if (!payload || typeof payload !== "object") {
            return "invalid";
        }
        if (payload.request !== request.nonce) {
            return "stale";
        }
        if (!payloadAccountMatches(payload.account, request.account) || payload.matches !== request.matches || payload.mode !== request.mode) {
            return "invalid";
        }
        return "ok";
    }

    function validateSuccessPayload(payload, request) {
        var identityResult;
        var groupIndex;
        var metricIndex;
        var group;
        var metric;
        var value;
        var percentile;
        identityResult = validateIdentityFields(payload, request);
        if (identityResult !== "ok") {
            return identityResult;
        }
        if (!exactKeys(payload, ["v", "kind", "request", "account", "matches", "mode", "sample", "generated", "groups"])) {
            return "invalid";
        }
        if (payload.v !== 3 || payload.kind !== "profile_stats" || typeof payload.account !== "number" || safeAccountNumber(payload.account) === null || typeof payload.request !== "string") {
            return "invalid";
        }
        if (!validMatchLimit(payload.matches) || !validMatchMode(payload.mode) || !finiteNumber(payload.sample) || Math.floor(payload.sample) !== payload.sample || payload.sample < 0 || payload.sample > request.matches) {
            return "invalid";
        }
        if (typeof payload.generated !== "string" || payload.generated.length === 0 || payload.generated.length > MAX_GENERATED_LENGTH || !isAscii(payload.generated)) {
            return "invalid";
        }
        if (!isArray(payload.groups) || payload.groups.length !== GROUPS.length) {
            return "invalid";
        }
        for (groupIndex = 0; groupIndex < GROUPS.length; groupIndex += 1) {
            group = payload.groups[groupIndex];
            if (!exactKeys(group, ["id", "metrics"]) || group.id !== GROUPS[groupIndex].id || !isArray(group.metrics) || group.metrics.length !== GROUPS[groupIndex].metrics.length) {
                return "invalid";
            }
            for (metricIndex = 0; metricIndex < GROUPS[groupIndex].metrics.length; metricIndex += 1) {
                metric = group.metrics[metricIndex];
                if (!exactKeys(metric, ["id", "player", "community", "percentile"]) || metric.id !== expectedMetric(groupIndex, metricIndex)) {
                    return "invalid";
                }
                value = metric.player;
                if (value !== null && !finiteNumber(value)) {
                    return "invalid";
                }
                value = metric.community;
                if (value !== null && !finiteNumber(value)) {
                    return "invalid";
                }
                percentile = metric.percentile;
                if (percentile !== null && (!finiteNumber(percentile) || percentile < 0 || percentile > 100)) {
                    return "invalid";
                }
            }
        }
        return "ok";
    }

    function validateErrorPayload(payload, request) {
        var identityResult;
        var status;
        var retryAfter;
        identityResult = validateIdentityFields(payload, request);
        if (identityResult !== "ok") {
            return identityResult;
        }
        if (!exactKeys(payload, ["v", "kind", "request", "account", "matches", "mode", "code"], ["status", "retry_after", "message"])) {
            return "invalid";
        }
        if (payload.v !== 3 || payload.kind !== "error" || typeof payload.account !== "number" || safeAccountNumber(payload.account) === null || typeof payload.request !== "string" || !validMatchLimit(payload.matches) || !validMatchMode(payload.mode) || !ERROR_CODES[payload.code]) {
            return "invalid";
        }
        if (hasOwn(payload, "status")) {
            status = payload.status;
            if (!finiteNumber(status) || Math.floor(status) !== status || status < 100 || status > 599) {
                return "invalid";
            }
        }
        if (hasOwn(payload, "retry_after")) {
            retryAfter = payload.retry_after;
            if (!finiteNumber(retryAfter) || retryAfter < 0 || retryAfter > 86400) {
                return "invalid";
            }
        }
        if (hasOwn(payload, "message") && !isPlainMessage(payload.message)) {
            return "invalid";
        }
        return "ok";
    }

    function parseTitle(title) {
        var body;
        if (typeof title !== "string" || title.length > BRIDGE_TITLE_MAX_LENGTH || !isAscii(title)) {
            return { kind: "invalid_title" };
        }
        if (title.indexOf(BRIDGE_TITLE_PREFIX) !== 0) {
            return null;
        }
        if (title.length === BRIDGE_TITLE_PREFIX.length) {
            return { kind: "invalid_title" };
        }
        body = title.substring(BRIDGE_TITLE_PREFIX.length);
        try {
            return { kind: "payload", value: JSON.parse(body) };
        } catch (error) {
            return { kind: "invalid_title" };
        }
    }


    function createNonce() {
        nonceSerial += 1;
        return "p" + new Date().getTime().toString(36) + nonceSerial.toString(36);
    }

    function now() {
        return new Date().getTime();
    }

    function freshCache(account, matches, mode) {
        var age;
        if (!memoryCache || memoryCache.account !== account || memoryCache.matches !== matches || memoryCache.mode !== mode) {
            return null;
        }
        age = now() - memoryCache.receivedAt;
        if (age < 0 || age >= CACHE_TTL_MS || generatedIsStale(memoryCache.payload.generated)) {
            memoryCache = null;
            return null;
        }
        return memoryCache.payload;
    }

    function formatValue(value) {
        if (value === null || value === undefined) {
            return "—";
        }
        if (!finiteNumber(value)) {
            return "—";
        }
        return String(value);
    }

    function formatPercentile(value) {
        var displayed;
        if (value === null || value === undefined || !finiteNumber(value)) {
            return "—";
        }
        displayed = value >= 50 ? 100 - value : value;
        return (value >= 50 ? "TOP " : "BOTTOM ") + String(Math.max(1, Math.round(displayed))) + "%";
    }

    function setPercentileState(panel, value) {
        var available = value !== null && value !== undefined && finiteNumber(value);
        setClass(panel, PERCENTILE_TOP_CLASS, available && value >= 50);
        setClass(panel, PERCENTILE_BOTTOM_CLASS, available && value < 50);
        setClass(panel, PERCENTILE_UNAVAILABLE_CLASS, !available);
    }

    function setValueState(panel, value) {
        setClass(panel, VALUE_UNAVAILABLE_CLASS, value === null || value === undefined || !finiteNumber(value));
    }
    function applyComparisonMode() {
        var showCommunity = selectedComparison === "community";
        var metricId;
        var refs;
        for (metricId in METRIC_PANELS) {
            if (!hasOwn(METRIC_PANELS, metricId)) {
                continue;
            }
            refs = resolveMetricRefs(metricId);
            if (!refs) {
                continue;
            }
            setVisibility(refs.community, showCommunity);
            setVisibility(refs.percentile, !showCommunity);
        }
        setVisibility(communityHeadingLeft, showCommunity);
        setVisibility(percentileHeadingLeft, !showCommunity);
        setVisibility(communityHeadingRight, showCommunity);
        setVisibility(percentileHeadingRight, !showCommunity);
        setClass(displayCommunityTab, "selected", showCommunity);
        setClass(displayPercentileTab, "selected", !showCommunity);
    }

    function selectComparisonMode(mode) {
        if (!validComparisonMode(mode) || mode === selectedComparison) {
            return;
        }
        selectedComparison = mode;
        applyComparisonMode();
    }

    function averagePercentile(metrics) {
        var total = 0;
        var count = 0;
        var index;
        var value;
        for (index = 0; index < metrics.length; index += 1) {
            value = metrics[index].percentile;
            if (value === null || value === undefined || !finiteNumber(value)) {
                continue;
            }
            total += value;
            count += 1;
        }
        return count > 0 ? total / count : null;
    }

    function resolveMetricRefs(metricId) {
        var refs = metricRefs[metricId];
        var pair = METRIC_PANELS[metricId];
        if (refs && isValidPanel(refs.player) && isValidPanel(refs.community) && isValidPanel(refs.percentile)) {
            return refs;
        }
        if (!pair) {
            return null;
        }
        refs = {
            player: findPanel(pair[0]),
            community: findPanel(pair[1]),
            percentile: findPanel(pair[2])
        };
        metricRefs[metricId] = refs;
        return refs;
    }

    function renderMetricGroups(groups) {
        var groupIndex;
        var metricIndex;
        var group;
        var metric;
        var refs;
        var groupBadge;
        var groupPercentile;
        for (groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
            group = groups[groupIndex];
            groupPercentile = averagePercentile(group.metrics);
            groupBadge = findPanel(GROUP_PERCENTILE_PANELS[group.id]);
            if (isValidPanel(groupBadge)) {
                setText(groupBadge, formatPercentile(groupPercentile));
                setPercentileState(groupBadge, groupPercentile);
            }
            for (metricIndex = 0; metricIndex < group.metrics.length; metricIndex += 1) {
                metric = group.metrics[metricIndex];
                refs = resolveMetricRefs(metric.id);
                if (!refs) {
                    continue;
                }
                if (isValidPanel(refs.player)) {
                    setText(refs.player, formatValue(metric.player));
                    setValueState(refs.player, metric.player);
                }
                if (isValidPanel(refs.community)) {
                    setText(refs.community, formatValue(metric.community));
                    setValueState(refs.community, metric.community);
                }
                if (isValidPanel(refs.percentile)) {
                    setText(refs.percentile, formatPercentile(metric.percentile));
                    setPercentileState(refs.percentile, metric.percentile);
                }
            }
        }
        applyComparisonMode();
    }


    function setRetryVisible(visible) {
        if (isValidPanel(retryButton)) {
            setVisibility(retryButton, visible);
        }
    }

    function setMetricsVisible(visible) {
        setVisibility(metricsPanel, visible);
        setVisibility(metadataPanel, visible);
    }

    function renderLoading() {
        var modeText = selectedMode === "ranked" ? "Ranked" : "Standard";
        setText(statusLabel, "Loading " + modeText + " comparison for up to " + String(selectedMatches) + " matches...");
        setMetricsVisible(false);
        setRetryVisible(false);
    }

    function renderIdentityError(identity) {
        setMetricsVisible(false);
        setRetryVisible(true);
        setText(statusLabel, identity && identity.message ? identity.message : "The viewed profile account is unavailable.");
    }
    function renderLocalError(code, status, retryVisible, retryAfter) {
        var message = ERROR_TEXT[code] || ERROR_TEXT.invalid_payload;
        if (status) {
            message += " (HTTP " + String(status) + ").";
        }
        if (finiteNumber(retryAfter) && retryAfter > 0) {
            message += " Retry after " + String(Math.ceil(retryAfter)) + " seconds.";
        }
        setMetricsVisible(false);
        setRetryVisible(retryVisible !== false);
        setText(statusLabel, message);
    }
    function generatedIsStale(value) {
        var timestamp;
        try {
            timestamp = Date.parse(value);
        } catch (error) {
            return false;
        }
        return finiteNumber(timestamp) && now() - timestamp >= CACHE_TTL_MS;
    }


    function renderSuccess(payload) {
        var modeText = payload.mode === "ranked" ? "Ranked" : "Standard";
        var sampleText = modeText + " sample: " + String(payload.sample) + " / " + String(payload.matches);
        var stale = generatedIsStale(payload.generated);
        var generatedText = "Generated: " + String(payload.generated) + (stale ? " (stale)" : "");
        renderMetricGroups(payload.groups);
        setText(sampleLabel, sampleText);
        setText(generatedLabel, generatedText);
        setMetricsVisible(true);
        setRetryVisible(stale);
        setText(statusLabel, stale ? "Showing cached comparison data. Retry for current values." : modeText + " comparison loaded.");
    }


    function setBridgeVisible(visible) {
        setVisibleProperty(bridgePanel, visible);
        if (!visible) {
            setStyle(bridgePanel, "visibility", "collapse");
        } else {
            setStyle(bridgePanel, "visibility", "visible");
        }
    }

    function unloadBridge() {
        if (!isValidPanel(bridgePanel)) {
            return;
        }
        try {
            if (isCallable(bridgePanel.SetURL)) {
                bridgePanel.SetURL("about:blank");
            }
        } catch (error) {
            /* A racing HTML panel is already on the unload path. */
        }
        setBridgeVisible(false);
    }

    function openSupporterTicker() {
        if (!isCustomActive() || !isValidPanel(supporterTicker) || !isCallable(supporterTicker.SetURL)) {
            return;
        }
        try {
            supporterTicker.SetURL(SUPPORTER_TICKER_URL);
        } catch (error) {
            return;
        }
        setVisibleProperty(supporterTicker, true);
        setVisibility(supporterTicker, true);
    }

    function closeSupporterTicker() {
        if (!isValidPanel(supporterTicker)) {
            return;
        }
        try {
            if (isCallable(supporterTicker.SetURL)) {
                supporterTicker.SetURL("about:blank");
            }
        } catch (error) {
            setVisibleProperty(supporterTicker, false);
            setVisibility(supporterTicker, false);
            return;
        }
        setVisibleProperty(supporterTicker, false);
        setVisibility(supporterTicker, false);
    }

    function cancelBridgeAssignment() {
        var handle = bridgeAssignmentHandle;
        bridgeAssignmentHandle = null;
        if (handle !== null && handle !== undefined && isCallable($.CancelScheduled)) {
            try {
                $.CancelScheduled(handle);
            } catch (error) {
                return;
            }
        }
    }

    function invalidateRequest(unload) {
        cancelBridgeAssignment();
        requestState = null;
        requestGeneration += 1;
        if (unload !== false) {
            unloadBridge();
        }
    }

    function renderBridgeError(payload) {
        var status = hasOwn(payload, "status") ? payload.status : null;
        var retryAfter = hasOwn(payload, "retry_after") ? payload.retry_after : 0;
        enterState(STATE_ERROR);
        rateLimitBlocked = payload.code === "rate_limit" && retryAfter > 0;
        if (rateLimitBlocked) {
            rateLimitUntil = Math.max(rateLimitUntil, now() + (retryAfter * 1000));
        }
        renderLocalError(payload.code, status, !rateLimitBlocked, rateLimitBlocked ? retryAfter : 0);
    }

    function finishError(code, status) {
        invalidateRequest(true);
        rateLimitBlocked = false;
        enterState(STATE_ERROR);
        renderLocalError(code, status, true, 0);
    }

    function finishSuccess(payload, request) {
        if (generatedIsStale(payload.generated)) {
            memoryCache = null;
        } else {
            memoryCache = {
                account: request.account,
                matches: request.matches,
                mode: request.mode,
                receivedAt: now(),
                payload: payload
            };
        }
        invalidateRequest(true);
        rateLimitBlocked = false;
        enterState(STATE_READY);
        renderSuccess(payload);
    }

    function bridgeUrl(request) {
        return BRIDGE_URL + "?account_id=" + encodeURIComponent(request.account) + "&matches=" + String(request.matches) + "&mode=" + encodeURIComponent(request.mode) + "&request=" + encodeURIComponent(request.nonce) + "&protocol=3";
    }

    function expectedBridgeUrl(url, request) {
        var boundary;
        if (typeof url !== "string" || !request) {
            return false;
        }
        if (url.indexOf(BRIDGE_ORIGIN_PATH) !== 0) {
            return false;
        }
        boundary = url.charAt(BRIDGE_ORIGIN_PATH.length);
        return boundary === "" || boundary === "?" || boundary === "#";
    }

    function bridgeFragment(url) {
        var hashIndex;
        var fragment;
        if (typeof url !== "string" || url.length > BRIDGE_URL_MAX_LENGTH) {
            return null;
        }
        hashIndex = url.indexOf("#");
        if (hashIndex < 0) {
            return "";
        }
        fragment = url.substring(hashIndex + 1);
        if (fragment.length === 0 || fragment.length > BRIDGE_FRAGMENT_MAX_LENGTH || fragment.indexOf("#") !== -1) {
            return null;
        }
        return fragment;
    }

    function eventString(value) {
        if (typeof value === "string") {
            return value;
        }
        if (value && typeof value.url === "string") {
            return value.url;
        }
        if (value && typeof value.title === "string") {
            return value.title;
        }
        return "";
    }

    function onBridgeUrlChanged(panelOrValue, eventValue) {
        var url = eventString(arguments.length > 1 ? eventValue : panelOrValue);
        var expected;
        var fragment;
        var decodedTitle;
        if (lifecycleState !== STATE_LOADING || !requestState || requestState.generation !== requestGeneration) {
            return;
        }
        if (url === "about:blank") {
            return;
        }
        expected = expectedBridgeUrl(url, requestState);
        if (!expected) {
            finishError("network_error", null);
            return;
        }
        fragment = bridgeFragment(url);
        if (fragment === "") {
            return;
        }
        if (fragment === null) {
            return;
        }
        try {
            decodedTitle = decodeURIComponent(fragment);
        } catch (error) {
            return;
        }
        if (typeof decodedTitle !== "string" || decodedTitle.length > BRIDGE_TITLE_MAX_LENGTH) {
            return;
        }
        if (decodedTitle.indexOf(BRIDGE_TITLE_PREFIX) !== 0) {
            return;
        }
        onBridgeTitle(decodedTitle);
    }


    function onBridgeTitle(panelOrValue, eventValue) {
        var parsed;
        var successResult;
        var errorResult;
        var request;
        var value = arguments.length > 1 ? eventValue : panelOrValue;
        if (lifecycleState !== STATE_LOADING || !requestState || requestState.generation !== requestGeneration) {
            return;
        }
        request = requestState;
        if (typeof value !== "string") {
            return;
        }
        if (request.lastTitle === value) {
            return;
        }
        request.lastTitle = value;
        parsed = parseTitle(value);
        if (!parsed) {
            return;
        }
        if (parsed.kind === "invalid_title") {
            finishError("invalid_payload", null);
            return;
        }
        if (!parsed.value || typeof parsed.value !== "object") {
            finishError("invalid_payload", null);
            return;
        }
        if (parsed.value.kind === "profile_stats") {
            successResult = validateSuccessPayload(parsed.value, request);
            if (successResult === "stale") {
                return;
            }
            if (successResult !== "ok") {
                finishError("invalid_payload", null);
                return;
            }
            if (parsed.value.sample === 0) {
                finishError("empty_sample", null);
                return;
            }
            finishSuccess(parsed.value, request);
            return;
        }
        if (parsed.value.kind === "error") {
            errorResult = validateErrorPayload(parsed.value, request);
            if (errorResult === "stale") {
                return;
            }
            if (errorResult !== "ok") {
                finishError("invalid_payload", null);
                return;
            }
            renderBridgeError(parsed.value);
            invalidateRequest(true);
            return;
        }
        finishError("invalid_payload", null);
    }

    function registerBridgeEvents() {
        registerPanelEvent(bridgePanel, "HTMLTitle", onBridgeTitle);
        registerPanelEvent(bridgePanel, "HTMLURLChanged", onBridgeUrlChanged);
    }
    function assignBridgeUrl(request) {
        if (requestState !== request || request.generation !== requestGeneration || !isCustomActive()) {
            return;
        }
        if (!runtimePanelsValid()) {
            disableRuntime("panel_invalid");
            return;
        }
        try {
            if (isCallable(bridgePanel.SetIgnoreCursor)) {
                bridgePanel.SetIgnoreCursor(true);
            }
            if (!isCallable(bridgePanel.SetURL)) {
                throw new Error("SetURL unavailable");
            }
            bridgePanel.SetURL(bridgeUrl(request));
        } catch (error) {
            finishError("network_error", null);
        }
    }

    function scheduleBridgeAssignment(request) {
        var generation = request.generation;
        cancelBridgeAssignment();
        try {
            bridgeAssignmentHandle = $.Schedule(BRIDGE_ASSIGN_DELAY_SECONDS, function () {
                if (requestState !== request || generation !== requestGeneration) {
                    return;
                }
                bridgeAssignmentHandle = null;
                inspectNativeHeroSignature();
                if (!isCustomActive()) {
                    return;
                }
                inspectStockSelection();
                if (!isCustomActive()) {
                    return;
                }
                assignBridgeUrl(request);
            });
        } catch (error) {
            bridgeAssignmentHandle = null;
            finishError("network_error", null);
        }
    }


    function beginRequest(deferBridgeAssignment) {
        var identity = readIdentity();
        var request;
        var cached;
        var remaining;
        if (!isCustomActive()) {
            return;
        }
        currentIdentity = identity;
        if (identity.state !== "valid") {
            invalidateRequest(true);
            rateLimitBlocked = false;
            enterState(STATE_ERROR);
            renderIdentityError(identity);
            return;
        }
        cached = freshCache(identity.account, selectedMatches, selectedMode);
        if (cached) {
            invalidateRequest(true);
            rateLimitBlocked = false;
            enterState(STATE_READY);
            renderSuccess(cached);
            return;
        }
        remaining = rateLimitUntil - now();
        if (remaining > 0) {
            invalidateRequest(true);
            rateLimitBlocked = true;
            enterState(STATE_ERROR);
            renderLocalError("rate_limit", 429, false, remaining / 1000);
            return;
        }
        rateLimitUntil = 0;
        rateLimitBlocked = false;
        invalidateRequest(true);
        request = {
            generation: requestGeneration,
            nonce: createNonce(),
            account: identity.account,
            matches: selectedMatches,
            mode: selectedMode,
            startedAt: now(),
            lastTitle: ""
        };
        requestState = request;
        enterState(STATE_LOADING);
        renderLoading();
        setBridgeVisible(true);
        if (deferBridgeAssignment) {
            scheduleBridgeAssignment(request);
        } else {
            assignBridgeUrl(request);
        }
    }

    function hasSelectionEvidence(panel) {
        try {
            if (isCallable(panel.BHasKeyFocus) && panel.BHasKeyFocus()) {
                return true;
            }
        } catch (error) {
            /* Try descendant focus and native selection signals. */
        }
        try {
            if (isCallable(panel.BHasDescendantKeyFocus) && panel.BHasDescendantKeyFocus()) {
                return true;
            }
        } catch (error2) {
            /* Try native selection signals. */
        }
        try {
            if (isCallable(panel.IsSelected) && panel.IsSelected()) {
                return true;
            }
        } catch (error3) {
            /* Try the direct class signal. */
        }
        try {
            if (isCallable(panel.BHasClass) && (panel.BHasClass("selected") || panel.BHasClass("Selected"))) {
                return true;
            }
        } catch (error4) {
            /* A replaced row has no usable selection signal. */
        }
        return false;
    }
    function readSelectedHeroSignature() {
        var childCount;
        var index;
        var row;
        var isHeroRow;
        var rowId;
        if (!isValidPanel(heroList)) {
            return "";
        }
        try {
            childCount = Math.min(heroList.GetChildCount(), MAX_HERO_ROWS);
        } catch (error) {
            return "";
        }
        for (index = 0; index < childCount; index += 1) {
            try {
                row = heroList.GetChild(index);
            } catch (error2) {
                return "";
            }
            if (!isValidPanel(row)) {
                continue;
            }
            isHeroRow = false;
            try {
                isHeroRow = isCallable(row.BHasClass) && row.BHasClass("heroRow");
            } catch (error3) {
                isHeroRow = false;
            }
            if (isHeroRow && hasSelectionEvidence(row)) {
                rowId = "";
                try {
                    if (row.id !== undefined && row.id !== null) {
                        rowId = String(row.id);
                    }
                } catch (error4) {
                    rowId = "";
                }
                return String(index) + ":" + rowId;
            }
        }
        return "";
    }


    function inspectStockSelection() {
        var signature;
        if (!isCustomActive()) {
            return;
        }
        signature = readSelectedHeroSignature();
        if (signature !== stockRowSignature) {
            restoreStock("stock_selection");
        }
    }

    function inspectNativeHeroSignature() {
        var signature;
        if (!isValidPanel(stockSectionName)) {
            stockSectionName = findDirectChildByClass(stockTitle, "statSectionName");
        }
        if (!isValidPanel(stockSectionName)) {
            return;
        }
        signature = textOf(stockSectionName);
        if (signature !== stockSectionSignature) {
            restoreStock("native_selection");
        }
    }

    function checkIdentity() {
        var nextIdentity = readIdentity();
        if (sameIdentity(currentIdentity, nextIdentity)) {
            return;
        }
        currentIdentity = nextIdentity;
        if (isCustomActive()) {
            restoreStock("profile_change");
        }
    }

    function runtimePanelsValid() {
        return isValidPanel(root) &&
            isValidPanel(heroList) &&
            isValidPanel(stockTitle) &&
            isValidPanel(customPanel) &&
            isValidPanel(selfNamePanel) &&
            isValidPanel(titleLabel) &&
            isValidPanel(statLockerButton) &&
            isValidPanel(playerHeadingLeft) &&
            isValidPanel(playerHeadingRight) &&
            isValidPanel(bridgePanel) &&
            isValidPanel(supporterTicker) &&
            isValidPanel(displayCommunityTab) &&
            isValidPanel(displayPercentileTab);
    }

    function stopWatcher() {
        var handle = watcherHandle;
        watcherGeneration += 1;
        watcherHandle = null;
        watcherPending = false;
        watcherCallback = null;
        if (handle !== null && handle !== undefined && isCallable($.CancelScheduled)) {
            try {
                $.CancelScheduled(handle);
            } catch (error) {
                return;
            }
        }
    }

    function disableRuntime(reason) {
        enterState(STATE_DISABLED);
        stopWatcher();
        invalidateRequest(true);
        closeSupporterTicker();
        setVisibility(customPanel, false);
        setRetryVisible(false);
    }

    function updateRateLimit() {
        if (!rateLimitBlocked || now() < rateLimitUntil) {
            return;
        }
        rateLimitBlocked = false;
        rateLimitUntil = 0;
        if (lifecycleState === STATE_ERROR) {
            setRetryVisible(true);
            setText(statusLabel, "The community service is ready for another request.");
        }
    }

    function scheduledCheck() {
        var elapsed;
        if (!isCustomActive()) {
            return;
        }
        if (!runtimePanelsValid()) {
            disableRuntime("panel_invalid");
            return;
        }
        checkIdentity();
        if (!isCustomActive()) {
            return;
        }
        renderViewedName();
        inspectNativeHeroSignature();
        if (!isCustomActive()) {
            return;
        }
        inspectStockSelection();
        if (!isCustomActive()) {
            return;
        }
        updateRateLimit();
        if (requestState && requestState.generation === requestGeneration) {
            elapsed = (now() - requestState.startedAt) / 1000;
            if (elapsed >= REQUEST_TIMEOUT_SECONDS) {
                finishError("network_error", null);
            }
        }
    }

    function startWatcher() {
        var token;
        function armWatcher() {
            if (token !== watcherGeneration || !isCustomActive() || watcherPending) {
                return;
            }
            watcherPending = true;
            try {
                watcherHandle = $.Schedule(CONTEXT_CHECK_SECONDS, watcherCallback);
            } catch (error) {
                watcherPending = false;
                watcherHandle = null;
                watcherCallback = null;
                disableRuntime("schedule_failed");
            }
        }
        if (!isCustomActive() || watcherPending || watcherCallback) {
            return;
        }
        watcherGeneration += 1;
        token = watcherGeneration;
        watcherCallback = function () {
            if (token !== watcherGeneration) {
                return;
            }
            watcherPending = false;
            watcherHandle = null;
            if (!isCustomActive()) {
                return;
            }
            scheduledCheck();
            armWatcher();
        };
        armWatcher();
    }

    function restoreStock(reason) {
        if (lifecycleState === STATE_DISABLED) {
            return;
        }
        enterState(STATE_STOCK);
        stockRowSignature = "";
        stopWatcher();
        invalidateRequest(true);
        closeSupporterTicker();
        setVisibility(customPanel, false);
        setRetryVisible(false);
        if (reason === "profile_change" || reason === "stock_selection" || reason === "page_leave" || reason === "native_selection") {
            setText(statusLabel, "");
        }
    }

    function showCustomMode() {
        if (lifecycleState === STATE_DISABLED || isCustomActive()) {
            return;
        }
        currentIdentity = readIdentity();
        enterState(STATE_LOADING);
        stockSectionSignature = textOf(stockSectionName);
        stockRowSignature = readSelectedHeroSignature();
        setVisibility(customPanel, true);
        openSupporterTicker();
        currentDisplayName = "";
        renderViewedName();
        beginRequest();
        startWatcher();
    }

    function readMatchLimitSelection() {
        var option;
        var value = "";
        if (!isValidPanel(matchCountDropdown) || !isCallable(matchCountDropdown.GetSelected)) {
            return selectedMatches;
        }
        try {
            option = matchCountDropdown.GetSelected();
        } catch (error) {
            return selectedMatches;
        }
        if (!isValidPanel(option)) {
            return selectedMatches;
        }
        if (option.id === "ProfileStatsCommunityMatchCount50") {
            return 50;
        }
        if (option.id === "ProfileStatsCommunityMatchCount100") {
            return 100;
        }
        if (option.id === "ProfileStatsCommunityMatchCount150") {
            return 150;
        }
        try {
            if (isCallable(option.GetAttributeString)) {
                value = option.GetAttributeString("value", "");
            }
        } catch (error2) {
            value = "";
        }
        return hasOwn(MATCH_LIMITS, value) ? Number(value) : selectedMatches;
    }

    function onMatchCountChanged() {
        var nextMatches = readMatchLimitSelection();
        if (nextMatches === selectedMatches) {
            return;
        }
        selectedMatches = nextMatches;
        beginRequest(true);
    }

    function selectMatchMode(mode) {
        if (!validMatchMode(mode) || mode === selectedMode) {
            return;
        }
        selectedMode = mode;
        beginRequest(true);
    }

    function onRankedSelected() {
        selectMatchMode("ranked");
    }

    function onStandardSelected() {
        selectMatchMode("standard");
    }
    function onDisplayCommunitySelected() {
        selectComparisonMode("community");
    }

    function onDisplayPercentileSelected() {
        selectComparisonMode("percentile");
    }

    function onRetry() {
        if (!isCustomActive() || rateLimitBlocked) {
            return;
        }
        beginRequest();
    }


    function collectMetricRefs() {
        var metricId;
        var pair;
        for (metricId in METRIC_PANELS) {
            if (hasOwn(METRIC_PANELS, metricId)) {
                pair = METRIC_PANELS[metricId];
                metricRefs[metricId] = {
                    player: findPanel(pair[0]),
                    community: findPanel(pair[1]),
                    percentile: findPanel(pair[2])
                };
            }
        }
    }

    function collectPanels() {
        root = $.GetContextPanel();
        if (!isValidPanel(root)) {
            return false;
        }
        heroList = findPanel("HeroList");
        statsBlock = findPanel("StatsBlock");
        stockTitle = findPanel("StatsTitle");
        stockLeft = findPanel("StatsLeft");
        stockRight = findPanel("StatsRight");
        stockSectionName = findDirectChildByClass(stockTitle, "statSectionName");
        communityButton = findPanel("ProfileStatsCommunityButton");
        customPanel = findPanel("ProfileStatsCommunityPanel");
        selfNamePanel = findPanel("SelfName");
        titleLabel = findPanel("ProfileStatsCommunityTitle");
        statLockerButton = findPanel("ProfileStatsCommunityStatLocker");
        playerHeadingLeft = findPanel("ProfileStatsCommunityPlayerHeadingLeft");
        playerHeadingRight = findPanel("ProfileStatsCommunityPlayerHeadingRight");
        accountWitness = findPanel("ProfileStatsCommunityAccount");
        matchCountDropdown = findPanel("ProfileStatsCommunityMatchCount");
        rankedTab = findPanel("ProfileStatsCommunityRanked");
        standardTab = findPanel("ProfileStatsCommunityStandard");
        displayCommunityTab = findPanel("ProfileStatsCommunityDisplayCommunity");
        displayPercentileTab = findPanel("ProfileStatsCommunityDisplayPercentile");
        communityHeadingLeft = findPanel("ProfileStatsCommunityCommunityHeadingLeft");
        percentileHeadingLeft = findPanel("ProfileStatsCommunityPercentileHeadingLeft");
        communityHeadingRight = findPanel("ProfileStatsCommunityCommunityHeadingRight");
        percentileHeadingRight = findPanel("ProfileStatsCommunityPercentileHeadingRight");
        statusLabel = findPanel("ProfileStatsCommunityStatus");
        metricsPanel = findPanel("ProfileStatsCommunityMetrics");
        metadataPanel = findPanel("ProfileStatsCommunityMetadata");
        sampleLabel = findPanel("ProfileStatsCommunitySample");
        generatedLabel = findPanel("ProfileStatsCommunityGenerated");
        retryButton = findPanel("ProfileStatsCommunityRetry");
        bridgePanel = findPanel("ProfileStatsCommunityBridge");
        supporterTicker = findPanel("ProfileStatsCommunitySupporterTicker");
        stockSectionSignature = textOf(stockSectionName);
        collectMetricRefs();
        return !!(heroList && statsBlock && stockTitle && stockLeft && stockRight && communityButton && customPanel && selfNamePanel && titleLabel && statLockerButton && playerHeadingLeft && playerHeadingRight && bridgePanel && supporterTicker && matchCountDropdown && rankedTab && standardTab && displayCommunityTab && displayPercentileTab);
    }

    function bindEvents() {
        setPanelEvent(communityButton, "onactivate", showCustomMode);
        setPanelEvent(statLockerButton, "onactivate", openStatLockerProfile);
        setPanelEvent(matchCountDropdown, "oninputsubmit", onMatchCountChanged);
        setPanelEvent(rankedTab, "onactivate", onRankedSelected);
        setPanelEvent(displayCommunityTab, "onactivate", onDisplayCommunitySelected);
        setPanelEvent(displayPercentileTab, "onactivate", onDisplayPercentileSelected);
        setPanelEvent(standardTab, "onactivate", onStandardSelected);
        setPanelEvent(retryButton, "onactivate", onRetry);
        registerBridgeEvents();
    }

    function boot() {
        if (initialized) {
            return;
        }
        if (!collectPanels()) {
            return;
        }
        initialized = true;
        currentIdentity = readIdentity();
        selectedComparison = "percentile";
        applyComparisonMode();
        renderViewedName();
        unloadBridge();
        closeSupporterTicker();
        setVisibility(customPanel, false);
        bindEvents();
    }

    try {
        $.Schedule(0.01, boot);
    } catch (error) {
        boot();
    }
}());
        /* PROFILE_STATS_COMMUNITY_MODULE_END */
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
        var missingShared = getState(root);
        registerMissingRecord(missingShared, root);
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
