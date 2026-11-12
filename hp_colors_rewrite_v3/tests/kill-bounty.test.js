'use strict';
// Ticket 50: kill bounty. The real Escape menu, topbar and world layouts (timers fixture) with two topbar
// teams of six cards. Expected values come from an independent port of the server.dll 6839 payout, itself
// checked against the server's own comeback log lines captured live for feeder_feed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {MockPanel}=require('./boot-layout');
const {setup}=require('./timers-fixture');
const evidence=[];
test.after(()=>{
 const root=path.resolve(__dirname,'../.build/evidence/kill-bounty',process.env.HPV3_DEBUG==='1'?'debug':'release');fs.mkdirSync(root,{recursive:true});
 fs.writeFileSync(path.join(root,'kill-bounty-transcript.json'),JSON.stringify(evidence,null,2));
});

// server.dll 6839: RemapValClamped base (rva 9f2b50), participant scaling (a05ab0) and comeback (a0ff20).
const F=Math.fround,FRAC=[1.25,0.575,0.283,0.175,0.11,0.083];
function serverPayout(seconds,participants,victim,victimTeam,killerTeam,killers){
 const B=Math.trunc(F(F(Math.min(Math.max(F(F(seconds-0)/F(2400-0)),0),1))*F(2200-200))+F(200));
 const S=Math.ceil(F(F(B*F(FRAC[participants-1]))*participants));
 let teamMult=1,diffMult=1,winning=false;
 if(killerTeam&&victimTeam>killerTeam&&victimTeam-killerTeam>1500)teamMult=F(F(F(2.268)*F(F(F(victimTeam)/F(killerTeam))-1))+1);
 const avg=Math.trunc(killerTeam/Math.max(1,killers));
 if(avg&&victim>avg&&avg>1250){winning=victimTeam<killerTeam;diffMult=F(F(F(2.484)*F(F(F(victim)/F(avg))-1))+1);}
 let mult=F(diffMult*teamMult);const cap=Math.floor(seconds/60)>=8?7:5,capped=mult>cap;
 if(capped)mult=cap;if(mult>1&&!winning&&!capped)mult=F(mult+F(0.15));
 const N=Math.trunc(F(F(Math.trunc(F(S*mult))-S)*F(0.4)));
 return {B,S,N,K:Math.trunc(F(F(0.3)*N)),mult};
}
// What YOUR solo kill pays you (the kill popup, live 6839 server log): base share + first-kill bonus + killer portion,
// 70% of the portion redirected (c3f770) when the killer is richer than the victim team's average.
// The topbar clock label trails server time by about a second (live 6839: labels 3:40/3:55/4:11 paid the 3:41/3:56/4:12
// base), so the pill for label time L shows the payout at L + 1.
const LABEL_LAG=1;
const shown=(label,victim,victimTeam,killerTeam,killers,o={})=>{const p=serverPayout(label+LABEL_LAG,1,victim,victimTeam,killerTeam,killers);
 const R=o.self!==undefined&&o.self>Math.trunc(victimTeam/(o.victims||6))?Math.min(p.K,Math.trunc(F(F(p.K)*F(0.7)))):0;return p.S+(o.firstKill?125:0)+p.K-R;};
const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');

test('reference payout reproduces the server comeback log captured live (feeder_feed live kills 2 and 3)',()=>{
 // Server: "Bounty Base 312, Killer Portion 149" with extra 499; "Bounty Base 317, Killer Portion 152" with extra 507.
 // Victim team SHIV 49k + YAMATO 49k, killers VENATOR 26k + WRAITH 25k, one assister (k = 2).
 assert.deepEqual((({S,N,K})=>({S,N,K}))(serverPayout(86,2,49000,98000,51000,2)),{S:312,N:499,K:149});
 assert.deepEqual((({S,N,K})=>({S,N,K}))(serverPayout(90,2,49000,98000,51000,2)),{S:317,N:507,K:152});
 // Base bounty: label 0:39 paid Base Bounty 232 and label 1:26 paid 271 (the label trails by about a second).
 assert.equal(serverPayout(39,1,0,0,0,1).B,232);assert.equal(serverPayout(86,1,0,0,0,1).B,271);
 assert.equal(serverPayout(3600,1,0,0,0,1).S,2750,'max bounty 2200 x 1.25 for a solo kill');
});

// Two topbar teams of six; REMOTE (the world bar) is on the enemy team, LOCAL on ours.
function bountyMatch(options={}){
 const f=setup({noTopBoot:true,heroes:options.heroes});
 const ctx=f.top.harness.contextPanel,teams={friendly:new MockPanel('CitadelHudTopBarTeam',ctx,'TeamFriendly'),enemy:new MockPanel('CitadelHudTopBarTeam',ctx,'TeamEnemy')};
 const souls={};
 function addSouls(owner,n,text){const label=new MockPanel('Label',owner,'SoulsValue');label.AddClass('SoulsValue');label.text=text;souls[n]=label;}
 function card(team,n,text){
  const owner=new MockPanel('CitadelHudTopBarPlayer',teams[team],n);owner.AddClass('UltimateUnlocked');
  const label=new MockPanel('Label',owner,'PlayerName');label.AddClass('PlayerName');label.text=n;
  const holder=new MockPanel('Panel',owner,'UltimateHolder'),ult=new MockPanel('Panel',holder,'UltimateStatus');new MockPanel('Panel',ult,'UltimateStatusBG').style.clip='radial(50% 50%, 0deg, 90deg)';
  addSouls(owner,n,text);return owner;
 }
 f.remote.owner.SetParent(teams.enemy);f.local.owner.SetParent(teams.friendly);
 addSouls(f.remote.owner,'REMOTE',options.remote||'12k');addSouls(f.local.owner,'LOCAL',options.local||'5,000');
 for(let i=1;i<=(options.solo?0:5);i++){card('enemy','FOE'+i,options.foes||'6.0k');card('friendly','ALLY'+i,options.allies||'6,000');}
 if(options.setup)options.setup(f,card);
 f.top.includeScripts();
 for(const [key,value] of options.edits||[])f.edit(key,value);
 f.edit('killBountyEnabled',true);f.advance(3000);
 const value=()=>f.r.FindChildTraverse('HPColorsV3BountyValue'),visible=()=>f.r.BHasClass('HPColorsV3KillBounty');
 const snapshots=()=>f.traffic.filter(m=>m.magic==='HPV3_BOUNTY_SNAPSHOT');
 return Object.assign(f,{teams,souls,card,value,visible,snapshots,clock:ctx.FindChildTraverse('GameTime')});
}

test('enemy bar shows the solo-kill bounty with the comeback bonus, from topbar souls and clock',()=>{
 const f=bountyMatch();
 // 5:01, enemy team 42,000 vs our 35,000: team x1.45, REMOTE 12k vs our 5,833 average: difficulty x3.63, capped at 5.
 const expected=shown(301,12000,42000,35000,6,{self:5000});
 assert.equal(serverPayout(301,1,12000,42000,35000,6).mult,5);
 assert.equal(expected,834,'paid at 5:02: S 564 + killer portion int(0.3 x 902)');
 assert.equal(f.visible(),true);assert.equal(f.value().text,'834');
 const last=f.snapshots().at(-1);assert.equal(last.players.length,11,'every non-local card, allies included');
 assert.deepEqual(last.players.find(p=>p[0]==='REMOTE'),['REMOTE',834]);
 assert.equal(last.players.find(p=>p[0]==='LOCAL'),undefined,'the local card is never published');
 // After 8:00 the cap rises to 7: uncapped 5.27 plus the 0.15 bonus.
 f.clock.text='8:00';f.advance(2100);
 assert.equal(f.value().text,fmt(shown(480,12000,42000,35000,6,{self:5000})));
 const late=serverPayout(480,1,12000,42000,35000,6).mult,raw=(2.484*(12000/5833-1)+1)*(2.268*(42000/35000-1)+1);
 assert.ok(raw<7&&Math.abs(late-(raw+0.15))<1e-4,'uncapped plus 0.15: '+late);
 // Souls move: REMOTE drops below our average and the teams even out, leaving the time bounty only.
 f.souls.REMOTE.text='6,000';f.souls.LOCAL.text='6,000';f.advance(2100);
 assert.equal(f.value().text,String(serverPayout(480+LABEL_LAG,1,6000,36000,36000,6).S),'no comeback: the base share only');
 evidence.push({case:'comeback',snapshots:f.snapshots().slice(-3)});
});

test('winning-team difficulty bonus gets no +0.15 and an ahead team pays no team multiplier',()=>{
 const f=bountyMatch({remote:'15k',foes:'5,000',allies:'9,000',local:'9,000'});
 // Enemy team 40,000 < our 54,000; REMOTE 15k above our 9,000 average.
 const p=serverPayout(301,1,15000,40000,54000,6);
 assert.ok(Math.abs(p.mult-(2.484*(15000/9000-1)+1))<1e-4,'difficulty only, no 0.15: '+p.mult);
 // Our 9,000 is above the enemy average 6,666: 70% of the killer portion goes to tick gold.
 const ours=shown(301,15000,40000,54000,6,{self:9000});assert.ok(ours<p.S+p.K,'redirected');
 assert.equal(f.value().text,fmt(ours));
});

test('ally bars, the local hero and unmatched names never show a bounty',()=>{
 const f=bountyMatch();assert.equal(f.visible(),true);
 f.h.root.classes=['CLASS_PLAYER','friend'];f.advance(3100);assert.equal(f.visible(),false,'ally bar');
 f.h.root.classes=['CLASS_PLAYER','enemy'];f.advance(3100);assert.equal(f.visible(),true);
 f.name.text='LOCAL';f.advance(5100);assert.equal(f.visible(),false,'local hero');
 f.name.text='NOBODY';f.advance(5100);assert.equal(f.visible(),false,'name not on the topbar');
 f.name.text='REMOTE';f.advance(5100);assert.equal(f.visible(),true);
});

test('unknown or incomplete inputs fail closed instead of guessing',()=>{
 const f=bountyMatch();assert.equal(f.visible(),true);
 f.souls.FOE3.text='{s:gold}';f.advance(2100);assert.equal(f.visible(),false,'one unreadable card hides every bounty');
 assert.deepEqual(f.snapshots().at(-1).players,[]);
 f.souls.FOE3.text='6.0k';f.advance(2100);assert.equal(f.visible(),true);
 f.clock.text='--:--';f.advance(2100);assert.equal(f.visible(),false,'clock unknown');
 f.clock.text='5:01';f.advance(2100);assert.equal(f.visible(),true);
 const third=new MockPanel('CitadelHudTopBarTeam',f.top.harness.contextPanel,'TeamOther');f.card('friendly','EXTRA','1,000').SetParent(third);
 f.advance(5100);assert.equal(f.visible(),false,'a third team panel is not a two-team match');
});

test('non-default maps, Street Brawl, tutorial and hideout publish no bounties; hero testing does',()=>{
 const f=bountyMatch();assert.equal(f.visible(),true);
 f.top.harness.root.AddClass('gamemode_streetbrawl');f.advance(2100);assert.equal(f.visible(),false);
 f.top.harness.root.RemoveClass('gamemode_streetbrawl');f.advance(2100);assert.equal(f.visible(),true);
 for(const c of ['connectedToTutorial','connectedToHideout']){f.top.harness.root.AddClass(c);f.advance(2100);assert.equal(f.visible(),false,c);f.top.harness.root.RemoveClass(c);f.advance(2100);assert.equal(f.visible(),true);}
 f.top.harness.root.RemoveClass('isDefaultMap');f.advance(2100);assert.equal(f.visible(),false);
 // Live 6839 report: hero testing (Testing Tools, bots) showed no pill. The server pays heroes there by the
 // same rules (no hero-testing branch in the payout), so its bars show the bounty with or without isDefaultMap.
 f.top.harness.root.AddClass('connectedToHeroTesting');f.advance(2100);assert.equal(f.visible(),true,'hero testing off the default-map class');
 f.top.harness.root.AddClass('isDefaultMap');f.advance(2100);assert.equal(f.visible(),true,'hero testing on the default map');
 f.top.harness.root.AddClass('gamemode_streetbrawl');f.advance(2100);assert.equal(f.visible(),false,'hero testing with Street Brawl values');
});

test('hero testing 1v1 from the live report: our 1.3k against a 49k bot at 2:25 shows its bounty',()=>{
 // Screenshot 2026-11-02 (6839): Testing Tools, one card per team, no isDefaultMap assumption.
 const f=bountyMatch({solo:true,remote:'49k',local:'1.3k',setup:g=>{const r=g.top.harness.root;r.RemoveClass('isDefaultMap');r.AddClass('connectedToHeroTesting');g.top.harness.contextPanel.FindChildTraverse('GameTime').text='2:25';}});
 const expected=shown(145,49000,49000,1300,1,{self:1300,victims:1});
 assert.equal(serverPayout(145,1,49000,49000,1300,1).mult,5,'capped before minute 8');
 assert.equal(f.visible(),true);assert.equal(f.value().text,fmt(expected));
 assert.deepEqual(f.snapshots().at(-1).players,[['REMOTE',expected]]);
 evidence.push({case:'hero-testing-1v1',expected,snapshot:f.snapshots().at(-1)});
});

test('replays the three live hero-testing kills: the pill equals the kill popup and the server log',()=>{
 // 2026-11-02 (6839) console.log, user screenshots 07:10:08 and 07:10:29. One local card against Infernus 49k and
 // two 600 bots; the cards read 2.1k/3.5k while the server's killer NW was 1515/2895 (team label 2k/3k).
 // Kill 1 Billy: "Base Bounty: 632, Total Bounty: 757" (first kill +125), "Bounty Base: 790, Total Comeback: 1896,
 //   Killer Portion: 568" -> popup 1,483. Kill 2 Infernus: base 649, S 812, comeback 1948, portion 584 -> popup 1,396.
 // Kill 3 Rat King: base 659, S 824, comeback 1977, portion 593 -> 1,417.
 const kills=[{clock:'8:38',victim:'600',others:['49k','600'],local:'2.1k',team:'2k',teamKills:'0',popup:1483},
  {clock:'8:58',victim:'49k',others:['600','600'],local:'3.5k',team:'3k',teamKills:'1',popup:1396},
  {clock:'9:10',victim:'600',others:['49k','600'],local:'4.9k',team:'4k',teamKills:'2',popup:1417}];
 const f=bountyMatch({solo:true,remote:kills[0].victim,local:kills[0].local,setup:(g,card)=>{
  const r=g.top.harness.root;r.RemoveClass('isDefaultMap');r.AddClass('connectedToHeroTesting');
  kills[0].others.forEach((souls,i)=>card('enemy','BOT'+i,souls));
 }});
 const ctx=f.top.harness.contextPanel,label=id=>ctx.FindChildTraverse(id).FindChildrenWithClassTraverse('ScoreLabel')[0];
 const killsLabel=ctx.FindChildrenWithClassTraverse('FriendlyKills')[0];
 for(const k of kills){
  f.clock.text=k.clock;f.souls.REMOTE.text=k.victim;f.souls.LOCAL.text=k.local;k.others.forEach((s,i)=>{f.souls['BOT'+i].text=s;});
  label('TeamScoreFriendly').text=k.team;label('TeamScoreEnemy').text='50k';killsLabel.text=k.teamKills;
  f.advance(2100);
  assert.equal(f.value().text,fmt(k.popup),k.clock+' popup');
  evidence.push({case:'live-hero-testing-'+k.clock,popup:k.popup,snapshot:f.snapshots().at(-1)});
 }
 // Without the team label the 2.1k card stands in for NW 1515; the capped comeback hides it here.
 label('TeamScoreFriendly').text='{s:team_networth}';f.advance(2100);assert.equal(f.value().text,'1,417');
});

test('replays the second live session: first-kill bonus ends with the first enemy death, label lag included',()=>{
 // 2026-11-02 11:33-11:34 (6839) console.log and user screenshots 11:34:23/25: Gigawatt vs a 49k Rat King bot.
 // Server: "Base Bounty: 384, Total Bounty: 509" + "Bounty Base: 480, Killer Portion: 230" -> popup 835;
 // then 396/396 + 495/237 -> 732 (no bonus) and 410/410 + 513/246 -> 759 (the screenshot popup).
 // The stock team kills label still read 0 at the second kill (it changed 22 s after the first), so only the
 // Rat King card's Dead class tells the pill the bonus is spent. Before: 856 shown for a 732 kill.
 const kills=[{clock:'3:40',local:'600',team:'600',teamKills:'0',popup:835},
  {clock:'3:55',local:'1.0k',team:'1k',teamKills:'0',popup:732},
  {clock:'4:11',local:'2.0k',team:'2k',teamKills:'2',popup:759}];
 const f=bountyMatch({solo:true,remote:'49k',local:'600',setup:g=>{const r=g.top.harness.root;r.RemoveClass('isDefaultMap');r.AddClass('connectedToHeroTesting');}});
 const ctx=f.top.harness.contextPanel,label=id=>ctx.FindChildTraverse(id).FindChildrenWithClassTraverse('ScoreLabel')[0];
 const killsLabel=ctx.FindChildrenWithClassTraverse('FriendlyKills')[0];
 kills.forEach((k,i)=>{
  f.clock.text=k.clock;f.souls.LOCAL.text=k.local;label('TeamScoreFriendly').text=k.team;label('TeamScoreEnemy').text='49k';killsLabel.text=k.teamKills;
  f.advance(1100);
  assert.equal(f.value().text,fmt(k.popup),k.clock+' popup');
  assert.equal(k.popup,shown(Number(k.clock.split(':')[0])*60+Number(k.clock.split(':')[1]),49000,49000,Number(k.team.replace('k','000')),1,{self:1,victims:1,firstKill:i===0}),'reference agrees');
  evidence.push({case:'live-session2-'+k.clock,popup:k.popup,snapshot:f.snapshots().at(-1)});
  // The kill: the card goes Dead for a while, then respawns.
  f.remote.owner.AddClass('Dead');f.advance(1100);f.remote.owner.RemoveClass('Dead');
 });
});

test('the pill follows the clock each second, and bars without a pill never parse bounty snapshots',()=>{
 const f=bountyMatch();assert.equal(f.visible(),true);
 // The clock moves every second, so every snapshot carries a new value for REMOTE.
 const step=(n)=>{for(let i=0;i<n;i++){const [m,s]=f.clock.text.split(':').map(Number),t=m*60+s+1;f.clock.text=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');f.advance(1000);}};
 step(2);let last=f.value().text,changes=0;
 for(let i=0;i<6;i++){step(1);if(f.value().text!==last){changes++;last=f.value().text;}}
 assert.ok(changes>=4,'the pill follows the clock: '+changes);
 // A trooper bar stays subscribed for the scan gate but drops snapshots before parsing them.
 f.h.root.classes=['CLASS_TROOPER','enemy'];f.advance(3100);assert.equal(f.visible(),false);
 const parse=f.world.context.JSON.parse;let parsed=0;f.world.context.JSON={...JSON,parse(raw){if(String(raw).indexOf('HPV3_BOUNTY_SNAPSHOT')>=0)parsed++;return parse(raw);}};
 step(4);assert.ok(f.snapshots().length>0);assert.equal(parsed,0,'inactive bars never parse bounty snapshots');
});

test('snapshots go out only on change plus a 5s heartbeat, and a stopped topbar expires the label',()=>{
 const f=bountyMatch(),before=f.snapshots().length;f.advance(20000);
 const sent=f.snapshots().length-before;assert.ok(sent>=3&&sent<=5,'heartbeat only while values hold: '+sent);
 const text=f.value(),writes=[];let current=text.text;
 Object.defineProperty(text,'text',{configurable:true,get(){return current;},set(v){writes.push(v);current=v;}});
 f.advance(20000);assert.equal(writes.length,0,'unchanged values never rewrite the label');
 f.top.harness.$.HPColorsV3Timers.stop();f.advance(16000);assert.equal(f.visible(),false,'stale after 12s');
});

test('turning the bounty off hides it and the bounty alone never writes topbar cards',()=>{
 const f=bountyMatch({edits:[['pickupTimersEnabled',false],['ultimateTimerEnabled',false]]});
 assert.equal(f.visible(),true);
 assert.equal(f.remote.cooldown.style.horizontalAlign,'right','stock cooldown alignment untouched');
 assert.equal(f.top.harness.contextPanel.FindChildTraverse('HPColorsV3PickupIndicators'),null);
 f.edit('killBountyEnabled',false);f.advance(3000);assert.equal(f.visible(),false);
 const count=f.snapshots().length;f.advance(10000);assert.equal(f.snapshots().length,count,'the topbar stops sampling');
});

test('offsets move the pill with the bar and keep it inside the canvas',()=>{
 const f=bountyMatch(),anchor=f.r.FindChild('HPColorsV3BountyAnchor');
 const base=anchor.style.transform;assert.match(base,/^translate3d\(0px, [\d.]+px, 0px\)$/);
 f.edit('killBountyOffsetX',20);f.edit('killBountyOffsetY',-10);f.advance(500);
 const [,x,y]=/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(anchor.style.transform);const y0=Number(/, ([\d.]+)px/.exec(base)[1]);
 assert.equal(Number(x),20);assert.equal(Number(y),y0-10);
 f.edit('killBountyOffsetX',200);f.edit('killBountyOffsetY',210);f.advance(500);
 const [,cx,cy]=/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(anchor.style.transform);
 assert.equal(Number(cx),66,'200px canvas: centre at most 34px from the edge');assert.equal(Number(cy),210-24);
 f.edit('enabled',false);f.advance(500);assert.equal(f.visible(),false);assert.ok(!anchor.style.transform,'master off releases the transform');
});

// yesdaddy, 2026-11-02: "the typical scale/rotation settings for the kill bounty". Size is the number's px size
// (17, the stock-look default) and scales the whole pill by ui-scale (layout, not raster); tilt turns it.
test('size and tilt scale and turn the pill around its own centre, inside the canvas',()=>{
 const f=bountyMatch(),anchor=f.r.FindChild('HPColorsV3BountyAnchor'),pill=anchor.FindChild('HPColorsV3Bounty');
 assert.ok(!pill.style.uiScale&&!pill.style.transform,'defaults keep the stock-look pill untouched');
 f.edit('killBountySize',34);f.edit('killBountyTilt',-8);f.advance(500);
 assert.equal(pill.style.uiScale,'200%');assert.equal(pill.style.transform,'rotateZ(-8deg)');
 f.edit('killBountyOffsetX',200);f.edit('killBountyOffsetY',210);f.advance(500);
 const [,cx,cy]=/translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(anchor.style.transform);
 assert.equal(Number(cx),32,'a twice-as-wide pill stays 68px from the edge');assert.equal(Number(cy),210-48,'and 48px from the bottom');
 f.edit('killBountySize',17);f.edit('killBountyTilt',0);f.advance(500);
 assert.ok(!pill.style.uiScale&&!pill.style.transform,'back to defaults releases both');
 f.edit('killBountySize',26);f.advance(500);assert.equal(pill.style.uiScale,'152.9%','one-decimal percent');
 f.edit('enabled',false);f.advance(500);assert.ok(!pill.style.uiScale,'master off releases the scale');
});

test('the menu preview shows a sample pill on the enemy hero only while the setting is on',()=>{
 const {loadLayout,latestPublishedConfig}=require('./boot-layout');
 const boot=loadLayout('hud_escape_menu.xml');boot.includeScripts();boot.onload();const h=boot.harness;
 const find=id=>{const p=h.contextPanel.FindChildTraverse(id);assert.ok(p,id);return p;};
 const {runInVm}=require('./boot-layout');runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate',''),boot.context);
 const canvas=find('HPColorsPreviewCanvas'),value=find('HPColorsPreviewBountyValue');
 assert.equal(canvas.BHasClass('HPColorsV3KillBounty'),false,'off by default');
 const row=h.$.HPColorsV3Settings.controls.find(x=>x.key==='killBountyEnabled');find(row.toggleId).events.onactivate();
 assert.equal(latestPublishedConfig(h).settings.shared.killBountyEnabled,true);
 assert.equal(canvas.BHasClass('HPColorsV3KillBounty'),true);assert.equal(value.text,'1,250');
 assert.match(find('HPColorsPreviewBountyAnchor').style.transform,/^translate3d\(0px, [\d.]+px, 0px\)$/);
 const size=h.$.HPColorsV3Settings.controls.find(x=>x.key==='killBountySize');
 find(size.entryId).text='34';find(size.entryId).events.ontextentrysubmit();
 assert.equal(find('HPColorsPreviewBounty').style.uiScale,'200%','the preview pill follows the size');
 find('HPColorsPreviewSideOptionAlly').events.onactivate();assert.equal(canvas.BHasClass('HPColorsV3KillBounty'),false,'ally sample');
 find('HPColorsPreviewSideOptionEnemy').events.onactivate();assert.equal(canvas.BHasClass('HPColorsV3KillBounty'),true);
 find(row.toggleId).events.onactivate();assert.equal(canvas.BHasClass('HPColorsV3KillBounty'),false);
});
