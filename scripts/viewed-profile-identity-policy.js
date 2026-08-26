    var viewedProfileIdentityPolicy = (function () {
        var STEAM_ID_BASE = "76561197960265728";
        var MAX_ACCOUNT_ID = "4294967295";

        function trim(value) {
            return String(value === null || value === undefined ? "" : value).replace(/^\s+|\s+$/g, "");
        }

        function stripLeadingZeroes(value) {
            var result = String(value).replace(/^0+/, "");
            return result || "0";
        }

        function normalizeAccount(value) {
            var normalized;
            if (typeof value !== "string") {
                return "";
            }
            normalized = trim(value);
            if (!/^\d{1,20}$/.test(normalized)) {
                return "";
            }
            normalized = stripLeadingZeroes(normalized);
            if (normalized === "0" || normalized.length > MAX_ACCOUNT_ID.length ||
                (normalized.length === MAX_ACCOUNT_ID.length && normalized > MAX_ACCOUNT_ID)) {
                return "";
            }
            return normalized;
        }

        function canonicalAccount(value) {
            var normalized = normalizeAccount(value);
            return normalized && normalized === value ? normalized : "";
        }

        function subtractSteamIdBase(value) {
            var index;
            var baseIndex;
            var digit;
            var baseDigit;
            var difference;
            var borrow = 0;
            var output = "";
            if (!/^\d{17}$/.test(value) || value < STEAM_ID_BASE) {
                return "";
            }
            index = value.length - 1;
            baseIndex = STEAM_ID_BASE.length - 1;
            while (index >= 0) {
                digit = parseInt(value.charAt(index), 10) - borrow;
                baseDigit = baseIndex >= 0 ? parseInt(STEAM_ID_BASE.charAt(baseIndex), 10) : 0;
                difference = digit - baseDigit;
                if (difference < 0) {
                    difference += 10;
                    borrow = 1;
                } else {
                    borrow = 0;
                }
                output = String(difference) + output;
                index -= 1;
                baseIndex -= 1;
            }
            return normalizeAccount(stripLeadingZeroes(output));
        }

        function normalizeSteamId(value) {
            var normalized;
            if (typeof value !== "string") {
                return "";
            }
            normalized = stripLeadingZeroes(trim(value));
            return normalizeAccount(normalized) || subtractSteamIdBase(normalized);
        }

        function normalizeIdentity(value) {
            var normalized;
            var steam3;
            if (typeof value !== "string") {
                return "";
            }
            normalized = trim(value);
            steam3 = /^\[U:1:([1-9][0-9]*)\]$/.exec(normalized) || /^U:1:([1-9][0-9]*)$/.exec(normalized);
            if (steam3) {
                return normalizeAccount(steam3[1]);
            }
            return normalizeAccount(normalized) || normalizeSteamId(normalized);
        }

        function normalize(value, format) {
            if (format === "account") {
                return normalizeAccount(value);
            }
            if (format === "steamid") {
                return normalizeSteamId(value);
            }
            if (format === "identity") {
                return normalizeIdentity(value);
            }
            return "";
        }

        function result(state, account) {
            return {
                state: state,
                account: account || ""
            };
        }

        function resolve(primary, corroborators) {
            var account;
            var index;
            var witness;
            var raw;
            var normalized;
            if (!primary) {
                return result("missing", "");
            }
            raw = typeof primary.value === "string" ? primary.value : "";
            account = normalize(raw, primary.format);
            if (!account) {
                return result("missing", "");
            }
            corroborators = corroborators || [];
            for (index = 0; index < corroborators.length; index += 1) {
                witness = corroborators[index];
                if (!witness || typeof witness.value !== "string") {
                    return result("mismatch", account);
                }
                raw = witness.value;
                if (trim(raw) === "") {
                    continue;
                }
                normalized = normalize(raw, witness.format);
                if (!normalized || normalized !== account) {
                    return result("mismatch", account);
                }
            }
            return result("valid", account);
        }

        function same(left, right) {
            return !!left && !!right && left.state === right.state && left.account === right.account;
        }

        function payloadMatches(value, account) {
            return typeof value === "number" && isFinite(value) && Math.floor(value) === value &&
                value > 0 && value <= 4294967295 && String(value) === account;
        }

        function accountNumber(account) {
            var normalized = normalizeAccount(account);
            return normalized ? Number(normalized) : null;
        }

        return {
            normalizeAccount: normalizeAccount,
            normalizeIdentity: normalizeIdentity,
            resolve: resolve,
            canonicalAccount: canonicalAccount,
            same: same,
            payloadMatches: payloadMatches,
            accountNumber: accountNumber
        };
    }());
