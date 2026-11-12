'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {profile,launch,CURRENT,PREVIOUS}=require('./storage-fixture');
function frame(codec,body,tag='HPV2S1'){const payload=Buffer.from(JSON.stringify(body)).toString('base64url');return tag+'.'+codec.checksum(payload)+'.'+payload;}
function body(code){return JSON.parse(Buffer.from(code.split('.')[2],'base64url'));}
function paste(f,kind,code){const root=f.harness.contextPanel;root.FindChildTraverse('HPColors'+kind+'CodeEntry').text=code;root.FindChildTraverse('HPColors'+kind+'ImportButton').events.onactivate();}
for(const mutate of [r=>r.d.push([10000,true]),r=>r.d.push([25,1000])])test('same-version newer schema stays readonly and imports known values',()=>{
 const p=profile();const seed=launch(p);seed.run(2000);const record=body(seed.codec.encodeRecord({settings:seed.settings(),presets:[]}));record.d.push([3,'#ABCDEF']);mutate(record);const encoded=frame(seed.codec,record);p.disk.set(CURRENT,encoded);p.disk.set(PREVIOUS,seed.codec.encodeRecord({settings:seed.settings(),presets:[]}));const f=launch(p);f.run(2000);assert.equal(f.settings().side.enemy.barColorLow,'#ABCDEF');assert.match(f.status(),/newer version/);f.edit('#123456');f.run(4000);assert.equal(p.disk.get(CURRENT),encoded);const result=f.harness.$.HPColorsV3Sharing.importBundleCode(frame(f.codec,record,'HPC3'));assert.equal(result.ok,true);assert.match(result.message,/newer version/);assert.equal(result.settings.side.enemy.barColorLow,'#ABCDEF');
});
test('HPC3 and HPCRP1 imports append fresh identities without applying current settings',()=>{
 const p=profile();const f=launch(p);f.run(2000);const store=f.harness.$.HPColorsV3Store;let initial=store.getBundle();initial.settings.side.enemy.barColorLow='#112233';initial.presets=[{id:'mine',name:'Mine',settings:initial.settings,v2pending:{pipsVisible:false}}];store.replaceBundle(initial);f.run(2000);const incoming=store.getBundle();incoming.settings.side.enemy.barColorLow='#AABBCC';incoming.presets=[{id:'mine',name:'Friend',settings:incoming.settings,v2pending:{pipsVisible:true}}];const code=f.harness.$.HPColorsV3Sharing.exportBundleCode(incoming).code;
 paste(f,'Bundle',code);f.run(2000);let b=store.getBundle();assert.equal(b.presets.length,2);assert.equal(b.presets[0].id,'mine');assert.notEqual(b.presets[1].id,'mine');assert.equal(b.settings.side.enemy.barColorLow,'#112233');assert.equal(b.presets[1].settings.side.enemy.barColorLow,'#AABBCC');
 const v2='HPCRP1'+JSON.stringify({records:[{id:'user_0001',kind:'user',name:'V2 friend',mode:'all',heroes:[],values:[],conditions:null}]});paste(f,'Bundle',v2);f.run(2000);b=store.getBundle();assert.equal(b.presets.length,3);assert.equal(b.settings.side.enemy.barColorLow,'#112233');assert.notEqual(b.presets[2].id,'user_0001');const again=launch(p);again.run(2000);assert.equal(again.harness.$.HPColorsV3Store.getBundle().presets.length,3);
});
for(const state of ['loading','unreadable','readonly'])test('append import refuses '+state+' atomically',()=>{
 const p=profile();const seed=launch(p);seed.run(2000);const b=seed.harness.$.HPColorsV3Store.getBundle();b.presets=[{id:'incoming',name:'Incoming',settings:b.settings}];const code=seed.harness.$.HPColorsV3Sharing.exportBundleCode(b).code;
 if(state==='unreadable')p.disk.set(CURRENT,'broken');if(state==='readonly'){const r=body(seed.codec.encodeRecord(b));r.v++;p.disk.set(CURRENT,frame(seed.codec,r));}const f=launch(p,{navLatencySec:state==='loading'?3:0.8});f.run(state==='loading'?100:2000);const before=JSON.stringify(f.harness.$.HPColorsV3Store.getBundle());assert.throws(()=>f.harness.$.HPColorsV3Store.importBundleCode(code),/loading|reset|newer version/i);assert.equal(JSON.stringify(f.harness.$.HPColorsV3Store.getBundle()),before);
});
test('pre-hydration HPCR2 preserves pending values and conditions through restore/restart',()=>{
 const p=profile();const seed=launch(p);seed.run(2000);p.disk.set(CURRENT,seed.codec.encodeRecord({settings:seed.settings(),presets:[]}));const f=launch(p,{navLatencySec:3});f.run(100);const index=require('./fixtures/v2-contract.json').codecKeys.indexOf('pipsVisible');paste(f,'Settings','HPCR2'+JSON.stringify({v:[[index,false]],c:{pipsVisible:{slot:1,minTier:2,value:false}}}));f.run(6000);const b=f.harness.$.HPColorsV3Store.getBundle(),cell=f.harness.$.HPColorsV3Settings.slots.find(slot=>slot.setting==='linesVisible'&&slot.side==='enemy').slot;assert.equal(b.settings.side.enemy.linesVisible,false);assert.equal(b.rules[cell].value,false);assert.equal(b.v2conditions,undefined);const again=launch(p);again.run(2000);assert.equal(again.harness.$.HPColorsV3Store.getBundle().rules[cell].value,false);
});
test('settings edits never encode; explicit preset mutation encodes once',()=>{
 const p=profile();const f=launch(p);f.run(2000);const old=f.harness.$.HPColorsV3Codec;let count=0;f.harness.$.HPColorsV3Codec={...old,encodeRecord(b){count++;return old.encodeRecord(b);}};
 f.edit('#123456');assert.equal(count,0);f.run(2000);assert.equal(count,1,'flush encodes once');
 count=0;const b=f.harness.$.HPColorsV3Store.getBundle();b.presets.push({id:'new',name:'New',settings:b.settings});f.harness.$.HPColorsV3Store.replaceBundle(b);assert.equal(count,1,'preset mutation checks size once');f.run(2000);assert.equal(count,2,'one validation and one durable encoding');
});
test('connection recreation registers one router per event/panel',()=>{
 const p=profile();const f=launch(p);f.run(2000);const panel=f.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel');let bridge=f.harness.$.HPColorsV3StorageFactory.create({panel});for(let i=0;i<4;i++){bridge.start();bridge.dispose();bridge=bridge.recreate();}for(const event of ['HTMLTitle','HTMLURLChanged'])assert.equal(f.harness.handlerEntries.filter(x=>x.panel===panel&&x.eventName===event).length,1);
});

test('valid legacy converter failure is not corruption or reset permission',()=>{
 const input=require('./fixtures/v2-migration.json')[4].input,p=profile({'hantu.hpcolors.v2/state':input}),f=launch(p),old=f.harness.$.HPColorsV3Codec;
 f.harness.$.HPColorsV3Codec={...old,encodeRecord(){throw new Error('Save exceeds 192,000 characters; remove some presets');}};
 f.run(4000);assert.match(f.status(),/V2 save could not be converted.*192,000/);assert.equal(f.page.writes,0);assert.equal(f.harness.$.HPColorsV3Store.resetUnreadableSave(true),false);assert.equal(p.disk.get('hantu.hpcolors.v2/state'),input);
});
test('append cap refusal preserves library and active draft',()=>{
 const p=profile(),f=launch(p);f.run(2000);const store=f.harness.$.HPColorsV3Store,b=store.getBundle();b.presets=Array.from({length:128},(_,i)=>({id:'mine-'+i,name:'Mine '+i,settings:b.settings}));store.replaceBundle(b);const before=JSON.stringify(store.getBundle());const code=f.harness.$.HPColorsV3Sharing.exportBundleCode({settings:b.settings,presets:[{id:'friend',name:'Friend',settings:b.settings}]}).code;assert.throws(()=>store.importBundleCode(code),/128/);assert.equal(JSON.stringify(store.getBundle()),before);
});
test('append durable size refusal preserves library, metadata and active draft',()=>{
 const p=profile(),f=launch(p);f.run(2000);const store=f.harness.$.HPColorsV3Store,b=store.getBundle();b.padding='x'.repeat(141000);b.presets=[{id:'mine',name:'Mine',settings:b.settings}];store.replaceBundle(b);f.run(8000);const saved=p.disk.get(CURRENT);assert.ok(saved.length<192000);
 f.edit('#123456');const before=JSON.stringify(store.getBundle());const incoming={settings:b.settings,presets:Array.from({length:100},(_,i)=>({id:'friend-'+i,name:'x'.repeat(48),settings:b.settings}))};const exported=f.harness.$.HPColorsV3Sharing.exportBundleCode(incoming);assert.equal(exported.ok,true);
 assert.throws(()=>store.importBundleCode(exported.code),/192,000/);assert.equal(JSON.stringify(store.getBundle()),before);assert.equal(p.disk.get(CURRENT),saved);f.run(8000);const again=launch(p);again.run(8000);assert.equal(again.settings().side.enemy.barColorLow,'#123456');assert.equal(again.harness.$.HPColorsV3Store.getBundle().presets.length,1);
});
test('vendored hosted fixture rejects modified bytes and has no external checkout dependency',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hpv3-store-pin-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.copyFileSync(path.join(__dirname,'../vendor/hpv2-store.pin.json'),path.join(dir,'hpv2-store.pin.json'));fs.writeFileSync(path.join(dir,'hpv2-store.js'),'corrupt');
 const result=spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'storage-fixture.js'))})`],{encoding:'utf8',env:{...process.env,HPV3_STORE_VENDOR_ROOT:dir}});assert.notEqual(result.status,0);assert.match(result.stderr,/Pinned hosted page mismatch/);
 const missing=spawnSync(process.execPath,['--test-reporter=tap','-e',`const fs=require('node:fs'),old=fs.existsSync;fs.existsSync=p=>p==='D:/hpv2-store'?false:old(p);require(${JSON.stringify(path.join(__dirname,'store-page.test.js'))});`],{encoding:'utf8',env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='NODE_TEST_CONTEXT'))});assert.equal(missing.status,0);assert.match(missing.stdout,/SKIP D:\/hpv2-store checkout absent/);assert.match(missing.stdout,/# skipped 26/);assert.match(missing.stdout,/# pass 0/);
});

test('audit A1: a newer save discovered by CAS keeps the complete local draft exportable and read-only',()=>{
 const p=profile(),f=launch(p);f.run(3000);const store=f.harness.$.HPColorsV3Store;
 const remote=body(f.codec.encodeRecord(store.getBundle()));remote.v++;remote.d.push([3,'#ABCDEF']);
 const bundle=store.getBundle();bundle.presets.push({id:'local-draft',name:'Local draft',settings:bundle.settings});store.replaceBundle(bundle);
 f.edit('#123456');const draft=JSON.stringify(store.getBundle()),future=frame(f.codec,remote);p.disk.set(CURRENT,future);
 f.run(12000);assert.match(f.status(),/newer version/);assert.equal(JSON.stringify(store.getBundle()),draft,'newer data cannot replace an outstanding draft');
 const root=f.harness.contextPanel;root.FindChildTraverse('HPColorsBundleCopyButton').events.onactivate();
 const code=root.FindChildTraverse('HPColorsBundleCodeEntry').text,decoded=store.decodeBundleCode(code);
 assert.equal(decoded.settings.side.enemy.barColorLow,'#123456');assert.equal(decoded.presets[0].id,'local-draft');
 assert.equal(p.disk.get(CURRENT),future);const writes=f.page.writes;f.edit('#654321');f.run(12000);
 assert.equal(f.page.writes,writes,'readonly refuses further writes');assert.equal(p.disk.get(CURRENT),future);
 f.reload();f.run(5000);assert.equal(f.settings().side.enemy.barColorLow,'#654321','reload handoff retains pending settings');
 assert.equal(f.harness.$.HPColorsV3Store.getBundle().presets[0].id,'local-draft');assert.equal(p.disk.get(CURRENT),future);
});
