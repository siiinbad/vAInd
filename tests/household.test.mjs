import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHouseholdStore } from '../server/households.mjs';
import { sharedState, mergeSharedState, validateSharedState } from '../public/core/household.js';
import { createHouseholdSync, HOUSEHOLD_KEY, PERSONAL_KEY, DISCONNECTED_KEY } from '../public/core/household-sync.js';
import { loadStartupState } from '../public/core/startup.js';
import { RECOVERY_KEY } from '../public/core/storage.js';
import { CATEGORIES } from '../public/core/catalog.js';
import { generatePlan } from '../public/core/planner.js';

const prices=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url))).prices;
const settings={month:'2026-10',budget:8000,household:2,excludeVegetableMains:false,excludeMonggo:false,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[]};
const initial=()=>({version:1,profileVersion:2,settings:structuredClone(settings),months:{'2026-10':{settings:structuredClone(settings),prices:structuredClone(prices),plan:generatePlan(settings,prices),spend:{}}},overrides:{},locationOverrides:{},pantry:{}});
const auth=credentials=>`Bearer ${credentials.id}.${credentials.token}`;
async function fixture(run){const directory=await mkdtemp(path.join(os.tmpdir(),'vaind-household-'));try{await run(createHouseholdStore({directory}),directory);}finally{await rm(directory,{recursive:true,force:true});}}
const create=store=>store.create({name:'Alex',householdName:'Our home',state:initial()});

test('household invites connect separate members; persisted membership tokens are hashed and private',()=>fixture(async(store,directory)=>{
 const owner=await create(store),partner=await store.join({name:'Sam',code:owner.snapshot.inviteCode.toLowerCase().match(/.{4}/g).join('-')});
 const snapshot=await store.read(auth(owner.credentials));assert.equal(snapshot.members.length,2);assert.equal(snapshot.members[1].name,'Sam');
 assert.equal(partner.snapshot.id,owner.snapshot.id);assert(!JSON.stringify(snapshot).includes('token'));
 const saved=await readFile(path.join(directory,'households.json'),'utf8');assert(!saved.includes(owner.credentials.token));assert(!saved.includes(partner.credentials.token));
 assert.equal((await stat(path.join(directory,'households.json'))).mode&0o777,0o600);
 assert.deepEqual((await createHouseholdStore({directory}).read(auth(partner.credentials))).state,snapshot.state);
 await assert.rejects(()=>store.read(),e=>e.status===401);
 await assert.rejects(()=>store.read(auth({...owner.credentials,token:'a'.repeat(43)})),e=>e.status===401);
}));
test('invite rotation and expiry prevent joining with old codes; leaving revokes only that member',()=>fixture(async(store)=>{
 const a=await create(store),b=await store.join({name:'Sam',code:a.snapshot.inviteCode});
 const rotated=await store.rotate(auth(a.credentials));assert.notEqual(rotated.inviteCode,a.snapshot.inviteCode);
 await assert.rejects(()=>store.join({name:'Not invited',code:a.snapshot.inviteCode}),e=>e.code==='invalidInvite');
 await store.leave(auth(b.credentials));await assert.rejects(()=>store.read(auth(b.credentials)),e=>e.status===401);
 assert.equal((await store.read(auth(a.credentials))).members.length,1);
}));
test('expired invites reject new members without erasing existing household data',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vaind-invite-'));let now=Date.UTC(2026,9,21);
 try{const store=createHouseholdStore({directory,now:()=>now}),owner=await create(store);now+=8*86400000;
  await assert.rejects(()=>store.join({name:'Sam',code:owner.snapshot.inviteCode}),e=>e.code==='invalidInvite');
  assert.equal((await store.read(auth(owner.credentials))).state.months['2026-10'].plan.meals.length,71);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('revision checks prevent a concurrent stale write from overwriting another member',()=>fixture(async(store)=>{
 const owner=await create(store),a=structuredClone(owner.snapshot.state),b=structuredClone(a);a.pantry.egg=2;b.pantry.chicken=1;
 const results=await Promise.allSettled([store.update(auth(owner.credentials),{revision:1,state:a}),store.update(auth(owner.credentials),{revision:1,state:b})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const failure=results.find(r=>r.status==='rejected').reason;assert.equal(failure.status,409);assert.equal(failure.snapshot.state.pantry.egg,2);
}));
test('invalid shared plans, member names and corrupted disk data never replace a valid store',()=>fixture(async(store,directory)=>{
 const owner=await create(store),file=path.join(directory,'households.json'),before=await readFile(file,'utf8');
 const invalid=structuredClone(owner.snapshot.state);invalid.months['2026-10'].plan.meals[0].cost=1;
 await assert.rejects(()=>store.update(auth(owner.credentials),{revision:1,state:invalid}),e=>e.code==='invalidSharedData');
 await assert.rejects(()=>store.create({name:'\nBad',householdName:'home',state:initial()}));
 assert.equal(await readFile(file,'utf8'),before);
 await writeFile(file,'broken data');await assert.rejects(()=>store.read(auth(owner.credentials)),e=>e.code==='sharedStoreUnavailable');assert.equal(await readFile(file,'utf8'),'broken data');
}));
test('shared payloads omit device navigation, public price files and membership credentials',()=>{
 const state={...initial(),lastMonth:'2027-01',priceData:{private:'unused'},connection:{token:'secret'}};
 const payload=validateSharedState(state);assert(!('lastMonth'in payload));assert(!('priceData'in payload));assert(!('connection'in payload));
 assert.deepEqual(payload,sharedState(state));
});
test('shared validation rejects an over-budget new plan while retaining honest logged overspending',()=>{
 const state=initial();state.months['2026-10'].settings.budget=3000;
 assert.throws(()=>validateSharedState(state),error=>error.code==='overBudget');
 state.months['2026-10'].settings.budget=8000;state.months['2026-10'].spend['2026-10-01/lunch']=9000;
 assert.doesNotThrow(()=>validateSharedState(state));
});
test('three-way merging preserves independent changes and deletions, and reports same-item conflicts',()=>{
 const base={pantry:{egg:1,chicken:1}},a={pantry:{egg:2}},b={pantry:{egg:1,chicken:1,pork:3}};
 const merged=mergeSharedState(base,a,b);assert.deepEqual(merged,{state:{pantry:{egg:2,pork:3}},conflicts:[]});
 const conflict=mergeSharedState(base,a,{pantry:{egg:3,chicken:1}});assert.deepEqual(conflict.conflicts,['/pantry/egg']);
});
function memoryStorage(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
function device(store,{storage=memoryStorage(),state=initial()}={}){
 const context={state:structuredClone(state),offline:false,storage};
 const fetcher=async(url,options)=>{
  if(context.offline)throw new Error('offline');const input=options.body?JSON.parse(options.body):undefined;
  if(options.method==='PUT'&&context.beforeWrite)await context.beforeWrite();
  try{
   const value=url==='/api/households'?await store.create(input):url==='/api/households/join'?await store.join(input):url.endsWith('/invite')?await store.rotate(options.headers.Authorization):options.method==='PUT'?await store.update(options.headers.Authorization,input):options.method==='DELETE'?await store.leave(options.headers.Authorization):await store.read(options.headers.Authorization);
   return {ok:true,json:async()=>value};
  }catch(error){return {ok:false,status:error.status||400,json:async()=>({error:error.code||error.message,snapshot:error.snapshot})};}
 };
 context.sync=createHouseholdSync({fetcher,storage,getState:()=>context.state,applyState:(data,personal)=>{context.state=personal?data:{...context.state,...data};}});
 return context;
}
test('missing, unreadable and invalid device copies recover before sync instead of deleting shared months',()=>fixture(async store=>{
 const owner=device(store);await owner.sync.create({name:'Alex',householdName:'Our home'});
 for(const raw of [null,'broken JSON',JSON.stringify({...initial(),months:{'2026-10':{broken:true}}})]){
  const storage=memoryStorage();storage.setItem(HOUSEHOLD_KEY,owner.storage.getItem(HOUSEHOLD_KEY));if(raw!==null)storage.setItem('vaind:v1',raw);
  const loaded=loadStartupState(storage);assert.equal(loaded.recovered,true);assert.equal(loaded.error,'sharedCacheRecovered');
  if(raw!==null)assert.equal(storage.getItem(RECOVERY_KEY),raw);
  const reopened=device(store,{storage,state:loaded.data});await reopened.sync.flush();
  const credentials=JSON.parse(storage.getItem(HOUSEHOLD_KEY)).credentials,snapshot=await store.read(auth(credentials));
  assert.equal(snapshot.revision,1);assert.equal(Object.keys(snapshot.state.months).length,1);assert.equal(reopened.state.months['2026-10'].plan.meals.length,71);
 }
}));
test('recovered cache merges newer server data and preserves new offline edits',()=>fixture(async store=>{
 const owner=device(store);await owner.sync.create({name:'Alex',householdName:'Our home'});
 const storage=memoryStorage();storage.setItem(HOUSEHOLD_KEY,owner.storage.getItem(HOUSEHOLD_KEY));storage.setItem('vaind:v1','broken JSON');
 const loaded=loadStartupState(storage),reopened=device(store,{storage,state:loaded.data});reopened.state.pantry.egg=5;
 owner.state.pantry.chicken=1;await owner.sync.flush();await reopened.sync.flush();
 assert.deepEqual(reopened.state.pantry,{egg:5,chicken:1});assert.equal(Object.keys(reopened.state.months).length,1);
}));
test('invalid current data cannot be uploaded by automatic household sync',()=>fixture(async store=>{
 const owner=device(store);await owner.sync.create({name:'Alex',householdName:'Our home'});
 owner.state.months['2026-10'].plan.meals[0].cost=1;
 assert.equal(await owner.sync.flush(),false);assert.equal(owner.sync.status().phase,'invalid');
 const credentials=JSON.parse(owner.storage.getItem(HOUSEHOLD_KEY)).credentials;assert.equal((await store.read(auth(credentials))).revision,1);
}));
test('offline disconnect keeps unsynced edits without credentials and permits a different host connection',()=>fixture(async store=>{
 const owner=device(store);owner.state.pantry.egg=9;await owner.sync.create({name:'Alex',householdName:'Our home'});
 const credentials=JSON.parse(owner.storage.getItem(HOUSEHOLD_KEY)).credentials;
 owner.state.pantry.egg=4;owner.offline=true;await assert.rejects(()=>owner.sync.flush());
 await owner.sync.disconnectLocal();assert.equal(owner.sync.status().connected,false);assert.equal(owner.state.pantry.egg,9);assert.equal(owner.storage.getItem(HOUSEHOLD_KEY),null);
 const retained=owner.sync.disconnectedBackup();assert.equal(retained.pantry.egg,4);assert.equal(Object.keys(retained.months).length,1);
 const archived=owner.storage.getItem(DISCONNECTED_KEY);assert(!archived.includes(credentials.token));assert(!archived.includes('credentials'));
 assert.equal((await store.read(auth(credentials))).state.pantry.egg,9);
 owner.offline=false;await owner.sync.create({name:'Alex',householdName:'New host'});assert(owner.sync.status().connected);assert.equal(owner.sync.disconnectedBackup().pantry.egg,4);
}));
test('failed recovery-copy writes prevent local disconnect and retain membership and edits',()=>fixture(async store=>{
 const owner=device(store);await owner.sync.create({name:'Alex',householdName:'Our home'});owner.state.pantry.egg=4;
 const reopened=device(store,{state:owner.state,storage:{...owner.storage,setItem:(key,value)=>{if(key===DISCONNECTED_KEY)throw new Error('quota');owner.storage.setItem(key,value);}}});
 await assert.rejects(()=>reopened.sync.disconnectLocal(),/storageUnavailable/);assert(reopened.sync.status().connected);assert(owner.storage.getItem(HOUSEHOLD_KEY));assert.equal(reopened.state.pantry.egg,4);
}));
test('two clients merge simultaneous spending on different meals without losing either log',()=>fixture(async(store)=>{
 const a=device(store),b=device(store);await a.sync.create({name:'Alex',householdName:'Our home'});await b.sync.join({name:'Sam',code:a.sync.status().snapshot.inviteCode});
 a.state.months['2026-10'].spend['2026-10-01/lunch']=50;b.state.months['2026-10'].spend['2026-10-01/dinner']=75;
 await Promise.all([a.sync.flush(),b.sync.flush()]);await a.sync.flush();await b.sync.flush();
 assert.deepEqual(a.state.months['2026-10'].spend,{'2026-10-01/lunch':50,'2026-10-01/dinner':75});assert.deepEqual(b.state,a.state);
 assert(!a.sync.status().pending);assert(!b.sync.status().pending);
}));
test('offline edits survive client recreation and merge after reconnecting',()=>fixture(async(store)=>{
 const a=device(store),b=device(store);await a.sync.create({name:'Alex',householdName:'Our home'});await b.sync.join({name:'Sam',code:a.sync.status().snapshot.inviteCode});await a.sync.flush();
 a.offline=true;a.state.pantry.egg=4;await assert.rejects(()=>a.sync.flush());assert.equal(a.sync.status().phase,'offline');assert(a.sync.status().pending);
 b.state.pantry.chicken=1;await b.sync.flush();
 const reopened=device(store,{storage:a.storage,state:a.state});await reopened.sync.flush();
 assert.deepEqual(reopened.state.pantry,{egg:4,chicken:1});assert.equal(reopened.sync.status().phase,'saved');
}));
test('same-item conflicts retain the local copy until the member chooses the shared version',()=>fixture(async(store)=>{
 const a=device(store),b=device(store);await a.sync.create({name:'Alex',householdName:'Our home'});await b.sync.join({name:'Sam',code:a.sync.status().snapshot.inviteCode});await a.sync.flush();
 a.state.pantry.egg=2;b.state.pantry.egg=3;await a.sync.flush();assert.equal(await b.sync.flush(),false);
 assert.equal(b.sync.status().phase,'conflict');assert.equal(b.state.pantry.egg,3);assert(b.sync.status().pending);
 b.sync.useShared();assert.equal(b.state.pantry.egg,2);assert(!b.sync.status().pending);
}));
test('joining saves the personal plan separately and leaving restores it without deleting the household',()=>fixture(async(store)=>{
 const a=device(store),b=device(store);b.state.pantry.egg=9;
 await a.sync.create({name:'Alex',householdName:'Our home'});await b.sync.join({name:'Sam',code:a.sync.status().snapshot.inviteCode});
 assert.equal(b.state.pantry.egg,undefined);assert.equal(JSON.parse(b.storage.getItem(PERSONAL_KEY)).pantry.egg,9);
 await b.sync.leave();assert.equal(b.state.pantry.egg,9);assert.equal(b.storage.getItem(HOUSEHOLD_KEY),null);assert(!b.sync.status().connected);
 await a.sync.flush();assert.equal(a.sync.status().snapshot.members.length,1);
}));
test('an edit made while a save is in flight is retained and sent in the next revision',{timeout:5000},()=>fixture(async(store)=>{
 const a=device(store);await a.sync.create({name:'Alex',householdName:'Our home'});
 let unblock,started;const gate=new Promise(resolve=>unblock=resolve),writing=new Promise(resolve=>started=resolve);
 a.beforeWrite=async()=>{a.beforeWrite=null;started();await gate;};
 a.state.pantry.egg=2;const saving=a.sync.flush();await writing;a.state.pantry.chicken=1;unblock();await saving;
 assert.deepEqual(a.state.pantry,{egg:2,chicken:1});assert(!a.sync.status().pending);
 const session=JSON.parse(a.storage.getItem(HOUSEHOLD_KEY));assert.deepEqual((await store.read(auth(session.credentials))).state.pantry,{egg:2,chicken:1});
}));
