(function () {
    "use strict";

    var ACCOUNT_WITNESS_ID = "ProfileStatsCommunityContextAccount";
    var AUTHORITY_NAMES = ["accountid", "steamid"];
    var STEAM_ID_BASE = "76561197960265728";

    function isCallable(value) {
        return typeof value === "function";
    }

    function isValidPanel(panel) {
        if (!panel) {
            return false;
        }
        try {
            return !isCallable(panel.IsValid) || panel.IsValid();
        } catch (error) {
            return false;
        }
    }

    function trim(value) {
        return String(value === null || value === undefined ? "" : value).replace(/^\s+|\s+$/g, "");
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
        return normalized === "0" ? "" : normalized;
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
        if (!normalized) {
            return "";
        }
        if (name === "steamid" && normalized.length > 10) {
            return normalizeDigits(subtractDecimal(normalized, STEAM_ID_BASE));
        }
        return normalized;
    }

    function readText(panel) {
        if (!isValidPanel(panel)) {
            return "";
        }
        try {
            return trim(panel.text);
        } catch (error) {
            return "";
        }
    }

    function readAttribute(panel, name) {
        var value;
        if (!isValidPanel(panel)) {
            return "";
        }
        try {
            if (isCallable(panel.GetAttributeString)) {
                value = panel.GetAttributeString(name, "");
                if (value !== null && value !== undefined) {
                    return trim(value);
                }
            }
        } catch (error) {
            return "";
        }
        try {
            return panel[name] === null || panel[name] === undefined ? "" : trim(panel[name]);
        } catch (error2) {
            return "";
        }
    }

    function findProfileCard(root) {
        if (!isValidPanel(root)) {
            return null;
        }
        try {
            if (isCallable(root.FindChildTraverse)) {
                return root.FindChildTraverse("ProfileCard");
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    function findWitness(card) {
        if (!isValidPanel(card)) {
            return null;
        }
        try {
            if (isCallable(card.FindChildTraverse)) {
                return card.FindChildTraverse(ACCOUNT_WITNESS_ID);
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    function resolveAccount(card) {
        var account = normalizeDigits(readText(findWitness(card)));
        var accountNumber = Number(account);
        var index;
        var authority;
        if (!account || !isFinite(accountNumber) || Math.floor(accountNumber) !== accountNumber || accountNumber <= 0 || accountNumber > 4294967295 || String(accountNumber) !== account) {
            return null;
        }
        for (index = 0; index < AUTHORITY_NAMES.length; index += 1) {
            authority = readAttribute(card, AUTHORITY_NAMES[index]);
            if (authority !== "" && normalizeAuthority(authority, AUTHORITY_NAMES[index]) !== account) {
                return null;
            }
        }
        return accountNumber;
    }

    function install() {
        var root;
        try {
            root = $.GetContextPanel();
        } catch (error) {
            return;
        }
        if (!isValidPanel(root)) {
            return;
        }
        $.ProfileStatsCommunityOpenPlayerProfile = function () {
            var account = resolveAccount(findProfileCard(root));
            if (account === null) {
                return false;
            }
            try {
                if (typeof CitadelShowProfilePageForAccount !== "function") {
                    return false;
                }
                CitadelShowProfilePageForAccount(account);
                return true;
            } catch (error) {
                return false;
            }
        };
    }

    install();
})();
