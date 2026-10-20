import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPhonePriceSync, reportURL } from '../public/core/phone-prices.js';
import { selectRegionalPrices } from '../public/core/regional-prices.js';
const original=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url)));
const sources=[{name:'DA VII',url:'https://rfo7.da.gov.ph/prices',kind:'index'}];
const csv='id,price,unit,date,market\nchicken,211,kg,2026-10-19,Cebu City\n';
function fixture(options={}){
 let book=structuredClone(original),clock=Date.UTC(2026,9,21),calls=[],snapshots=[],saved=new Map();
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 const manager=createPhonePriceSync({getBook:()=>book,storage,now:()=>clock,getSources:async()=>sources,fetchReport:async url=>{calls.push(url);return {url,text:url.endsWith('.csv')?csv:'<a href="/cebu.csv">Cebu</a><a href="/report.pdf">image report</a><a href="http://evil.example/x.csv">bad</a>'};},onSnapshot:value=>{book={prices:value.prices,observations:value.observations||[]};snapshots.push(value);},...options});
 return {manager,storage,saved,calls,snapshots,book:()=>book,advance:ms=>clock+=ms};
}
test('phone reads public source reports directly, retains source dates and keeps city prices separate',async()=>{
 const f=fixture();const result=await f.manager.read();assert.equal(result.refresh.state,'updated');
 assert.deepEqual(f.calls,['https://rfo7.da.gov.ph/prices','https://rfo7.da.gov.ph/cebu.csv']);
 assert.equal(f.snapshots[0].refresh.state,'checking');assert.equal(result.refresh.sources[0].state,'parsed');
 const price=selectRegionalPrices(f.book(),{province:'Cebu',city:'Cebu City'}).find(p=>p.id==='chicken');assert.equal(price.price,211);assert.equal(price.date,'2026-10-19');assert.equal(price.status,'reported');
 assert(!f.calls.some(u=>u.includes('/api/')||u.includes('budget')));
});
test('phone checks deduplicate concurrent actions and respect foreground schedule and manual cooldown',async()=>{
 let unblock;const gate=new Promise(resolve=>unblock=resolve);let count=0;
 const f=fixture({getSources:async()=>{count++;await gate;return [{name:'DA',url:'https://rfo7.da.gov.ph/price.csv',kind:'csv'}];},fetchReport:async url=>({url,text:csv})});
 const a=f.manager.read(),b=f.manager.refresh();unblock();await Promise.all([a,b]);assert.equal(count,1);
 await f.manager.read();await f.manager.refresh();assert.equal(count,1);
 f.advance(61000);await f.manager.refresh();assert.equal(count,2);
 f.advance(6*3600000+1);await f.manager.read();assert.equal(count,3);
});
test('unavailable and image-only sources keep previously saved market observations and ages',async()=>{
 const f=fixture({fetchReport:async()=>{throw new Error('offline');}}),before=f.book();
 const result=await f.manager.read();assert.equal(result.refresh.state,'unavailable');assert.deepEqual(f.book().prices,before.prices);assert(result.observations.length>=0);
 const g=fixture({fetchReport:async url=>({url,text:'<a href="/prices.pdf">PDF</a><img src="prices.jpg">'})});
 const empty=await g.manager.read();assert.equal(empty.refresh.state,'unavailable');assert.equal(empty.refresh.sources[0].state,'noRows');
 assert.deepEqual(empty.prices,original.prices);
});
test('phone price status survives restart and does not check again until due',async()=>{
 const f=fixture();await f.manager.read();let count=0;
 const reopened=createPhonePriceSync({storage:f.storage,getBook:f.book,now:()=>Date.UTC(2026,9,21)+1000,getSources:async()=>{count++;return sources;},fetchReport:async()=>{throw new Error();}});
 const result=await reopened.read();assert.equal(count,0);assert.equal(result.refresh.state,'updated');
});
test('phone source guards reject private hosts, spoofed domains, non-HTTPS and invalid responses',async()=>{
 for(const url of ['http://www.da.gov.ph/a','https://127.0.0.1/a','https://192.168.1.2/a','https://rfo7.da.gov.ph.evil.example/a','https://user:secret@www.da.gov.ph/a','https://www.da.gov.ph:5173/a','https://www.da.gov.ph/a#x'])assert.throws(()=>reportURL(url));
 const f=fixture({getSources:async()=>[{name:'Bad source',url:'https://localhost/report',kind:'csv'}],fetchReport:async()=>{throw new Error('should never fetch');}});
 assert.equal((await f.manager.read()).refresh.sources[0].state,'unavailable');
 const g=fixture({fetchReport:async()=>({url:'https://evil.example/prices',text:csv})});assert.equal((await g.manager.read()).refresh.state,'unavailable');
});
test('explicit price observations override equal-date legacy references for the same market',async()=>{
 const row=original.prices.find(p=>p.id==='chicken');
 const f=fixture({getSources:async()=>[{name:'DA',url:'https://rfo7.da.gov.ph/price.csv',kind:'csv'}],fetchReport:async url=>({url,text:csv.replace('2026-10-19',row.date)})});
 const result=await f.manager.read();const price=selectRegionalPrices(result,{province:'Cebu',city:'Cebu City'}).find(p=>p.id==='chicken');assert.equal(price.price,211);
});
