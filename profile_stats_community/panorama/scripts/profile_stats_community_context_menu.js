(function () {
    "use strict";

    var ACCOUNT_WITNESS_ID = "ProfileStatsCommunityContextAccount";
    /* VIEWED_PROFILE_IDENTITY_POLICY: scripts/viewed-profile-identity-policy.js */


    function isCallable(value) {
        return typeof value === "function";
    }

    function isValidPanel(panel) {
        try {
            return !!panel && isCallable(panel.IsValid) && panel.IsValid();
        } catch (error) {
            return false;
        }
    }

    function trim(value) {
        return String(value === null || value === undefined ? "" : value).replace(/^\s+|\s+$/g, "");
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
        if (!isValidPanel(panel) || !isCallable(panel.GetAttributeString)) {
            return "";
        }
        try {
            return trim(panel.GetAttributeString(name, ""));
        } catch (error) {
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
        var witness = findWitness(card);
        var identity = viewedProfileIdentityPolicy.resolve({
            value: readText(witness),
            format: "account"
        }, [
            {
                value: readAttribute(card, "accountid"),
                format: "account"
            },
            {
                value: readAttribute(card, "steamid"),
                format: "identity"
            }
        ]);
        return identity.state === "valid"
            ? viewedProfileIdentityPolicy.accountNumber(identity.account)
            : null;
    }

    function openSelectedProfile() {
        var root;
        var account;
        try {
            root = $.GetContextPanel();
        } catch (error) {
            return false;
        }
        account = resolveAccount(findProfileCard(root));
        if (account === null) {
            return false;
        }
        try {
            $.DispatchEvent("CitadelShowProfilePageForAccount", account);
            return true;
        } catch (error2) {
            return false;
        }
    }

    $.ProfileStatsCommunityOpenPlayerProfile = openSelectedProfile;
})();
