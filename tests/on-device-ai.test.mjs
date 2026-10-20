import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { devicePlanOptions, devicePlanPrompt, requestDevicePlan, ON_DEVICE_MODEL } from '../public/core/on-device-ai.js';
import { validatePlan } from '../public/core/planner.js';
import { CATEGORIES } from '../public/core/catalog.js';
const prices=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url))).prices;
const settings={month:'2026-10',budget:8000,household:4,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[],excludeVegetableMains:true,excludeMonggo:true};

test('on-device AI chooses a complete valid menu without inventing costs or quantities',async()=>{
 const candidates=devicePlanOptions(settings,prices);assert(candidates.length>1&&candidates.length<=4);
 let calls=0;
 const plan=await requestDevicePlan(settings,prices,{infer:async payload=>{calls++;assert.equal(payload.count,candidates.length);assert(payload.prompt.includes('budgetPHP'));return {choice:1};}});
 assert.equal(calls,1);assert.equal(plan.generator,'ai');assert.equal(plan.aiMode,'on-device-selection');assert.equal(plan.aiModel,ON_DEVICE_MODEL);
 assert.deepEqual(plan.meals,candidates[1].meals);validatePlan(plan,settings,prices);assert(plan.total<=settings.budget);
 assert(plan.meals.every(m=>m.category!=='vegetables'&&m.protein!=='monggo'));
});
test('phone prompt contains household, calendar, preferences and real price context',()=>{
 const candidates=devicePlanOptions(settings,prices),prompt=devicePlanPrompt(settings,prices,candidates);
 const context=JSON.parse(prompt.slice(prompt.indexOf('\n')+1,prompt.lastIndexOf('\n')));
 assert.equal(context.budgetPHP,8000);assert.equal(context.household,4);assert.equal(context.calendar.meals,71);assert.equal(context.calendar.breakfasts,9);
 assert.equal(context.excludeMonggo,true);assert.deepEqual(context.preferences,settings.preferences);assert.equal(context.options.length,candidates.length);
 assert(context.prices.length>0);for(const price of context.prices)assert.equal(price.price,prices.find(p=>p.id===price.id).price);
 assert(prompt.length<16000);
});
test('invalid phone AI decisions and native failures are labelled rule-based',async()=>{
 for(const result of [{choice:-1},{choice:4},{choice:1.2},{choice:'A'},null]){
  const plan=await requestDevicePlan(settings,prices,{infer:async()=>result});assert.equal(plan.generator,'rules');assert.equal(plan.fallbackReason,'deviceAiUnavailable');validatePlan(plan,settings,prices);
 }
 for(const code of ['deviceAiMemory','deviceAiStorage','deviceAiUnsupported','unexpected']){
  const plan=await requestDevicePlan(settings,prices,{infer:async()=>{throw new Error(code);}});assert.equal(plan.generator,'rules');assert.equal(plan.fallbackReason,code==='unexpected'?'deviceAiUnavailable':code);
 }
});
test('built-in AI retains logged history and Never categories in every candidate',async()=>{
 const s={...settings,preferences:{...settings.preferences,beef:'never',shellfish:'never'}},initial=devicePlanOptions(s,prices)[0],locked=[initial.meals[0]],spend={[locked[0].key]:0};
 const plan=await requestDevicePlan(s,prices,{locked,spend,infer:async()=>({choice:1})});
 assert.deepEqual(plan.meals[0],locked[0]);assert(plan.meals.every(m=>!['beef','shellfish'].includes(m.category)));validatePlan(plan,s,prices,spend);
});
test('infeasible settings fail before starting the native model',async()=>{
 let called=false;await assert.rejects(requestDevicePlan({...settings,budget:2999},prices,{infer:async()=>{called=true;return {choice:0};}}));assert.equal(called,false);
});
