const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const sharedPath = path.join(projectRoot, "panorama", "scripts", "ql_shared_presets.js");
const settingsPath = path.join(projectRoot, "panorama", "scripts", "ql_settings.js");
const corePath = path.join(projectRoot, "panorama", "scripts", "ql_core.js");

function readFile(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function makePanelStub() {
    const panel = {
        style: {},
        actuallayoutwidth: 0,
        actuallayoutheight: 0,
        actualxoffset: 0,
        actualyoffset: 0,
        visible: true,
        enabled: true,
        text: "",
        GetParent: () => null,
        GetChild: () => null,
        GetChildCount: () => 0,
        FindChild: () => null,
        FindChildTraverse: () => null,
        FindChildInLayoutFile: () => null,
        FindChildrenWithClassTraverse: () => [],
        FindChildrenWithClassTraverseInLayoutFile: () => [],
        BHasClass: () => false,
        AddClass: () => {},
        RemoveClass: () => {},
        SetHasClass: () => {},
        SetAttributeString: () => {},
        GetAttributeString: (_key, fallback) => (typeof fallback === "undefined" ? "" : fallback),
        SetAttributeInt: () => {},
        GetAttributeInt: (_key, fallback) => (typeof fallback === "undefined" ? 0 : fallback),
        SetAttributeFloat: () => {},
        GetAttributeFloat: (_key, fallback) => (typeof fallback === "undefined" ? 0 : fallback),
        SetDialogVariable: () => {},
        SetDialogVariableInt: () => {},
        SetDialogVariableTime: () => {},
        SetPanelEvent: () => {},
        ClearPanelEvent: () => {},
        DeleteAsync: () => {},
        RemoveAndDeleteChildren: () => {},
        RemoveClassFromAllChildren: () => {},
        BLoadLayoutFromString: () => true,
        BLoadLayout: () => true,
        BLoadLayoutSnippet: () => true,
        MoveChildBefore: () => {},
        MoveChildAfter: () => {},
        SetParent: () => {},
        ScrollToTop: () => {},
        ScrollParentToMakePanelFit: () => {},
        SetReadyForDisplay: () => {},
        IsValid: () => true
    };
    return panel;
}

function makeNoopProxy() {
    const fn = function() { return undefined; };
    return new Proxy(fn, {
        get(_target, prop) {
            if (prop === Symbol.toPrimitive) return () => "";
            if (prop === "toString") return () => "";
            if (prop === "valueOf") return () => 0;
            if (prop === "length") return 0;
            if (prop === "name") return "noop";
            return makeNoopProxy();
        },
        apply() {
            return undefined;
        },
        construct() {
            return {};
        }
    });
}

function makeSandbox() {
    const rootPanel = makePanelStub();
    const storage = new Map();
    const noop = () => {};
    return {
        console,
        JSON,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Date,
        RegExp,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        setTimeout: () => 0,
        setInterval: () => 0,
        clearTimeout: noop,
        clearInterval: noop,
        performance: { now: () => 0 },
        $: {
            Msg: noop,
            Warning: noop,
            Localize: (token) => String(token || ""),
            Schedule: () => 0,
            CancelScheduled: noop,
            DispatchEvent: noop,
            RegisterForUnhandledEvent: noop,
            RegisterEventHandler: noop,
            CreatePanel: () => makePanelStub(),
            GetContextPanel: () => rootPanel,
            persistentStorage: {
                getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : ""),
                setItem: (key, value) => storage.set(String(key), String(value)),
                removeItem: (key) => storage.delete(String(key))
            },
            NetProps: {}
        },
        Game: {
            Events: {
                Subscribe: noop,
                Unsubscribe: noop
            }
        },
        GameEvents: {
            Subscribe: noop,
            Unsubscribe: noop,
            SendCustomGameEventToServer: noop
        },
        GameUI: {
            CustomUIConfig: () => ({})
        },
        GameStateAPI: {
            SubscribeToGameState: noop,
            UnsubscribeFromGameState: noop,
            GetLocalPlayerID: () => 0,
            GetLocalTeam: () => 0,
            GetTeam: () => 0,
            GetMapName: () => "",
            IsSpectator: () => false
        },
        Players: makeNoopProxy(),
        Entities: makeNoopProxy(),
        Abilities: makeNoopProxy(),
        Buffs: makeNoopProxy(),
        GameModeAPI: makeNoopProxy(),
        GameInterfaceAPI: makeNoopProxy(),
        MatchDetailsAPI: makeNoopProxy(),
        PartyListAPI: makeNoopProxy(),
        SteamOverlayAPI: makeNoopProxy(),
        FriendsUI: makeNoopProxy(),
        PanoramaRunScript: noop
    };
}

function appendTrailer(source, trailer, injectInsideIife) {
    if (!trailer) return source;
    if (!injectInsideIife) {
        return source + "\n" + trailer + "\n";
    }
    const iifeClose = source.lastIndexOf("})();");
    if (iifeClose >= 0) {
        return source.slice(0, iifeClose) + "\n" + trailer + "\n" + source.slice(iifeClose);
    }
    return source + "\n" + trailer + "\n";
}

function loadContext(scriptPaths, trailer, injectInsideIife) {
    const sandbox = makeSandbox();
    vm.createContext(sandbox);
    for (let i = 0; i < scriptPaths.length; i++) {
        const scriptPath = scriptPaths[i];
        const source = readFile(scriptPath);
        const finalSource = (i === scriptPaths.length - 1 && trailer)
            ? appendTrailer(source, trailer, !!injectInsideIife)
            : source;
        vm.runInContext(finalSource, sandbox, { filename: scriptPath });
    }
    return sandbox;
}

function getJson(context, expression) {
    return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

function getValue(context, expression) {
    return vm.runInContext(expression, context);
}

function schemaToComparable(schema) {
    return (Array.isArray(schema) ? schema : []).map((field) => ({
        key: String(field.key),
        min: Number(field.min),
        max: Number(field.max),
        step: Number(field.step)
    }));
}

function compareSchemas(left, right) {
    const a = schemaToComparable(left);
    const b = schemaToComparable(right);
    if (a.length !== b.length) {
        return `field count differs (${a.length} !== ${b.length})`;
    }
    for (let i = 0; i < a.length; i++) {
        const leftField = a[i];
        const rightField = b[i];
        if (
            leftField.key !== rightField.key ||
            leftField.min !== rightField.min ||
            leftField.max !== rightField.max ||
            leftField.step !== rightField.step
        ) {
            return `field ${i} differs (${JSON.stringify(leftField)} !== ${JSON.stringify(rightField)})`;
        }
    }
    return "";
}

function getExpectedFieldValue(fieldKey, effectiveConfig, defaultConfig) {
    if (fieldKey === "DEFAULT_HERO_INDEX") {
        return String(
            Object.prototype.hasOwnProperty.call(effectiveConfig, "DEFAULT_HERO")
                ? effectiveConfig.DEFAULT_HERO
                : defaultConfig.DEFAULT_HERO
        );
    }
    if (fieldKey === "ULT_COOLDOWN_X_OFFSET" || fieldKey === "ULT_COOLDOWN_Y_OFFSET") {
        return 0;
    }
    if (Object.prototype.hasOwnProperty.call(effectiveConfig, fieldKey)) {
        return effectiveConfig[fieldKey];
    }
    return defaultConfig[fieldKey];
}

function compareDecodedAgainstSchema(decoded, effectiveConfig, defaultConfig, schema) {
    const mismatches = [];
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        const decodedKey = field.key === "DEFAULT_HERO_INDEX" ? "DEFAULT_HERO" : field.key;
        const expected = getExpectedFieldValue(field.key, effectiveConfig, defaultConfig);
        const actual = decoded[decodedKey];
        if (expected !== actual) {
            mismatches.push(`${decodedKey}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    return mismatches;
}

function buildSchemaCompatibleConfig(config, schema) {
    const source = Object.assign({}, config || {});
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        const key = String(field.key);
        const sourceKey = key === "DEFAULT_HERO_INDEX" ? "DEFAULT_HERO" : key;
        if (!Object.prototype.hasOwnProperty.call(source, sourceKey)) continue;
        const rawValue = source[sourceKey];
        const num = Number(rawValue);
        if (!Number.isFinite(num)) continue;
        let clamped = Math.max(field.min, Math.min(field.max, num));
        const slots = (clamped - field.min) / field.step;
        const rounded = Math.round(slots);
        clamped = field.min + (rounded * field.step);
        const decimals = String(field.step).includes(".")
            ? String(field.step).split(".")[1].length
            : 0;
        clamped = decimals > 0 ? parseFloat(clamped.toFixed(decimals)) : Math.round(clamped);
        source[sourceKey] = clamped;
    }
    return source;
}

function mutateEncodedWireVersion(encodedBinary, newWireVersion) {
    if (!encodedBinary || typeof encodedBinary !== "string" || encodedBinary.length < 1) {
        throw new Error("Encoded binary is too short to mutate wire version");
    }
    const normalized = Math.max(0, Math.round(Number(newWireVersion) || 0)) & 255;
    return String.fromCharCode(normalized) + encodedBinary.slice(1);
}

function validatePresetValues(presetName, effectiveConfig, schema) {
    const issues = [];
    const comparableSchema = schemaToComparable(schema);
    for (const field of comparableSchema) {
        if (field.key === "DEFAULT_HERO_INDEX") continue;
        const value = effectiveConfig[field.key];
        if (typeof value === "undefined") continue;
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        if (num < field.min || num > field.max) {
            issues.push(`${presetName}: ${field.key} out of range (${num} not in [${field.min}, ${field.max}])`);
            continue;
        }
        const slots = (num - field.min) / field.step;
        const rounded = Math.round(slots);
        if (Math.abs(slots - rounded) > 1e-9) {
            issues.push(`${presetName}: ${field.key} step mismatch (${num} step ${field.step} from ${field.min})`);
        }
    }
    return issues;
}

function fail(message) {
    console.error(`[SchemaGuard] ${message}`);
    process.exit(1);
}

function main() {
    const settingsContext = loadContext(
        [sharedPath, settingsPath],
        `globalThis.__schemaGuardExports = {
            sharedSemver: QOL_SCHEMA_SEMVER,
            sharedWireVersion: QOL_SCHEMA_WIRE_VERSION,
            defaultConfig: QOL_DEFAULT_CONFIG,
            presets: QOL_PRESETS,
            latestSemver: LATEST_COMPACT_SEMVER,
            registry: COMPACT_SCHEMA_REGISTRY,
            serialize: SerializeCompactV2,
            deserialize: DeserializeCompactV2,
            buildCandidateConfig: BuildCandidateConfigFromParsed
        };`,
        false
    );
    const coreContext = loadContext(
        [sharedPath, corePath],
        `globalThis.__schemaGuardExports = {
            latestSemver: BUILD_CATEGORY_LATEST_COMPACT_SEMVER,
            registry: BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY,
            serialize: SerializeBuildPayloadCompact,
            deserialize: DeserializeBuildPayloadCompact
        };`,
        true
    );

    const settingsExports = getValue(settingsContext, "globalThis.__schemaGuardExports");
    const coreExports = getValue(coreContext, "globalThis.__schemaGuardExports");
    const defaultConfig = JSON.parse(JSON.stringify(settingsExports.defaultConfig));
    const presets = JSON.parse(JSON.stringify(settingsExports.presets));
    const sharedSemver = settingsExports.sharedSemver;
    const sharedWireVersion = settingsExports.sharedWireVersion;
    const settingsLatestSemver = settingsExports.latestSemver;
    const coreLatestSemver = coreExports.latestSemver;
    const settingsRegistry = JSON.parse(JSON.stringify(settingsExports.registry));
    const coreRegistry = JSON.parse(JSON.stringify(coreExports.registry));

    if (sharedSemver !== settingsLatestSemver) {
        fail(`Shared schema semver ${sharedSemver} does not match settings latest ${settingsLatestSemver}`);
    }
    if (sharedSemver !== coreLatestSemver) {
        fail(`Shared schema semver ${sharedSemver} does not match core latest ${coreLatestSemver}`);
    }
    if (!Object.prototype.hasOwnProperty.call(settingsRegistry, sharedSemver)) {
        fail(`Settings schema registry is missing shared semver ${sharedSemver}`);
    }
    if (!Object.prototype.hasOwnProperty.call(coreRegistry, sharedSemver)) {
        fail(`Core schema registry is missing shared semver ${sharedSemver}`);
    }
    if (Number(settingsRegistry[sharedSemver].wireVersion) !== Number(sharedWireVersion)) {
        fail(`Settings wire version ${settingsRegistry[sharedSemver].wireVersion} does not match shared wire ${sharedWireVersion}`);
    }
    if (Number(coreRegistry[sharedSemver].wireVersion) !== Number(sharedWireVersion)) {
        fail(`Core wire version ${coreRegistry[sharedSemver].wireVersion} does not match shared wire ${sharedWireVersion}`);
    }

    const settingsSemvers = Object.keys(settingsRegistry);
    const coreSemvers = Object.keys(coreRegistry);
    if (JSON.stringify(settingsSemvers) !== JSON.stringify(coreSemvers)) {
        fail(`Schema semver keys differ between settings and core (${settingsSemvers.join(", ")} !== ${coreSemvers.join(", ")})`);
    }

    for (const semver of settingsSemvers) {
        const settingsEntry = settingsRegistry[semver];
        const coreEntry = coreRegistry[semver];
        if (Number(settingsEntry.wireVersion) !== Number(coreEntry.wireVersion)) {
            fail(`Wire version mismatch for ${semver} (${settingsEntry.wireVersion} !== ${coreEntry.wireVersion})`);
        }
        const schemaDiff = compareSchemas(settingsEntry.schema, coreEntry.schema);
        if (schemaDiff) {
            fail(`Schema mismatch for ${semver}: ${schemaDiff}`);
        }
    }

    const latestSchema = settingsRegistry[sharedSemver].schema;
    const latestLanguageField = schemaToComparable(latestSchema).find((field) => field.key === "LANGUAGE");
    const latestLanguageMax = latestLanguageField ? Number(latestLanguageField.max) : 0;
    const configNames = ["__DEFAULT__"].concat(Object.keys(presets));
    for (const configName of configNames) {
        const override = configName === "__DEFAULT__" ? {} : presets[configName];
        const effectiveConfig = Object.assign({}, defaultConfig, override);
        const presetIssues = validatePresetValues(configName, effectiveConfig, latestSchema);
        if (presetIssues.length > 0) {
            fail(presetIssues[0]);
        }

        const settingsEncoded = settingsExports.serialize(effectiveConfig);
        const coreEncoded = coreExports.serialize(effectiveConfig);
        if (settingsEncoded !== coreEncoded) {
            fail(`Encoded payload mismatch for ${configName}`);
        }

        const settingsDecoded = settingsExports.deserialize(settingsEncoded, sharedSemver);
        const coreDecoded = coreExports.deserialize(coreEncoded, sharedSemver);
        const settingsDiff = compareDecodedAgainstSchema(settingsDecoded, effectiveConfig, defaultConfig, latestSchema);
        if (settingsDiff.length > 0) {
            fail(`Settings round-trip mismatch for ${configName}: ${settingsDiff[0]}`);
        }
        const coreDiff = compareDecodedAgainstSchema(coreDecoded, effectiveConfig, defaultConfig, latestSchema);
        if (coreDiff.length > 0) {
            fail(`Core round-trip mismatch for ${configName}: ${coreDiff[0]}`);
        }
    }

    const targetedSemvers = ["2.0.0", "2.0.1", "2.1.0", "2.1.1", "2.2.3", "2.2.4", "2.2.5", "2.2.6", "2.2.7", "2.2.8", "2.2.9", "2.2.10", "2.3.0", "2.3.1", "2.3.2"];
    const regressionConfig = Object.assign({}, defaultConfig, {
        LANGUAGE: 2,
        ENABLE_CHAT: 0,
        ENABLE_GAME_AUDIO: 0,
        CHAT_SCALE: 137,
        CHAT_X_OFFSET: 245,
        CHAT_Y_OFFSET: 115,
        MINIMAP_FLIP: 1
    });

    for (const semver of targetedSemvers) {
        if (!Object.prototype.hasOwnProperty.call(settingsRegistry, semver)) {
            fail(`Targeted semver ${semver} missing from settings registry`);
        }
        if (!Object.prototype.hasOwnProperty.call(coreRegistry, semver)) {
            fail(`Targeted semver ${semver} missing from core registry`);
        }

        const expectedSchema = settingsRegistry[semver].schema;
        const schemaCompatibleConfig = buildSchemaCompatibleConfig(regressionConfig, expectedSchema);
        const settingsEncoded = settingsExports.serialize(regressionConfig, semver);
        const coreEncoded = coreExports.serialize(regressionConfig, semver);
        const settingsDecoded = settingsExports.deserialize(settingsEncoded, semver);
        const coreDecoded = coreExports.deserialize(coreEncoded, semver);
        const candidateResult = settingsExports.buildCandidateConfig(settingsDecoded, semver, defaultConfig);
        const candidateConfig = candidateResult && candidateResult.candidateConfig
            ? candidateResult.candidateConfig
            : Object.assign({}, defaultConfig);

        const settingsDiff = compareDecodedAgainstSchema(settingsDecoded, schemaCompatibleConfig, defaultConfig, expectedSchema);
        if (settingsDiff.length > 0) {
            fail(`Settings semver decode mismatch for ${semver}: ${settingsDiff[0]}`);
        }
        const coreDiff = compareDecodedAgainstSchema(coreDecoded, schemaCompatibleConfig, defaultConfig, expectedSchema);
        if (coreDiff.length > 0) {
            fail(`Core semver decode mismatch for ${semver}: ${coreDiff[0]}`);
        }

        if (!candidateConfig || typeof candidateConfig !== "object") {
            fail(`Settings candidate config build failed for ${semver}`);
        }
        const candidateLanguage = Number(candidateConfig.LANGUAGE);
        if (!Number.isFinite(candidateLanguage) || candidateLanguage < 0 || candidateLanguage > latestLanguageMax) {
            fail(`Settings candidate config produced invalid LANGUAGE for ${semver}: ${candidateConfig.LANGUAGE}`);
        }
        if (!Object.prototype.hasOwnProperty.call(candidateConfig, "MINIMAP_FLIP")) {
            fail(`Settings candidate config missing MINIMAP_FLIP fallback for ${semver}`);
        }

        const wrongWire = semver === "2.0.0" ? 2 : 1;
        try {
            settingsExports.deserialize(mutateEncodedWireVersion(settingsEncoded, wrongWire), semver);
            fail(`Settings decoder accepted mismatched wire version for ${semver}`);
        } catch (_settingsWireErr) {}
        try {
            coreExports.deserialize(mutateEncodedWireVersion(coreEncoded, wrongWire), semver);
            fail(`Core decoder accepted mismatched wire version for ${semver}`);
        } catch (_coreWireErr) {}
    }

    console.log(`[SchemaGuard] OK: ${settingsSemvers.length} schema versions and ${configNames.length} config states validated.`);
}

main();
