import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseCSV,normalizeRows,parseCdn,refresh,discoverReports,parseFeed} from '../scripts/refresh-prices.mjs';
const original=await readFile(new URL('../public/data/prices.json',import.meta.url),'utf8'),prices=JSON.parse(original).prices;
const row={id:'chicken',price:'210',unit:'kg',date:'2026-10-19',source:'DA VII · Cebu market',sourceUrl:'https://rfo7.da.gov.ph/report.pdf',market:'Cebu City'};
test('CSV parser handles quotes, commas, CRLF and rejects unclosed quotes',()=>{assert.deepEqual(parseCSV('name,source\r\n"Egg, medium","DA ""Cebu"""\r\n'),[{name:'Egg, medium',source:'DA "Cebu"'}]);assert.throws(()=>parseCSV('id\n"bad'));});
test('imports require a trusted source, identified market, matching unit and valid date',()=>{assert.equal(normalizeRows([row],prices)[0].price,210);for(const diff of [{market:'Manila'},{unit:'piece'},{sourceUrl:'https://example.com/price.pdf'},{date:'2026-02-31'},{date:'2099-01-01'},{province:'Iloilo',city:'Iloilo City'}])assert.throws(()=>normalizeRows([{...row,...diff}],prices));});
test('CDN parser uses observation date and facts without inventing image prices',()=>{const text='Mandaue City Public Market today, Friday, July 26, 2024. Pork lean meat is P350 and ginaling costs P330. Milkfish costs P200 per kilo while local round scad is P140.';const rows=parseCdn(text,'https://cebudailynews.inquirer.net/509909/report',prices);assert.equal(rows.length,3);assert(rows.every(r=>r.date==='2024-07-26'));assert.equal(parseCdn('Current prices <img src="report.jpg">','https://cebudailynews.inquirer.net/report',prices).length,0);});
test('refresh atomically imports verified data and failures preserve existing observations',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'vaind-prices-'));try{const file=path.join(dir,'prices.json'),csv=path.join(dir,'report.csv');await writeFile(file,original);await writeFile(csv,[Object.keys(row).join(','),Object.values(row).join(',')].join('\n'));const result=await refresh({file,importFile:csv,offline:true});assert.equal(result.updated,1);assert.equal(JSON.parse(await readFile(file)).prices[0].price,210);const before=await readFile(file,'utf8');const failed=await refresh({file,fetcher:async()=>{throw new Error('source offline');}});assert.equal(failed.failures,4);assert.equal(await readFile(file,'utf8'),before);}finally{await rm(dir,{recursive:true,force:true});}});
test('latest-report discovery accepts only trusted matching links and removes duplicates',()=>{
 const html='<a href="https://evil.example/123/presyo-merkado-fake">bad</a><a href="/123/presyo-merkado-cebu">new</a><a href="/123/presyo-merkado-cebu">same</a>';
 assert.deepEqual(discoverReports(html,'https://cebudailynews.inquirer.net/category/presyo-merkado','cdn'),['https://cebudailynews.inquirer.net/123/presyo-merkado-cebu']);
});
test('DA structured feeds retain Cebu and NCR as separate areas',()=>{
 const csv='Commodity,Price,Unit,Observation date,Location\nchicken,210,kg,2026-10-19,Cebu City\nchicken,999,kg,2026-10-19,NCR\n';
 const result=parseFeed(csv,{name:'DA VII',url:'https://rfo7.da.gov.ph/report.csv'},prices);
 assert.equal(result.length,2);assert.equal(result[0].price,210);assert.equal(result[0].date,'2026-10-19');
 assert.deepEqual(result[0].location,{province:'Cebu',city:'Cebu City'});
 assert.deepEqual(result[1].location,{province:'Metro Manila',city:''});
});
test('multi-location imports keep the same product separately without replacing Cebu reference prices',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'vaind-area-'));
 try{
  const file=path.join(dir,'prices.json'),csv=path.join(dir,'report.csv');await writeFile(file,original);
  const rows=[{...row,price:'215',market:'Carbon Market',province:'Cebu',city:'Cebu City'},{...row,price:'225',market:'La Paz Market',province:'Iloilo',city:'Iloilo City'}];
  await writeFile(csv,[Object.keys(rows[0]).join(','),...rows.map(r=>Object.values(r).join(','))].join('\n'));
  assert.equal((await refresh({file,importFile:csv,offline:true,quiet:true})).updated,2);
  const data=JSON.parse(await readFile(file));assert.equal(data.prices.find(p=>p.id==='chicken').price,215);
  assert.equal(data.observations.find(p=>p.id==='chicken'&&p.location.province==='Iloilo').price,225);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('automatic refresh follows DA CSV reports and updates prices without relabeling observation dates',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'vaind-live-'));
 try{
  const file=path.join(dir,'prices.json');await writeFile(file,original);
  const fetcher=async url=>({ok:true,text:async()=>url.endsWith('.csv')?'id,price,unit,date,market\nchicken,211,kg,2026-10-19,Cebu City\n':'<a href="/cebu.csv">Report</a>'});
  const result=await refresh({file,quiet:true,fetcher,sources:[{name:'DA VII',url:'https://rfo7.da.gov.ph/prices',kind:'index'}]});
  assert.equal(result.updated,1);const data=JSON.parse(await readFile(file));assert.equal(data.prices[0].price,211);assert.equal(data.prices[0].date,'2026-10-19');assert.equal(result.sources[0].state,'parsed');
 }finally{await rm(dir,{recursive:true,force:true});}
});
