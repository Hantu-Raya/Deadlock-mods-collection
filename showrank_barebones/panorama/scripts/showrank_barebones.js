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
        if (hidden === null || accountId === null || steamId === null || !accept(hidden) || !accept(accountId) ||
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
        var rankImage = findChild(panel, page ? "ShowRankBarebonesProfilePageRankImage":
            "ShowRankBarebonesRankImage", "Image");
        return isValid(panel) && isValid(accountLabel) && isValid(rankImage) ? {
            root: panel,
            accountLabel: accountLabel,
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
    if (root && (root.paneltype === "CitadelProfileCard" || root.paneltype === "CitadelProfilePage")) {
        var profileRecord = buildProfileRecord(root);
        if (profileRecord) {
            root.ShowRankBarebonesRefresh = function () {
                startProfileWatch(profileRecord, PROFILE_REFRESH_DELAYS);
            };
            root.ShowRankBarebonesOpenStatlocker = function () {
                return openStatlocker(profileRecord);
            };
            root.ShowRankBarebonesCopyAccount = function () {
                return copyAccountId(profileRecord);
            };
            startProfileWatch(profileRecord, STARTUP_REFRESH_DELAYS, true);
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
