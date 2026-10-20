import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { locationKey } from '../public/core/locations.js';
import { observationsFromBook, validatePriceBook, legacyObservationLocation } from '../public/core/regional-prices.js';

import { trustedReportHost as trusted, parseCSV, normalizeRows, parseCdn, discoverReports, parseFeed } from '../public/core/price-reports.js';
export { parseCSV, normalizeRows, parseCdn, discoverReports, parseFeed } from '../public/core/price-reports.js';

const defaultFile = fileURLToPath(new URL('../public/data/prices.json', import.meta.url));
async function fetchText(url, fetcher) {
 const target = new URL(url);
 if (target.protocol !== 'https:' || target.username || target.password || !trusted(target.hostname)) throw new Error('Untrusted price source');
 const response = await fetcher(target.href, { headers: { 'User-Agent': 'vAInd local price refresher/1.1 (personal household planning)' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 const text = await response.text(); if (text.length > 6000000) throw new Error('Report too large');
 return text;
}
export async function refresh({ file = defaultFile, importFile, fetcher = fetch, offline = false, quiet = false, sources } = {}) {
 file = file instanceof URL ? fileURLToPath(file) : file;
 let data = JSON.parse(await readFile(file, 'utf8')); validatePriceBook(data);
 let observations = [], failures = 0; const discoveries = [], sourceResults = [];
 if (importFile) observations.push(...normalizeRows(parseCSV(await readFile(importFile, 'utf8')), data.prices));
 if (!offline) {
  const configured = sources || JSON.parse(await readFile(new URL('../public/data/price-sources.json', import.meta.url), 'utf8')).sources;
  const results = await Promise.allSettled(configured.map(async source => {
   const text = await fetchText(source.url, fetcher);
   let rows = [], links = [], childFailures = 0;
   if (source.kind === 'cdn') rows = parseCdn(text, source.url, data.prices);
   else if (source.kind === 'csv') rows = parseFeed(text, source, data.prices);
   else {
    links = discoverReports(text, source.url, source.kind === 'cdn-index' ? 'cdn' : 'da');
    const follow = source.kind === 'cdn-index' ? links.slice(0, 3) : links.filter(link => new URL(link).pathname.toLowerCase().endsWith('.csv')).slice(0, 3);
    const children = await Promise.allSettled(follow.map(async url => {
     const child = await fetchText(url, fetcher);
     return source.kind === 'cdn-index' ? parseCdn(child, url, data.prices) : parseFeed(child, { name: source.name, url }, data.prices);
    }));
    for (const child of children) if (child.status === 'fulfilled') rows.push(...child.value); else childFailures++;
   }
   return { name: source.name, url: source.url, state: childFailures ? 'partial' : rows.length ? 'parsed' : 'noRows', observations: rows, links, failures: childFailures };
  }));
  for (let i = 0; i < results.length; i++) {
   const result = results[i];
   if (result.status === 'fulfilled') {
    const { observations: rows, links, ...summary } = result.value;
    observations.push(...rows); discoveries.push(...links); failures += summary.failures;
    sourceResults.push({ ...summary, count: rows.length });
   } else {
    failures++;
    sourceResults.push({ name: configured[i].name, url: configured[i].url, state: 'unavailable', count: 0 });
    if (!quiet) console.warn(`Source retained: ${configured[i].name}: ${result.reason.message}`);
   }
  }
 }
 // A CLI import may have completed while network requests were in flight. Merge into the latest file.
 if(observations.length){data=JSON.parse(await readFile(file,'utf8'));validatePriceBook(data);}
 let updated = 0;
 const byMarket=new Map();
 for(const observation of observationsFromBook(data)){
  const key=`${observation.id}@${locationKey(observation.location)}`,old=byMarket.get(key);
  if(!old||observation.date>old.date)byMarket.set(key,observation);
 }
 for (const next of observations) {
  const key=`${next.id}@${locationKey(next.location)}`,old=byMarket.get(key);
  const correction=old&&next.date===old.date&&next.price!==old.price&&(importFile||next.sourceUrl===old.sourceUrl);
  if(!old||next.date>old.date||correction){byMarket.set(key,next);updated++;}
  // Keep the legacy reference array stable across areas. Other cities live in observations.
  const index=data.prices.findIndex(p=>p.id===next.id),reference=data.prices[index];
  const referenceLocation=legacyObservationLocation(reference);
  if(referenceLocation&&locationKey(referenceLocation)===locationKey(next.location)&&(next.date>reference.date||(next.date===reference.date&&correction)))data.prices[index]=next;
 }
 if(updated){data.version=2;data.region='Philippines';data.observations=[...byMarket.values()];}
 validatePriceBook(data);
 if (updated) {
  data.refreshedAt = new Date().toISOString(); const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => {}); }
 }
 if (!quiet) {
  console.log(`${updated} prices updated; ${failures} sources unavailable. Original observation dates preserved.`);
  if (discoveries.length) console.log(`Source reports (only explicitly located market CSV rows are auto-imported):\n${[...new Set(discoveries)].slice(0, 8).join('\n')}`);
  if (!updated) console.log('No newer verified market observations. Existing prices are unchanged; blocked or image-only reports still need a verified import or local override.');
 }
 return { updated, failures, sources: sourceResults };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 const args = process.argv.slice(2), at = args.indexOf('--import'), importFile = at < 0 ? undefined : args[at + 1];
 if (at >= 0 && !importFile) { console.error('Usage: npm run prices:refresh -- --import report.csv [--offline]'); process.exitCode = 1; }
 else refresh({ importFile, offline: args.includes('--offline') }).then(r => { if (!r.updated && r.failures) process.exitCode = 2; }).catch(e => { console.error(`Prices were kept: ${e.message}`); process.exitCode = 1; });
}
