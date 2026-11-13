"use strict";

var g_HeroesPage = $.GetContextPanel();
var g_HeroesPageCurrentHero = null;
var g_HeroesPageOrder = null;
var g_HeroesPageHarvest = null;
var g_HeroesPageHarvestGuard = false;
var g_HeroesPageDetailIDs = [
	"DetailsSpotlight",
	"DetailsLogo",
	"DetailsTags",
	"DetailsAbilities"
	];

function HeroesPage_Log(msg)
{
	$.Msg("[HeroesPage] " + msg);
}

function HeroesPage_ApplyHeroID(panel, heroID)
{
	if (typeof panel.SetHeroID === "function")
		panel.SetHeroID(heroID);
	else
		panel.heroid = heroID;
}

function HeroesPage_SetHeroOn(panel, heroID)
{
	if (!panel)
		return;
	try { HeroesPage_ApplyHeroID(panel, heroID); }
	catch (e) { HeroesPage_Log(panel.id + ": " + e); }

	try
	{
		var scene = panel.FindChildTraverse("HeroScenePanel");
		if (scene && scene !== panel)
			HeroesPage_ApplyHeroID(scene, heroID);
	}
	catch (e2) { HeroesPage_Log(panel.id + "/HeroScenePanel: " + e2); }
}

function HeroesPage_HideHeroBackground()
{
	try
	{
		var bg = g_HeroesPage.FindChildTraverse("CustomHeroBackground");
		if (bg)
		{
			bg.style.visibility = "collapse";
			bg.visible = false;
		}
	}
	catch (e) { HeroesPage_Log("hide CustomHeroBackground: " + e); }
}

function HeroesPage_ShowHero(heroID)
{
	heroID = Number(heroID);
	if (isNaN(heroID))
		return;
	if (heroID === g_HeroesPageCurrentHero && g_HeroesPage.BHasClass("ShowingHeroDetails"))
		return;
	HeroesPage_Log("showing hero " + heroID);
	g_HeroesPageCurrentHero = heroID;
	for (var i = 0; i < g_HeroesPageDetailIDs.length; i++)
		HeroesPage_SetHeroOn(g_HeroesPage.FindChildTraverse(g_HeroesPageDetailIDs[i]), heroID);
	HeroesPage_HideHeroBackground();
	HeroesPage_FillDetails(heroID);
	HeroesPage_SelectTab("basic");
	g_HeroesPage.AddClass("ShowingHeroDetails");
	try
	{
		var view = g_HeroesPage.FindChildTraverse("HeroDetailsView");
		if (view)
			view.SetFocus();
	}
	catch (e3) { HeroesPage_Log("focus details: " + e3); }
}

function HeroesPage_ShowGrid()
{
	g_HeroesPage.RemoveClass("ShowingAbilityTooltip");
	g_HeroesPage.RemoveClass("ShowingHeroDetails");
}

function HeroesPage_OnNavigateBack()
{
	if (!g_HeroesPage.IsValid() || !g_HeroesPage.BHasClass("ShowingHeroDetails"))
		return false;
	HeroesPage_ShowGrid();
	return true;
}

function HeroesPage_FindDashboard()
{
	var p = g_HeroesPage;
	while (p)
	{
		if (p.paneltype === "CitadelDB")
			return p;
		p = p.GetParent();
	}
	return null;
}

function HeroesPage_Cancel()
{
	if (g_HeroesPage.BHasClass("ShowingHeroDetails"))
		HeroesPage_ShowGrid();
	else
		$.DispatchEvent("CitadelNavigateBack");
}

function HeroesPage_GridCards()
{
	var cards = [];
	var containers = ["HeroesContainerRecommended", "HeroesContainer"];
	for (var c = 0; c < containers.length; c++)
	{
		var container = g_HeroesPage.FindChildTraverse(containers[c]);
		if (!container)
			continue;
		var stack = container.Children();
		while (stack.length > 0)
		{
			var p = stack.shift();
			if (p.paneltype === "CitadelHeroCard")
				cards.push(p);
			else
				stack = p.Children().concat(stack);
		}
	}
	return cards;
}

function HeroesPage_FinishHarvest()
{
	var ids = [];
	var got = g_HeroesPageHarvest || [];
	for (var j = 0; j < got.length; j++)
		if (ids.indexOf(got[j]) < 0)
			ids.push(got[j]);
	g_HeroesPageHarvest = null;
	g_HeroesPageHarvestGuard = true;
	$.Schedule(0.5, function () { g_HeroesPageHarvestGuard = false; });
	HeroesPage_Log("hero order: " + ids.length + " heroes");
	if (ids.length > 0)
		g_HeroesPageOrder = ids;
}

function HeroesPage_HarvestWhileVisible(attempt)
{
	attempt = attempt || 0;
	if (!g_HeroesPage.IsValid() || (g_HeroesPageOrder && g_HeroesPageOrder.length > 0))
		return;
	if (g_HeroesPage.BHasClass("ShowingHeroDetails") || g_HeroesPageHarvest !== null)
	{
		$.Schedule(0.5, function () { HeroesPage_HarvestWhileVisible(attempt); });
		return;
	}
	var cards = HeroesPage_GridCards();
	if (cards.length === 0)
	{
		if (attempt < 20)
			$.Schedule(0.5, function () { HeroesPage_HarvestWhileVisible(attempt + 1); });
		else
			HeroesPage_Log("grid never populated: no CitadelHeroCard panels found");
		return;
	}
	g_HeroesPageHarvest = [];
	for (var i = 0; i < cards.length; i++)
	{
		try { $.DispatchEvent("HeroCardActivated", cards[i]); }
		catch (e) { HeroesPage_Log("HeroCardActivated dispatch: " + e); break; }
	}
	HeroesPage_Log("harvest dispatched to " + cards.length + " cards, " + g_HeroesPageHarvest.length + " ids came back immediately");
	$.Schedule(0.25, function ()
	{
		HeroesPage_FinishHarvest();
		if (!g_HeroesPageOrder && attempt < 3)
			$.Schedule(1.0, function () { HeroesPage_HarvestWhileVisible(attempt + 1); });
	});
}

function HeroesPage_StepWithOrder(dir)
{
	var ids = g_HeroesPageOrder || [];
	if (ids.length === 0)
	{
		HeroesPage_Log("no hero ids readable from the grid cards; prev/next unavailable");
		return;
	}
	var idx = ids.indexOf(g_HeroesPageCurrentHero);
	idx = (idx < 0) ? 0 : (idx + dir + ids.length) % ids.length;
	HeroesPage_ShowHero(ids[idx]);
}

var g_HeroesPageShowAll = false;
var g_HeroesPageModeSeq = -1;

function HeroesPage_AllIDs()
{
	var ids = [];
	for (var k in g_HeroesPageHeroCodes)
		ids.push(Number(k));
	return ids;
}

function HeroesPage_HeroName(id)
{
	var code = g_HeroesPageHeroCodes[id];
	if (code)
		return HeroesPage_Loc("hero_" + code) || (code.charAt(0).toUpperCase() + code.slice(1));
	return String(id);
}

function HeroesPage_BuildOrder()
{
	var source = g_HeroesPageShowAll ? HeroesPage_AllIDs() : g_HeroesPageSelectable;
	var list = [];
	for (var i = 0; i < source.length; i++)
	{
		var id = source[i];
		list.push({ id: id, name: HeroesPage_HeroName(id).toUpperCase().replace(/^THE /, "") });
	}
	list.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
	var ids = [];
	for (var j = 0; j < list.length; j++)
		ids.push(list[j].id);
	return ids;
}

function HeroesPage_Create(type, parent, id, props)
{
	try { return $.CreatePanel(type, parent, id, props); }
	catch (e) {}
	try { return $.CreatePanelWithProperties(type, parent, id, props); }
	catch (e2) { HeroesPage_Log("create " + type + ": " + e2); }
	return null;
}

var g_HeroesPageGenericCard = "s2r://panorama/images/heroes/generic_vertical_psd.vtex";

function HeroesPage_ImageExists(src)
{
	try { return $.BImageFileExists(src); }
	catch (e) { return true; }
}

function HeroesPage_CardImage(id)
{
	var src = (typeof g_HeroesPageCardImage !== "undefined") ? g_HeroesPageCardImage[id] : null;
	if (src)
	{
		var m = src.match(/^file:\/\/\{images\}\/(.*)\.(psd|png|tga|jpg)$/i);
		var candidates = [src];
		if (m)
			candidates.push("s2r://panorama/images/" + m[1] + "_" + m[2].toLowerCase() + ".vtex");
		for (var i = 0; i < candidates.length; i++)
		{
			if (HeroesPage_ImageExists(candidates[i]))
				return candidates[i];
		}
	}
	return g_HeroesPageGenericCard;
}

function HeroesPage_MakeHiddenCard(container, id)
{
	var card = HeroesPage_Create("Button", container, "RMHiddenHero" + id, {});
	if (!card)
		return null;
	card.AddClass("RMHiddenCard");
	var src = HeroesPage_CardImage(id);
	var img = HeroesPage_Create("Image", card, "RMHiddenImage", { hittest: "false", scaling: "stretch-to-cover-preserve-aspect", src: src });
	if (img)
	{
		try { img.SetImage(src); }
		catch (e) { HeroesPage_Log("hidden card image " + id + ": " + e); }
	}
	var shade = HeroesPage_Create("Panel", card, "RMHiddenShade", { hittest: "false" });
	var plate = HeroesPage_Create("Panel", card, "RMHiddenPlate", { hittest: "false" });
	if (plate)
	{
		var name = HeroesPage_Create("Label", plate, "RMHiddenName", { hittest: "false" });
		if (name)
			name.text = HeroesPage_HeroName(id);
		var tag = HeroesPage_Create("Label", plate, "RMHiddenTag", { hittest: "false" });
		if (tag)
			tag.text = String(g_HeroesPageHidden[id] || "Hidden").toUpperCase();
	}
	card.SetPanelEvent("onactivate", function () { HeroesPage_ShowHero(id); });
	return card;
}

function HeroesPage_SyncHiddenCards()
{
	if (typeof g_HeroesPageHidden === "undefined")
		return true;
	var container = g_HeroesPage.FindChildTraverse("HeroesContainer");
	if (!container)
	{
		if (g_HeroesPageShowAll)
			HeroesPage_Log("hidden heroes: HeroesContainer not found yet");
		return false;
	}
	var ok = true;
	var made = 0;
	for (var k in g_HeroesPageHidden)
	{
		var id = Number(k);
		var card = container.FindChild("RMHiddenHero" + id);
		if (!card && g_HeroesPageShowAll)
		{
			card = HeroesPage_MakeHiddenCard(container, id);
			if (card)
				made++;
		}
		if (!card)
		{
			if (g_HeroesPageShowAll)
				ok = false;
			continue;
		}
		card.style.visibility = g_HeroesPageShowAll ? "visible" : "collapse";
	}
	if (made > 0)
		HeroesPage_Log("hidden heroes: added " + made + " cards to the grid");
	return ok;
}

function HeroesPage_SetShowAll(on)
{
	g_HeroesPageShowAll = on;
	g_HeroesPageOrder = null;
	var title = g_HeroesPage.FindChildTraverse("HeroesPageTitle");
	if (title)
		title.text = (HeroesPage_Loc("menu_hero_grid") || "Heroes") + (on ? " (ALL)" : "");
	g_HeroesPage.SetHasClass("ShowingAllHeroes", on);
	HeroesPage_SyncHiddenCards();
	HeroesPage_Log(on ? "showing all heroes, including hidden ones" : "showing playable heroes");
}

function HeroesPage_PollMode()
{
	if (!g_HeroesPage.IsValid())
		return;
	var db = HeroesPage_FindDashboard();
	if (db)
	{
		var want = false;
		var seq = 0;
		try
		{
			want = db.GetAttributeString("restoremenu_heroes_showall", "0") === "1";
			seq = db.GetAttributeInt("restoremenu_heroes_seq", 0);
		}
		catch (e) {}
		if (want !== g_HeroesPageShowAll || seq !== g_HeroesPageModeSeq)
		{
			HeroesPage_Log("mode request " + seq + ": showall=" + want);
			g_HeroesPageModeSeq = seq;
			HeroesPage_SetShowAll(want);
		}
		else if (g_HeroesPageShowAll)
		{
			HeroesPage_SyncHiddenCards();
		}
	}
	$.Schedule(0.25, HeroesPage_PollMode);
}

function HeroesPage_Step(dir)
{
	if (!g_HeroesPageOrder || g_HeroesPageOrder.length === 0)
	{
		g_HeroesPageOrder = HeroesPage_BuildOrder();
		HeroesPage_Log("hero order from game data: " + g_HeroesPageOrder.length + " heroes");
	}
	if (g_HeroesPageOrder.indexOf(g_HeroesPageCurrentHero) < 0 && g_HeroesPageCurrentHero !== null)
		HeroesPage_Log("current hero " + g_HeroesPageCurrentHero + " isn't in the list; starting from the first");
	HeroesPage_StepWithOrder(dir);
}

function HeroesPage_HeroIDFromArgs(args)
{
	for (var i = args.length - 1; i >= 0; i--)
	{
		var a = args[i];
		if (typeof a === "number")
			return a;
		if (typeof a === "string" && a !== "" && !isNaN(Number(a)))
			return Number(a);
	}
	return null;
}

function HeroesPage_OnHeroSelected()
{
	var args = Array.prototype.slice.call(arguments);
	var heroID = HeroesPage_HeroIDFromArgs(args);
	if (heroID === null)
		return false;
	if (g_HeroesPageHarvest !== null)
	{
		g_HeroesPageHarvest.push(heroID);
		return true;
	}
	if (g_HeroesPageHarvestGuard)
		return true;
	HeroesPage_ShowHero(heroID);
	return true;
}

function HeroesPage_Loc(token)
{
	try
	{
		var s = $.Localize("#" + token);
		if (s && s !== "#" + token && s !== token)
			return s;
	}
	catch (e) {}
	return null;
}

function HeroesPage_SplitWords(name)
{
	return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function HeroesPage_CleanDesc(text, heroID)
{
	var code = g_HeroesPageHeroCodes[heroID];
	var heroName = (code && HeroesPage_Loc("hero_" + code)) || "this hero";
	text = text.replace(/<\/?Panel[^>]*>/gi, "");
	text = text.replace(/\{g:citadel_inline_attribute:'([^']+)'\}/g, function (m, attr)
	{
		return '<span class="highlight">' + HeroesPage_SplitWords(attr) + "</span>";
	});
	text = text.replace(/\{s:hero_name\}/g, heroName);
	text = text.replace(/\{[sgdi]:[^}]*\}/g, "?");
	return text;
}

function HeroesPage_Fmt(n)
{
	n = Number(n);
	if (isNaN(n))
		return "";
	var r = Math.round(n * 100) / 100;
	return r.toString();
}

function HeroesPage_PropPostfix(prop, cls)
{
	var p = HeroesPage_Loc(prop + "_postfix");
	if (p !== null)
		return p;
	if (cls === "duration" || cls === "cooldown" || cls === "cast" || cls === "charge_cooldown")
		return "s";
	if (cls === "distance" || cls === "range")
		return "m";
	if (cls === "slow")
		return "%";
	return "";
}

function HeroesPage_PropLabel(prop, cls)
{
	var l = HeroesPage_Loc(prop + "_label");
	if (l !== null)
		return l;
	if (cls === "slow")
		return "Move Speed";
	return HeroesPage_SplitWords(prop);
}

function HeroesPage_FmtWithUnits(prop, value, cls, signed)
{
	var n = Number(value);
	var sign = "";
	if (cls === "slow" && n > 0)
		sign = "-";
	else if (signed && n > 0)
		sign = "+";
	return sign + HeroesPage_Fmt(n) + HeroesPage_PropPostfix(prop, cls);
}

function HeroesPage_LocInto(label, token, values, heroID)
{
	if (!label)
		return false;
	var code = g_HeroesPageHeroCodes[heroID];
	try
	{
		for (var k in values)
			label.SetDialogVariable(k, HeroesPage_Fmt(values[k]));
		label.SetDialogVariable("hero_name", (code && HeroesPage_Loc("hero_" + code)) || "");
	}
	catch (e) { HeroesPage_Log("SetDialogVariable: " + e); }
	var text = null;
	try
	{
		text = $.Localize("#" + token, label);
		if (!text || text === "#" + token || text === token)
			text = null;
	}
	catch (e2) { text = null; }
	if (text === null)
		return false;
	label.text = HeroesPage_CleanDesc(text, heroID);
	return true;
}

function HeroesPage_ShowAbilityTip(slot)
{
	var heroID = g_HeroesPageCurrentHero;
	var list = g_HeroesPageAbilities[heroID];
	if (!list || !list[slot])
		return;
	var ability = list[slot];
	var data = (typeof g_HeroesPageAbilityData !== "undefined" && g_HeroesPageAbilityData[ability]) || { v: {} };
	var v = data.v || {};
	var cls = data.c || {};

	HeroesPage_SetText("AbilityTooltipName", HeroesPage_Loc(ability) || ability);

	var cdPanel = g_HeroesPage.FindChildTraverse("AbilityTooltipCooldown");
	if (cdPanel)
		cdPanel.SetHasClass("TipHidden", !(v.AbilityCooldown > 0));
	HeroesPage_SetText("AbilityTooltipCooldownText", v.AbilityCooldown > 0 ? HeroesPage_Fmt(v.AbilityCooldown) + "s" : "");
	var shown = (data.i || []).concat(data.b || []);
	var badges = [];
	if (v.AbilityChannelTime > 0) badges.push(HeroesPage_Fmt(v.AbilityChannelTime) + "s");
	if (v.AbilityDuration > 0) badges.push(HeroesPage_Fmt(v.AbilityDuration) + "s");
	if (v.AbilityCastRange > 0) badges.push(HeroesPage_Fmt(v.AbilityCastRange) + "m");
	if (v.Radius > 0 && shown.indexOf("Radius") < 0) badges.push(HeroesPage_Fmt(v.Radius) + "m");
	if (v.AbilityCharges > 1) badges.push(HeroesPage_Fmt(v.AbilityCharges) + " charges");
	for (var bi = 0; bi < 4; bi++)
	{
		var bp = g_HeroesPage.FindChildTraverse("TipBadge" + bi);
		if (bp)
			bp.SetHasClass("TipHidden", bi >= badges.length);
		HeroesPage_SetText("TipBadgeText" + bi, bi < badges.length ? badges[bi] : "");
	}

	var descLabel = g_HeroesPage.FindChildTraverse("AbilityTooltipDesc");
	var locs = (data.l && data.l.length) ? data.l : [ability + "_desc"];
	var parts = [];
	for (var li = 0; li < locs.length; li++)
	{
		if (HeroesPage_LocInto(descLabel, locs[li], v, heroID))
			parts.push(descLabel.text);
	}
	if (descLabel)
		descLabel.text = parts.join("<br><br>");

	var imp = data.i || [];
	for (var ii = 0; ii < 3; ii++)
	{
		var box = g_HeroesPage.FindChildTraverse("TipImp" + ii);
		var prop = imp[ii];
		var has = prop !== undefined && v[prop] !== undefined;
		if (box)
		{
			box.SetHasClass("TipHidden", !has);
			box.SetHasClass("SpiritProp", has && cls[prop] === "tech_damage");
		}
		if (!has)
			continue;
		HeroesPage_SetText("TipImpValue" + ii, HeroesPage_FmtWithUnits(prop, v[prop], cls[prop], false));
		HeroesPage_SetText("TipImpLabel" + ii, HeroesPage_PropLabel(prop, cls[prop]));
		HeroesPage_SetText("TipImpScale" + ii, (data.s && data.s[prop]) ? "x " + HeroesPage_Fmt(data.s[prop]) : "");
	}
	var anyImp = imp.some(function (p) { return v[p] !== undefined; });

	var bas = (data.b || []).filter(function (p) { return v[p] !== undefined; });
	for (var bj = 0; bj < 6; bj++)
	{
		var row = g_HeroesPage.FindChildTraverse("TipBasic" + bj);
		if (row)
			row.SetHasClass("TipHidden", bj >= bas.length);
		if (bj < bas.length)
		{
			var bpName = bas[bj];
			HeroesPage_SetText("TipBasic" + bj, "<b>" + HeroesPage_FmtWithUnits(bpName, v[bpName], cls[bpName], false) + "</b>  " + HeroesPage_PropLabel(bpName, cls[bpName]));
		}
	}
	var basicPanel = g_HeroesPage.FindChildTraverse("TipBasic");
	if (basicPanel)
		basicPanel.SetHasClass("TipHidden", bas.length === 0);
	var propsPanel = g_HeroesPage.FindChildTraverse("AbilityTooltipProps");
	if (propsPanel)
		propsPanel.SetHasClass("TipHidden", !anyImp && bas.length === 0);

	var tiers = data.t || [];
	for (var t = 1; t <= 3; t++)
	{
		var label = g_HeroesPage.FindChildTraverse("AbilityTier" + t);
		var ups = tiers[t - 1] || [];
		var bonus = {};
		for (var u = 0; u < ups.length; u++)
		{
			if (!ups[u][2])
				bonus[ups[u][0]] = ups[u][1];
		}
		if (HeroesPage_LocInto(label, ability + "_t" + t + "_desc", bonus, heroID))
			continue;
		var lines = [];
		for (var u2 = 0; u2 < ups.length; u2++)
		{
			var up = ups[u2][0];
			var upCls = (data.c && data.c[up]) || (up === "AbilityCooldown" ? "cooldown" : (up === "AbilityDuration" ? "duration" : undefined));
			var kind = ups[u2][2];
			var valueText;
			if (kind === "scale")
				valueText = "+" + HeroesPage_Fmt(ups[u2][1]) + "x Spirit Scaling";
			else if (kind === "mul" || kind === "mulscale")
				valueText = "x" + HeroesPage_Fmt(ups[u2][1]) + (kind === "mulscale" ? " Spirit Scaling" : "");
			else
				valueText = HeroesPage_FmtWithUnits(up, ups[u2][1], upCls, true);
			lines.push('<span class="TipTierValue">' + valueText + "</span><br>" + HeroesPage_PropLabel(up, upCls));
		}
		if (label)
			label.text = lines.length ? lines.join("<br>") : "-";
	}

	g_HeroesPage.AddClass("ShowingAbilityTooltip");
}

function HeroesPage_HideAbilityTip()
{
	g_HeroesPage.RemoveClass("ShowingAbilityTooltip");
}

function HeroesPage_Bind(id, eventName, fn)
{
	var p = g_HeroesPage.FindChildTraverse(id);
	if (!p)
	{
		HeroesPage_Log("bind: no panel #" + id);
		return;
	}
	try { p.SetPanelEvent(eventName, fn); }
	catch (e) { HeroesPage_Log("bind " + id + "." + eventName + ": " + e); }
}

function HeroesPage_SetText(id, text)
{
	var l = g_HeroesPage.FindChildTraverse(id);
	if (l)
		l.text = text;
}

function HeroesPage_Num(v, digits)
{
	var n = Number(v);
	if (isNaN(n))
		return "-";
	return (Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)).toString();
}

function HeroesPage_FillDetails(heroID)
{
	var code = g_HeroesPageHeroCodes[heroID];
	HeroesPage_SetText("DetailsRole", (code && HeroesPage_Loc("hero_" + code + "_role")) || "");
	HeroesPage_SetText("DetailsPlaystyle", (code && HeroesPage_Loc("hero_" + code + "_playstyle")) || "");
	HeroesPage_SetText("DetailsLoreText", (code && HeroesPage_Loc("hero_" + code + "_lore")) || "No background available for this hero.");

	var s = g_HeroesPageStats[heroID] || {};
	var w = (typeof g_HeroesPageWeapon !== "undefined" && g_HeroesPageWeapon[heroID]) || {};
	HeroesPage_SetText("Stat_DPS", HeroesPage_Num(w.dps, 0));
	HeroesPage_SetText("Stat_BulletDamage", HeroesPage_Num(w.dmg, 2));
	HeroesPage_SetText("Stat_Ammo", HeroesPage_Num(w.ammo, 0));
	HeroesPage_SetText("Stat_BulletsPerSec", HeroesPage_Num(w.bps, 1));
	HeroesPage_SetText("Stat_LightMelee", HeroesPage_Num(s.light, 0));
	HeroesPage_SetText("Stat_HeavyMelee", HeroesPage_Num(s.heavy, 0));
	HeroesPage_SetText("Stat_MaxHealth", HeroesPage_Num(s.hp, 0));
	HeroesPage_SetText("Stat_HealthRegen", HeroesPage_Num(s.regen, 1));
	HeroesPage_SetText("Stat_BulletResist", HeroesPage_Num((s.bres || 0) * 100, 0) + "%");
	HeroesPage_SetText("Stat_SpiritResist", HeroesPage_Num((s.sres || 0) * 100, 0) + "%");
	HeroesPage_SetText("Stat_MoveSpeed", HeroesPage_Num(s.move, 1) + " m/s");
	HeroesPage_SetText("Stat_SprintSpeed", HeroesPage_Num(s.sprint, 1) + " m/s");
	HeroesPage_SetText("Stat_Stamina", HeroesPage_Num(s.stamina, 0));
}

function HeroesPage_StartSandbox()
{
	var code = g_HeroesPageHeroCodes[g_HeroesPageCurrentHero];
	if (!code)
	{
		HeroesPage_Log("sandbox: no hero code for " + g_HeroesPageCurrentHero);
		return;
	}
	var db = HeroesPage_FindDashboard();
	if (db)
	{
		db.SetAttributeString("restoremenu_sandbox_hero", "hero_" + code);
		db.SetAttributeInt("restoremenu_sandbox_ticks", 0);
	}
	HeroesPage_Log("sandbox: loading new_player_basics as hero_" + code);
	$.DispatchEvent("CitadelConCommand", "map new_player_basics");
}

function HeroesPage_SelectTab(tab)
{
	var tabs = { basic: "TabBasic", background: "TabBackground", builds: "TabBuilds" };
	if (tab === "builds")
	{

		try { $.DispatchEvent("CitadelOpenBuildBrowser", g_HeroesPageCurrentHero); }
		catch (e) { HeroesPage_Log("CitadelOpenBuildBrowser: " + e); }
		return;
	}
	for (var k in tabs)
	{
		var b = g_HeroesPage.FindChildTraverse(tabs[k]);
		if (b)
			b.SetHasClass("Active", k === tab);
	}
	g_HeroesPage.SetHasClass("ShowingLore", tab === "background");
	HeroesPage_HideAbilityTip();
}

(function ()
{
	try { g_HeroesPage.SetPanelEvent("oncancel", HeroesPage_Cancel); }
	catch (e) { HeroesPage_Log("SetPanelEvent(oncancel): " + e); }

	try { $.RegisterEventHandler("CitadelHeroSelected", g_HeroesPage, HeroesPage_OnHeroSelected); }
	catch (e) { HeroesPage_Log("RegisterEventHandler(CitadelHeroSelected): " + e); }

	try
	{
		var db = HeroesPage_FindDashboard();
		var footer = db ? db.FindChildTraverse("FooterBar") : null;
		if (footer)
			$.RegisterEventHandler("CitadelNavigateBack", footer, HeroesPage_OnNavigateBack);
		else
			HeroesPage_Log("FooterBar not found");
		if (db)
			$.RegisterEventHandler("CitadelNavigateBack", db, HeroesPage_OnNavigateBack);
	}
	catch (e) { HeroesPage_Log("RegisterEventHandler(CitadelNavigateBack): " + e); }

	HeroesPage_Bind("DetailsPrevButton", "onactivate", function () { HeroesPage_Step(-1); });
	HeroesPage_Bind("DetailsNextButton", "onactivate", function () { HeroesPage_Step(1); });
	HeroesPage_Bind("HeroDetailsView", "oncancel", HeroesPage_ShowGrid);
	HeroesPage_Bind("DetailsSandboxButton", "onactivate", HeroesPage_StartSandbox);
	HeroesPage_Bind("TabBasic", "onactivate", function () { HeroesPage_SelectTab("basic"); });
	HeroesPage_Bind("TabBackground", "onactivate", function () { HeroesPage_SelectTab("background"); });
	HeroesPage_Bind("TabBuilds", "onactivate", function () { HeroesPage_SelectTab("builds"); });
	for (var s = 0; s < 4; s++)
	{
		(function (slot)
		{
			HeroesPage_Bind("AbilityHotspot" + slot, "onmouseover", function () { HeroesPage_ShowAbilityTip(slot); });
			HeroesPage_Bind("AbilityHotspot" + slot, "onmouseout", HeroesPage_HideAbilityTip);
		})(s);
	}

	HeroesPage_ShowGrid();
	HeroesPage_PollMode();
	HeroesPage_Log("loaded");
})();
