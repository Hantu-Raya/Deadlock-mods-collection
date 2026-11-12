'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {profile,launch,CURRENT,PREVIOUS,evidenceRoot,transcript}=require('./storage-fixture');
const corpus=require('./fixtures/v2-migration.json').concat(require('./fixtures/v2-indicators-migration.json'),require('./fixtures/v2-level-ultimate-migration.json'),require('./fixtures/v2-stamina-migration.json'),require('./fixtures/v2-pulse-migration.json'),require('./fixtures/v2-pickups-rejuvenator-migration.json'),require('./fixtures/v2-timers-migration.json'),require('./fixtures/v2-units-migration.json'),require('./fixtures/v2-bar-style-migration.json'),require('./fixtures/v2-shake-tilt-migration.json'),require('./fixtures/v2-text-outline-align-migration.json'),require('./fixtures/v2-own-hud-migration.json'));
const legacy=require('./fixtures/v2-contract.json');
const V2='hantu.hpcolors.v2/state';
function paste(f,kind,code){const root=f.harness.contextPanel;root.FindChildTraverse('HPColors'+kind+'CodeEntry').text=code;root.FindChildTraverse('HPColors'+kind+'ImportButton').events.onactivate();}
function expected(settings,part){for(const [side,values] of Object.entries(part)){const actual=side==='shared'?settings.shared:settings.side[side];for(const [key,value] of Object.entries(values))assert.equal(actual[key],value,side+'.'+key);}}
function frame(s,b){const payload=Buffer.from(JSON.stringify({m:'HPV2STORE',s,t:1,b:s===1?JSON.stringify(b):b})).toString('base64url');let h=2166136261;for(const c of payload){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return `HPV2S1.${(h>>>0).toString(16).padStart(8,'0')}.${payload}`;}
function nativeRule(f,item,key,side='enemy'){const cell=f.harness.$.HPColorsV3Settings.slots.find(slot=>slot.setting===key&&slot.side===side).slot;return (item.rules||{})[cell];}
for(const item of corpus)test(item.name+' converts through real menu/page and restart',()=>{
 const p=profile(item.kind==='save'?{[V2]:item.input}:{});const f=launch(p);f.run(2000);
 const before=JSON.stringify(f.settings());
 if(item.kind!=='save')paste(f,item.kind==='settings'?'Settings':'Bundle',item.input);f.run(3000);
 const bundle=f.harness.$.HPColorsV3Store.getBundle();
 if(item.kind==='bundle')assert.equal(JSON.stringify(f.settings()),before,'preset import does not apply settings');
 else expected(f.settings(),item.expected);
 assert.equal(f.status(),'Saved');assert.ok(p.disk.get(CURRENT));
 const migrated=item.kind==='bundle'?bundle.presets[0]:bundle;
 assert.equal(migrated.settings.side.enemy.linesVisible,false);
 for(const key of ['pipsVisible','enemyPipColorEnabled','enemyPipColor','allyPipColorEnabled','allyPipColor','pipOpacity','enemyKillMarkerEnabled','enemyKillMarkerThreshold','enemyKillMarkerWidth','enemyKillMarkerColor',
   'levelsVisible','levelOffsetX','levelOffsetY','accessoryAnchorEnabled','ultMode','ultCustom','ultOffsetX','ultOffsetY','ultimateTimerSize',
   'enemyStaminaColorEnabled','enemyStaminaColor','staminaWidth','staminaHeight','staminaOffsetX','staminaOffsetY','staminaShape',
   'enemyPulseEnabled','enemyPulseThreshold','enemyPulseBpm','enemyPulseIntensity','enemyPulseColorEnabled','enemyPulseColorMode','enemyPulseColor','enemyPulseHideBar',
   'enemyPulseReadout','enemyPulseReadoutModifiers','enemyPulseReadoutSize','enemyPulseReadoutOffsetX','enemyPulseReadoutOffsetY',
   'allyPulseEnabled','allyPulseThreshold','allyPulseBpm','allyPulseIntensity','allyPulseColorEnabled','allyPulseColorMode','allyPulseColor','allyPulseReadout',
   'pickupTimersEnabled','pickupGunColor','pickupMovementColor','pickupSpiritColor','pickupSurvivalColor','pickupBackgroundDarkness','pickupGlyphColor','pickupSize','pickupSpacing','pickupOffsetX','pickupOffsetY','rejuvOffsetX','rejuvOffsetY','rejuvTilt','rejuvScale',
   'ultimateTimerEnabled','ultimateTimerDarkness','ultimateTimerColorMode','ultimateTimerUnavailableColor','ultimateTimerAvailableColor',
   'npcEnemyEnabled','npcAllyEnabled','npcNeutralEnabled','buildingEnemyEnabled','buildingAllyEnabled','neutralColor','barMask','nameRiseWithPips','damageShakeEnabled','damageShakeIntensity','nameTilt','readoutTilt','allyReadoutTilt',
   'readoutOutlineWidth','allyReadoutOutlineWidth','nameOutlineWidth','nameAlign','hpTextAlign','hudHealthColorMode','hudHealthColor'])
   assert.equal(Object.hasOwn(migrated.v2pending||{},key),false,key+' consumed into v3 settings');
 if(item.nameExpected)assert.equal(bundle.presets[0].name,item.nameExpected);
 for(const [i,part] of (item.expectedPresets||[]).entries())expected(bundle.presets[i].settings,part);
 const saved=p.disk.get(CURRENT);const again=launch(p);again.run(2000);
 if(item.kind==='bundle')assert.equal(JSON.stringify(again.settings()),before);else expected(again.settings(),item.expected);
 const restarted=again.harness.$.HPColorsV3Store.getBundle();
 for(const [i,part] of (item.expectedPresets||[]).entries())expected(restarted.presets[i].settings,part);
 assert.equal(p.disk.get(CURRENT),saved);
 assert.ok(!again.page.requests.some(r=>r.k===V2||r.k===V2+'.prev'));assert.ok(f.page.requests.filter(r=>r.o==='w').every(r=>r.k===CURRENT));
 if(item.kind==='save')assert.equal(f.page.requests.filter(r=>r.o==='r'&&r.k===V2).length,1);
 if(item.kind==='save')assert.equal(p.disk.get(V2),item.input);
});
test('legacy current wins; previous recovered only on corrupt or absent current',()=>{
 const p=profile({[V2]:'broken',[V2+'.prev']:corpus[4].input});const f=launch(p);f.run(5000);expected(f.settings(),corpus[4].expected);assert.equal(p.disk.get(V2),'broken');assert.equal(p.disk.get(V2+'.prev'),corpus[4].input);
});
test('valid v3 wins without a legacy read',()=>{
 const p=profile();const seed=launch(p);seed.run(2000);seed.edit('#ABCDEF');seed.run(2000);p.disk.set(V2,corpus[0].input);const f=launch(p);f.run(3000);assert.equal(f.settings().side.enemy.barColorLow,'#ABCDEF');assert.ok(!f.page.requests.some(r=>r.k===V2));
});
test('corrupt/future legacy saves fail closed without a fresh write',()=>{
 for(const input of ['broken',frame(6,{version:1,values:{}})]){const p=profile({[V2]:input});const f=launch(p);f.run(5000);f.edit('#AABBCC');f.run(5000);assert.equal(f.page.writes,0);assert.equal(p.disk.get(V2),input);}
});
test('Current and explicit own are flattened; pending conditions/routing round-trip',()=>{
 const b={version:1,values:{enemyLow:'#111111'},scopes:[{id:'scope_current',mode:'all',heroes:[],values:{enemyLow:'#ABCDEF'},conditions:{}}],userPresets:[{id:'user_0001',name:'Base',mode:'all',heroes:[],values:{widthScale:200,pipsVisible:false},conditions:null},{id:'user_0002',name:'Hero',mode:'selected',heroes:['hero_synth'],own:['enemyLow'],values:{widthScale:300,enemyLow:'#334455'},conditions:{pipsVisible:{slot:1,minTier:2,value:false}}}]};
 const p=profile({[V2]:frame(4,b)});const f=launch(p);f.run(5000);assert.equal(f.settings().side.enemy.barColorLow,'#ABCDEF');let bundle=f.harness.$.HPColorsV3Store.getBundle();const hero=bundle.presets[1];assert.equal(hero.settings.side.enemy.barWidth,158);assert.equal(hero.settings.side.enemy.barColorLow,'#334455');assert.ok(!('own' in hero));assert.equal(hero.settings.side.enemy.linesVisible,false);assert.equal(bundle.heroPresets.hero_synth,'user_0002');assert.equal(bundle.heroDefault,'user_0001');assert.equal(hero.heroes,undefined);assert.equal(hero.mode,undefined);assert.equal(nativeRule(f,hero,'linesVisible').minTier,2);
 const code=f.harness.$.HPColorsV3Store.exportBundleCode(f.settings());paste(f,'Bundle',code);f.run(2000);const again=launch(p);again.run(2000);bundle=again.harness.$.HPColorsV3Store.getBundle();assert.equal(nativeRule(again,bundle.presets[1],'linesVisible').minTier,2);assert.equal(bundle.presets[1].settings.side.enemy.barWidth,158);
});
test('malformed legacy imports refuse atomically',()=>{
 const p=profile();const f=launch(p);f.run(2000);f.edit('#ABCDEF');f.run(2000);const before=JSON.stringify(f.harness.$.HPColorsV3Store.getBundle());const saved=p.disk.get(CURRENT);const i=legacy.codecKeys.indexOf('enemyLow');
 for(const input of ['HPCR2{','HPCR2'+JSON.stringify([[i,'#112233'],[i,'#445566']]),'HPCR2'+JSON.stringify([[999,true]]),'HPCR2'+JSON.stringify([[i,false]]),'HPCR2'+JSON.stringify({v:[],c:{},hpv2:{v:4,values:[],conditions:{}}})]){paste(f,'Settings',input);f.run(2000);assert.equal(JSON.stringify(f.harness.$.HPColorsV3Store.getBundle()),before);assert.equal(p.disk.get(CURRENT),saved);}
});
test.after(()=>fs.writeFileSync(path.join(evidenceRoot,'migration-transcript.json'),JSON.stringify(transcript.map(x=>({status:x.status(),requests:x.page.requests,replies:x.page.replies})),null,2)));

test('bare HPCR2 preserves extension settings and conditional metadata',()=>{
 const p=profile();const f=launch(p);f.run(2000);let b=f.harness.$.HPColorsV3Store.getBundle();b.settings.side.enemy.nameOffsetX=42;b.v2pending={pickupOffsetX:17};const cell=f.harness.$.HPColorsV3Settings.slots.find(slot=>slot.setting==='pickupOffsetX').slot;b.rules={[cell]:{slot:1,minTier:2,value:18}};f.harness.$.HPColorsV3Store.replaceBundle(b);f.run(2000);
 paste(f,'Settings','HPCR2[]');f.run(2000);b=f.harness.$.HPColorsV3Store.getBundle();assert.equal(b.settings.side.enemy.nameOffsetX,42);assert.equal(b.v2pending.pickupOffsetX,17);assert.equal(nativeRule(f,b,'pickupOffsetX','shared').value,18);
});
test('legacy all-hero scope offsets and conditional size values convert exactly once',()=>{
 const b={version:1,values:{},scopes:[{id:'all',mode:'all',heroes:[],values:{widthScale:200,readoutOffsetX:100},conditions:{widthScale:{slot:1,minTier:2,value:300}}}]};const p=profile({[V2]:frame(2,b)});const f=launch(p);f.run(5000);const result=f.harness.$.HPColorsV3Store.getBundle();assert.equal(result.settings.side.enemy.hpTextOffsetX,50);assert.equal(result.v2scopes[0].settings.side.enemy.hpTextOffsetX,50);assert.equal(nativeRule(f,result,'barWidth').value,237);const again=launch(p);again.run(2000);assert.equal(again.harness.$.HPColorsV3Store.getBundle().v2scopes[0].settings.side.enemy.hpTextOffsetX,50);
});
test('baked HPCRP1 copy becomes a durable named user preset',()=>{
 const pairs=keys=>keys.flatMap((key,i)=>Object.hasOwn(legacy.defaults,key)&&legacy.defaults[key]!==legacy.codecDefaults[key]?[[i,legacy.defaults[key]]]:[]);
 const source={records:[{id:'baked_default',kind:'baked',name:'Named default copy',mode:'off',heroes:[],values:pairs(legacy.codecKeys),conditions:null,hpv2:{v:2,values:pairs(legacy.extensionKeys),conditions:{}}}]};const p=profile();const f=launch(p);f.run(2000);paste(f,'Bundle','HPCRP1'+JSON.stringify(source));f.run(3000);const bundle=f.harness.$.HPColorsV3Store.getBundle();assert.equal(bundle.presets.length,1);assert.notEqual(bundle.presets[0].id,'baked_default');assert.equal(bundle.presets[0].name,'Named default copy');const again=launch(p);again.run(2000);assert.equal(again.harness.$.HPColorsV3Store.getBundle().presets[0].id,bundle.presets[0].id);
});
test('sparse pending omits shipped defaults and saves all128 legacy presets without dropping maps',()=>{
 const body={version:1,values:{},userPresets:Array.from({length:128},(_,i)=>({id:'user_'+String(i+1).padStart(4,'0'),name:'Preset '+i,mode:'all',heroes:[],values:{}}))};const input=frame(4,body);const p=profile({[V2]:input});const f=launch(p);f.run(5000);assert.equal(f.status(),'Saved');const bundle=f.harness.$.HPColorsV3Store.getBundle();assert.equal(bundle.presets.length,128);assert.ok(bundle.presets.every(x=>x.v2pending));assert.ok(!('ultimateTimerEnabled' in bundle.v2pending));assert.ok(!('nameRiseWithPips' in bundle.v2pending),'ticket 19 maps it');assert.equal(bundle.settings.shared.nameRiseWithPips,false,'frozen sparse v2 value, not the shipped default');assert.ok(p.disk.get(CURRENT).length<=192000);assert.equal(p.disk.get(V2),input);
});
test('ticket 28: complete v2 parity preserves every setting and refuses oversize conversion without dropping data',()=>{
 const seed=launch(profile());seed.run(2000);const converter=seed.harness.$.HPColorsV3FromV2;const raw={};
 for(const key of legacy.keys){const meta=legacy.settingMeta[key],value=legacy.defaults[key];raw[key]=meta.type==='boolean'?!value:meta.type==='color'?'#123123':meta.type==='enum'?meta.options.find(x=>x!==value):meta.min===value?meta.max:meta.min;}
 const sample=converter.classifyRecord(frame(4,{version:1,values:raw,userPresets:[]}));
 assert.equal(sample.kind,'valid');assert.deepEqual(JSON.parse(JSON.stringify(sample.bundle.v2pending)),{},'every supported v2 key now maps to a slot');
 const body=count=>({version:1,values:{enemyLow:'#445566'},
  scopes:Array.from({length:count},(_,i)=>({id:'extra'+i,mode:'selected',heroes:['hero_synth'],values:raw,conditions:{}})),
  userPresets:Array.from({length:128},(_,i)=>({id:'user_'+String(i+1).padStart(4,'0'),name:'Preset '+i,mode:'all',heroes:[],values:{enemyLow:'#123123'}}))});
 // Ticket 35: every v2 scope keeps a full v3 settings copy, so 19 more settings lower the largest synthetic
 // all-keys-changed save that converts under the 192,000 cap from 27 to 26 scopes; the v17 neutral camp
 // look (slot 198) lowers it to 25, the v18 objective HP number settings (204-208) to 24, and the v22 HP number
 // format (216-217) to 23, and the v23 status effect sizes (218-225) to 22.
 const input=frame(4,body(22)),codec=seed.harness.$.HPColorsV3Codec;let encodes=0;
 seed.harness.$.HPColorsV3Codec={...codec,encodeRecord(bundle){encodes++;return codec.encodeRecord(bundle);}};
 const converted=converter.classifyRecord(input);assert.equal(converted.kind,'valid');assert.equal(encodes,1);
 assert.ok(codec.encodeRecord(converted.bundle).length<=192000);
 const p=profile({[V2]:input}),f=launch(p);f.run(8000);assert.equal(f.status(),'Saved');
 const bundle=f.harness.$.HPColorsV3Store.getBundle();assert.equal(bundle.presets.length,128);
 assert.ok(bundle.presets.every(x=>x.settings.side.enemy.barColorLow==='#123123'));assert.equal(bundle.settings.side.enemy.barColorLow,'#445566');
 assert.equal(bundle.v2scopes.length,22);assert.ok(p.disk.get(CURRENT).length<=192000);assert.equal(p.disk.get(V2),input);
 const again=launch(p);again.run(8000);assert.equal(again.harness.$.HPColorsV3Store.getBundle().presets.length,128);
 const oversized=frame(4,body(30));assert.ok(oversized.length<=192000,'legal old save expands past the v3 cap');
 const refusal=converter.classifyRecord(oversized);assert.equal(refusal.kind,'conversion_error');assert.match(refusal.message,/192,000/);
 const blocked=profile({[V2]:oversized}),boot=launch(blocked);boot.run(8000);
 assert.equal(boot.page.writes,0);assert.equal(blocked.disk.get(V2),oversized);assert.equal(blocked.disk.get(CURRENT),undefined);
});

test('lost legacy read fails closed, then an edit-triggered probe migrates without losing edits',()=>{
 const p=profile({[V2]:corpus[0].input});let f;
 f=launch(p,{dropTitle(text){if(!text.startsWith('HPV2S1:'))return false;const reply=JSON.parse(text.slice(7));return f.page.requests.some(r=>r.i===reply.i&&r.o==='r'&&r.k===V2);}});
 f.run(15000);assert.match(f.status(),/UNAVAILABLE/);assert.equal(f.page.writes,0);assert.equal(p.disk.get(V2),corpus[0].input);
 f.page.options.dropTitle=null;f.edit('#654321');f.run(15000);assert.equal(f.status(),'Saved');assert.equal(f.settings().side.enemy.barColorLow,'#654321');assert.equal(f.settings().side.enemy.barWidth,158);assert.equal(p.disk.get(V2),corpus[0].input);
});

function v3frame(body,tag='HPV2S1'){
 const payload=Buffer.from(JSON.stringify(body)).toString('base64url');let h=2166136261;
 for(const c of payload){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return `${tag}.${(h>>>0).toString(16).padStart(8,'0')}.${payload}`;
}
for(const version of [1,2,3,4]) for(const mode of ['load','import']) test(`pending v2 indicators promote on v${version} ${mode} and stay promoted after restart`,()=>{
 const seed=launch(profile());seed.run(2000);
 const pending={pipsVisible:false,enemyPipColorEnabled:true,enemyPipColor:'#123456',allyPipColorEnabled:true,allyPipColor:'#654321',pipOpacity:37,
   enemyKillMarkerEnabled:true,enemyKillMarkerThreshold:61,enemyKillMarkerWidth:version===1?23:2.3,enemyKillMarkerColor:'#ABCDEF',
   levelsVisible:false,levelOffsetX:12.3,levelOffsetY:-4.7,accessoryAnchorEnabled:false,ultMode:'custom',ultCustom:'#112233',ultOffsetX:-8.1,ultOffsetY:5.9,ultimateTimerSize:150,
   enemyStaminaColorEnabled:true,enemyStaminaColor:'#234567',staminaWidth:22,staminaHeight:8.96,staminaOffsetX:12.3,staminaOffsetY:-4.7,staminaShape:'circle',
   enemyPulseThreshold:42,enemyPulseBpm:120,enemyPulseIntensity:2,enemyPulseReadout:true,enemyPulseReadoutModifiers:true,enemyPulseReadoutSize:20,enemyPulseReadoutOffsetX:10,enemyPulseReadoutOffsetY:-10,
   allyPulseEnabled:true,allyPulseColorMode:'gradient',allyPulseReadout:true,
   pickupOffsetX:17};
 const scopeSettings=JSON.parse(JSON.stringify(seed.settings()));
 for(const slot of seed.harness.$.HPColorsV3Settings.slots.filter(slot=>slot.slot>=83))delete (slot.side==='shared'?scopeSettings.shared:scopeSettings.side[slot.side])[slot.setting];
 const item={id:'old',name:'Old',mode:'selected',heroes:['hero_synth'],hidden:true,d:[[3,'#445566']],v2pending:{...pending}};
 const b={v2pending:{...pending},v2scopes:[{mode:'selected',heroes:['hero_synth'],settings:scopeSettings,v2pending:{...pending}}],routing:{default:'old'}};
 const record={v:version,k:'bundle',d:[[3,'#113355']],p:[item],b};
 const p=profile(mode==='load'?{[CURRENT]:v3frame(record)}:{}),f=launch(p);f.run(3000);
 if(mode==='import')paste(f,'Bundle',v3frame(record,'HPC3'));f.run(3000);
 const check=(entry)=>{
   const enemy={staminaColorEnabled:true,staminaColor:'#234567',staminaWidth:22,staminaHeight:8.96,staminaOffsetX:12.3,staminaOffsetY:-4.7,staminaShape:'circle'};
   if(version<=2)Object.assign(enemy,{linesVisible:false,lineColorEnabled:true,lineColor:'#123456',lineOpacity:37,killMarkerEnabled:true,killMarkerThreshold:61,killMarkerWidth:2.3,killMarkerColor:'#ABCDEF',levelsVisible:false,levelOffsetX:12.3,levelOffsetY:-4.7});
   else Object.assign(enemy,{linesVisible:true,lineOpacity:100,levelsVisible:true});
   if(version===4)Object.assign(enemy,{staminaColorEnabled:false,staminaColor:'#FD4949',staminaWidth:11,staminaHeight:4.48,staminaOffsetX:0,staminaOffsetY:0,staminaShape:'arrow'});
   Object.assign(enemy,{pulseThreshold:42,pulseBpm:120,pulseIntensity:2,pulseReadout:true,pulseReadoutModifiers:true,pulseReadoutSize:20,pulseReadoutOffsetX:10,pulseReadoutOffsetY:-10});
   expected(entry.settings,{enemy,ally:version<=2?{lineColorEnabled:true,lineColor:'#654321',lineOpacity:37}:{lineColorEnabled:false,lineOpacity:100},
     shared:version<=2?{accessoryAnchorEnabled:false,ultMode:'custom',ultCustom:'#112233',ultOffsetX:-8.1,ultOffsetY:5.9,ultSize:30}:{accessoryAnchorEnabled:true,ultMode:'follow',ultSize:20}});
   expected(entry.settings,{shared:{pickupOffsetX:17}});assert.deepEqual(JSON.parse(JSON.stringify(entry.v2pending)),{});
   expected(entry.settings,{ally:{pulseEnabled:true,pulseColorMode:'gradient',pulseReadout:true}});
 };
 const decoded=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));
 check(decoded);check(decoded.presets[0]);check(decoded.v2scopes[0]);
 let bundle=f.harness.$.HPColorsV3Store.getBundle();check(bundle.presets[0]);assert.equal(bundle.presets[0].hidden,true);
 if(mode==='load'){check(bundle);check(bundle.v2scopes[0]);assert.equal(bundle.routing.default,'old');}
 const again=launch(p);again.run(3000);bundle=again.harness.$.HPColorsV3Store.getBundle();check(bundle.presets[0]);
 if(mode==='load'){check(bundle);check(bundle.v2scopes[0]);}
 const explicit={...record,d:[[89,44]],b:{v2pending:{pipOpacity:37}}};
 const result=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(explicit,'HPC3'));
 assert.equal(result.settings.side.enemy.lineOpacity,version<=2?37:44);assert.equal(result.settings.side.ally.lineOpacity,version<=2?37:100);
 const staminaExplicit={...record,d:[[106,11],[110,'arrow']],b:{v2pending:{staminaWidth:22,staminaShape:'circle'}}};
 const staminaResult=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(staminaExplicit,'HPC3'));
 assert.equal(staminaResult.settings.side.enemy.staminaWidth,version<4?22:11);assert.equal(staminaResult.settings.side.enemy.staminaShape,version<4?'circle':'arrow');
 assert.deepEqual(JSON.parse(JSON.stringify(staminaResult.v2pending)),{},'mapped pending is consumed, never resurrected');
 const nondefault={...record,d:[[106,17],[110,'box']],b:{v2pending:{staminaWidth:22,staminaShape:'circle'}}};
 const overridden=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(nondefault,'HPC3'));
 assert.equal(overridden.settings.side.enemy.staminaWidth,version<4?22:17);assert.equal(overridden.settings.side.enemy.staminaShape,version<4?'circle':'box');
 assert.deepEqual(JSON.parse(JSON.stringify(overridden.v2pending)),{});
});

test('v1 pending survives a real ticket-12-format default-emitting save, current hydration and restart',()=>{
 const seed=launch(profile());seed.run(2000);
 const contract=seed.harness.$.HPColorsV3Settings,codec=seed.harness.$.HPColorsV3Codec;
 const fullSlots=contract.slots;
 const pending={pipsVisible:false,enemyPipColor:'#123456',pipOpacity:37,enemyKillMarkerEnabled:true,enemyKillMarkerWidth:2.3,
   staminaWidth:22,staminaHeight:8.96,staminaOffsetX:12.3,staminaShape:'circle',pickupOffsetX:17};
 const record={v:1,k:'bundle',d:[],p:[{id:'old',name:'Old',d:[],v2pending:{...pending}}],b:{v2pending:{...pending}}};
 // Replay the old reader/writer's public codec with its actual known-slot/version
 // contracts: v1 hydration had no promotion; ticket 12 emitted every 83–94 default.
 contract.recordVersion=1;contract.slots=fullSlots.filter(slot=>slot.slot<83);
 const old=codec.classifyRecord(v3frame(record));assert.equal(old.kind,'valid');
 contract.recordVersion=2;contract.slots=fullSlots.filter(slot=>slot.slot<95);contract.defaultChanges=contract.slotAdditions.filter(change=>change.version<=2);
 const saved=codec.encodeRecord(old.bundle),body=JSON.parse(Buffer.from(saved.split('.')[2],'base64url').toString());
 assert.ok(body.d.some(([slot,value])=>slot===83&&value===true));
 assert.ok(body.d.some(([slot,value])=>slot===91&&value===false));
 const p=profile({[CURRENT]:saved}),f=launch(p);f.run(4000);
 const check=entry=>{
   expected(entry.settings,{enemy:{linesVisible:false,lineColor:'#123456',lineOpacity:37,killMarkerEnabled:true,killMarkerWidth:2.3,
     staminaWidth:22,staminaHeight:8.96,staminaOffsetX:12.3,staminaShape:'circle'}});
   assert.equal(Object.hasOwn(entry.v2pending,'pipsVisible'),false);assert.equal(Object.hasOwn(entry.v2pending,'enemyKillMarkerEnabled'),false);
   assert.equal(entry.settings.shared.pickupOffsetX,17);assert.equal(Object.hasOwn(entry.v2pending,'staminaWidth'),false);
 };
 let bundle=f.harness.$.HPColorsV3Store.getBundle();check(bundle);check(bundle.presets[0]);
 assert.equal(f.status(),'Saved');
 const again=launch(p);again.run(4000);bundle=again.harness.$.HPColorsV3Store.getBundle();check(bundle);check(bundle.presets[0]);
});

for(const width of [10,50]) test(`v1 raw kill-marker width ${width} promotes once through store, presets and scopes`,()=>{
 const seed=launch(profile());seed.run(2000);
 const scopeSettings=JSON.parse(JSON.stringify(seed.settings()));
 const pending={enemyKillMarkerWidth:width};
 const rule={enemyKillMarkerWidth:{slot:1,minTier:2,value:width}};
 const record={v:1,k:'bundle',d:[],p:[{id:'old',name:'Old',d:[],v2pending:{...pending},v2conditions:rule}],
   b:{v2pending:{...pending},v2conditions:rule,v2scopes:[{mode:'all',heroes:[],settings:scopeSettings,v2pending:{...pending},v2conditions:rule}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 for(const boot of [f,launch(p)]) {
   boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();
   for(const item of [b,b.presets[0],b.v2scopes[0]]) {
     assert.equal(item.settings.side.enemy.killMarkerWidth,width/10);
     assert.equal(nativeRule(boot,item,'killMarkerWidth').value,width/10);
     assert.ok(!Object.hasOwn(item.v2pending,'enemyKillMarkerWidth'));
   }
   assert.equal(boot.status(),'Saved');
 }
});

test('v3 deliberate indicator defaults beat retained pending in settings, presets and scopes after restart',()=>{
 const seed=launch(profile());seed.run(2000);const s=seed.settings();
 const pending={levelsVisible:false,pipOpacity:37,enemyKillMarkerEnabled:true,staminaShape:'circle',pickupOffsetX:17};
 const record={v:3,k:'bundle',d:[[95,true],[89,100],[91,false]],p:[{id:'old',name:'Old',d:[[95,true],[89,100],[91,false]],v2pending:{...pending}}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:s,v2pending:{...pending}}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 for(const boot of [f,launch(p)]) {
   boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();
   for(const item of [b,b.presets[0],b.v2scopes[0]]) {
     expected(item.settings,{enemy:{levelsVisible:true,lineOpacity:100,killMarkerEnabled:false,staminaShape:'circle'}});
     expected(item.settings,{shared:{pickupOffsetX:17}});assert.deepEqual(JSON.parse(JSON.stringify(item.v2pending)),{});
   }
 }
});

for(const version of [1,2,3,4,5,6])test(`pickup/rejuvenator pending promotes only at the v6 boundary from v${version}`,()=>{
 const pending={pickupTimersEnabled:false,pickupGunColor:'#123456',pickupMovementColor:'#234567',pickupSpiritColor:'#345678',pickupSurvivalColor:'#456789',
   pickupBackgroundDarkness:50,pickupGlyphColor:'#ABCDEF',pickupSize:64,pickupSpacing:16,pickupOffsetX:200,pickupOffsetY:-100,
   rejuvOffsetX:200,rejuvOffsetY:-210,rejuvTilt:-360,rejuvScale:200,ultimateTimerDarkness:45};
 const seed=launch(profile());seed.run(2000);const scopeSettings=JSON.parse(JSON.stringify(seed.settings()));
 const record={v:version,k:'bundle',d:[],p:[{id:'old',name:'Old',d:[],v2pending:{...pending}}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:scopeSettings,v2pending:{...pending}}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 const check=item=>{
   const shared=version<6?Object.fromEntries(Object.entries(pending).filter(([k])=>!['ultimateTimerDarkness','rejuvScale'].includes(k))):{pickupSize:22,rejuvTilt:6};
   shared.rejuvSize=version<6?48:24;
   shared.ultimateTimerDarkness=45;
   expected(item.settings,{shared});assert.deepEqual(JSON.parse(JSON.stringify(item.v2pending)),{});
 };
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();for(const item of [b,b.presets[0],b.v2scopes[0]])check(item);}
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);
});

test('rejuvenator scale conditions convert to pixels once on legacy import and v5 pending upgrade',()=>{
 for(const legacyInput of [true,false]) {
   const rule={rejuvScale:{slot:1,minTier:2,value:150}};
   const input=legacyInput?frame(4,{version:1,values:{rejuvScale:150},conditions:rule}):
     v3frame({v:5,k:'bundle',d:[],p:[{id:'old',name:'Old',d:[],v2pending:{rejuvScale:150},v2conditions:rule}],
       b:{v2pending:{rejuvScale:150},v2conditions:rule}});
   const p=profile({[legacyInput?V2:CURRENT]:input}),f=launch(p);f.run(3000);
   for(const boot of [f,launch(p)]) {
     boot.run(3000);const bundle=boot.harness.$.HPColorsV3Store.getBundle();
     for(const item of [bundle,...bundle.presets]) {
       assert.equal(item.settings.shared.rejuvSize,36);assert.equal(nativeRule(boot,item,'rejuvSize','shared').value,36);
       assert.ok(!Object.hasOwn(item.v2pending||{},'rejuvScale'));
     }
   }
 }
});

for(const version of [5,6])for(const mode of ['load','import'])test(`v${version} timer pending promotes through ${mode}, presets/scopes and restart`,()=>{
 const pending={ultimateTimerEnabled:false,ultimateTimerDarkness:45,ultimateTimerColorMode:'gradient',ultimateTimerUnavailableColor:'#123456',ultimateTimerAvailableColor:'#ABCDEF'};
 const seed=launch(profile());seed.run(2000);const s=JSON.parse(JSON.stringify(seed.settings()));
 for(const key of Object.keys(pending))delete s.shared[key];
 const record={v:version,k:'bundle',d:[[103,30]],p:[{id:'old',name:'Old',d:[[103,30]],v2pending:{...pending}}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:s,v2pending:{...pending}}]}};
 const p=profile(mode==='load'?{[CURRENT]:v3frame(record)}:{}),f=launch(p);f.run(3000);
 if(mode==='import'){paste(f,'Bundle',v3frame(record,'HPC3'));f.run(3000);}
 const check=item=>{expected(item.settings,{shared:pending});for(const key of Object.keys(pending))assert.ok(!Object.hasOwn(item.v2pending,key));};
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));
 for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);
 assert.equal(imported.settings.shared.ultSize,30);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();check(b.presets[0]);if(mode==='load'){check(b);check(b.v2scopes[0]);}}
});

test('small rejuvenator scale upgrades and conditions have exact step-aligned pixel values',()=>{
 const pending={rejuvScale:30},rule={rejuvScale:{slot:1,minTier:2,value:30}};
 const record={v:5,k:'bundle',d:[],p:[{id:'old',name:'Old',d:[],v2pending:pending,v2conditions:rule}],b:{v2pending:pending,v2conditions:rule}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();for(const item of [b,b.presets[0]]){assert.equal(item.settings.shared.rejuvSize,7.2);assert.equal(nativeRule(boot,item,'rejuvSize','shared').value,7.2);}}
});

for(const version of [1,2,3,4,5,6,7])for(const mode of ['load','import'])test(`v${version} unit pending promotes at v8 through ${mode}, presets/scopes and restart`,()=>{
 const pending=version%3===1?{npcEnemyEnabled:true,npcAllyEnabled:false,npcNeutralEnabled:false,buildingEnemyEnabled:false,buildingAllyEnabled:true,neutralColor:'#123456'}:
   version%3===2?{npcEnemyEnabled:true,npcAllyEnabled:true,npcNeutralEnabled:true,buildingEnemyEnabled:false,buildingAllyEnabled:false,neutralColor:'#123456'}:
     {npcEnemyEnabled:false,npcAllyEnabled:true,npcNeutralEnabled:true,buildingEnemyEnabled:true,buildingAllyEnabled:false,neutralColor:'#123456'};
 const seed=launch(profile());seed.run(2000);const scopeSettings=JSON.parse(JSON.stringify(seed.settings()));
 for(const slot of seed.harness.$.HPColorsV3Settings.slots.filter(slot=>slot.slot>=152))delete (slot.side==='shared'?scopeSettings.shared:scopeSettings.side[slot.side])[slot.setting];
 const record={v:version,k:'bundle',d:[],p:[{id:'units',name:'Units',d:[],v2pending:{...pending}}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:scopeSettings,v2pending:{...pending}}]}};
 const input=v3frame(record),p=profile(mode==='load'?{[CURRENT]:input}:{}),f=launch(p);f.run(3000);
 if(mode==='import'){paste(f,'Bundle',v3frame(record,'HPC3'));f.run(3000);}
 const check=item=>{
   expected(item.settings,version%3===1?{enemy:{objectiveEnabled:false},ally:{objectiveEnabled:true},shared:{neutralEnabled:false,neutralColor:'#123456'}}:
     version%3===2?{enemy:{objectiveEnabled:false},ally:{objectiveEnabled:false},shared:{neutralEnabled:true,neutralColor:'#123456'}}:
       {enemy:{objectiveEnabled:true},ally:{objectiveEnabled:false},shared:{neutralEnabled:true,neutralColor:'#123456'}});
   for(const key of Object.keys(pending))assert.ok(!Object.hasOwn(item.v2pending,key),key+' consumed at version boundary');
   assert.equal(Object.hasOwn(item.settings.side.enemy,'npcEnabled')||Object.hasOwn(item.settings.side.ally,'npcEnabled'),false,'Customize NPC bars was removed (2026-10-29)');
 };
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));
 for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();check(b.presets[0]);if(mode==='load'){check(b);check(b.v2scopes[0]);}}
 const saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,f.harness.$.HPColorsV3Settings.recordVersion);assert.ok(saved.d.every(value=>!Array.isArray(value)),'v8+ keeps flat sparse wire');
});
test('same-version deliberate unit defaults beat conflicting pending metadata on save and code restart',()=>{
 const pending={npcEnemyEnabled:true,npcAllyEnabled:false,npcNeutralEnabled:true,buildingEnemyEnabled:false,buildingAllyEnabled:true,neutralColor:'#123456'};
 const seed=launch(profile());seed.run(2000);const s=JSON.parse(JSON.stringify(seed.settings()));
 // Current record version: v8 unit slots existed, so pending never promotes into them.
 const record={v:seed.harness.$.HPColorsV3Settings.recordVersion,k:'bundle',d:[],p:[{id:'units',name:'Units',d:[],v2pending:{...pending}}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:s,v2pending:{...pending}}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 const check=item=>{
   expected(item.settings,{enemy:{objectiveEnabled:false},ally:{objectiveEnabled:false},shared:{neutralEnabled:false,neutralColor:'#5BEFB5'}});
   assert.deepEqual(JSON.parse(JSON.stringify(item.v2pending)),pending,'same-version pending cannot overwrite deliberate v3 slots');
 };
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);
 f.edit('#654321');f.run(3000);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();for(const item of [b,b.presets[0],b.v2scopes[0]])check(item);}
});
for(const version of [1,2,3,4,5,6,7,8])for(const mode of ['load','import'])test(`ticket 19: v${version} bar-style pending promotes at v9 through ${mode}, presets/scopes and restart`,()=>{
 const pending=version%2?{barMask:'old',nameRiseWithPips:false}:{barMask:'original',nameRiseWithPips:false};
 const seed=launch(profile());seed.run(2000);const scopeSettings=JSON.parse(JSON.stringify(seed.settings()));
 for(const slot of seed.harness.$.HPColorsV3Settings.slots.filter(slot=>slot.slot>=158))delete scopeSettings.shared[slot.setting];
 const record={v:version,k:'bundle',d:[],p:[{id:'style',name:'Style',d:[],v2pending:{...pending}}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:scopeSettings,v2pending:{...pending}}]}};
 const p=profile(mode==='load'?{[CURRENT]:v3frame(record)}:{}),f=launch(p);f.run(3000);
 if(mode==='import'){paste(f,'Bundle',v3frame(record,'HPC3'));f.run(3000);}
 const check=item=>{
   expected(item.settings,{shared:{barStyle:pending.barMask,nameRiseWithPips:false}});
   for(const key of Object.keys(pending))assert.ok(!Object.hasOwn(item.v2pending||{},key),key+' consumed at the v9 boundary');
 };
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));
 for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();check(b.presets[0]);if(mode==='load'){check(b);check(b.v2scopes[0]);}}
 const saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,f.harness.$.HPColorsV3Settings.recordVersion);assert.ok(saved.d.every(value=>!Array.isArray(value)),'flat sparse wire');
});
test('ticket 19: current-version deliberate bar-style defaults beat same-version pending; saves stay sparse',()=>{
 const pending={barMask:'old',nameRiseWithPips:false};
 const seed=launch(profile());seed.run(2000);const s=JSON.parse(JSON.stringify(seed.settings()));
 const record={v:seed.harness.$.HPColorsV3Settings.recordVersion,k:'bundle',d:[],p:[{id:'style',name:'Style',d:[],v2pending:{...pending}}],b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:s,v2pending:{...pending}}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 const check=item=>{expected(item.settings,{shared:{barStyle:'none',nameRiseWithPips:true}});assert.deepEqual(JSON.parse(JSON.stringify(item.v2pending)),pending);};
 const b=f.harness.$.HPColorsV3Store.getBundle();for(const item of [b,b.presets[0],b.v2scopes[0]])check(item);
 // Defaults are not emitted: only an explicit change adds the two new slots to the sparse wire.
 const slots=f.harness.$.HPColorsV3Settings.slots.filter(slot=>slot.slot>=158).map(slot=>slot.slot);
 f.edit('#654321');f.run(3000);
 const saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,f.harness.$.HPColorsV3Settings.recordVersion);for(let i=0;i<saved.d.length;i+=2)assert.ok(!slots.includes(saved.d[i]),'default bar style is sparse');
});

// Ticket 20: shake and tilt slots (record v10). Older v3 records promote retained v2 pending at the
// v10 boundary; records without pending take the new defaults (level names, native shake).
const shakeTiltPending=[{damageShakeEnabled:false,damageShakeIntensity:7,nameTilt:-25,readoutTilt:40,allyReadoutTilt:-55},
  {damageShakeEnabled:true,damageShakeIntensity:9,nameTilt:33,readoutTilt:-12,allyReadoutTilt:270}];
function shakeTiltExpected(v){return {enemy:{hpTextTilt:v.readoutTilt},ally:{hpTextTilt:v.allyReadoutTilt},shared:{damageShakeEnabled:v.damageShakeEnabled,damageShakeStrength:v.damageShakeIntensity,nameTilt:v.nameTilt}};}
function withoutShakeTilt(settings,contract){
 const copy=JSON.parse(JSON.stringify(settings));
 for(const slot of contract.slots.filter(slot=>slot.slot>=160))delete (slot.side==='shared'?copy.shared:copy.side[slot.side])[slot.setting];
 return copy;
}
for(const version of [1,2,3,4,5,6,7,8,9])for(const mode of ['load','import'])test(`ticket 20: v${version} shake/tilt pending promotes at v10 through ${mode}, presets/scopes and restart`,()=>{
 const pending=shakeTiltPending[version%2];
 const seed=launch(profile());seed.run(2000);const contract=seed.harness.$.HPColorsV3Settings;
 const scopeSettings=withoutShakeTilt(seed.settings(),contract);
 const record={v:version,k:'bundle',d:[],p:[{id:'tilt',name:'Tilt',d:[],v2pending:{...pending}},{id:'plain',name:'Plain',d:[]}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:scopeSettings,v2pending:{...pending}}]}};
 const p=profile(mode==='load'?{[CURRENT]:v3frame(record)}:{}),f=launch(p);f.run(3000);
 if(mode==='import'){paste(f,'Bundle',v3frame(record,'HPC3'));f.run(3000);}
 const check=item=>{
   expected(item.settings,shakeTiltExpected(pending));
   for(const key of Object.keys(pending))assert.ok(!Object.hasOwn(item.v2pending||{},key),key+' consumed at the v10 boundary');
 };
 const plain=item=>expected(item.settings,{enemy:{hpTextTilt:0},ally:{hpTextTilt:0},shared:{damageShakeEnabled:true,damageShakeStrength:3,nameTilt:0}});
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));
 for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);plain(imported.presets[1]);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();check(b.presets[0]);plain(b.presets[1]);if(mode==='load'){check(b);check(b.v2scopes[0]);}}
 const saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,contract.recordVersion);assert.ok(saved.d.every(value=>!Array.isArray(value)),'flat sparse wire');
});
test('ticket 20: current-version shake/tilt defaults beat same-version pending and stay out of the sparse wire',()=>{
 const pending=shakeTiltPending[0];
 const seed=launch(profile());seed.run(2000);const contract=seed.harness.$.HPColorsV3Settings;const s=JSON.parse(JSON.stringify(seed.settings()));
 const record={v:contract.recordVersion,k:'bundle',d:[],p:[{id:'tilt',name:'Tilt',d:[],v2pending:{...pending}}],b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:s,v2pending:{...pending}}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 const b=f.harness.$.HPColorsV3Store.getBundle();
 for(const item of [b,b.presets[0],b.v2scopes[0]]){
   expected(item.settings,{enemy:{hpTextTilt:0},ally:{hpTextTilt:0},shared:{damageShakeEnabled:true,damageShakeStrength:3,nameTilt:0}});
   assert.deepEqual(JSON.parse(JSON.stringify(item.v2pending)),pending);
 }
 const slots=contract.slots.filter(slot=>slot.slot>=160&&slot.slot<=164).map(slot=>slot.slot);
 assert.deepEqual([...slots].sort((a,b)=>a-b),[160,161,162,163,164]);
 f.edit('#654321');f.run(3000);
 let saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,contract.recordVersion);for(let i=0;i<saved.d.length;i+=2)assert.ok(!slots.includes(saved.d[i]),'default shake/tilt are sparse');
 // A deliberate change is one flat slot/value pair that survives restart.
 f.harness.contextPanel.FindChildTraverse(contract.controls.find(r=>r.key==='nameTilt').entryId).text='-90';
 f.harness.contextPanel.FindChildTraverse(contract.controls.find(r=>r.key==='nameTilt').entryId).events.ontextentrysubmit();f.run(3000);
 saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 const at=saved.d.indexOf(162);assert.ok(at>=0&&at%2===0);assert.equal(saved.d[at+1],-90);
 const again=launch(p);again.run(3000);assert.equal(again.settings().shared.nameTilt,-90);
});

// Ticket 22: own bottom-HUD health color slots (record v11). Older v3 records promote retained v2
// pending at the v11 boundary; records without pending take the v2 defaults (OFF, #FFFF00).
const ownHudPending=[{hudHealthColorMode:'team',hudHealthColor:'#2468AC'},{hudHealthColorMode:'custom',hudHealthColor:'#FEDCBA'}];
function ownHudExpected(v){return {shared:{hudHealthColorMode:v.hudHealthColorMode,hudHealthColor:v.hudHealthColor}};}
function withoutOwnHud(settings,contract){
 const copy=JSON.parse(JSON.stringify(settings));
 for(const slot of contract.slots.filter(slot=>slot.slot>=165&&slot.slot<=166))delete (slot.side==='shared'?copy.shared:copy.side[slot.side])[slot.setting];
 return copy;
}
for(const version of [1,2,3,4,5,6,7,8,9,10])for(const mode of ['load','import'])test(`ticket 22: v${version} own-HUD pending promotes at v11 through ${mode}, presets/scopes and restart`,()=>{
 const pending=ownHudPending[version%2];
 const seed=launch(profile());seed.run(2000);const contract=seed.harness.$.HPColorsV3Settings;
 assert.ok(contract.recordVersion>=11);
 const scopeSettings=withoutOwnHud(seed.settings(),contract);
 const record={v:version,k:'bundle',d:[],p:[{id:'hud',name:'Hud',d:[],v2pending:{...pending}},{id:'plain',name:'Plain',d:[]}],
   b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:scopeSettings,v2pending:{...pending}}]}};
 const p=profile(mode==='load'?{[CURRENT]:v3frame(record)}:{}),f=launch(p);f.run(3000);
 if(mode==='import'){paste(f,'Bundle',v3frame(record,'HPC3'));f.run(3000);}
 const check=item=>{
   expected(item.settings,ownHudExpected(pending));
   for(const key of Object.keys(pending))assert.ok(!Object.hasOwn(item.v2pending||{},key),key+' consumed at the v11 boundary');
 };
 const plain=item=>expected(item.settings,{shared:{hudHealthColorMode:'off',hudHealthColor:'#FFFF00'}});
 const imported=f.harness.$.HPColorsV3Store.decodeBundleCode(v3frame(record,'HPC3'));
 for(const item of [imported,imported.presets[0],imported.v2scopes[0]])check(item);plain(imported.presets[1]);
 for(const boot of [f,launch(p)]){boot.run(3000);const b=boot.harness.$.HPColorsV3Store.getBundle();check(b.presets[0]);plain(b.presets[1]);if(mode==='load'){check(b);check(b.v2scopes[0]);}}
 const saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,contract.recordVersion);assert.ok(saved.d.every(value=>!Array.isArray(value)),'flat sparse wire');
});
test('ticket 22: current-version own-HUD defaults beat same-version pending, stay sparse, and a change is one flat pair',()=>{
 const pending=ownHudPending[0];
 const seed=launch(profile());seed.run(2000);const contract=seed.harness.$.HPColorsV3Settings;const s=JSON.parse(JSON.stringify(seed.settings()));
 const record={v:contract.recordVersion,k:'bundle',d:[],p:[{id:'hud',name:'Hud',d:[],v2pending:{...pending}}],b:{v2pending:{...pending},v2scopes:[{mode:'all',heroes:[],settings:s,v2pending:{...pending}}]}};
 const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
 const b=f.harness.$.HPColorsV3Store.getBundle();
 for(const item of [b,b.presets[0],b.v2scopes[0]]){
   expected(item.settings,{shared:{hudHealthColorMode:'off',hudHealthColor:'#FFFF00'}});
   assert.deepEqual(JSON.parse(JSON.stringify(item.v2pending)),pending);
 }
 const slots=contract.slots.filter(slot=>slot.setting==='hudHealthColorMode'||slot.setting==='hudHealthColor').map(slot=>slot.slot);
 assert.deepEqual([...slots].sort((a,b)=>a-b),[165,166]);
 f.edit('#654321');f.run(3000);
 let saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 assert.equal(saved.v,contract.recordVersion);for(let i=0;i<saved.d.length;i+=2)assert.ok(!slots.includes(saved.d[i]),'default own-HUD color is sparse');
 // The custom color is usable only in Custom mode (dependent rows, 2026-10-28).
 const mode=contract.controls.find(r=>r.key==='hudHealthColorMode');
 f.harness.contextPanel.FindChildTraverse(mode.options.find(o=>o.value==='custom').id).events.onactivate();
 const hex=f.harness.contextPanel.FindChildTraverse(contract.controls.find(r=>r.key==='hudHealthColor').hexId);
 hex.text='#0A0B0C';hex.events.ontextentrysubmit();f.run(3000);
 saved=JSON.parse(Buffer.from(p.disk.get(CURRENT).split('.')[2],'base64url').toString());
 const at=saved.d.indexOf(166);assert.ok(at>=0&&at%2===0);assert.equal(saved.d[at+1],'#0A0B0C');
 const again=launch(p);again.run(3000);assert.equal(again.settings().shared.hudHealthColor,'#0A0B0C');
});

const labelValues={criticalIndicatorVisible:false,criticalOffsetX:37,criticalOffsetY:-21,assassinateOffsetX:-43,assassinateOffsetY:19};
const labelDefaults={criticalIndicatorVisible:true,assassinateIndicatorVisible:true,unkillableIndicatorVisible:true,
 criticalOffsetX:0,criticalOffsetY:0,assassinateOffsetX:0,assassinateOffsetY:0,unkillableOffsetX:0,unkillableOffsetY:0};
test('ticket 28: v2 label keys import once through menu/save/restart without scaling',()=>{
 const p=profile(),f=launch(p);f.run(2000);
 const values=Object.entries(labelValues).map(([key,value])=>[legacy.extensionKeys.indexOf(key),value]);
 paste(f,'Settings','HPCR2'+JSON.stringify({v:[],c:{},hpv2:{v:2,values,conditions:{}}}));f.run(3000);
 expected(f.settings(),{shared:{...labelDefaults,...labelValues}});
 const b=f.harness.$.HPColorsV3Store.getBundle();
 for(const key of Object.keys(labelValues))assert.equal(Object.hasOwn(b.v2pending||{},key),false,key+' consumed');
 const saved=p.disk.get(CURRENT),again=launch(p);again.run(3000);
 expected(again.settings(),{shared:{...labelDefaults,...labelValues}});assert.equal(p.disk.get(CURRENT),saved);
});
test('ticket 28: v12 records without label slots load native defaults and promote old pending once',()=>{
 for(const pending of [{},labelValues]){
  const record={v:12,k:'bundle',d:[],p:[{id:'labels',name:'Labels',d:[],v2pending:{...pending}}],b:{v2pending:{...pending}}};
  const p=profile({[CURRENT]:v3frame(record)}),f=launch(p);f.run(3000);
  const b=f.harness.$.HPColorsV3Store.getBundle();
  for(const item of [b,b.presets[0]]){
   expected(item.settings,{shared:{...labelDefaults,...pending}});
   for(const key of Object.keys(labelValues))assert.equal(Object.hasOwn(item.v2pending||{},key),false);
  }
  f.edit('#123456');f.run(3000);const again=launch(p);again.run(3000);
  expected(again.settings(),{shared:{...labelDefaults,...pending}});
 }
});
test('ticket 28: v13 sparse label slots round-trip and beat same-version pending',()=>{
 const seed=launch(profile());seed.run(2000);
 const contract=seed.harness.$.HPColorsV3Settings,slots=contract.slots.filter(slot=>slot.slot>=167&&slot.slot<=175);
 assert.equal(contract.recordVersion,23,'v13 label slots stay in later record versions');
 assert.deepEqual(Array.from(slots,slot=>[slot.slot,slot.setting]),[
  [167,'criticalIndicatorVisible'],[168,'criticalOffsetX'],[169,'criticalOffsetY'],
  [170,'assassinateIndicatorVisible'],[171,'assassinateOffsetX'],[172,'assassinateOffsetY'],
  [173,'unkillableIndicatorVisible'],[174,'unkillableOffsetX'],[175,'unkillableOffsetY']]);
 // Same-version pending: the record carries the current record version (v13 when ticket 28 landed).
 const body={v:contract.recordVersion,k:'bundle',d:[170,false,174,-200,175,210],p:[],b:{v2pending:{...labelValues}}};
 const p=profile({[CURRENT]:v3frame(body)}),f=launch(p);f.run(3000);
 expected(f.settings(),{shared:{...labelDefaults,assassinateIndicatorVisible:false,unkillableOffsetX:-200,unkillableOffsetY:210}});
 f.edit('#654321');f.run(3000);
 const b=f.harness.$.HPColorsV3Store.getBundle();
 assert.deepEqual(JSON.parse(JSON.stringify(b.v2pending)),labelValues,'same-version pending stays nonauthoritative under the existing record contract');
 const again=launch(p);again.run(3000);
 expected(again.settings(),{shared:{...labelDefaults,assassinateIndicatorVisible:false,unkillableOffsetX:-200,unkillableOffsetY:210}});
});
