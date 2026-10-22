'use strict';
// Ticket 22b: the composed QOLLOCK topbar keeps QOLLOCK's panels and runs the same v3 timers, through the
// canonical v3 timer fixture.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {runtimes,bootLayout,skipOf,v3Tests}=require('./qollock-runtime');
const {MockPanel}=require(path.join(v3Tests,'boot-layout'));
const {setup,ring}=require(path.join(v3Tests,'timers-fixture'));
// QOLLOCK's citadel_hud_top_bar_player adds an AlwaysPlayerName label beside PlayerName.
function decorateRow(owner,n){const always=new MockPanel('Label',owner,'');always.AddClass('AlwaysPlayerName');always.text=n;}
// Ticket 22b: the composed QOLLOCK topbar keeps QOLLOCK's panels and runs the same v3 timers.
for(const runtime of runtimes()){
 test('22b QOLLOCK ('+runtime.name+'): composed topbar keeps QOLLOCK panels and runs v3 pickup and ultimate timers',{skip:skipOf(runtime)},()=>{
  const f=setup({load:relative=>bootLayout(relative,runtime),decorateRow}),topRoot=f.top.harness.contextPanel;
  assert.ok(topRoot.BHasClass('HPColorsV3TimersTopBar'));
  for(const id of ['BuffHUD','RejuvHUD','RejuvBuff','Buff','Rejuv','TeamSPMDisplay_friendly','TeamSPMDisplay_enemy','TeamFriendly','TeamEnemy'])assert.ok(topRoot.FindChildTraverse(id),id);
  f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -270deg)';f.remote.radial.style.clip='radial(50% 50%, 0deg, 120deg)';f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -240deg)';f.advance(3000);
  assert.ok(f.traffic.some(x=>x.magic==='HPV3_PICKUP_SNAPSHOT'&&x.record&&x.record.progress[0].rate>0));
  assert.ok(ring(f),'pickup ring in the QOLLOCK topbar row');const before=ring(f).style.clip;f.advance(1000);assert.notEqual(ring(f).style.clip,before);
  assert.equal(f.remote.cooldown.style.horizontalAlign,'center','v3 owns only the cooldown label alignment');
  const progress=f.r.FindChildTraverse('HPColorsV3UltimateFill');assert.ok(progress);assert.notEqual(progress.style.clip,'radial(50% 50%, 0deg, 0deg)');
  // ql_ult_cooldowns mirrors cooldown text into the same label; v3 neither reads nor rewrites it.
  f.remote.cooldown.text='42';f.advance(2000);assert.equal(f.remote.cooldown.text,'42');
  f.edit('pickupTimersEnabled',false);assert.ok(f.remote.ult.GetParent()===f.remote.holder);assert.equal(f.remote.cooldown.style.horizontalAlign,'right');
  for(const id of ['BuffHUD','RejuvHUD'])assert.ok(topRoot.FindChildTraverse(id).IsValid(),id+' untouched');
 });
 // Street Brawl report (yesdaddy, 2026-10-19, QOLLOCK): world bars titled with the hero name got no
 // ultimate progress. QOLLOCK's row also has a HeroNameHidden label ({g:citadel_hero_name:hero_id}); the
 // match uses the stock HeroName label beside PlayerName.
 test('QOLLOCK ('+runtime.name+'): Street Brawl hero-titled world bars get ultimate progress and topbar pickups',{skip:skipOf(runtime)},()=>{
  const decorate=(owner,n)=>{decorateRow(owner,n);const hidden=new MockPanel('Label',owner,'');hidden.AddClass('HeroNameHidden');hidden.text='Unrelated';};
  const f=setup({load:relative=>bootLayout(relative,runtime),decorateRow:decorate,heroes:{REMOTE:'Drifter',LOCAL:'Abrams'}});f.name.text='Drifter';
  assert.ok(f.top.harness.contextPanel.BHasClass('HPColorsV3TimersHeroNames'),'the composed QOLLOCK topbar opts in to hero-name matching');
  f.top.harness.root.AddClass('gamemode_streetbrawl');f.top.harness.contextPanel.FindChildTraverse('GameTime').text='0:09';
  f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -270deg)';f.remote.radial.style.clip='radial(50% 50%, 0deg, 120deg)';f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -240deg)';f.advance(3000);
  const overlay=f.r.FindChildTraverse('HPColorsV3UltimateOverlay'),progress=f.r.FindChildTraverse('HPColorsV3UltimateFill');
  assert.ok(overlay&&progress);assert.notEqual(overlay.style.visibility,'collapse');assert.notEqual(progress.style.clip,'radial(50% 50%, 0deg, 0deg)');
  assert.ok(ring(f),'pickup ring in the QOLLOCK topbar row');
 });
}
