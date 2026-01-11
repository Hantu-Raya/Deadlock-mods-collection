// this was never needed i couldve reused the vanilla navbar commands from the start
function NP_changeShopTab(panel_clicked) {
	
	if (panel_clicked == "weapon") {
		var category_text = $.FindChildInContext('#NP_Shop_title_category').text
		$.FindChildInContext('#NP_Shop_title_category').text = "Weapon Mods";
		
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingSearch");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingFavorites");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingArmor");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingTech");
		$.FindChildInContext('#CitadelHudHeroShop').AddClass("showingWeapon");

		$.FindChildInContext('#WeaponModsContainer').AddClass("cat_weapon_selected");
		$.FindChildInContext('#ArmorModsContainer').RemoveClass("cat_armor_selected");
		$.FindChildInContext('#TechModsContainer').RemoveClass("cat_tech_selected");
		$.FindChildInContext('#NP_BuildButton').RemoveClass("cat_build_selected");
		
		$.Msg( "shop weapon selected" );

	} else if (panel_clicked == "armor") {
		var category_text = $.FindChildInContext('#NP_Shop_title_category').text
		$.FindChildInContext('#NP_Shop_title_category').text = "Armor Mods";
		
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingSearch");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingFavorites");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingWeapon");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingTech");
		$.FindChildInContext('#CitadelHudHeroShop').AddClass("showingArmor");

		$.FindChildInContext('#WeaponModsContainer').RemoveClass("cat_weapon_selected");
		$.FindChildInContext('#ArmorModsContainer').AddClass("cat_armor_selected");
		$.FindChildInContext('#TechModsContainer').RemoveClass("cat_tech_selected");
		$.FindChildInContext('#NP_BuildButton').RemoveClass("cat_build_selected");
		
		$.Msg( "shop armor" );

	} else if (panel_clicked == "tech") {
		var category_text = $.FindChildInContext('#NP_Shop_title_category').text
		$.FindChildInContext('#NP_Shop_title_category').text = "Tech Mods";
		
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingSearch");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingFavorites");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingArmor");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingWeapon");
		$.FindChildInContext('#CitadelHudHeroShop').AddClass("showingTech");

		$.FindChildInContext('#WeaponModsContainer').RemoveClass("cat_weapon_selected");
		$.FindChildInContext('#ArmorModsContainer').RemoveClass("cat_armor_selected");
		$.FindChildInContext('#TechModsContainer').AddClass("cat_tech_selected");
		$.FindChildInContext('#NP_BuildButton').RemoveClass("cat_build_selected");
		
		$.Msg( "shop tech" );

	} else if (panel_clicked == "fav") {
		var category_text = $.FindChildInContext('#NP_Shop_title_category').text
		$.FindChildInContext('#NP_Shop_title_category').text = "Mod Build";
		
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingSearch");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingWeapon");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingArmor");
		$.FindChildInContext('#CitadelHudHeroShop').RemoveClass("showingTech");
		$.FindChildInContext('#CitadelHudHeroShop').AddClass("showingFavorites");

		$.FindChildInContext('#WeaponModsContainer').RemoveClass("cat_weapon_selected");
		$.FindChildInContext('#ArmorModsContainer').RemoveClass("cat_armor_selected");
		$.FindChildInContext('#TechModsContainer').RemoveClass("cat_tech_selected");
		$.FindChildInContext('#NP_BuildButton').AddClass("cat_build_selected");
		
		$.Msg( "shop builds" );
	} 
}
  
// unused / doesnt work.
function NP_add_level_zeros() {
	$.Msg("zeros loaded test");
	var level = $.FindChildInContext('#NP_playerlevel').text;
	if (level.length == 1) {
		$.FindChildInContext('#NP_playerlevel').text = "0{i:player_level}"; 
	} else if (level.length > 1) {
		$.FindChildInContext('#NP_playerlevel').text = "{i:player_level}"; 
	}
	// const zeroPad = (num, places) => String(num).padStart(places, '0');
	// $.Msg(zeroPad(level, 2));
	
}

var shop_expanded = false;

function NP_ExpandShop() {
	if (shop_expanded == false) {
		$.FindChildInContext('#NP_Statpanel').AddClass("sidepanel_hide");
		$.FindChildInContext('#MainPanel').AddClass("shop_wide");
		shop_expanded = true;
		$.Msg("shop expanded");
	} else {
		$.FindChildInContext('#NP_Statpanel').RemoveClass("sidepanel_hide");
		$.FindChildInContext('#MainPanel').RemoveClass("shop_wide");
		shop_expanded = false;
		$.Msg("shop collapsed");
	}
}

function NP_ClearShopSearch() {
	$.FindChildInContext('#SearchTextEntry').text = "";
}


var original_mod_shape = false;

function NP_ToggleModShape() {
	if (original_mod_shape == false) {
		$.FindChildInContext('#MainPanel').AddClass("NP_orig_mod_shape");
		original_mod_shape = true;
		$.Msg("original mod shape enabled");
	} else {
		$.FindChildInContext('#MainPanel').RemoveClass("NP_orig_mod_shape");
		original_mod_shape = false;
		$.Msg("original mod shape disabled");
	}
	
}


function NP_Lore_ChangeTab(tab_selected) {
	if (tab_selected == "world") {
		$.FindChildInContext('#NP_nav_guide_world').AddClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_election').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_faction').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_location').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_citizen').RemoveClass("NP_navbutton_selected");

		$.FindChildInContext('#lorecontainer_world').AddClass("NP_show");
		$.FindChildInContext('#lorecontainer_election').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_faction').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_location').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_citizen').RemoveClass("NP_show");
		$.Msg("world lore");

	} else if (tab_selected == "election") {
		$.FindChildInContext('#NP_nav_guide_world').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_election').AddClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_faction').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_location').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_citizen').RemoveClass("NP_navbutton_selected");

		$.FindChildInContext('#lorecontainer_world').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_election').AddClass("NP_show");
		$.FindChildInContext('#lorecontainer_faction').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_location').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_citizen').RemoveClass("NP_show");
		$.Msg("election lore");

	} else if (tab_selected == "faction") {
		$.FindChildInContext('#NP_nav_guide_world').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_election').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_faction').AddClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_location').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_citizen').RemoveClass("NP_navbutton_selected");

		$.FindChildInContext('#lorecontainer_world').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_election').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_faction').AddClass("NP_show");
		$.FindChildInContext('#lorecontainer_location').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_citizen').RemoveClass("NP_show");
		$.Msg("faction lore");

	} else if (tab_selected == "location") {
		$.FindChildInContext('#NP_nav_guide_world').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_election').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_faction').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_location').AddClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_citizen').RemoveClass("NP_navbutton_selected");

		$.FindChildInContext('#lorecontainer_world').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_election').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_faction').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_location').AddClass("NP_show");
		$.FindChildInContext('#lorecontainer_citizen').RemoveClass("NP_show");
		$.Msg("location lore");

	} else if (tab_selected == "citizen") {
		$.FindChildInContext('#NP_nav_guide_world').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_election').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_faction').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_location').RemoveClass("NP_navbutton_selected");
		$.FindChildInContext('#NP_nav_guide_citizen').AddClass("NP_navbutton_selected");

		$.FindChildInContext('#lorecontainer_world').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_election').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_faction').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_location').RemoveClass("NP_show");
		$.FindChildInContext('#lorecontainer_citizen').AddClass("NP_show");
		$.Msg("citizen lore");
	}
}