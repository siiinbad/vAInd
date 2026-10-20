import { calendar, validateSettings, validatePrices, validatePlan, generatePlan, PlanError, allowedDish } from './planner.js';
import { DISHES, MENU_POLICY_VERSION } from './catalog.js';
import { isAndroidApp, inferAndroidPlan } from './android.js';
import { requestDevicePlan } from './on-device-ai.js';
export function aiPayload(settings, prices, spend={}, locked=[]) {
 validateSettings(settings); validatePrices(prices);
 return {settings,prices,calendar:calendar(settings.month),spend,locked:locked.filter(m=>Object.hasOwn(spend,m.key)),dishes:DISHES.filter(d=>allowedDish(d,settings,prices)),constraints:{excludedMainCategories:settings.excludeVegetableMains?['vegetables']:[],excludedProteins:settings.excludeMonggo?['monggo']:[],historicalException:'Previously logged meals are immutable history; never schedule excluded dishes in any unlogged slot',currency:'PHP',costing:'Home: main ingredients only. Ready-cooked: entire vendor ulam serving price, including vendor preparation and condiments. No rice.',rice:false,condiments:'Excluded for home cooking; included in the complete ready-cooked serving price',breakfastWeight:.6,quantities:'Home: catalog per-person quantity × household × meal weight, rounded to 2 decimals. Ready-cooked: ceil(household × meal weight) whole servings at the listed serving price; never add raw ingredient costs.',neverExcluded:true,noConsecutiveDishOrProtein:true,porkBeefMostlyWeekends:true,preferenceWeights:{often:3,sometimes:1,never:0},budget:'Sum actual logged spend plus unlogged meal costs <= monthly budget',shape:{meals:[{key:'YYYY-MM-DD/lunch',date:'YYYY-MM-DD',meal:'lunch',preparation:'home',dishId:'catalog ID',dish:'exact catalog name',category:'catalog category',protein:'catalog protein',weight:1,weekend:false,ingredients:[{id:'price ID',quantity:.64,unitPrice:190}],cost:121.6}]}}};
}
export async function requestPlan(settings,prices,{spend={},locked=[],seed=0,fetcher=fetch,pantry={}}={}) {
 if(isAndroidApp())return requestDevicePlan(settings,prices,{infer:inferAndroidPlan,spend,locked,seed,pantry});
 // Establish feasibility first. Never ask the AI to solve impossible settings.
 const fallback=generatePlan(settings,prices,{spend,locked,seed,pantry});
 try {
  const response=await fetcher('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings,prices,spend,locked}),signal:AbortSignal.timeout(125000)});
  if(!response.ok)throw new Error('aiUnavailable');
  const result=await response.json();
  if(result.generator==='rules')return {...fallback,fallbackReason:result.fallbackReason||'aiUnavailable'};
  const validated=validatePlan({...result,generator:'ai',menuVersion:MENU_POLICY_VERSION,createdAt:new Date().toISOString(),warnings:fallback.warnings,expensiveCategory:fallback.expensiveCategory},settings,prices,spend);
  for(const m of locked.filter(m=>Object.hasOwn(spend,m.key)))if(JSON.stringify(validated.meals.find(x=>x.key===m.key)?.ingredients)!==JSON.stringify(m.ingredients)||validated.meals.find(x=>x.key===m.key)?.dishId!==m.dishId)throw new PlanError('loggedChanged');
  return validated;
 } catch { return {...fallback,fallbackReason:'aiUnavailable'}; }
}
