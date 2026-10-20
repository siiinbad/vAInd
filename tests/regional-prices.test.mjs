import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_LOCATION, inferReportLocation, locationKey, sameLocation } from '../public/core/locations.js';
import { migrateRegionalProfile, overridesForLocation, selectRegionalPrices, validatePriceBook } from '../public/core/regional-prices.js';
import { validateSettings, costDish, calendar } from '../public/core/planner.js';
import { CATEGORIES, DISHES } from '../public/core/catalog.js';
import { extendReadyPrices } from '../public/core/ready-prices.js';
import { mergePriceBooks } from '../public/core/price-cache.js';
const full=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url)));
const cebu={province:'Cebu',city:'Cebu City'},mandaue={province:'Cebu',city:'Mandaue City'},manila={province:'Metro Manila',city:'Manila'};
const product=full.prices.find(p=>p.id==='chicken');
const observation=(location,price,date='2026-10-19')=>({...product,location,price,date,status:'reported'});
const book={prices:[product],observations:[observation(cebu,200,'2026-10-17'),observation(cebu,210,'2026-10-18'),observation(mandaue,215),observation({province:'Metro Manila',city:''},220)]};

test('offline startup and older server snapshots retain newer cached reports per city',()=>{
 const cached={prices:full.prices,observations:[observation(cebu,250,'2026-10-21'),observation(manila,240,'2026-10-20')]};
 const merged=mergePriceBooks(cached,full);assert.equal(selectRegionalPrices(merged,cebu).find(p=>p.id==='chicken').price,250);
 assert.equal(selectRegionalPrices(merged,manila).find(p=>p.id==='chicken').price,240);
 const correction={prices:full.prices,observations:[observation(cebu,255,'2026-10-21')]};
 const corrected=mergePriceBooks(merged,correction);assert.equal(selectRegionalPrices(corrected,cebu).find(p=>p.id==='chicken').price,255);
 assert.equal(selectRegionalPrices(corrected,manila).find(p=>p.id==='chicken').price,240);
 assert.equal(cached.observations[0].price,250);validatePriceBook(corrected);
});
test('price merging adds new products without inventing reported observations',()=>{
 const cached={prices:full.prices.filter(p=>p.kind!=='ready'),observations:[]},merged=mergePriceBooks(cached,full);
 assert.equal(merged.prices.length,full.prices.length);assert(merged.observations.every(p=>p.status==='reported'));
 assert.throws(()=>mergePriceBooks(cached,{prices:[{...product,price:0}]}));
});

test('location matching normalizes city and NCR labels and rejects contradictory provenance',()=>{
 assert(sameLocation({province:'Cebu Province',city:'City of Cebu'},cebu));
 assert.equal(locationKey({province:'NCR',city:'City of Manila'}),locationKey(manila));
 assert.throws(()=>inferReportLocation({market:'NCR',province:'Cebu',city:'Cebu City'}));
 assert.throws(()=>inferReportLocation({market:'Unspecified Market'}));
 assert.deepEqual(inferReportLocation({market:'La Paz Market',province:'Iloilo',city:'Iloilo City'}),{province:'Iloilo',city:'Iloilo City'});
});
test('newest city report wins over other cities; same province is explicitly labelled',()=>{
 const local=selectRegionalPrices(book,cebu)[0];assert.equal(local.price,210);assert.equal(local.priceScope,'city');
 const provincial=selectRegionalPrices(book,{province:'Cebu',city:'Toledo City'})[0];
 assert.equal(provincial.price,215);assert.equal(provincial.priceScope,'province');assert.deepEqual(provincial.location,mandaue);
 const metro=selectRegionalPrices(book,manila)[0];assert.equal(metro.price,220);assert.equal(metro.priceScope,'province');
});
test('missing local reports are reference estimates, never reported as local or multiplied',()=>{
 const price=selectRegionalPrices(book,{province:'Davao del Sur',city:'Davao City'})[0];
 assert.equal(price.price,product.price);assert.equal(price.status,'estimate');assert.equal(price.priceScope,'reference');assert.equal(price.location,null);assert.deepEqual(price.referenceLocation,DEFAULT_LOCATION);
});
test('overrides and legacy override migration remain isolated by household location',()=>{
 const override={price:199,date:'2026-10-19',source:'Your price',sourceUrl:null,status:'override'};
 const historical=[{...product,price:123}],state={settings:{},months:{'2026-10':{settings:{},prices:historical}},overrides:{chicken:override}};
 assert(migrateRegionalProfile(state));assert.equal(migrateRegionalProfile(state),false);
 assert.deepEqual(state.settings.location,cebu);assert.equal(state.months['2026-10'].prices[0].price,123);
 assert.equal(selectRegionalPrices(book,cebu,overridesForLocation(state,cebu))[0].price,199);
 assert.equal(selectRegionalPrices(book,manila,overridesForLocation(state,manila))[0].price,220);
 assert.deepEqual(state.overrides,{});
 const old=full.prices.filter(p=>p.kind!=='ready');state.months.manila={settings:{location:manila},prices:structuredClone(old)};
 state.locationOverrides[locationKey(cebu)]['ready-chicken-adobo']={...override,price:12};
 extendReadyPrices(state,full);
 assert.notEqual(state.months.manila.prices.find(p=>p.id==='ready-chicken-adobo').price,12);
});
test('malformed observations or settings fail validation before accepting location prices',()=>{
 validatePriceBook(book);
 for(const change of [{location:null},{location:{province:'',city:'Manila'}},{unit:'piece'},{status:'estimate'},{id:'unknown'}]){
  assert.throws(()=>validatePriceBook({prices:[product],observations:[{...book.observations[0],...change}]}));
 }
 const settings={month:'2026-10',budget:8000,household:4,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[]};
 for(const location of [{province:'Cebu',city:''},{province:'Cebu',city:'\nManila'},null])assert.throws(()=>validateSettings({...settings,location}),e=>e.code==='invalidLocation');
});
test('bundled Metro Manila observations change meal costs without changing Cebu snapshots',()=>{
 const local=selectRegionalPrices(full,cebu),metro=selectRegionalPrices(full,manila);
 assert.equal(metro.find(p=>p.id==='chicken').price,214.36);assert.equal(metro.find(p=>p.id==='chicken').status,'reported');
 assert.equal(local.find(p=>p.id==='chicken').price,product.price);
 const s={household:4},dish=DISHES.find(d=>d.id==='chicken-adobo'),slot=calendar('2026-10')[0];
 assert.notEqual(costDish(dish,slot,s,local).cost,costDish(dish,slot,s,metro).cost);
});
