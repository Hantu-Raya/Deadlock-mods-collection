"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function collectCssFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectCssFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(fullPath);
  }
  return files;
}

const stylesRoot = path.join(__dirname, "..", "panorama", "styles");
for (const cssPath of collectCssFiles(stylesRoot)) {
  const relativePath = path.relative(stylesRoot, cssPath).replace(/\\/g, "/");
  const compiledPath = relativePath.replace(/\.css$/, ".vcss_c");
  const source = fs.readFileSync(cssPath, "utf8");
  assert.ok(
    !source.includes(`s2r://panorama/styles/${compiledPath}`),
    `${relativePath} must not import its own compiled resource`,
  );
}

const moduleRoot = path.join(__dirname, "..");
const runtimePath = process.env.NOTIFIER_RUNTIME_PATH
  ? path.resolve(process.env.NOTIFIER_RUNTIME_PATH)
  : path.join(
      moduleRoot,
      "panorama",
      "scripts",
      "mercurial_magnum_notifier.js",
    );
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
assert.doesNotMatch(
  runtimeSource,
  /\$\.Msg|MAGNUMDBG|SPLITSHOTDBG|BLOODTRIBUTEDBG|debugMagnum|debugSplitShot|debugBloodTribute/,
  "production runtime must not contain diagnostic logging",
);

const iconPath = path.join(
  moduleRoot,
  "panorama",
  "images",
  "mercurial_magnum",
  "upgrade_ethereal_bullets.png",
);
const icon = fs.readFileSync(iconPath);
assert.equal(icon.toString("ascii", 1, 4), "PNG", "notifier icon must be a PNG");
assert.equal(icon.readUInt32BE(16), 128, "notifier icon width must remain 128px");
assert.equal(icon.readUInt32BE(20), 128, "notifier icon height must remain 128px");
assert.ok(
  icon[25] === 4 || icon[25] === 6,
  "notifier icon must retain an alpha channel",
);

const splitShotIconPath = path.join(
  moduleRoot,
  "panorama",
  "images",
  "split_shot",
  "upgrade_split_shot.png",
);
const splitShotIcon = fs.readFileSync(splitShotIconPath);
assert.equal(splitShotIcon.toString("ascii", 1, 4), "PNG", "Split Shot icon must be a PNG");
assert.equal(splitShotIcon.readUInt32BE(16), 128, "Split Shot icon width must remain 128px");
assert.equal(splitShotIcon.readUInt32BE(20), 128, "Split Shot icon height must remain 128px");
assert.ok(
  splitShotIcon[25] === 4 || splitShotIcon[25] === 6,
  "Split Shot icon must retain an alpha channel",
);

const bloodTributeIconPath = path.join(
  moduleRoot,
  "panorama",
  "images",
  "blood_tribute",
  "upgrade_blood_tribute.png",
);
const bloodTributeIcon = fs.readFileSync(bloodTributeIconPath);
assert.equal(bloodTributeIcon.toString("ascii", 1, 4), "PNG", "Blood Tribute icon must be a PNG");
assert.equal(bloodTributeIcon.readUInt32BE(16), 128, "Blood Tribute icon width must remain 128px");
assert.equal(bloodTributeIcon.readUInt32BE(20), 128, "Blood Tribute icon height must remain 128px");
assert.ok(
  bloodTributeIcon[25] === 4 || bloodTributeIcon[25] === 6,
  "Blood Tribute icon must retain an alpha channel",
);

const textureDefinition = fs.readFileSync(
  path.join(
    moduleRoot,
    "panorama",
    "images",
    "mercurial_magnum",
    "upgrade_ethereal_bullets.vtex",
  ),
  "utf8",
);
assert.ok(
  textureDefinition.includes('"m_bNoLod" "bool" "1"'),
  "notifier texture must opt out of mip LOD and texture bias",
);
assert.ok(
  textureDefinition.includes('"m_outputFormat" "string" "BGRA8888"'),
  "notifier texture must preserve lossless BGRA8888 quality",
);
assert.match(
  textureDefinition,
  /"m_mipAlgorithm"\s+"CDmeImageProcessor"\s*\{[^}]*"m_algorithm"\s+"string"\s+"None"/s,
  "notifier texture must disable mip filtering",
);
assert.ok(
  textureDefinition.includes('"m_outputClearColor" "vector4" "0 0 0 0"'),
  "notifier texture clear color must remain transparent",
);

const splitShotTextureDefinition = fs.readFileSync(
  path.join(
    moduleRoot,
    "panorama",
    "images",
    "split_shot",
    "upgrade_split_shot.vtex",
  ),
  "utf8",
);
assert.ok(
  splitShotTextureDefinition.includes('"m_bNoLod" "bool" "1"'),
  "Split Shot texture must opt out of mip LOD and texture bias",
);
assert.ok(
  splitShotTextureDefinition.includes('"m_outputFormat" "string" "BGRA8888"'),
  "Split Shot texture must preserve lossless BGRA8888 quality",
);
assert.match(
  splitShotTextureDefinition,
  /"m_mipAlgorithm"\s+"CDmeImageProcessor"\s*\{[^}]*"m_algorithm"\s+"string"\s+"None"/s,
  "Split Shot texture must disable mip filtering",
);
assert.ok(
  splitShotTextureDefinition.includes('"m_outputClearColor" "vector4" "0 0 0 0"'),
  "Split Shot texture clear color must remain transparent",
);

const bloodTributeTextureDefinition = fs.readFileSync(
  path.join(
    moduleRoot,
    "panorama",
    "images",
    "blood_tribute",
    "upgrade_blood_tribute.vtex",
  ),
  "utf8",
);
assert.ok(
  bloodTributeTextureDefinition.includes('"m_bNoLod" "bool" "1"'),
  "Blood Tribute texture must opt out of mip LOD and texture bias",
);
assert.ok(
  bloodTributeTextureDefinition.includes(
    '"m_outputFormat" "string" "BGRA8888"',
  ),
  "Blood Tribute texture must preserve lossless BGRA8888 quality",
);
assert.match(
  bloodTributeTextureDefinition,
  /"m_mipAlgorithm"\s+"CDmeImageProcessor"\s*\{[^}]*"m_algorithm"\s+"string"\s+"None"/s,
  "Blood Tribute texture must disable mip filtering",
);
assert.ok(
  bloodTributeTextureDefinition.includes('"m_outputClearColor" "vector4" "0 0 0 0"'),
  "Blood Tribute texture clear color must remain transparent",
);

const gunLayout = fs.readFileSync(
  path.join(
    moduleRoot,
    "panorama",
    "layout",
    "ability_hud_elements",
    "element_gun.xml",
  ),
  "utf8",
);
assert.ok(
  gunLayout.includes(
    "s2r://panorama/images/mercurial_magnum/upgrade_ethereal_bullets.vtex",
  ),
  "ammo notifier must use the supplied purple gun texture",
);
assert.ok(
  gunLayout.includes(
    "s2r://panorama/images/split_shot/upgrade_split_shot.vtex",
  ),
  "Split Shot notifier must use the supplied orange texture",
);
assert.ok(
  gunLayout.includes(
    "s2r://panorama/images/blood_tribute/upgrade_blood_tribute.vtex",
  ),
  "Blood Tribute notifier must use the supplied blood emblem",
);
const ammoPanelMatch = gunLayout.match(
  /<Panel id="ammo_panel">([\s\S]*?)<\/Panel>/,
);
assert.ok(ammoPanelMatch, "gun layout must retain the stock ammo panel");
assert.ok(
  !ammoPanelMatch[1].includes("MercurialMagnumNotifier") &&
    !ammoPanelMatch[1].includes("SplitShotNotifier") &&
    !ammoPanelMatch[1].includes("BloodTributeNotifier"),
  "notifier icons must stay outside ammo flow so ammo never shifts",
);
assert.ok(
  gunLayout.includes('style="visibility: collapse; opacity: 0;"'),
  "notifier icon must be hidden before the detector initializes",
);
assert.ok(
  gunLayout.includes(
    "s2r://panorama/styles/mercurial_magnum_notifier.vcss_c",
  ),
  "gun layout must load the notifier-specific stylesheet",
);

const notifierStyles = fs.readFileSync(
  path.join(stylesRoot, "mercurial_magnum_notifier.css"),
  "utf8",
);
assert.match(
  notifierStyles,
  /#MercurialMagnumNotifier\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*transform:\s*translate3d\(-49px,\s*80px,\s*0px\);/s,
  "notifier must stay compact and independently positioned beside ammo",
);
assert.match(
  notifierStyles,
  /#SplitShotNotifier\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*transform:\s*translate3d\(-49px,\s*80px,\s*0px\);/s,
  "Split Shot notifier must sit beside ammo when active alone",
);
assert.match(
  notifierStyles,
  /#BloodTributeNotifier\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*transform:\s*translate3d\(-49px,\s*80px,\s*0px\);/s,
  "Blood Tribute must share the same nearest position as the other indicators",
);
assert.match(
  notifierStyles,
  /#MercurialMagnumNotifier\.NotifierOneOffset,\s*#SplitShotNotifier\.NotifierOneOffset,\s*#BloodTributeNotifier\.NotifierOneOffset\s*\{[^}]*transform:\s*translate3d\(-69px,\s*80px,\s*0px\);/s,
  "every indicator must support the second activation-order position",
);
assert.match(
  notifierStyles,
  /#MercurialMagnumNotifier\.NotifierTwoOffsets,\s*#SplitShotNotifier\.NotifierTwoOffsets,\s*#BloodTributeNotifier\.NotifierTwoOffsets\s*\{[^}]*transform:\s*translate3d\(-89px,\s*80px,\s*0px\);/s,
  "every indicator must support the third activation-order position",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\s*\{[^}]*color:\s*#f2efe4ff;/s,
  "inactive current ammo must use the warm-white base color",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.MagnumAmmoGlow\s*\{[^}]*color:\s*#c58affff;[^}]*text-shadow:/s,
  "active Magnum proc must color the current ammo violet",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.SplitShotAmmoGlow\s*\{[^}]*color:\s*#ffb347ff;[^}]*text-shadow:/s,
  "active Split Shot must color the current ammo amber",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.BloodTributeAmmoGlow\s*\{[^}]*color:\s*#e9c69cff;[^}]*text-shadow:\s*0px 0px 5px 1\.5 #b96b3aff;/s,
  "active Blood Tribute must color current ammo parchment with a copper glow",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.MagnumAmmoGlow\.SplitShotAmmoGlow\s*\{[^}]*color:\s*#f58aafff;/s,
  "Magnum and Split Shot must blend the current ammo to rose",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.MagnumAmmoGlow\.BloodTributeAmmoGlow\s*\{[^}]*color:\s*#d9b8e6ff;[^}]*text-shadow:\s*0px 0px 5px 1\.5 #9461aeff;/s,
  "Magnum and Blood Tribute must blend current ammo to orchid",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.SplitShotAmmoGlow\.BloodTributeAmmoGlow\s*\{[^}]*color:\s*#ffd17aff;[^}]*text-shadow:\s*0px 0px 5px 1\.5 #c9872dff;/s,
  "Split Shot and Blood Tribute must blend current ammo to golden cream",
);
assert.match(
  notifierStyles,
  /\.weapon_ammo\.MagnumAmmoGlow\.SplitShotAmmoGlow\.BloodTributeAmmoGlow\s*\{[^}]*color:\s*#fff4d8ff;[^}]*text-shadow:\s*0px 0px 6px 2 #caa25dff;/s,
  "all three effects must blend current ammo to luminous champagne",
);

class MockPanel {
  constructor(id, classes, text) {
    this.id = id || "";
    this.classes = new Set(classes || []);
    this.text = text || "";
    this.children = [];
    this.parent = null;
    this.valid = true;
    this.style = {};
    this.setHasClassCalls = 0;
    this.findClassCalls = 0;
    this.findIdCalls = 0;
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  IsValid() {
    return this.valid;
  }

  GetParent() {
    return this.parent;
  }

  BHasClass(className) {
    return this.classes.has(className);
  }

  SetHasClass(className, enabled) {
    this.setHasClassCalls += 1;
    if (enabled) this.classes.add(className);
    else this.classes.delete(className);
  }

  GetAttributeString(name, fallback) {
    return name === "text" ? this.text : fallback;
  }


  FindChildTraverse(id) {
    this.findIdCalls += 1;
    if (this.id === id) return this;
    for (const child of this.children) {
      const match = child.FindChildTraverse(id);
      if (match) return match;
    }
    return null;
  }

  FindChildrenWithClassTraverse(className) {
    this.findClassCalls += 1;
    const matches = [];
    if (this.classes.has(className)) matches.push(this);
    for (const child of this.children) {
      matches.push(...child.FindChildrenWithClassTraverse(className));
    }
    return matches;
  }
}

function createHarness(initialCooling, itemsOwned = true) {
  const root = new MockPanel("HudRoot");
  const gun = root.add(new MockPanel("gun"));
  const ammoPanel = gun.add(new MockPanel("ammo_panel"));
  const ammo = ammoPanel.add(new MockPanel("", ["weapon_ammo"], "20"));
  ammoPanel.add(new MockPanel("", ["weapon_ammo_max"], " / 30"));
  const notifier = ammoPanel.add(new MockPanel("MercurialMagnumNotifier"));
  const splitNotifier = gun.add(new MockPanel("SplitShotNotifier"));
  const bloodNotifier = gun.add(new MockPanel("BloodTributeNotifier"));
  const itemClasses = itemsOwned ? ["trained"] : [];
  if (initialCooling) itemClasses.push("cooling_down", "ability_not_ready");
  const item = root.add(new MockPanel("upgrade_ethereal_bullets", itemClasses));
  const cooldown = item.add(new MockPanel("", ["cooldown_timer"], initialCooling ? "14" : "0"));
  const cooldownMask = item.add(new MockPanel("cooldown_mask"));
  cooldownMask.style.clip = `radial(50% 50%, 0deg, ${initialCooling ? 360 : 0}deg)`;
  const splitItem = root.add(
    new MockPanel("upgrade_split_shot", itemsOwned ? ["trained"] : []),
  );
  const activeAbilities = root.add(
    new MockPanel("ActiveAbilitiesMenu", ["active_abilities"]),
  );
  const abilitiesContainer = activeAbilities.add(
    new MockPanel("abilitiesContainer"),
  );
  const bloodSlots = [];
  const bloodLabels = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const slotPanel = abilitiesContainer.add(
      new MockPanel(`abilityButton${slot}`, [
        "ability_container",
        "HasKeyBind",
        "NoAbility",
      ]),
    );
    bloodSlots.push(slotPanel);
    bloodLabels.push(
      slotPanel.add(new MockPanel("", ["ability_name"], "")),
    );
  }
  const bloodToggle = bloodSlots[0];
  if (itemsOwned) {
    bloodToggle.classes.add("item_gadget");
    bloodToggle.classes.add("has_ability_image");
    bloodToggle.classes.delete("NoAbility");
  }
  if (itemsOwned) bloodLabels[0].text = "BLOOD TRIBUTE";

  let nowMs = 0;
  const scheduled = [];
  const panorama = {
    GetContextPanel() {
      return gun;
    },
    Schedule(delay, callback) {
      scheduled.push({ delay, callback });
      return scheduled.length;
    },
  };

  vm.runInNewContext(runtimeSource, {
    $: panorama,
    Date: { now: () => nowMs },
    Number,
  });

  function step(seconds) {
    assert.ok(scheduled.length > 0, "notifier should keep polling");
    nowMs += seconds * 1000;
    scheduled.shift().callback();
  }

  function nextDelay() {
    assert.ok(scheduled.length > 0, "notifier should have a pending update");
    return scheduled[0].delay;
  }

  function isActive() {
    return (
      notifier.classes.has("MagnumBuffActive") &&
      notifier.style.visibility === "visible" &&
      ammo.classes.has("MagnumAmmoGlow")
    );
  }

  function isSplitActive() {
    return (
      splitNotifier.classes.has("SplitShotActive") &&
      splitNotifier.style.visibility === "visible"
    );
  }


  function isBloodActive() {
    return (
      bloodNotifier.classes.has("BloodTributeActive") &&
      bloodNotifier.style.visibility === "visible"
    );
  }
  return {
    ammo,
    abilitiesContainer,
    bloodLabels,
    bloodSlots,
    bloodNotifier,
    bloodToggle,
    cooldown,
    cooldownMask,
    isSplitActive,
    gun,
    isBloodActive,
    isActive,
    item,
    notifier,
    nextDelay,
    root,
    splitItem,
    splitNotifier,
    step,
  };
}

{
  const h = createHarness(true);
  assert.equal(h.isActive(), false, "initial charge state must not look like a proc");
  h.step(0.05);
  assert.equal(h.isActive(), false, "initial cooldown remains ignored");

  h.item.classes.delete("cooling_down");
  h.cooldown.text = "0";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 0deg)";
  h.step(0.05);
  h.step(0.05);
  assert.equal(
    h.isActive(),
    false,
    "ability_not_ready without cooling_down must not activate the icon",
  );

  h.item.classes.add("cooling_down");
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.ammo.text = "30";
  h.step(0.05);
  assert.equal(h.isActive(), true, "ready-to-cooldown transition marks the proc active");
  assert.equal(
    h.ammo.classes.has("MagnumAmmoGlow"),
    true,
    "active proc must glow the current ammo text",
  );

  h.step(0.25);
  h.ammo.text = "28";
  h.step(0.05);
  assert.equal(h.isActive(), true, "spending empowered ammo keeps the notifier active");

  h.gun.classes.add("reloading");
  h.step(0.05);
  assert.equal(h.isActive(), false, "starting a manual reload clears the notifier");
}

{
  const h = createHarness(false);
  h.step(0.05);
  h.item.classes.add("ability_not_ready");
  h.step(0.05);
  assert.equal(
    h.isActive(),
    false,
    "ability_not_ready transitions are not Magnum proc signals",
  );

  h.item.classes.delete("trained");
  h.step(0.05);

  assert.equal(h.isActive(), false, "removing the item clears the notifier");
  assert.equal(h.notifier.style.visibility, "collapse", "removed item stays hidden");
}
{
  const h = createHarness(true);
  h.step(0.05);
  h.cooldown.text = "7";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 180deg)";
  h.ammo.text = "20";
  h.step(0.05);
  assert.equal(h.isActive(), false, "counting down alone must not activate the icon");

  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.ammo.text = "30";
  h.step(0.05);
  assert.equal(
    h.isActive(),
    true,
    "a logged 7-to-14 cooldown reset with a full magazine must activate the icon",
  );
  h.step(0.25);
  assert.equal(
    h.isActive(),
    true,
    "the proc's automatic full-magazine refill must not look like a manual reload",
  );
}

{
  const h = createHarness(true);
  h.step(0.05);
  h.cooldown.text = "12";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 300deg)";
  h.ammo.text = "1";
  h.step(0.05);
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.ammo.text = "12";
  h.step(0.05);
  assert.equal(

    h.isActive(),
    true,
    "a logged 12-to-14 cooldown reset with a partial refill must activate the icon",
  );
}
{
  const h = createHarness(true);
  h.step(0.05);
  h.cooldown.text = "12";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 300deg)";
  h.ammo.text = "0";
  h.step(0.05);
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.ammo.text = "20";
  h.step(0.05);
  assert.equal(h.isActive(), true, "first imbue proc activates the notifier");

  h.gun.classes.add("reloading");
  h.step(0.05);
  assert.equal(h.isActive(), false, "first manual reload clears the notifier");
  h.cooldown.text = "12";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 300deg)";
  h.step(0.05);
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.ammo.text = "30";
  h.step(0.05);
  assert.equal(
    h.isActive(),
    true,
    "imbuing during the first reload reactivates the notifier",
  );
  h.step(0.25);
  assert.equal(
    h.isActive(),
    true,
    "a sustained reload class must not clear the reactivated proc",
  );

  h.gun.classes.delete("reloading");
  h.step(0.05);
  h.gun.classes.add("reloading");
  h.step(0.05);
  assert.equal(h.isActive(), false, "second manual reload clears the notifier");
  h.cooldown.text = "10";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 250deg)";
  h.step(0.05);
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.step(0.05);
  assert.equal(
    h.isActive(),
    true,
    "imbuing during the second reload reactivates the notifier",
  );
}

{
  const h = createHarness(true);
  h.step(0.05);
  h.cooldownMask.style.clip = "radial(50.0% 50.0%, 0.0deg, 340.1250deg)";
  h.step(0.05);
  assert.equal(
    h.isActive(),
    false,
    "decreasing radial progress with the same integer timer is not a proc",
  );

  h.cooldownMask.style.clip = "radial(50.0% 50.0%, 0.0deg, 359.8750deg)";
  h.step(0.05);
  assert.equal(
    h.isActive(),
    true,
    "an upward fractional radial reset must detect a proc while the timer still reads 14",
  );
}

{
  const h = createHarness(false);
  assert.equal(h.isSplitActive(), false, "Split Shot starts hidden while ready");
  h.step(0.05);

  h.splitItem.classes.add("cooling_down");
  h.splitItem.classes.add("ability_not_ready");
  h.step(0.05);
  assert.equal(h.isSplitActive(), true, "casting Split Shot shows its notifier");
  assert.equal(
    h.ammo.classes.has("SplitShotAmmoGlow"),
    true,
    "active Split Shot must color the current ammo",
  );

  h.step(4.9);
  assert.equal(h.isSplitActive(), true, "Split Shot remains visible for its five-second buff");
  h.step(0.11);
  assert.equal(h.isSplitActive(), false, "Split Shot hides when its five-second buff expires");
  assert.equal(
    h.ammo.classes.has("SplitShotAmmoGlow"),
    false,
    "expired Split Shot must restore the prior ammo color state",
  );

  h.splitItem.classes.delete("cooling_down");
  h.splitItem.classes.delete("ability_not_ready");
  h.step(0.05);
  assert.equal(h.isSplitActive(), false, "returning off cooldown only rearms Split Shot");
  h.splitItem.classes.add("cooling_down");
  h.step(0.05);
  assert.equal(
    h.isSplitActive(),
    true,
    "Split Shot activates again only after a new off-cooldown transition",
  );
}

{
  const h = createHarness(false);
  h.step(0.05);

  h.splitItem.classes.add("cooling_down");
  h.step(0.05);

  h.item.classes.add("cooling_down");
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.step(0.05);
  assert.equal(h.isSplitActive(), true, "Split Shot remains visible when Magnum procs");
  assert.equal(h.isActive(), true, "Magnum remains visible beside active Split Shot");
  assert.equal(
    h.splitNotifier.classes.has("NotifierOneOffset"),
    true,
    "Split Shot stays left of Magnum because Split Shot activated first",
  );
  h.bloodToggle.classes.add("toggled_on");
  h.step(0.05);
  assert.equal(h.isBloodActive(), true, "Blood Tribute activates third");
  assert.equal(
    h.splitNotifier.classes.has("NotifierTwoOffsets"),
    true,
    "first-used Split Shot moves to the leftmost third position",
  );
  assert.equal(
    h.notifier.classes.has("NotifierOneOffset"),
    true,
    "second-used Magnum stays in the middle position",
  );
  assert.equal(
    h.bloodNotifier.classes.has("NotifierOneOffset") ||
      h.bloodNotifier.classes.has("NotifierTwoOffsets"),
    false,
    "third-used Blood Tribute stays nearest to ammo",
  );

  h.bloodToggle.classes.delete("toggled_on");
  h.step(0.05);

  h.gun.classes.add("reloading");
  h.step(0.05);
  assert.equal(h.isActive(), false, "manual reload still clears only Magnum");
  assert.equal(
    h.isSplitActive(),
    true,
    "manual reload does not clear Split Shot's independent duration",
  );
  assert.equal(
    h.splitNotifier.classes.has("NotifierOneOffset"),
    false,
    "Split Shot returns to the nearest position after Magnum clears",
  );

  h.splitItem.classes.delete("trained");
  h.step(0.55);
  assert.equal(h.isSplitActive(), false, "removing Split Shot clears its notifier");
}
{
  const h = createHarness(false);
  h.step(0.05);

  h.item.classes.add("cooling_down");
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.step(0.05);
  assert.equal(h.isActive(), true, "Magnum activates first");

  h.splitItem.classes.add("cooling_down");
  h.step(0.05);
  assert.equal(h.isSplitActive(), true, "Split Shot activates second");
  assert.equal(
    h.notifier.classes.has("NotifierOneOffset"),
    true,
    "Magnum stays left of Split Shot because Magnum activated first",
  );
  assert.equal(
    h.splitNotifier.classes.has("NotifierOneOffset") ||
      h.splitNotifier.classes.has("NotifierTwoOffsets"),
    false,
    "the most recently activated Split Shot stays nearest to ammo",
  );
}


{
  const h = createHarness(false);
  h.step(0.05);

  h.splitItem.classes.add("cooling_down");
  h.step(0.05);
  h.step(2.0);

  h.item.classes.add("cooling_down");
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.step(0.05);
  assert.equal(h.isActive(), true, "Magnum activates during Split Shot's duration");
  assert.equal(h.isSplitActive(), true, "Split Shot remains active before five seconds");

  h.step(3.0);
  assert.equal(
    h.isSplitActive(),
    false,

    "Magnum's proc-time radial pulse must not extend Split Shot past five seconds",
  );
  assert.equal(h.isActive(), true, "expiring Split Shot must not clear Magnum");
}
{
  const h = createHarness(false);
  h.bloodToggle.classes.add("toggled_on");
  h.step(0.05);
  assert.equal(
    h.isBloodActive(),
    true,
    "Blood Tribute must be detected from the live ability_name label text",
  );
}
{
  const h = createHarness(false);
  const initialSlotLookups = h.abilitiesContainer.findIdCalls;
  const initialLabelLookups = h.bloodSlots.reduce(
    (total, slot) => total + slot.findClassCalls,
    0,
  );
  for (let index = 0; index < h.bloodSlots.length; index += 1) {
    for (let slotIndex = 0; slotIndex < h.bloodSlots.length; slotIndex += 1) {
      const slot = h.bloodSlots[slotIndex];
      h.bloodLabels[slotIndex].text = "";
      slot.classes.delete("item_gadget");
      slot.classes.delete("has_ability_image");
      slot.classes.delete("toggled_on");
      slot.classes.add("NoAbility");
    }

    const activeSlot = h.bloodSlots[index];
    h.bloodLabels[index].text = "BLOOD TRIBUTE";
    activeSlot.classes.add("item_gadget");
    activeSlot.classes.add("has_ability_image");
    activeSlot.classes.add("toggled_on");
    activeSlot.classes.delete("NoAbility");
    h.step(0.55);
    assert.equal(
      h.isBloodActive(),
      true,
      `Blood Tribute must activate from abilityButton${index}`,
    );
    activeSlot.classes.delete("toggled_on");
    h.step(0.05);
    assert.equal(
      h.isBloodActive(),
      false,
      `Blood Tribute must deactivate from abilityButton${index}`,
    );
  }
  assert.equal(
    h.abilitiesContainer.findIdCalls,
    initialSlotLookups,
    "bounded Blood Tribute rescans reuse the four cached slot panels",
  );
  assert.equal(
    h.bloodSlots.reduce(
      (total, slot) => total + slot.findClassCalls,
      0,
    ),
    initialLabelLookups,
    "bounded Blood Tribute rescans reuse the four cached name labels",
  );
}



{
  const h = createHarness(false);
  assert.equal(h.isBloodActive(), false, "Blood Tribute starts hidden while toggled off");
  h.step(0.05);

  h.bloodToggle.classes.add("toggled_on");
  h.step(0.05);
  assert.equal(h.isBloodActive(), true, "the active-item toggled_on class shows Blood Tribute");
  assert.equal(
    h.ammo.classes.has("BloodTributeAmmoGlow"),
    true,
    "active Blood Tribute must color the current ammo",
  );

  h.bloodToggle.classes.delete("toggled_on");
  h.step(0.05);
  assert.equal(h.isBloodActive(), false, "manually toggling Blood Tribute off hides it");
  assert.equal(
    h.ammo.classes.has("BloodTributeAmmoGlow"),
    false,
    "inactive Blood Tribute must restore the prior ammo color state",
  );
}

{
  const h = createHarness(false);
  h.step(0.05);
  h.bloodToggle.classes.add("toggled_on");
  h.step(0.05);
  assert.equal(
    h.bloodNotifier.classes.has("NotifierOneOffset"),
    false,
    "Blood Tribute uses the nearest position when active alone",
  );

  h.splitItem.classes.add("cooling_down");
  h.step(0.05);
  assert.equal(
    h.bloodNotifier.classes.has("NotifierOneOffset"),
    true,
    "Blood Tribute shifts left when Split Shot activates after it",
  );

  h.item.classes.add("cooling_down");
  h.cooldown.text = "14";
  h.cooldownMask.style.clip = "radial(50% 50%, 0deg, 360deg)";
  h.step(0.05);
  assert.equal(h.isActive(), true, "Magnum remains active in the three-icon stack");
  assert.equal(h.isSplitActive(), true, "Split Shot remains active in the three-icon stack");
  assert.equal(h.isBloodActive(), true, "Blood Tribute remains active in the three-icon stack");
  assert.equal(
    h.bloodNotifier.classes.has("NotifierTwoOffsets"),
    true,
    "Blood Tribute stays leftmost because it activated first",
  );
  assert.equal(
    h.splitNotifier.classes.has("NotifierOneOffset"),
    true,
    "Split Shot stays between Blood Tribute and the later Magnum proc",
  );
  assert.equal(
    h.notifier.classes.has("NotifierOneOffset") ||
      h.notifier.classes.has("NotifierTwoOffsets"),
    false,
    "the third activated indicator stays nearest to ammo",
  );
  assert.equal(
    h.ammo.classes.has("MagnumAmmoGlow") &&
      h.ammo.classes.has("SplitShotAmmoGlow") &&
      h.ammo.classes.has("BloodTributeAmmoGlow"),
    true,
    "the three-effect stack must expose all ammo blend classes",
  );

  h.bloodToggle.classes.delete("toggled_on");
  h.step(0.05);
  assert.equal(h.isBloodActive(), false, "Blood Tribute hides without clearing other indicators");
  assert.equal(h.isActive(), true, "Blood Tribute toggle-off does not clear Magnum");
  assert.equal(h.isSplitActive(), true, "Blood Tribute toggle-off does not clear Split Shot");

  h.bloodToggle.classes.add("toggled_on");
  h.step(0.05);
  h.bloodToggle.valid = false;
  h.step(0.05);
  assert.equal(h.isBloodActive(), false, "removing Blood Tribute clears its indicator");
}

{
  const h = createHarness(false);
  h.step(0.05);
  h.bloodToggle.classes.add("toggled_on");
  h.step(0.05);
  assert.equal(h.isBloodActive(), true, "Blood Tribute activates from the first slot");

  h.bloodLabels[0].text = "";
  h.bloodToggle.classes.delete("toggled_on");
  const fourthSlot = h.bloodSlots[3];
  h.bloodLabels[3].text = "BLOOD TRIBUTE";
  fourthSlot.classes.add("item_gadget");
  fourthSlot.classes.add("has_ability_image");
  fourthSlot.classes.add("toggled_on");
  fourthSlot.classes.delete("NoAbility");

  h.step(0.05);
  assert.equal(
    h.isBloodActive(),
    false,
    "the cached old slot reflects its toggle until the bounded rescan",
  );
  h.step(0.5);
  assert.equal(
    h.isBloodActive(),
    true,
    "the half-second rescan follows Blood Tribute into the fourth active-item slot",
  );

  h.bloodToggle.classes.add("toggled_on");
  fourthSlot.classes.delete("toggled_on");
  h.step(0.05);
  assert.equal(
    h.isBloodActive(),
    false,
    "hot polling stays on the newly cached fourth slot instead of rescanning the HUD",
  );
}


{
  const h = createHarness(false, false);
  assert.equal(
    h.nextDelay(),
    0.5,
    "the notifier uses the bounded discovery cadence before tracked items are purchased",
  );

  h.item.classes.add("trained");
  h.step(0.5);
  assert.equal(
    h.nextDelay(),
    0.05,
    "purchasing a tracked item restores responsive state polling",
  );
}

{
  const h = createHarness(false);
  const initialRenderCalls =
    h.notifier.setHasClassCalls +
    h.splitNotifier.setHasClassCalls +
    h.bloodNotifier.setHasClassCalls;
  const initialCooldownLookups = h.item.findClassCalls;
  h.step(0.05);
  assert.equal(
    h.notifier.setHasClassCalls +
      h.splitNotifier.setHasClassCalls +
      h.bloodNotifier.setHasClassCalls,
    initialRenderCalls,
    "stable cached panels are not rewritten on every poll",
  );
  assert.equal(
    h.item.findClassCalls,
    initialCooldownLookups,
    "the cached Magnum cooldown label avoids hot-loop tree traversal",
  );
}


console.log("Mercurial Magnum notifier validation passed.");
