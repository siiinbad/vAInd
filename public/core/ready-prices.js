import { DEFAULT_LOCATION, sameLocation } from './locations.js';
import { selectRegionalPrices, overridesForLocation } from './regional-prices.js';
// Only add missing products. Logged/history prices remain immutable and location-scoped.
export function extendReadyPrices(state, latest) {
 const book=Array.isArray(latest)?{prices:latest}:latest;
 let changed=false;
 for(const record of Object.values(state.months)){
  const location=record.settings?.location||DEFAULT_LOCATION;
  const applicable=selectRegionalPrices(book,location,{...(sameLocation(location,DEFAULT_LOCATION)?state.overrides:{}),...overridesForLocation(state,location)});
  const existing=new Set(record.prices.map(p=>p.id));
  for(const p of applicable.filter(p=>p.kind==='ready'))if(!existing.has(p.id)){record.prices.push({...p});existing.add(p.id);changed=true;}
 }
 return changed;
}
