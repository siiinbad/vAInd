import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATEGORIES, DISHES } from '../public/core/catalog.js';
import { allowedDish, calendar, costDish, generatePlan, groceryList, swapOptions, validatePlan, validatePrices, validateSettings } from '../public/core/planner.js';
import { aiPayload } from '../public/core/ai.js';
import { extendReadyPrices } from '../public/core/ready-prices.js';
const prices=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url))).prices;
const settings=(extra={})=>({month:'2026-10',budget:8000,household:4,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[],...extra});
const dish=id=>DISHES.find(d=>d.id===id);

test('ready-cooked meals cost whole servings at the vendor price, without raw ingredient costs',()=>{
 const s=settings(),lunch=calendar(s.month).find(slot=>slot.meal==='lunch'),breakfast=calendar(s.month).find(slot=>slot.meal==='breakfast');
 const price=prices.find(p=>p.id==='ready-chicken-adobo').price;
 const meal=costDish(dish('ready-chicken-adobo'),lunch,s,prices);
 assert.equal(meal.preparation,'ready');assert.equal(meal.ingredients.length,1);assert.equal(meal.ingredients[0].quantity,4);assert.equal(meal.cost,4*price);
 const light=costDish(dish('ready-chicken-adobo'),breakfast,s,prices);assert.equal(light.ingredients[0].quantity,3);assert.equal(light.cost,3*price);
 const single=costDish(dish('ready-chicken-adobo'),breakfast,settings({household:1}),prices);assert.equal(single.ingredients[0].quantity,1);
});
test('mixed, home-only and ready-only plans and AI choices obey the requested preparation mode',()=>{
 for(const preparationMode of ['mixed','home','ready']){
  const s=settings({preparationMode}),plan=generatePlan(s,prices);validatePlan(plan,s,prices);assert(plan.total<=s.budget);
  if(preparationMode==='mixed'){assert(plan.meals.some(m=>m.preparation==='ready'));assert(plan.meals.some(m=>m.preparation==='home'));}
  else assert(plan.meals.every(m=>m.preparation===preparationMode));
  if(preparationMode!=='mixed')assert(aiPayload(s,prices).dishes.every(d=>(d.preparation||'home')===preparationMode));
 }
 assert.throws(()=>validateSettings(settings({preparationMode:'invalid'})),e=>e.code==='invalidPreparationMode');
});
test('ready-cooked dishes retain Never and Avoid checks for their underlying ingredients',()=>{
 const s=settings();assert(allowedDish(dish('ready-tortang-talong'),s,prices));
 assert(!allowedDish(dish('ready-tortang-talong'),{...s,avoid:['egg']},prices));
 assert(!allowedDish(dish('ready-tortang-talong'),{...s,preferences:{...s.preferences,vegetables:'never'}},prices));
 assert(!allowedDish(dish('ready-chicken-adobo'),{...s,preferences:{...s.preferences,chicken:'never'}},prices));
 assert(allowedDish(dish('ready-chicken-adobo'),{...s,preferences:{...s.preferences,vegetables:'never'}},prices));
});
test('ready-only grocery lists contain purchases, never raw recipe ingredients or pantry deductions',()=>{
 const s=settings({preparationMode:'ready'}),plan=generatePlan(s,prices),list=groceryList(plan.meals,prices,{'ready-chicken-adobo':10000,chicken:10000});
 assert(list.length);assert(list.every(p=>p.kind==='ready'&&p.unit==='serving'&&p.needed===p.quantity));
 assert.equal(Math.round(list.reduce((n,p)=>n+p.cost,0)*100),Math.round(plan.total*100));
});
test('AI cannot underprice servings, change preparation labels or add raw costs to ready-cooked meals',()=>{
 const s=settings({preparationMode:'ready'}),plan=generatePlan(s,prices);
 for(const change of [m=>m.preparation='home',m=>m.ingredients[0].unitPrice=1,m=>m.ingredients[0].quantity=.1,m=>m.ingredients.push({id:'chicken',quantity:1,unitPrice:190})]){
  const invalid=structuredClone(plan);change(invalid.meals[0]);assert.throws(()=>validatePlan(invalid,s,prices));
 }
 const invalidPrices=structuredClone(prices);invalidPrices.find(p=>p.kind==='ready').unit='kg';assert.throws(()=>validatePrices(invalidPrices));
});
test('home/ready swaps obey both neighboring proteins and preparation changes retain logged history',()=>{
 const s=settings({budget:20000}),plan=generatePlan(s,prices);
 const options=swapOptions(plan,plan.meals[2].key,s,prices);assert(options.some(m=>m.preparation==='ready'));
 for(const m of options){assert.notEqual(m.protein,plan.meals[1].protein);assert.notEqual(m.protein,plan.meals[3].protein);}
 const original=generatePlan({...s,preparationMode:'home'},prices),logged=original.meals[0],spend={[logged.key]:logged.cost};
 const next=generatePlan({...s,preparationMode:'ready'},prices,{spend,locked:original.meals});
 assert.deepEqual(next.meals[0],logged);assert(next.meals.slice(1).every(m=>m.preparation==='ready'));
});
test('new ready-cooked prices extend old snapshots without changing historical prices or existing overrides',()=>{
 const old=prices.filter(p=>p.kind!=='ready').map(p=>({...p}));old[0].price=123;
 const state={priceFile:structuredClone(old),months:{'2026-10':{prices:structuredClone(old)}},overrides:{'ready-chicken-adobo':{price:60,status:'override',source:'Your override',sourceUrl:null,date:'2026-10-20'}}};
 assert(extendReadyPrices(state,prices));assert.equal(state.months['2026-10'].prices[0].price,123);
 assert.equal(state.months['2026-10'].prices.find(p=>p.id==='ready-chicken-adobo').price,60);
 assert.equal(state.months['2026-10'].prices.length,prices.length);assert.equal(extendReadyPrices(state,prices),false);
 validatePrices(state.months['2026-10'].prices);
});
