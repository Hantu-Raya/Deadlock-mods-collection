(function () {
    "use strict";
    /* VIEWED_PROFILE_IDENTITY_POLICY: scripts/viewed-profile-identity-policy.js */


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
    var CACHE_SCHEMA = "profile_stats_community_v4";
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
            "id": "performance",
            "panel": "PSCGroupPerformancePercentile",
            "metrics": ["kda", "kills_plus_assists", "player_damage_per_health"]
        },
        {
            "id": "scoreboard",
            "panel": "PSCGroupScoreboardPercentile",
            "metrics": ["average_kills", "average_deaths", "average_assists"]
        },
        {
            "id": "accuracy_kd",
            "panel": "PSCGroupAccuracyKdPercentile",
            "metrics": ["accuracy", "critical_hit_rate", "kd"]
        },
        {
            "id": "damage",
            "panel": "PSCGroupDamagePercentile",
            "metrics": ["player_damage_per_minute", "damage_taken_per_minute", "objective_damage_per_minute"]
        },
        {
            "id": "economy",
            "panel": "PSCGroupEconomyPercentile",
            "metrics": ["net_worth_per_minute", "average_last_hits", "average_denies"]
        },
        {
            "id": "healing",
            "panel": "PSCGroupHealingPercentile",
            "metrics": ["self_healing_per_minute", "player_healing_per_minute", "heal_prevented"]
        }
    ];

    var METRIC_REGISTRY = {
        "kda": {
            "panels": ["PSCMetricKdaPlayer", "PSCMetricKdaCommunity", "PSCMetricKdaPercentile"],
            "label": "KDA",
            "format": "ratio",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "kills_plus_assists": {
            "panels": ["PSCMetricKillsPlusAssistsPlayer", "PSCMetricKillsPlusAssistsCommunity", "PSCMetricKillsPlusAssistsPercentile"],
            "label": "KILLS + ASSISTS",
            "format": "average",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "player_damage_per_health": {
            "panels": ["PSCMetricPlayerDamagePerHealthPlayer", "PSCMetricPlayerDamagePerHealthCommunity", "PSCMetricPlayerDamagePerHealthPercentile"],
            "label": "PLAYER DAMAGE / HEALTH",
            "format": "ratio",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "average_kills": {
            "panels": ["PSCMetricAverageKillsPlayer", "PSCMetricAverageKillsCommunity", "PSCMetricAverageKillsPercentile"],
            "label": "AVERAGE KILLS",
            "format": "average",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "average_deaths": {
            "panels": ["PSCMetricAverageDeathsPlayer", "PSCMetricAverageDeathsCommunity", "PSCMetricAverageDeathsPercentile"],
            "label": "AVERAGE DEATHS",
            "format": "average",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "average_assists": {
            "panels": ["PSCMetricAverageAssistsPlayer", "PSCMetricAverageAssistsCommunity", "PSCMetricAverageAssistsPercentile"],
            "label": "AVERAGE ASSISTS",
            "format": "average",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "accuracy": {
            "panels": ["PSCMetricAccuracyPlayer", "PSCMetricAccuracyCommunity", "PSCMetricAccuracyPercentile"],
            "label": "ACCURACY",
            "format": "percent",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "critical_hit_rate": {
            "panels": ["PSCMetricCriticalHitRatePlayer", "PSCMetricCriticalHitRateCommunity", "PSCMetricCriticalHitRatePercentile"],
            "label": "CRITICAL HIT RATE",
            "format": "percent",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "kd": {
            "panels": ["PSCMetricKdPlayer", "PSCMetricKdCommunity", "PSCMetricKdPercentile"],
            "label": "K/D",
            "format": "ratio",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "player_damage_per_minute": {
            "panels": ["PSCMetricPlayerDamagePerMinutePlayer", "PSCMetricPlayerDamagePerMinuteCommunity", "PSCMetricPlayerDamagePerMinutePercentile"],
            "label": "PLAYER DAMAGE / MIN",
            "format": "per_minute",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "damage_taken_per_minute": {
            "panels": ["PSCMetricDamageTakenPerMinutePlayer", "PSCMetricDamageTakenPerMinuteCommunity", "PSCMetricDamageTakenPerMinutePercentile"],
            "label": "DAMAGE TAKEN / MIN",
            "format": "per_minute",
            "percentileKind": "higher_lower",
            "includeInGroupAverage": false
        },
        "objective_damage_per_minute": {
            "panels": ["PSCMetricObjectiveDamagePerMinutePlayer", "PSCMetricObjectiveDamagePerMinuteCommunity", "PSCMetricObjectiveDamagePerMinutePercentile"],
            "label": "OBJECTIVE DAMAGE / MIN",
            "format": "per_minute",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "net_worth_per_minute": {
            "panels": ["PSCMetricNetWorthPerMinutePlayer", "PSCMetricNetWorthPerMinuteCommunity", "PSCMetricNetWorthPerMinutePercentile"],
            "label": "NET WORTH / MIN",
            "format": "per_minute",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "average_last_hits": {
            "panels": ["PSCMetricAverageLastHitsPlayer", "PSCMetricAverageLastHitsCommunity", "PSCMetricAverageLastHitsPercentile"],
            "label": "AVERAGE LAST HITS",
            "format": "average",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "average_denies": {
            "panels": ["PSCMetricAverageDeniesPlayer", "PSCMetricAverageDeniesCommunity", "PSCMetricAverageDeniesPercentile"],
            "label": "AVERAGE DENIES",
            "format": "average",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "self_healing_per_minute": {
            "panels": ["PSCMetricSelfHealingPerMinutePlayer", "PSCMetricSelfHealingPerMinuteCommunity", "PSCMetricSelfHealingPerMinutePercentile"],
            "label": "SELF HEALING / MIN",
            "format": "per_minute",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "player_healing_per_minute": {
            "panels": ["PSCMetricPlayerHealingPerMinutePlayer", "PSCMetricPlayerHealingPerMinuteCommunity", "PSCMetricPlayerHealingPerMinutePercentile"],
            "label": "PLAYER HEALING / MIN",
            "format": "per_minute",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        },
        "heal_prevented": {
            "panels": ["PSCMetricHealPreventedPlayer", "PSCMetricHealPreventedCommunity", "PSCMetricHealPreventedPercentile"],
            "label": "HEAL PREVENTED",
            "format": "per_minute",
            "percentileKind": "top_bottom",
            "includeInGroupAverage": true
        }
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
        var value;
        if (!isValidPanel(panel)) {
            return "";
        }
        try {
            value = panel.text;
            return value === null || value === undefined ? "" : String(value);
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

    function readIdentity() {
        var witness;
        var authorityNames = AUTHORITY_NAMES;
        var corroborators = [];
        var index;
        var identity;
        if (!isValidPanel(accountWitness)) {
            accountWitness = findPanel("ProfileStatsCommunityAccount");
        }
        witness = accountWitness;
        for (index = 0; index < authorityNames.length; index += 1) {
            corroborators.push({
                value: readRootAuthority(authorityNames[index]),
                format: authorityNames[index] === "steamid" ? "identity" : "account"
            });
        }
        identity = viewedProfileIdentityPolicy.resolve({
            value: textOf(witness),
            format: "account"
        }, corroborators);
        if (identity.state === "missing") {
            return {
                state: "missing",
                account: "",
                message: "The viewed profile account is unavailable."
            };
        }
        if (identity.state !== "valid") {
            return {
                state: "mismatch",
                account: identity.account,
                message: "The viewed profile account witness does not match the profile root."
            };
        }
        return {
            state: "valid",
            account: identity.account,
            message: ""
        };
    }

    function payloadAccountMatches(value, accountText) {
        return viewedProfileIdentityPolicy.payloadMatches(value, accountText);
    }

    function sameIdentity(left, right) {
        return viewedProfileIdentityPolicy.same(left, right);
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

    function metricDefinition(metricId) {
        if (typeof metricId !== "string" || !hasOwn(METRIC_REGISTRY, metricId)) {
            return null;
        }
        return METRIC_REGISTRY[metricId];
    }

    function validMetricValue(value) {
        return value === null || finiteNumber(value);
    }

    function validMetricPercentile(value) {
        return value === null || (finiteNumber(value) && value >= 0 && value <= 100);
    }

    function validMetricTuple(metric, expectedId) {
        return isArray(metric) &&
            metric.length === 4 &&
            metric[0] === expectedId &&
            validMetricValue(metric[1]) &&
            validMetricValue(metric[2]) &&
            validMetricPercentile(metric[3]);
    }

    function validMetricGroups(groups) {
        var groupIndex;
        var metricIndex;
        var group;
        var expectedGroup;
        if (!isArray(groups) || groups.length !== GROUPS.length) {
            return false;
        }
        for (groupIndex = 0; groupIndex < GROUPS.length; groupIndex += 1) {
            group = groups[groupIndex];
            expectedGroup = GROUPS[groupIndex];
            if (!exactKeys(group, ["id", "metrics"]) ||
                    group.id !== expectedGroup.id ||
                    !isArray(group.metrics) ||
                    group.metrics.length !== expectedGroup.metrics.length) {
                return false;
            }
            for (metricIndex = 0; metricIndex < expectedGroup.metrics.length; metricIndex += 1) {
                if (!validMetricTuple(group.metrics[metricIndex], expectedGroup.metrics[metricIndex])) {
                    return false;
                }
            }
        }
        return true;
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
        var identityResult = validateIdentityFields(payload, request);
        if (identityResult !== "ok") {
            return identityResult;
        }
        if (!exactKeys(payload, ["v", "kind", "request", "account", "matches", "mode", "sample", "generated", "groups"])) {
            return "invalid";
        }
        if (payload.v !== 4 || payload.kind !== "profile_stats" || typeof payload.account !== "number" || !viewedProfileIdentityPolicy.payloadMatches(payload.account, String(payload.account)) || typeof payload.request !== "string") {
            return "invalid";
        }
        if (!validMatchLimit(payload.matches) || !validMatchMode(payload.mode) || !finiteNumber(payload.sample) || Math.floor(payload.sample) !== payload.sample || payload.sample < 0 || payload.sample > request.matches) {
            return "invalid";
        }
        if (typeof payload.generated !== "string" || payload.generated.length === 0 || payload.generated.length > MAX_GENERATED_LENGTH || !isAscii(payload.generated)) {
            return "invalid";
        }
        return validMetricGroups(payload.groups) ? "ok" : "invalid";
    }

    function validErrorEnvelope(payload) {
        if (!exactKeys(payload, ["v", "kind", "request", "account", "matches", "mode", "code"], ["status", "retry_after", "message"])) {
            return false;
        }
        return payload.v === 4 &&
            payload.kind === "error" &&
            typeof payload.account === "number" &&
            viewedProfileIdentityPolicy.payloadMatches(payload.account, String(payload.account)) &&
            typeof payload.request === "string" &&
            validMatchLimit(payload.matches) &&
            validMatchMode(payload.mode) &&
            !!ERROR_CODES[payload.code];
    }

    function validErrorStatus(payload) {
        var status;
        if (!hasOwn(payload, "status")) {
            return true;
        }
        status = payload.status;
        return finiteNumber(status) && Math.floor(status) === status && status >= 100 && status <= 599;
    }

    function validRetryAfter(payload) {
        var retryAfter;
        if (!hasOwn(payload, "retry_after")) {
            return true;
        }
        retryAfter = payload.retry_after;
        return finiteNumber(retryAfter) && retryAfter >= 0 && retryAfter <= 86400;
    }

    function validErrorMessage(payload) {
        return !hasOwn(payload, "message") || isPlainMessage(payload.message);
    }

    function validateErrorPayload(payload, request) {
        var identityResult = validateIdentityFields(payload, request);
        if (identityResult !== "ok") {
            return identityResult;
        }
        if (!validErrorEnvelope(payload) ||
                !validErrorStatus(payload) ||
                !validRetryAfter(payload) ||
                !validErrorMessage(payload)) {
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
        return "p" + Date.now().toString(36) + nonceSerial.toString(36);
    }

    function now() {
        return Date.now();
    }

    function freshCache(account, matches, mode) {
        var age;
        if (!memoryCache ||
                memoryCache.schema !== CACHE_SCHEMA ||
                memoryCache.account !== account ||
                memoryCache.matches !== matches ||
                memoryCache.mode !== mode ||
                !memoryCache.payload ||
                memoryCache.payload.v !== 4 ||
                !validMetricGroups(memoryCache.payload.groups)) {
            return null;
        }
        age = now() - memoryCache.receivedAt;
        if (age < 0 || age >= CACHE_TTL_MS || generatedIsStale(memoryCache.payload.generated)) {
            memoryCache = null;
            return null;
        }
        return memoryCache.payload;
    }

    function fixedString(value, digits) {
        return value.toFixed(digits);
    }

    function formatValue(value, definition) {
        if (value === null || value === undefined || !finiteNumber(value)) {
            return "—";
        }
        if (definition && definition.format === "percent") {
            return fixedString(value * 100, 1) + "%";
        }
        if (definition && definition.format === "ratio") {
            return fixedString(value, 2);
        }
        if (Math.abs(value) >= 10000) {
            return fixedString(value / 1000, 1) + "k";
        }
        return fixedString(value, 1);
    }

    function formatPercentile(value, kind) {
        var displayed;
        if (value === null || value === undefined || !finiteNumber(value)) {
            return "—";
        }
        if (kind === "higher_lower") {
            return (value >= 50 ? "HIGHER " : "LOWER ") + String(Math.round(value)) + "%";
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
        for (metricId in METRIC_REGISTRY) {
            if (!hasOwn(METRIC_REGISTRY, metricId)) {
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

    function averagePercentile(group) {
        var total = 0;
        var count = 0;
        var index;
        var metric;
        var definition;
        for (index = 0; index < group.metrics.length; index += 1) {
            metric = group.metrics[index];
            definition = metricDefinition(metric[0]);
            if (!definition) {
                return null;
            }
            if (!definition.includeInGroupAverage) {
                continue;
            }
            if (metric[3] === null || !validMetricPercentile(metric[3])) {
                return null;
            }
            total += metric[3];
            count += 1;
        }
        return count > 0 ? total / count : null;
    }
    function resolveMetricRefs(metricId) {
        var refs = metricRefs[metricId];
        var definition = metricDefinition(metricId);
        var panels;
        if (refs && isValidPanel(refs.player) && isValidPanel(refs.community) && isValidPanel(refs.percentile)) {
            return refs;
        }
        if (!definition) {
            return null;
        }
        panels = definition.panels;
        refs = {
            player: findPanel(panels[0]),
            community: findPanel(panels[1]),
            percentile: findPanel(panels[2])
        };
        metricRefs[metricId] = refs;
        return refs;
    }

    function renderMetricGroups(groups) {
        var groupIndex;
        var metricIndex;
        var group;
        var metric;
        var definition;
        var refs;
        var groupBadge;
        var groupPercentile;
        for (groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
            group = groups[groupIndex];
            groupPercentile = averagePercentile(group);
            groupBadge = findPanel(GROUPS[groupIndex].panel);
            if (isValidPanel(groupBadge)) {
                setText(groupBadge, formatPercentile(groupPercentile, "top_bottom"));
                setPercentileState(groupBadge, groupPercentile);
            }
            for (metricIndex = 0; metricIndex < group.metrics.length; metricIndex += 1) {
                metric = group.metrics[metricIndex];
                definition = metricDefinition(metric[0]);
                refs = resolveMetricRefs(metric[0]);
                if (!refs) {
                    continue;
                }
                if (isValidPanel(refs.player)) {
                    setText(refs.player, formatValue(metric[1], definition));
                    setValueState(refs.player, metric[1]);
                }
                if (isValidPanel(refs.community)) {
                    setText(refs.community, formatValue(metric[2], definition));
                    setValueState(refs.community, metric[2]);
                }
                if (isValidPanel(refs.percentile)) {
                    setText(refs.percentile, formatPercentile(metric[3], definition.percentileKind));
                    setPercentileState(refs.percentile, metric[3]);
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
                schema: CACHE_SCHEMA,
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
        return BRIDGE_URL + "?account_id=" + encodeURIComponent(request.account) + "&matches=" + String(request.matches) + "&mode=" + encodeURIComponent(request.mode) + "&request=" + encodeURIComponent(request.nonce) + "&protocol=4";
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
        var definition;
        var panels;
        for (metricId in METRIC_REGISTRY) {
            if (!hasOwn(METRIC_REGISTRY, metricId)) {
                continue;
            }
            definition = METRIC_REGISTRY[metricId];
            panels = definition.panels;
            metricRefs[metricId] = {
                player: findPanel(panels[0]),
                community: findPanel(panels[1]),
                percentile: findPanel(panels[2])
            };
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
