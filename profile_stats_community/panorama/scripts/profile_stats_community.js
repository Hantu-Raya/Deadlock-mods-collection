(function () {
    "use strict";

    var BRIDGE_URL = "https://hantu-raya.github.io/deadlock-stats-bridge/bridge.html";
    var BRIDGE_ORIGIN_PATH = "https://hantu-raya.github.io/deadlock-stats-bridge/bridge.html";
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
    var CACHE_TTL_MS = 10 * 60 * 1000;
    var CONTEXT_CHECK_SECONDS = 0.5;
    var DEBUG_LOGGING = true;
    var REQUEST_TIMEOUT_SECONDS = 25;
    var MAX_HERO_ROWS = 64;
    var MAX_GENERATED_LENGTH = 64;
    var MAX_ERROR_MESSAGE_LENGTH = 160;

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
            metrics: ["player_damage_per_minute", "accuracy", "critical_hit_rate"]
        },
        {
            id: "economy",
            metrics: ["net_worth_per_minute", "boss_damage_per_minute"]
        },
        {
            id: "sustain",
            metrics: ["healing_per_minute"]
        }
    ];

    var METRIC_PANELS = {
        "kd": ["PSCMetricKdPlayer", "PSCMetricKdCommunity"],
        "kda": ["PSCMetricKdaPlayer", "PSCMetricKdaCommunity"],
        "average_kills": ["PSCMetricAverageKillsPlayer", "PSCMetricAverageKillsCommunity"],
        "average_assists": ["PSCMetricAverageAssistsPlayer", "PSCMetricAverageAssistsCommunity"],
        "average_deaths": ["PSCMetricAverageDeathsPlayer", "PSCMetricAverageDeathsCommunity"],
        "damage_taken_per_minute": ["PSCMetricDamageTakenPerMinutePlayer", "PSCMetricDamageTakenPerMinuteCommunity"],
        "player_damage_per_minute": ["PSCMetricPlayerDamagePerMinutePlayer", "PSCMetricPlayerDamagePerMinuteCommunity"],
        "accuracy": ["PSCMetricAccuracyPlayer", "PSCMetricAccuracyCommunity"],
        "critical_hit_rate": ["PSCMetricCriticalHitRatePlayer", "PSCMetricCriticalHitRateCommunity"],
        "net_worth_per_minute": ["PSCMetricNetWorthPerMinutePlayer", "PSCMetricNetWorthPerMinuteCommunity"],
        "boss_damage_per_minute": ["PSCMetricBossDamagePerMinutePlayer", "PSCMetricBossDamagePerMinuteCommunity"],
        "healing_per_minute": ["PSCMetricHealingPerMinutePlayer", "PSCMetricHealingPerMinuteCommunity"]
    };

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
    var identityLabel = null;
    var statusLabel = null;
    var metricsPanel = null;
    var metadataPanel = null;
    var sampleLabel = null;
    var generatedLabel = null;
    var retryButton = null;
    var bridgePanel = null;
    var matchCountDropdown = null;
    var rankedTab = null;
    var standardTab = null;
    var metricRefs = {};
    var stockSectionSignature = "";
    var stockRowSignature = "";

    var currentIdentity = null;
    var customMode = false;
    var lifecycleGeneration = 0;
    var nonceSerial = 0;
    var requestState = null;
    var memoryCache = null;
    var checkScheduled = false;
    var initialized = false;
    var selectedMatches = DEFAULT_MATCH_LIMIT;
    var selectedMode = "ranked";

    function isCallable(value) {
        return typeof value === "function";
    }

    function debugLog(message) {
        if (!DEBUG_LOGGING) {
            return;
        }
        try {
            $.Msg("[ProfileStatsCommunity] " + String(message));
        } catch (error) {
            return;
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
        var witness = findPanel("ProfileStatsCommunityAccount");
        var witnessAccount = normalizeDigits(textOf(witness));
        var authorityNames;
        var index;
        var authority;
        if (!witnessAccount || !safeAccountText(witnessAccount)) {
            return {
                state: "missing",
                account: "",
                message: "The viewed profile account is unavailable."
            };
        }
        authorityNames = ["accountid", "steamid"];
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

    function logIdentity(eventName, identity) {
        if (!identity) {
            debugLog(eventName + " state=none");
            return;
        }
        debugLog(eventName + " state=" + identity.state + " account=" + (identity.account || "-"));
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
        identityResult = validateIdentityFields(payload, request);
        if (identityResult !== "ok") {
            return identityResult;
        }
        if (!exactKeys(payload, ["v", "kind", "request", "account", "matches", "mode", "sample", "generated", "groups"])) {
            return "invalid";
        }
        if (payload.v !== 2 || payload.kind !== "profile_stats" || typeof payload.account !== "number" || safeAccountNumber(payload.account) === null || typeof payload.request !== "string") {
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
                if (!exactKeys(metric, ["id", "player", "community"]) || metric.id !== expectedMetric(groupIndex, metricIndex)) {
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
        if (payload.v !== 2 || payload.kind !== "error" || typeof payload.account !== "number" || safeAccountNumber(payload.account) === null || typeof payload.request !== "string" || !validMatchLimit(payload.matches) || !validMatchMode(payload.mode) || !ERROR_CODES[payload.code]) {
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

    function rejectTitle(reason) {
        debugLog("title reject reason=" + String(reason));
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
        if (age < 0 || age > CACHE_TTL_MS) {
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

    function resolveMetricRefs(metricId) {
        var refs = metricRefs[metricId];
        var pair = METRIC_PANELS[metricId];
        if (refs && isValidPanel(refs.player) && isValidPanel(refs.community)) {
            return refs;
        }
        if (!pair) {
            return null;
        }
        refs = {
            player: findPanel(pair[0]),
            community: findPanel(pair[1])
        };
        metricRefs[metricId] = refs;
        return refs;
    }

    function renderMetricGroups(groups) {
        var groupIndex;
        var metricIndex;
        var metric;
        var refs;
        for (groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
            for (metricIndex = 0; metricIndex < groups[groupIndex].metrics.length; metricIndex += 1) {
                metric = groups[groupIndex].metrics[metricIndex];
                refs = resolveMetricRefs(metric.id);
                if (refs && isValidPanel(refs.player) && isValidPanel(refs.community)) {
                    setText(refs.player, formatValue(metric.player));
                    setText(refs.community, formatValue(metric.community));
                }
            }
        }
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
    function renderLocalError(code, status) {
        var message = ERROR_TEXT[code] || ERROR_TEXT.invalid_payload;
        if (status) {
            message += " (HTTP " + String(status) + ").";
        }
        setMetricsVisible(false);
        setRetryVisible(true);
        setText(statusLabel, message);
    }

    function renderSuccess(payload) {
        var modeText = payload.mode === "ranked" ? "Ranked" : "Standard";
        var sampleText = modeText + " sample: " + String(payload.sample) + " / " + String(payload.matches);
        var generatedText = "Generated: " + String(payload.generated);
        renderMetricGroups(payload.groups);
        setText(sampleLabel, sampleText);
        setText(generatedLabel, generatedText);
        setMetricsVisible(true);
        setRetryVisible(false);
        setText(statusLabel, modeText + " comparison loaded.");
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

    function invalidateRequest(unload) {
        requestState = null;
        lifecycleGeneration += 1;
        if (unload !== false) {
            unloadBridge();
        }
    }

    function renderBridgeError(payload) {
        var status = hasOwn(payload, "status") ? payload.status : null;
        debugLog("error code=" + payload.code + " status=" + (status === null ? "-" : String(status)));
        renderLocalError(payload.code, status);
    }

    function finishError(code, status) {
        debugLog("error code=" + String(code) + " status=" + (status === null || status === undefined ? "-" : String(status)));
        invalidateRequest(true);
        renderLocalError(code, status);
        scheduleCheck(lifecycleGeneration);
    }

    function finishSuccess(payload, request) {
        debugLog("success sample=" + String(payload.sample) + " account=" + request.account + " mode=" + request.mode + " matches=" + String(request.matches));
        memoryCache = {
            account: request.account,
            matches: request.matches,
            mode: request.mode,
            receivedAt: now(),
            payload: payload
        };
        invalidateRequest(true);
        renderSuccess(payload);
        scheduleCheck(lifecycleGeneration);
    }

    function bridgeUrl(request) {
        return BRIDGE_URL + "?account_id=" + encodeURIComponent(request.account) + "&matches=" + String(request.matches) + "&mode=" + encodeURIComponent(request.mode) + "&request=" + encodeURIComponent(request.nonce);
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
        if (!requestState || requestState.generation !== lifecycleGeneration) {
            return;
        }
        if (url === "about:blank") {
            debugLog("url event about:blank");
            return;
        }
        expected = expectedBridgeUrl(url, requestState);
        debugLog("url event " + (expected ? "bridge" : "unexpected"));
        if (!expected) {
            finishError("network_error", null);
            return;
        }
        fragment = bridgeFragment(url);
        if (fragment === "") {
            return;
        }
        if (fragment === null) {
            rejectTitle("invalid_fragment");
            return;
        }
        try {
            decodedTitle = decodeURIComponent(fragment);
        } catch (error) {
            rejectTitle("decode_fragment");
            return;
        }
        if (typeof decodedTitle !== "string" || decodedTitle.length > BRIDGE_TITLE_MAX_LENGTH) {
            rejectTitle("fragment_title_too_large");
            return;
        }
        if (decodedTitle.indexOf(BRIDGE_TITLE_PREFIX) !== 0) {
            rejectTitle("fragment_prefix");
            return;
        }
        debugLog("url event title");
        onBridgeTitle(decodedTitle);
    }


    function onBridgeTitle(panelOrValue, eventValue) {
        var parsed;
        var successResult;
        var errorResult;
        var request;
        var value = arguments.length > 1 ? eventValue : panelOrValue;
        if (!requestState || requestState.generation !== lifecycleGeneration) {
            return;
        }
        request = requestState;
        if (typeof value !== "string") {
            rejectTitle("non_string");
            return;
        }
        debugLog("title len=" + String(value.length) + " prefix=" + (value.indexOf(BRIDGE_TITLE_PREFIX) === 0 ? "DLSTATS2" : "other"));
        if (request.lastTitle === value) {
            rejectTitle("duplicate");
            return;
        }
        request.lastTitle = value;
        parsed = parseTitle(value);
        if (!parsed) {
            rejectTitle("normal_title");
            return;
        }
        if (parsed.kind === "invalid_title") {
            rejectTitle("invalid_title");
            finishError("invalid_payload", null);
            return;
        }
        if (!parsed.value || typeof parsed.value !== "object") {
            rejectTitle("non_object");
            finishError("invalid_payload", null);
            return;
        }
        if (parsed.value.kind === "profile_stats") {
            successResult = validateSuccessPayload(parsed.value, request);
            if (successResult === "stale") {
                rejectTitle("stale_success");
                return;
            }
            if (successResult !== "ok") {
                rejectTitle("invalid_success");
                finishError("invalid_payload", null);
                return;
            }
            if (parsed.value.sample === 0) {
                rejectTitle("empty_sample");
                finishError("empty_sample", null);
                return;
            }
            finishSuccess(parsed.value, request);
            return;
        }
        if (parsed.value.kind === "error") {
            errorResult = validateErrorPayload(parsed.value, request);
            if (errorResult === "stale") {
                rejectTitle("stale_error");
                return;
            }
            if (errorResult !== "ok") {
                rejectTitle("invalid_error");
                finishError("invalid_payload", null);
                return;
            }
            renderBridgeError(parsed.value);
            invalidateRequest(true);
            scheduleCheck(lifecycleGeneration);
            return;
        }
        rejectTitle("unknown_kind");
        finishError("invalid_payload", null);
    }

    function registerBridgeEvents() {
        registerPanelEvent(bridgePanel, "HTMLTitle", onBridgeTitle);
        registerPanelEvent(bridgePanel, "HTMLURLChanged", onBridgeUrlChanged);
    }

    function beginRequest() {
        var identity = readIdentity();
        var request;
        var cached;
        if (!customMode) {
            return;
        }
        currentIdentity = identity;
        logIdentity("request identity", identity);
        setText(identityLabel, identity.state === "valid" ? "VIEWED ACCOUNT " + identity.account : "VIEWED PROFILE");
        if (identity.state !== "valid") {
            invalidateRequest(true);
            renderIdentityError(identity);
            scheduleCheck(lifecycleGeneration);
            return;
        }
        cached = freshCache(identity.account, selectedMatches, selectedMode);
        if (cached) {
            debugLog("cache hit account=" + identity.account + " mode=" + selectedMode + " matches=" + String(selectedMatches));
            invalidateRequest(true);
            renderSuccess(cached);
            scheduleCheck(lifecycleGeneration);
            return;
        }
        invalidateRequest(true);
        request = {
            generation: lifecycleGeneration,
            nonce: createNonce(),
            account: identity.account,
            matches: selectedMatches,
            mode: selectedMode,
            startedAt: now(),
            lastTitle: ""
        };
        requestState = request;
        debugLog("request start account=" + request.account + " mode=" + request.mode + " matches=" + String(request.matches) + " nonce=" + request.nonce + " generation=" + String(request.generation));
        renderLoading();
        setBridgeVisible(true);
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
        scheduleCheck(lifecycleGeneration);
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
        if (!customMode) {
            return;
        }
        signature = readSelectedHeroSignature();
        if (signature !== stockRowSignature) {
            debugLog("hero selection signal=stock_row from=" + (stockRowSignature || "none") + " to=" + (signature || "none"));
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
        if (!customMode) {
            stockSectionSignature = signature;
            return;
        }
        if (signature !== stockSectionSignature) {
            debugLog("hero selection signal=statSectionName");
            restoreStock("native_selection");
        }
    }

    function checkIdentity() {
        var nextIdentity = readIdentity();
        if (!sameIdentity(currentIdentity, nextIdentity)) {
            logIdentity("identity change", nextIdentity);
            if (currentIdentity && (customMode || requestState)) {
                restoreStock("profile_change");
            }
            currentIdentity = nextIdentity;
            if (customMode) {
                if (nextIdentity.state !== "valid") {
                    renderIdentityError(nextIdentity);
                } else {
                    beginRequest();
                }
            }
        }
    }

    function scheduledCheck(token) {
        var elapsed;
        if (token !== lifecycleGeneration) {
            scheduleCheck(lifecycleGeneration);
            return;
        }
        if (!isValidPanel(root)) {
            invalidateRequest(true);
            return;
        }
        checkIdentity();
        inspectNativeHeroSignature();
        inspectStockSelection();
        if (requestState && requestState.generation === lifecycleGeneration) {
            elapsed = (now() - requestState.startedAt) / 1000;
            if (elapsed > REQUEST_TIMEOUT_SECONDS) {
                debugLog("timeout generation=" + String(requestState.generation));
                finishError("network_error", null);
            }
        }
        scheduleCheck(lifecycleGeneration);
    }

    function scheduleCheck(token) {
        if (checkScheduled || token !== lifecycleGeneration) {
            return;
        }
        checkScheduled = true;
        try {
            $.Schedule(CONTEXT_CHECK_SECONDS, function () {
                checkScheduled = false;
                scheduledCheck(token);
            });
        } catch (error) {
            checkScheduled = false;
            return;
        }
    }
    function restoreStock(reason) {
        debugLog("restore reason=" + String(reason || "unknown"));
        customMode = false;
        stockRowSignature = "";
        invalidateRequest(true);
        setVisibility(customPanel, false);
        setRetryVisible(false);
        if (reason === "profile_change" || reason === "stock_selection" || reason === "page_leave" || reason === "native_selection") {
            setText(statusLabel, "");
        }
        scheduleCheck(lifecycleGeneration);
    }
    function showCustomMode() {
        currentIdentity = readIdentity();
        logIdentity("custom open identity", currentIdentity);
        debugLog("custom open");
        customMode = true;
        stockSectionSignature = textOf(stockSectionName);
        stockRowSignature = readSelectedHeroSignature();
        setVisibility(customPanel, true);
        setText(identityLabel, currentIdentity.state === "valid" ? "VIEWED ACCOUNT " + currentIdentity.account : "VIEWED PROFILE");
        beginRequest();
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
        beginRequest();
    }

    function selectMatchMode(mode) {
        if (!validMatchMode(mode) || mode === selectedMode) {
            return;
        }
        selectedMode = mode;
        beginRequest();
    }

    function onRankedSelected() {
        selectMatchMode("ranked");
    }

    function onStandardSelected() {
        selectMatchMode("standard");
    }

    function onPageCancel() {
        restoreStock("page_leave");
        try {
            if (typeof CitadelNavigateBack === "function") {
                CitadelNavigateBack();
            }
        } catch (error) {
            return;
        }
    }

    function collectMetricRefs() {
        var metricId;
        var pair;
        for (metricId in METRIC_PANELS) {
            if (hasOwn(METRIC_PANELS, metricId)) {
                pair = METRIC_PANELS[metricId];
                metricRefs[metricId] = {
                    player: findPanel(pair[0]),
                    community: findPanel(pair[1])
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
        identityLabel = findPanel("ProfileStatsCommunityIdentity");
        matchCountDropdown = findPanel("ProfileStatsCommunityMatchCount");
        rankedTab = findPanel("ProfileStatsCommunityRanked");
        standardTab = findPanel("ProfileStatsCommunityStandard");
        statusLabel = findPanel("ProfileStatsCommunityStatus");
        metricsPanel = findPanel("ProfileStatsCommunityMetrics");
        metadataPanel = findPanel("ProfileStatsCommunityMetadata");
        sampleLabel = findPanel("ProfileStatsCommunitySample");
        generatedLabel = findPanel("ProfileStatsCommunityGenerated");
        retryButton = findPanel("ProfileStatsCommunityRetry");
        bridgePanel = findPanel("ProfileStatsCommunityBridge");
        stockSectionSignature = textOf(stockSectionName);
        debugLog("panel refs hero=" + (isValidPanel(heroList) ? "1" : "0") + " stats=" + (isValidPanel(statsBlock) ? "1" : "0") + " section=" + (isValidPanel(stockSectionName) ? "1" : "0") + " bridge=" + (isValidPanel(bridgePanel) ? "1" : "0"));
        collectMetricRefs();
        return !!(heroList && statsBlock && stockTitle && stockLeft && stockRight && communityButton && customPanel && bridgePanel && matchCountDropdown && rankedTab && standardTab);
    }

    function bindEvents() {
        setPanelEvent(communityButton, "onactivate", showCustomMode);
        setPanelEvent(matchCountDropdown, "oninputsubmit", onMatchCountChanged);
        setPanelEvent(rankedTab, "onactivate", onRankedSelected);
        setPanelEvent(standardTab, "onactivate", onStandardSelected);
        setPanelEvent(retryButton, "onactivate", beginRequest);
        setPanelEvent(root, "oncancel", onPageCancel);
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
        logIdentity("boot identity", currentIdentity);
        setBridgeVisible(false);
        setVisibility(customPanel, false);
        bindEvents();
        scheduleCheck(lifecycleGeneration);
    }

    try {
        $.Schedule(0.01, boot);
    } catch (error) {
        boot();
    }
}());
