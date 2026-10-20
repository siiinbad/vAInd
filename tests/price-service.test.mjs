import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriceService, DEFAULT_REFRESH_MS } from '../server/price-service.mjs';
import { createPriceSync, PRICE_SYNC_MS, validatePriceSnapshot } from '../public/core/price-sync.js';
import { readFile } from 'node:fs/promises';
const file=new URL('../public/data/prices.json',import.meta.url);
const prices=JSON.parse(await readFile(file)).prices;
const payload={prices,refresh:{state:'unchanged',intervalMinutes:360,lastCheckedAt:'2026-10-20T03:00:00Z',sources:[]}};
test('server checks at startup, repeats on schedule, and deduplicates concurrent refreshes',async()=>{
 let time=Date.parse('2026-10-20T03:00:00Z'),calls=0,tick,cleared=false;
 const service=createPriceService({file,now:()=>time,refreshPrices:async()=>{calls++;return {updated:1,failures:0,sources:[]};},setTimer:(fn,ms)=>{tick=fn;assert.equal(ms,DEFAULT_REFRESH_MS);return 1;},clearTimer:()=>{cleared=true;}});
 service.start();await Promise.all([service.check(),service.check()]);assert.equal(calls,1);
 let snapshot=await service.snapshot();assert.equal(snapshot.refresh.state,'updated');assert.equal(snapshot.refresh.nextCheckAt,'2026-10-20T09:00:00.000Z');
 await service.check();assert.equal(calls,1);time+=DEFAULT_REFRESH_MS;tick();await service.check();assert.equal(calls,2);
 service.stop();assert(cleared);
});
test('failed checks preserve observed prices and expose failure independently of price age',async()=>{
 let time=Date.parse('2026-10-20T03:00:00Z'),calls=0;
 const service=createPriceService({file,now:()=>time,refreshPrices:()=>{calls++;throw new Error('offline');}});
 await service.check();const failed=await service.snapshot();assert.deepEqual(failed.prices,prices);assert.equal(failed.refresh.state,'unavailable');assert.equal(failed.refresh.lastSuccessAt,null);
 time+=60001;await service.check();assert.equal(calls,2);service.stop();
});
test('browser sync polls without AI calls, deduplicates reads and uses POST only for explicit refresh',async()=>{
 const calls=[],seen=[];let tick,stopped=false;
 const sync=createPriceSync({fetcher:async(url,options)=>{calls.push({url,method:options.method});return {ok:true,json:async()=>structuredClone(payload)};},onSnapshot:value=>seen.push(value),setTimer:(fn,ms)=>{tick=fn;assert.equal(ms,PRICE_SYNC_MS);return 1;},clearTimer:()=>{stopped=true;}});
 sync.start();await Promise.all([sync.read(),sync.read()]);assert.equal(calls.length,1);
 await sync.refresh();assert.deepEqual(calls[1],{url:'/api/prices',method:'POST'});
 tick();await sync.read();assert.equal(calls.length,3);assert.equal(seen.length,3);sync.stop();assert(stopped);
});
test('malformed snapshots and failed syncs keep the previous browser snapshot',async()=>{
 let seen=0,errors=0;const sync=createPriceSync({fetcher:async()=>({ok:true,json:async()=>({prices:[]})}),onSnapshot:()=>seen++,onError:()=>errors++});
 await assert.rejects(sync.read());await assert.rejects(sync.read());assert.equal(seen,0);assert.equal(errors,2);
 assert.throws(()=>validatePriceSnapshot({...payload,refresh:{...payload.refresh,lastCheckedAt:'bad'}}));
 assert.throws(()=>createPriceService({intervalMs:1}));
});
