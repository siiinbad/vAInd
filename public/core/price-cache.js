import { validatePriceBook, observationsFromBook } from './regional-prices.js';
import { locationKey } from './locations.js';

// Merge independently by product and reported location; incoming equal-date corrections win.
export function mergePriceBooks(cached,incoming){
 validatePriceBook(incoming);
 if(!cached)return structuredClone({prices:incoming.prices,observations:incoming.observations||[]});
 validatePriceBook(cached);
 const compatible=(a,b)=>a.unit===b.unit&&a.category===b.category&&(a.kind||'ingredient')===(b.kind||'ingredient');
 const newer=(a,b)=>{
  if(a.status==='reported'&&b.status==='estimate')return a;
  if(b.status==='reported'&&a.status==='estimate')return b;
  return b.date>=a.date?b:a;
 };
 const products=new Map(cached.prices.map(p=>[p.id,p]));
 for(const p of incoming.prices){const previous=products.get(p.id);products.set(p.id,previous&&compatible(previous,p)?newer(previous,p):p);}
 const observations=new Map();
 for(const p of [...observationsFromBook(cached),...observationsFromBook(incoming)]){
  if(!compatible(products.get(p.id),p))continue;
  const key=`${p.id}:${locationKey(p.location)}`,previous=observations.get(key);
  if(!previous||p.date>=previous.date)observations.set(key,p);
 }
 return structuredClone(validatePriceBook({prices:[...products.values()],observations:[...observations.values()]}));
}
