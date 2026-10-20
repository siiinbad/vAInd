import { validatePriceBook } from './regional-prices.js';
export const PRICE_SYNC_MS = 5 * 60 * 1000;
const STATES = ['idle', 'checking', 'updated', 'unchanged', 'partial', 'unavailable'];
export function validatePriceSnapshot(value) {
 validatePriceBook(value);
 if (value.refresh && (!STATES.includes(value.refresh.state) || !Number.isFinite(value.refresh.intervalMinutes) || value.refresh.intervalMinutes < 5 || value.refresh.intervalMinutes > 1440)) throw new Error('Invalid price status');
 if(value.refresh){
  for(const key of ['lastAttemptAt','lastCheckedAt','lastSuccessAt','nextCheckAt'])if(value.refresh[key]!=null&&(typeof value.refresh[key]!=='string'||!Number.isFinite(Date.parse(value.refresh[key]))))throw new Error('Invalid check timestamp');
  if(value.refresh.sources&&(!Array.isArray(value.refresh.sources)||value.refresh.sources.some(s=>!s||typeof s.name!=='string'||!['parsed','partial','noRows','unavailable'].includes(s.state))))throw new Error('Invalid source status');
 }
 return value;
}
export function createPriceSync({ fetcher = fetch, onSnapshot = () => {}, onError = () => {}, isActive = () => true, setTimer = setInterval, clearTimer = clearInterval, setQuickTimer = setTimeout, clearQuickTimer = clearTimeout } = {}) {
 let timer = null, quickTimer = null, pending = null, pendingManual = false;
 async function read(manual = false) {
  if (pending) return manual&&!pendingManual?pending.catch(()=>{}).then(()=>read(true)):pending;
  pendingManual=manual;
  pending = Promise.resolve().then(async () => {
   try {
    const response = await fetcher('/api/prices', {
     method: manual ? 'POST' : 'GET', cache: 'no-store',
     ...(manual ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
     signal: AbortSignal.timeout(manual ? 50000 : 15000),
    });
    if (!response.ok) throw new Error('Price server unavailable');
    const snapshot = validatePriceSnapshot(await response.json());
    onSnapshot(snapshot);
    if(quickTimer)clearQuickTimer(quickTimer);
    if(timer&&snapshot.refresh?.state==='checking')quickTimer=setQuickTimer(()=>{if(isActive())void read().catch(()=>{});},3000);
    return snapshot;
   } catch (error) { onError(error); throw error; }
  }).finally(() => { pending = null; pendingManual = false; });
  return pending;
 }
 function start() {
  if (timer) return;
  timer = setTimer(() => { if (isActive()) void read().catch(() => {}); }, PRICE_SYNC_MS);
 }
 function stop() { if (timer) clearTimer(timer); if(quickTimer)clearQuickTimer(quickTimer); timer = null; quickTimer = null; }
 return { read, refresh: () => read(true), start, stop };
}
