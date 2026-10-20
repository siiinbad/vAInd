import { validLocation } from './locations.js';
import { CATEGORIES, LEVELS, DISHES, isMenuExcluded, MENU_POLICY_VERSION, PREPARATION_MODES } from './catalog.js';
export class PlanError extends Error { constructor(code, details = {}) { super(code); this.code = code; this.details = details; } }
export const MIN_MONTHLY_BUDGET = 3000;
export const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
export function calendar(month) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || +month.slice(0,4)<2020 || +month.slice(0,4)>2100) throw new PlanError('invalidMonth');
 const [y,m] = month.split('-').map(Number), count = new Date(y,m,0).getDate();
 return Array.from({length:count},(_,i) => {const date=`${month}-${String(i+1).padStart(2,'0')}`, day=new Date(y,m-1,i+1).getDay(), weekend=day===0||day===6; return (weekend?['breakfast','lunch','dinner']:['lunch','dinner']).map(meal=>({date,meal,key:`${date}/${meal}`,weekend,weight:meal==='breakfast'?.6:1}));}).flat();
}
export function validateSettings(s,{allowLegacyBudget=false}={}) {
 if (!s || typeof s!=='object') throw new PlanError('invalidInput');
 calendar(s.month);
 if(s.location!==undefined&&!validLocation(s.location))throw new PlanError('invalidLocation');
 if(['excludeVegetableMains','excludeMonggo'].some(key=>s[key]!==undefined&&typeof s[key]!=='boolean'))throw new PlanError('invalidMenuOptions');
 if(s.preparationMode!==undefined&&!PREPARATION_MODES.includes(s.preparationMode))throw new PlanError('invalidPreparationMode');
 if (!Number.isFinite(s.budget)||s.budget<(allowLegacyBudget?1:MIN_MONTHLY_BUDGET)||s.budget>1000000) throw new PlanError('invalidBudget');
 if (!Number.isInteger(s.household)||s.household<1||s.household>30) throw new PlanError('invalidHousehold');
 if (!s.preferences||CATEGORIES.some(c=>!LEVELS.includes(s.preferences[c]))) throw new PlanError('invalidPreferences');
 if (!Array.isArray(s.avoid)||s.avoid.some(x=>typeof x!=='string'||x.length>80)||s.avoid.length>40) throw new PlanError('invalidAvoid');
}
export function validatePrices(prices) {
 if(!Array.isArray(prices)||!prices.length) throw new PlanError('invalidPrices');
 const ids = new Set();
 for(const p of prices) {
  if(!p||typeof p.id!=='string'||!/^[a-z-]+$/.test(p.id)||typeof p.name!=='string'||!p.name||typeof p.source!=='string'||ids.has(p.id)||!CATEGORIES.includes(p.category)||!['kg','piece','can','serving'].includes(p.unit)||!['ingredient','ready'].includes(p.kind||'ingredient')||((p.kind==='ready')!==(p.unit==='serving'))||!Number.isFinite(p.price)||p.price<=0||p.price>100000||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||!p.source||!['reported','estimate','override'].includes(p.status)) throw new PlanError('invalidPrices');
  if(p.location!=null&&!validLocation(p.location,{provinceOnly:true}))throw new PlanError('invalidPrices');
  if(p.sourceUrl!==null){let url;try{url=new URL(p.sourceUrl);}catch{throw new PlanError('invalidPrices');}if(url.protocol!=='https:'||url.username||url.password)throw new PlanError('invalidPrices');}
  if(new Date(p.date).toISOString().slice(0,10)!==p.date)throw new PlanError('invalidPrices');
  ids.add(p.id);
 }
}
export function allowedDish(d,s,prices,{ignoreMenuExclusions=false,ignorePreparationMode=false,ignoreFoodExclusions=false}={}) {
 if(!ignoreMenuExclusions&&isMenuExcluded(d,s))return false;
 const preparation=d.preparation||'home',mode=s.preparationMode||'mixed';
 if(!ignorePreparationMode&&mode!=='mixed'&&mode!==preparation)return false;
 const ingredientIds=d.contains||d.ingredients.map(i=>i.id);
 const words=value=>' '+value.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(x=>x.length>3&&x.endsWith('s')?x.slice(0,-1):x).join(' ')+' ';
 const avoided=s.avoid.map(words).filter(x=>x.trim());
 return (ignoreFoodExclusions||s.preferences[d.category]!=='never'&&!avoided.some(a=>[d.name,d.protein,d.category,...ingredientIds.flatMap(id=>[id,prices.find(p=>p.id===id)?.name||''])].some(x=>words(x).includes(a)))) && ingredientIds.every(id=>{const p=prices.find(p=>p.id===id);return p&&(ignoreFoodExclusions||s.preferences[p.category]!=='never');})&&d.ingredients.every(i=>prices.some(p=>p.id===i.id));
}
export function costDish(d,slot,s,prices) {
 const preparation=d.preparation||'home';
 const factor=preparation==='ready'?Math.ceil(s.household*slot.weight):s.household*slot.weight;
 const ingredients=d.ingredients.map(i=>{const p=prices.find(p=>p.id===i.id);if(!p)throw new PlanError('missingPrice');if(preparation==='ready'&&(p.unit!=='serving'||p.kind!=='ready'))throw new PlanError('invalidPrices');return {id:i.id,quantity:round(i.quantity*factor),unitPrice:p.price};});
 const cost=round(ingredients.reduce((sum,i)=>sum+i.quantity*i.unitPrice,0));
 return {...slot,preparation,dishId:d.id,dish:d.name,category:d.category,protein:d.protein,ingredients,cost};
}
export function validateSpend(spend,slots) {
 if(!spend||typeof spend!=='object'||Array.isArray(spend))throw new PlanError('invalidSpend');
 const keys=new Set(slots.map(s=>s.key));
 for(const [key,v] of Object.entries(spend))if(!keys.has(key)||!Number.isFinite(v)||v<0||v>1000000)throw new PlanError('invalidSpend');
}
export function validatePlan(plan,s,prices,spend={}, {allowOverBudget=false,legacyMenu=false,allowLegacyBudget=false}={}) {
 validateSettings(s,{allowLegacyBudget});validatePrices(prices); const slots=calendar(s.month);validateSpend(spend,slots);
 if(!plan||!Array.isArray(plan.meals)||plan.meals.length!==slots.length)throw new PlanError('incompletePlan');
 let total=0,previous;
 const meals=slots.map((slot,i)=>{
  const m=plan.meals[i],d=DISHES.find(d=>d.id===m?.dishId);
  if(!m||m.date!==slot.date||m.meal!==slot.meal||m.key!==slot.key||!d||!allowedDish(d,s,prices,{ignoreMenuExclusions:legacyMenu||Object.hasOwn(spend,slot.key),ignorePreparationMode:Object.hasOwn(spend,slot.key),ignoreFoodExclusions:Object.hasOwn(spend,slot.key)}))throw new PlanError('invalidDish');
  if(previous&&(previous.protein===d.protein||previous.id===d.id))throw new PlanError('consecutiveRepeat');
  const expected=costDish(d,slot,s,prices);
  if((m.preparation||'home')!==(d.preparation||'home')||m.category!==d.category||m.protein!==d.protein||m.dish!==d.name||!Array.isArray(m.ingredients)||m.ingredients.length!==expected.ingredients.length)throw new PlanError('invalidDish');
  expected.ingredients.forEach((e,j)=>{const a=m.ingredients[j];if(!a||a.id!==e.id||a.quantity!==e.quantity||a.unitPrice!==e.unitPrice)throw new PlanError('priceMismatch');});
  if(m.cost!==expected.cost)throw new PlanError('priceMismatch');
  total+=spend[slot.key]??expected.cost;previous=d;return expected;
 });
 if(!allowOverBudget&&round(total)>s.budget)throw new PlanError('overBudget',{minimum:round(total)});
 return {...plan,meals,total:round(total)};
}
// Dynamic programming reserves the cheapest valid continuation before choosing a preferred dish.
// This keeps proper portions and budget feasibility even with immutable logged meals.
export function generatePlan(s,prices,{spend={},locked=[],seed=0,pantry={}}={}) {
 validateSettings(s);validatePrices(prices);const slots=calendar(s.month);validateSpend(spend,slots);
 const dishes=DISHES.filter(d=>allowedDish(d,s,prices));
 if(!dishes.length)throw new PlanError('noDishes');
 const options=slots.map(slot=>{
  const fixed=Object.hasOwn(spend,slot.key)?locked.find(m=>m.key===slot.key):null;
  if(Object.hasOwn(spend,slot.key)&&!fixed)throw new PlanError('missingLoggedMeal');
  return (fixed?DISHES.filter(d=>d.id===fixed.dishId&&allowedDish(d,s,prices,{ignoreMenuExclusions:true,ignorePreparationMode:true,ignoreFoodExclusions:true})):dishes).map(d=>costDish(d,slot,s,prices));
 });
 const memo=new Map();
 const minimum=(i,prev)=>{
  if(i===slots.length)return 0;
  const key=`${i}:${prev}`;if(memo.has(key))return memo.get(key);
  let best=Infinity;
  for(const m of options[i])if(m.protein!==prev)best=Math.min(best,(spend[m.key]??m.cost)+minimum(i+1,m.protein));
  memo.set(key,best);return best;
 };
 const floor=minimum(0,'');
 const expensive=[...dishes].sort((a,b)=>costDish(b,slots.find(x=>x.weight===1),s,prices).cost-costDish(a,slots.find(x=>x.weight===1),s,prices).cost)[0]?.category;
 if(!Number.isFinite(floor))throw new PlanError('needVariety',{category:expensive});
 if(round(floor)>s.budget)throw new PlanError('budgetConflict',{minimum:round(floor),category:expensive});
 let remaining=s.budget,prev='',meals=[];const counts={},dishCounts={};
 const categories=[...new Set(dishes.map(d=>d.category))];
 const baseWeights=Object.fromEntries(categories.map(c=>[c,s.preferences[c]==='often'?3:1]));
 const fullSlot=slots.find(x=>x.weight===1);
 const typical=Object.fromEntries(categories.map(c=>{const costs=dishes.filter(d=>d.category===c).map(d=>costDish(d,fullSlot,s,prices).cost).sort((a,b)=>a-b).slice(0,2);return [c,costs.reduce((a,b)=>a+b,0)/costs.length];}));
 const unlogged=slots.filter(slot=>!Object.hasOwn(spend,slot.key));
 const target=Math.max(1,(s.budget-Object.values(spend).reduce((a,b)=>a+b,0))/Math.max(1,unlogged.reduce((a,x)=>a+x.weight,0))*.94);
 const adjusted=lambda=>Object.fromEntries(categories.map(c=>[c,baseWeights[c]*Math.exp(-lambda*typical[c]/target)]));
 const average=ws=>categories.reduce((a,c)=>a+ws[c]*typical[c],0)/categories.reduce((a,c)=>a+ws[c],0);
 let low=0,high=30;
 if(average(baseWeights)>target)for(let step=0;step<30;step++){const middle=(low+high)/2;if(average(adjusted(middle))>target)low=middle;else high=middle;}
 const raw=average(baseWeights)>target?adjusted(high):baseWeights,scale=categories.length/categories.reduce((a,c)=>a+raw[c],0);
 const weights=Object.fromEntries(categories.map(c=>[c,raw[c]*scale]));
 for(let i=0;i<slots.length;i++) {
  const weightLeft=slots.slice(i).reduce((a,x)=>a+x.weight,0),share=remaining*slots[i].weight/weightLeft;
  const feasible=options[i].filter(m=>m.protein!==prev&&(spend[m.key]??m.cost)+minimum(i+1,m.protein)<=remaining+.001);
  feasible.sort((a,b)=>{
   const score=m=>{
    const fairness=((counts[m.category]||0)+.6)/weights[m.category];
    const premium=['pork','beef'].includes(m.category)&&!m.weekend?3:0;
    const breakfast=m.meal==='breakfast'&&!DISHES.find(d=>d.id===m.dishId).breakfast?2:0;
    const pantryBonus=m.preparation==='ready'?0:m.ingredients.reduce((n,x)=>n+Math.min(x.quantity,pantry[x.id]||0)*.15,0);
    const jitter=((m.dishId.length*13+i*7+seed*11)%17)/100;
    return fairness+premium+breakfast+(dishCounts[m.dishId]||0)*.28+Math.max(0,m.cost-share)/Math.max(share,1)*2-pantrysafe(pantryBonus)+jitter;
   };return score(a)-score(b)||a.dishId.localeCompare(b.dishId);
  });
  const chosen=feasible[0];if(!chosen)throw new PlanError('budgetConflict',{minimum:round(floor),category:expensive});
  meals.push(chosen);remaining=round(remaining-(spend[chosen.key]??chosen.cost));prev=chosen.protein;counts[chosen.category]=(counts[chosen.category]||0)+1;dishCounts[chosen.dishId]=(dishCounts[chosen.dishId]||0)+1;
 }
 const warnings=[];
 if(prices.some(p=>p.status==='estimate'))warnings.push('estimatedPrices');
 if(average(baseWeights)>target||dishes.some(d=>s.preferences[d.category]==='often'&&!meals.some(m=>m.category===d.category)))warnings.push('preferenceLimited');
 return validatePlan({meals,generator:'rules',createdAt:new Date().toISOString(),warnings,expensiveCategory:expensive,menuVersion:MENU_POLICY_VERSION},s,prices,spend);
}
function pantrysafe(n){return Math.min(n,1);}
export function budgetStats(plan,s,spend={}) {
 const meals=plan?.meals||[],spent=round(Object.values(spend).reduce((a,b)=>a+b,0));
 const pending=meals.filter(m=>!Object.hasOwn(spend,m.key)), weight=pending.reduce((a,m)=>a+m.weight,0);
 const planned=round(meals.reduce((a,m)=>a+m.cost,0));
 return {spent,planned,remaining:round(s.budget-spent),pending:pending.length,committed:round(spent+pending.reduce((a,m)=>a+m.cost,0)),share:weight?round((s.budget-spent)/weight):0,rollover:round(meals.filter(m=>Object.hasOwn(spend,m.key)).reduce((a,m)=>a+m.cost-spend[m.key],0))};
}
export function swapOptions(plan,key,s,prices,spend={},pantry={}) {
 if(Object.hasOwn(spend,key))return [];
 const index=plan.meals.findIndex(m=>m.key===key);if(index<0)return [];
 const slot=calendar(s.month)[index];
 return DISHES.filter(d=>d.id!==plan.meals[index].dishId&&allowedDish(d,s,prices)).map(d=>costDish(d,slot,s,prices)).filter(m=>{
  if(plan.meals[index-1]?.protein===m.protein||plan.meals[index+1]?.protein===m.protein)return false;
  try {validatePlan({...plan,meals:plan.meals.map((old,i)=>i===index?m:old)},s,prices,spend);return true;}catch{return false;}
 }).sort((a,b)=>{
  const coverage=m=>m.preparation==='ready'?0:m.ingredients.reduce((v,i)=>v+Math.min(pantry[i.id]||0,i.quantity)/i.quantity,0)/m.ingredients.length;
  return coverage(b)-coverage(a)||a.cost-b.cost;
 });
}
export function groceryList(meals,prices,pantry={}) {
 const sums={};for(const m of meals)for(const i of m.ingredients)sums[i.id]=(sums[i.id]||0)+i.quantity;
 return Object.entries(sums).map(([id,quantity])=>{const p=prices.find(p=>p.id===id);const needed=Math.max(0,round(quantity-(p.kind==='ready'?0:(pantry[id]||0))));return {...p,quantity:round(quantity),needed,cost:round(needed*p.price)};});
}
