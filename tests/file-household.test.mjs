import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFileHousehold, FILE_HOUSEHOLD_KEY, validateHouseholdFile } from '../public/core/file-household.js';
import { loadStartupState } from '../public/core/startup.js';
import { generatePlan } from '../public/core/planner.js';
import { CATEGORIES } from '../public/core/catalog.js';
const prices=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url))).prices;
const settings={month:'2026-10',budget:8000,household:2,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[]};
const initial=()=>({version:1,profileVersion:2,settings,months:{'2026-10':{settings,prices,plan:generatePlan(settings,prices),spend:{}}},overrides:{},pantry:{},locationOverrides:{}});
function memory(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
function device(storage=memory(),state=initial()){
 const context={storage,state:structuredClone(state)};
 context.manager=createFileHousehold({storage,getState:()=>context.state,applyState:data=>{context.state=structuredClone(data);}});return context;
}
function pair(){const a=device(),b=device();a.manager.create({name:'Alex',householdName:'Our home'});b.manager.importFile(a.manager.exportFile(),'Sam');return {a,b};}
test('household files join without accounts, network requests or timers and omit credentials',()=>{
 const {a,b}=pair(),file=a.manager.exportFile();
 assert.equal(b.manager.status().snapshot.name,'Our home');assert.equal(b.manager.status().snapshot.members.length,2);
 assert.equal(a.manager.status().phase,'local');assert.equal(b.manager.status().fileMode,true);
 assert.doesNotMatch(JSON.stringify(file),/credentials|token|priceData|priceFile/);
 assert.equal(file.kind,'vaind-household-file');assert.equal(file.version,1);
});
test('phone file exchange merges independent meal spending and pantry edits over several rounds',()=>{
 const {a,b}=pair();
 a.state.months['2026-10'].spend['2026-10-01/lunch']=50;b.state.months['2026-10'].spend['2026-10-01/dinner']=75;
 a.state.pantry.egg=3;b.state.pantry.chicken=1;
 a.manager.importFile(b.manager.exportFile());b.manager.importFile(a.manager.exportFile());
 assert.deepEqual(b.state.months['2026-10'].spend,{'2026-10-01/lunch':50,'2026-10-01/dinner':75});
 assert.deepEqual(a.state,b.state);assert.deepEqual(b.state.pantry,{egg:3,chicken:1});
 b.state.pantry.chicken=2;b.manager.changed();a.manager.importFile(b.manager.exportFile());
 a.state.pantry.egg=4;b.manager.importFile(a.manager.exportFile());assert.deepEqual(b.state.pantry,{egg:4,chicken:2});
});
test('same-item conflicts retain current data, survive repeated imports and allow explicit replacement',()=>{
 const {a,b}=pair();a.state.pantry.egg=2;b.state.pantry.egg=4;const file=b.manager.exportFile(),before=structuredClone(a.state);
 assert.throws(()=>a.manager.importFile(file),/householdFileConflict/);assert.deepEqual(a.state,before);assert.equal(a.manager.status().phase,'conflict');
 assert.equal(a.manager.exportFile().state.pantry.egg,2);a.manager.useShared();assert.equal(a.state.pantry.egg,4);assert.equal(a.manager.status().phase,'local');
 assert.throws(()=>a.manager.importFile(file),/householdOldFile/);
});
test('invalid, foreign, own and stale household files cannot replace current data',()=>{
 const {a,b}=pair(),file=a.manager.exportFile(),before=structuredClone(b.state);
 const invalid=structuredClone(file);invalid.state.months['2026-10'].plan.meals[0].cost=1;
 assert.throws(()=>b.manager.importFile(invalid),/invalidHouseholdFile/);
 const over=structuredClone(file);over.state.months['2026-10'].settings.budget=3000;assert.throws(()=>b.manager.importFile(over),/invalidHouseholdFile/);
 const c=device();c.manager.create({name:'Jo',householdName:'Other home'});assert.throws(()=>b.manager.importFile(c.manager.exportFile()),/householdDifferent/);
 assert.throws(()=>a.manager.importFile(file),/householdOwnFile/);
 b.manager.importFile(file);assert.throws(()=>b.manager.importFile(file),/householdOldFile/);
 assert.deepEqual(b.state,before);assert.throws(()=>validateHouseholdFile({...file,sequence:-1}),/invalidHouseholdFile/);
 const extra=structuredClone(file);extra.state.priceData={untrusted:true};assert.equal(validateHouseholdFile(extra).state.priceData,undefined);
});
test('device recovery restores local household edits without contacting another device',()=>{
 const {a}=pair();a.state.pantry.egg=7;a.manager.changed();a.storage.setItem('vaind:v1','broken JSON');
 const recovered=loadStartupState(a.storage);assert.equal(recovered.error,'fileCacheRecovered');assert.equal(recovered.recovered,true);assert.equal(recovered.data.pantry.egg,7);
 const reopened=device(a.storage,recovered.data);assert.equal(reopened.manager.status().phase,'local');assert.equal(reopened.manager.exportFile().state.pantry.egg,7);
});
test('leaving keeps the household recovery copy and restores the previous personal plan',()=>{
 const a=device(),b=device();b.state.pantry.egg=9;a.manager.create({name:'Alex',householdName:'Our home'});b.manager.importFile(a.manager.exportFile(),'Sam');
 b.state.pantry.egg=4;b.manager.disconnectLocal();assert.equal(b.state.pantry.egg,9);assert.equal(b.manager.disconnectedBackup().pantry.egg,4);assert.equal(b.storage.getItem(FILE_HOUSEHOLD_KEY),null);assert.equal(b.manager.status().connected,false);
});
test('storage failures on importing and leaving retain the current household and plans',()=>{
 const {a,b}=pair();b.state.pantry.egg=4;const file=b.manager.exportFile(),oldSession=a.storage.getItem(FILE_HOUSEHOLD_KEY),oldState=structuredClone(a.state);
 const blocked={...a.storage,setItem:()=>{throw new Error('quota');}},manager=device(blocked,a.state).manager;
 assert.throws(()=>manager.importFile(file),/storageUnavailable/);assert.deepEqual(a.state,oldState);assert.equal(a.storage.getItem(FILE_HOUSEHOLD_KEY),oldSession);
 assert.throws(()=>manager.disconnectLocal(),/storageUnavailable/);assert(manager.status().connected);assert.equal(a.storage.getItem(FILE_HOUSEHOLD_KEY),oldSession);
});
