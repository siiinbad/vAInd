import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATEGORIES, DISHES, isMenuExcluded } from '../public/core/catalog.js';
import { calendar, costDish, generatePlan, validatePlan, swapOptions, allowedDish, validateSettings } from '../public/core/planner.js';
import { migrateMenu } from '../public/core/menu-migration.js';
import { aiPayload } from '../public/core/ai.js';
const prices = JSON.parse(await readFile(new URL('../public/data/prices.json', import.meta.url))).prices;
const settings = budget => ({ month:'2026-10',budget,household:4,excludeVegetableMains:true,excludeMonggo:true,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[] });
function legacyPlan(s) {
 const recipes = ['monggo','scrambled-eggs'].map(id=>DISHES.find(d=>d.id===id));
 return {generator:'rules',meals:calendar(s.month).map((slot,i)=>costDish(recipes[i%2],slot,s,prices))};
}
test('personal menu excludes every vegetable-only main and monggo in plans, swaps and AI catalog',()=>{
 const s=settings(8000),plan=generatePlan(s,prices);
 assert(plan.meals.every(m=>m.category!=='vegetables'&&m.protein!=='monggo'));
 assert(swapOptions(plan,plan.meals[1].key,s,prices).every(m=>m.category!=='vegetables'&&m.protein!=='monggo'));
 assert(aiPayload(s,prices).dishes.every(d=>!isMenuExcluded(d,s)));
 assert(allowedDish(DISHES.find(d=>d.id==='tinola'),s,prices));
 assert(allowedDish(DISHES.find(d=>d.id==='pork-sinigang'),s,prices));
});
test('households independently include vegetable mains and monggo; Never and Avoid still win',()=>{
 const vegetable=DISHES.find(d=>d.id==='utan'),monggo=DISHES.find(d=>d.id==='monggo');
 for(const excludeVegetableMains of [false,true])for(const excludeMonggo of [false,true]){
  const s={...settings(14000),excludeVegetableMains,excludeMonggo};
  assert.equal(allowedDish(vegetable,s,prices),!excludeVegetableMains);
  assert.equal(allowedDish(monggo,s,prices),!excludeMonggo);
  const payload=aiPayload(s,prices);
  assert.equal(payload.dishes.some(d=>d.id==='utan'),!excludeVegetableMains);
  assert.equal(payload.dishes.some(d=>d.id==='monggo'),!excludeMonggo);
  const plan=generatePlan(s,prices);validatePlan(plan,s,prices);
  if(excludeVegetableMains)assert(plan.meals.every(m=>m.category!=='vegetables'));
  if(excludeMonggo)assert(plan.meals.every(m=>m.protein!=='monggo'));
 }
 const s={...settings(14000),excludeVegetableMains:false,excludeMonggo:false};
 assert(!allowedDish(vegetable,{...s,preferences:{...s.preferences,vegetables:'never'}},prices));
 assert(!allowedDish(monggo,{...s,avoid:['monggo']},prices));
 assert.throws(()=>validateSettings({...s,excludeMonggo:'false'}),e=>e.code==='invalidMenuOptions');
});
test('legacy household exclusions persist while new profiles can include both options',()=>{
 const legacy=settings(8000);delete legacy.excludeVegetableMains;delete legacy.excludeMonggo;
 const old={settings:legacy,months:{}};migrateMenu(old);
 assert.equal(old.settings.excludeVegetableMains,true);assert.equal(old.settings.excludeMonggo,true);
 const fresh={months:{}};migrateMenu(fresh);
 fresh.settings={...settings(8000),excludeVegetableMains:false,excludeMonggo:false};migrateMenu(fresh);
 assert.equal(fresh.settings.excludeVegetableMains,false);assert.equal(fresh.settings.excludeMonggo,false);
 assert(!isMenuExcluded(DISHES.find(d=>d.id==='utan')));
});
test('AI cannot reintroduce a forbidden vegetable main even within budget',()=>{
 const s=settings(14000),plan=generatePlan(s,prices),d=DISHES.find(d=>d.id==='pinakbet');
 plan.meals[0]=costDish(d,calendar(s.month)[0],s,prices);
 assert.throws(()=>validatePlan(plan,s,prices),e=>e.code==='invalidDish');
});
test('saved menus migrate without losing logged monggo, spend or price snapshots',()=>{
 const s=settings(8000),old=legacyPlan(s),spend={[old.meals[0].key]:50},state={months:{[s.month]:{settings:s,prices:structuredClone(prices),spend,plan:old}}};
 validatePlan(old,s,prices,spend,{legacyMenu:true});
 const snapshot=structuredClone(state.months[s.month].prices),logged=structuredClone(old.meals[0]);
 const result=migrateMenu(state),r=state.months[s.month];
 assert.equal(result.changed,true);assert.deepEqual(result.conflicts,[]);
 assert.deepEqual(r.plan.meals[0],logged);assert.deepEqual(r.spend,spend);assert.deepEqual(r.prices,snapshot);
 assert(r.plan.meals.slice(1).every(m=>m.category!=='vegetables'&&m.protein!=='monggo'));
 validatePlan(r.plan,s,prices,spend);
 assert.equal(migrateMenu(state).changed,false);
});
test('infeasible migration retains data and requests a new budget instead of losing history',()=>{
 const s=settings(4600),old=legacyPlan(s),state={months:{[s.month]:{settings:s,prices,spend:{},plan:old}}};
 validatePlan(old,s,prices,{}, {legacyMenu:true});
 const before=structuredClone(old),result=migrateMenu(state);
 assert.deepEqual(result.conflicts,[s.month]);assert.deepEqual(state.months[s.month].plan,before);
 assert.equal(state.months[s.month].menuConflict.code,'budgetConflict');
});
