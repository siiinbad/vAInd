import { validatePrices } from './planner.js';
import { DEFAULT_LOCATION, validLocation, normalizeLocation, locationKey, provinceKey } from './locations.js';

export function validatePriceBook(book){
 validatePrices(book?.prices);
 if(book.observations!==undefined){
  if(!Array.isArray(book.observations)||book.observations.length>50000)throw new Error('invalidPrices');
  for(const observation of book.observations){
   validatePrices([observation]);
   const product=book.prices.find(p=>p.id===observation.id);
   if(!product||product.unit!==observation.unit||product.category!==observation.category||(product.kind||'ingredient')!==(observation.kind||'ingredient')||observation.status!=='reported'||!validLocation(observation.location,{provinceOnly:true}))throw new Error('invalidPrices');
  }
 }
 return book;
}
export function legacyObservationLocation(price){
 if(price.location)return normalizeLocation(price.location);
 if(price.status!=='reported')return null;
 return /mandaue/i.test(price.source)?{province:'Cebu',city:'Mandaue City'}:{...DEFAULT_LOCATION};
}
export function observationsFromBook(book){
 const explicit=book.observations||[];
 const fallback=book.prices.filter(p=>p.status==='reported').map(p=>({...p,location:legacyObservationLocation(p)}));
 return [...fallback,...explicit];
}
export function selectRegionalPrices(book,requested=DEFAULT_LOCATION,overrides={}){
 const location=normalizeLocation(requested),key=locationKey(location),province=provinceKey(location);
 const observations=observationsFromBook(book);
 return book.prices.map(template=>{
  const candidates=observations.filter(p=>p.id===template.id&&p.unit===template.unit&&p.status==='reported'&&provinceKey(p.location)===province);
  const latest=list=>list.reduce((latest,p)=>!latest||p.date>=latest.date?p:latest,undefined);
  const local=latest(candidates.filter(p=>locationKey(p.location)===key));
  const regional=local||latest(candidates);
  let selected;
  if(regional)selected={...regional,priceScope:local?'city':'province'};
  else selected={...template,status:'estimate',location:null,referenceLocation:legacyObservationLocation(template),priceScope:template.status==='reported'?'reference':'estimate'};
  const override=overrides[template.id];
  if(override)selected={...selected,...override,status:'override',location:{...location},referenceLocation:null,priceScope:'override'};
  return selected;
 });
}
export function overridesForLocation(state,location=DEFAULT_LOCATION){return state.locationOverrides?.[locationKey(location)]||{};}
export function migrateRegionalProfile(state){
 let changed=false;
 if(!state.locationOverrides){state.locationOverrides={};changed=true;}
 if(state.overrides&&Object.keys(state.overrides).length){
  const key=locationKey(DEFAULT_LOCATION);state.locationOverrides[key]={...state.overrides,...state.locationOverrides[key]};state.overrides={};changed=true;
 }
 for(const settings of [state.settings,...Object.values(state.months).map(r=>r.settings)].filter(Boolean)){
  if(!settings.location){settings.location={...DEFAULT_LOCATION};changed=true;}
 }
 return changed;
}
