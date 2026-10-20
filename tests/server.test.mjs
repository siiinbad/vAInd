import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const householdDirectory=await mkdtemp(path.join(os.tmpdir(),'vaind-http-household-'));
process.env.HOUSEHOLD_DATA_DIR=householdDirectory;
process.env.PORT='0';
process.env.AUTO_PRICE_REFRESH='false';
const {server}=await import('../server.mjs');
if(!server.listening)await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
test.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(householdDirectory,{recursive:true,force:true});});
test('server serves app, modules, price file and local health',async()=>{for(const route of ['/','/app.js','/styles.css','/core/planner.js','/data/prices.json','/api/health','/api/prices']){const response=await fetch(`${base}${route}`);assert.equal(response.status,200,route);assert(response.headers.get('content-security-policy').includes("script-src 'self'"));}});
test('server hides private files and rejects invalid AI requests and cross origins',async()=>{for(const route of ['/.env','/server.mjs','/%2e%2e/package.json'])assert.equal((await fetch(`${base}${route}`)).status,404);const cross=await fetch(`${base}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});assert.equal(cross.status,403);const invalid=await fetch(`${base}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,400);});
test('mobile shell assets are served and local-only mode does not expose network addresses',async()=>{
 for(const [route,type]of [['/manifest.webmanifest','application/manifest+json'],['/icons/icon-192.png','image/png'],['/icons/icon-512.png','image/png'],['/sw.js','text/javascript']]){const response=await fetch(`${base}${route}`);assert.equal(response.status,200);assert(response.headers.get('content-type').startsWith(type));}
 assert.deepEqual(await (await fetch(`${base}/api/network`)).json(),{networkEnabled:false,urls:[]});
 for(const route of ['/install','/install.js','/install.css'])assert.equal((await fetch(`${base}${route}`)).status,200);
 assert.deepEqual(await (await fetch(`${base}/api/install-info`)).json(),{httpsEnabled:false,networkEnabled:false,urls:[],certificate:null});
 assert.equal((await fetch(`${base}/install/root-ca.crt`)).status,404);
 const http=await import('node:http');
 const invalidHost=await new Promise((resolve,reject)=>{http.get(`${base}/`,{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});
 assert.equal(invalidHost,403);
});
test('household HTTP API requires membership and validates revisions, origin and content type',async()=>{
 const request=(route,method,data,credentials,headers={})=>fetch(`${base}${route}`,{method,headers:{'Content-Type':'application/json',...(credentials?{Authorization:`Bearer ${credentials.id}.${credentials.token}`} : {}),...headers},...(data?{body:JSON.stringify(data)}:{})});
 const state={version:1,profileVersion:2,months:{},overrides:{},pantry:{}};
 const created=await request('/api/households','POST',{name:'Alex',householdName:'Shared home',state});assert.equal(created.status,201);const owner=await created.json();
 assert.equal((await fetch(`${base}/api/household`)).status,401);
 const joined=await request('/api/households/join','POST',{name:'Sam',code:owner.snapshot.inviteCode});assert.equal(joined.status,201);const partner=await joined.json();
 const update=await request('/api/household','PUT',{revision:partner.snapshot.revision,state:{...state,pantry:{egg:2}}},partner.credentials);assert.equal(update.status,200);
 const stale=await request('/api/household','PUT',{revision:1,state},owner.credentials);assert.equal(stale.status,409);assert.equal((await stale.json()).snapshot.state.pantry.egg,2);
 assert.equal((await request('/api/household','PUT',{revision:3,state},owner.credentials,{Origin:'https://evil.example'})).status,403);
 assert.equal((await fetch(`${base}/api/households`,{method:'POST',body:'{}'})).status,415);
 assert.equal((await fetch(`${base}/.vaind/households.json`)).status,404);
 assert.equal((await request('/api/household','DELETE',null,partner.credentials)).status,200);
 assert.equal((await request('/api/household','GET',null,partner.credentials)).status,401);
});
test('AI gateway accepts valid structured output and rejects price tampering',async()=>{
 const http=await import('node:http');const {readFile}=await import('node:fs/promises');const {generatePlan,validatePlan}=await import('../public/core/planner.js');const {CATEGORIES}=await import('../public/core/catalog.js');
 const prices=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url))).prices,settings={month:'2026-10',budget:8000,household:4,preferences:Object.fromEntries(CATEGORIES.map(c=>[c,'sometimes'])),avoid:[]};
 let tamper=false,calls=0;
 const mock=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.format,'json');assert.equal(input.stream,false);assert.equal(JSON.parse(input.messages[1].content).calendar.length,71);const plan=generatePlan(settings,prices);if(tamper)plan.meals[0].ingredients[0].unitPrice=1;calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify(plan)}}));});
 mock.listen(0,'127.0.0.1');await once(mock,'listening');const previous=process.env.OLLAMA_URL;process.env.OLLAMA_URL=`http://127.0.0.1:${mock.address().port}`;
 try{const request=()=>fetch(`${base}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings,prices})});const valid=await (await request()).json();assert.equal(valid.generator,'ai');validatePlan(valid,settings,prices);tamper=true;const fallback=await (await request()).json();assert.equal(fallback.generator,'rules');validatePlan(fallback,settings,prices);assert.equal(calls,2);}finally{if(previous)process.env.OLLAMA_URL=previous;else delete process.env.OLLAMA_URL;await new Promise(resolve=>mock.close(resolve));}
});
