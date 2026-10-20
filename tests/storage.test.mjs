import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { savePriceFile, saveState, RECOVERY_KEY } from '../public/core/storage.js';
import { loadStartupState } from '../public/core/startup.js';
import { generatePlan } from '../public/core/planner.js';
import { CATEGORIES } from '../public/core/catalog.js';
const full=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url)));
const settings={month:'2026-10',budget:8000,household:2,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[]};
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
test('background price sync preserves a newer spend log and override saved by another tab',()=>{
 const previous=globalThis.localStorage;
 const current={version:1,months:{'2026-10':{settings,prices:full.prices,plan:generatePlan(settings,full.prices),spend:{'2026-10-01/lunch':125}}},pantry:{},overrides:{egg:{price:9,date:'2026-10-21',source:'User',sourceUrl:null,status:'override'}},priceFile:[]};
 let text=JSON.stringify(current);
 globalThis.localStorage={getItem:()=>text,setItem:(key,value)=>{assert.equal(key,'vaind:v1');text=value;}};
 try{
  const prices=structuredClone(full.prices);
  assert(savePriceFile(prices,{version:1,months:{},overrides:{}}));
  const saved=JSON.parse(text);assert.deepEqual(saved.months,current.months);assert.deepEqual(saved.overrides,current.overrides);assert.deepEqual(saved.priceFile,prices);
  const book={prices,observations:[{...prices.find(p=>p.id==='egg'),location:{province:'Metro Manila',city:''},price:8.22,status:'reported',date:'2026-10-21'}]};
  assert(savePriceFile(book,{}));const regional=JSON.parse(text);
  assert(regional.priceData.observations.some(p=>p.id==='egg'&&p.price===8.22));assert.deepEqual(regional.months,current.months);assert.deepEqual(regional.overrides,current.overrides);
  text='broken backup data';assert.equal(savePriceFile(prices,{}),false);assert.equal(text,'broken backup data');
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('replacing damaged storage retains raw data and refuses writes if recovery storage is full',()=>{
 const storage=memory(),valid={version:1,months:{},overrides:{},pantry:{}};
 storage.setItem('vaind:v1','damaged JSON');assert(saveState(valid,storage));assert.equal(storage.getItem(RECOVERY_KEY),'damaged JSON');
 storage.setItem('vaind:v1','another damaged copy');const limited={...storage,setItem:(key,value)=>{if(key===RECOVERY_KEY)throw new Error('quota');storage.setItem(key,value);}};
 assert.equal(saveState(valid,limited),false);assert.equal(storage.getItem('vaind:v1'),'another damaged copy');
});
test('startup distinguishes broken storage from a new profile and retains damaged bytes',()=>{
 const storage=memory();assert.deepEqual(loadStartupState(storage),{data:null,error:undefined});
 storage.setItem('vaind:v1','not JSON');const loaded=loadStartupState(storage);assert.equal(loaded.data,null);assert.equal(loaded.error,'storageCorrupt');assert.equal(storage.getItem(RECOVERY_KEY),'not JSON');
 const invalid={version:1,months:{bad:{}},overrides:{},pantry:{}};storage.setItem('vaind:v1',JSON.stringify(invalid));assert.equal(loadStartupState(storage).data,null);assert.equal(storage.getItem(RECOVERY_KEY),JSON.stringify(invalid));
});
test('blocked localStorage access degrades to a recoverable session instead of throwing during startup',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('storage blocked');}});
 try{assert.equal(loadStartupState().error,'storageUnavailable');assert.equal(saveState({version:1,months:{},overrides:{},pantry:{}}),false);}
 finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
