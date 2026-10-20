import { readFile } from 'node:fs/promises';
import { refresh } from '../scripts/refresh-prices.mjs';
import { validatePriceBook } from '../public/core/regional-prices.js';

export const DEFAULT_REFRESH_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_PRICE_FILE = new URL('../public/data/prices.json', import.meta.url);

// One scheduler per local server. A shared promise deduplicates tabs, manual refreshes and timer ticks.
export function createPriceService({
 file = DEFAULT_PRICE_FILE,
 refreshPrices = refresh,
 intervalMs = DEFAULT_REFRESH_MS,
 cooldownMs = 60_000,
 now = () => Date.now(),
 setTimer = setInterval,
 clearTimer = clearInterval,
} = {}) {
 if (!Number.isFinite(intervalMs) || intervalMs < 300_000 || intervalMs > 86_400_000) throw new Error('Invalid price refresh interval');
 let pending = null;
 let timer = null;
 let stopped = false;
 let status = {
  state: 'idle', intervalMinutes: intervalMs / 60_000,
  lastAttemptAt: null, lastCheckedAt: null, lastSuccessAt: null, nextCheckAt: null,
  updated: 0, failures: 0, sources: [],
 };
 const stamp = () => new Date(now()).toISOString();
 async function snapshot() {
  const data = JSON.parse(await readFile(file, 'utf8'));
  validatePriceBook(data);
  return { ...data, refresh: { ...status, sources: [...status.sources] } };
 }
 function check() {
  if (pending) return pending;
  if (stopped) return Promise.resolve({ ...status });
  if (status.lastAttemptAt && now() - Date.parse(status.lastAttemptAt) < cooldownMs) return Promise.resolve({ ...status });
  status = { ...status, state: 'checking', lastAttemptAt: stamp(), nextCheckAt: new Date(now() + intervalMs).toISOString() };
  pending = Promise.resolve().then(async () => {
   try {
    const result = await refreshPrices({ file, quiet: true });
    status = {
     ...status, state: result.failures ? (result.updated ? 'partial' : 'unavailable') : (result.updated ? 'updated' : 'unchanged'),
     lastCheckedAt: stamp(), updated: result.updated, failures: result.failures, sources: result.sources || [],
     lastSuccessAt: result.updated ? stamp() : status.lastSuccessAt,
    };
   } catch {
    status = { ...status, state: 'unavailable', lastCheckedAt: stamp(), updated: 0, failures: Math.max(1, status.failures) };
   }
   return { ...status };
  }).finally(() => { pending = null; });
  return pending;
 }
 function start() {
  if (timer || stopped) return;
  void check();
  timer = setTimer(() => { void check(); }, intervalMs);
  timer?.unref?.();
 }
 function stop() {
  stopped = true;
  if (timer) clearTimer(timer);
  timer = null;
 }
 return { snapshot, check, start, stop };
}
