import http from 'node:http';
import https from 'node:https';
import { createHouseholdStore } from './server/households.mjs';
import { privateAddresses } from './server/local-tls.mjs';
import { createInstallHandler, createInstallServer, publicCertificate, allowedLocalHost } from './server/install-service.mjs';
import { createPriceService, DEFAULT_REFRESH_MS } from './server/price-service.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { aiPayload } from './public/core/ai.js';
import { validatePlan, generatePlan } from './public/core/planner.js';
const root=path.resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const port=Number(process.env.PORT||5173);
const networkEnabled=process.argv.includes('--share')||process.env.HOST==='0.0.0.0';
const addresses=privateAddresses;
const protocol=process.env.TLS_CERT&&process.env.TLS_KEY?'https':'http';
const tls=protocol==='https'?{cert:await readFile(process.env.TLS_CERT),key:await readFile(process.env.TLS_KEY)}:null;
const rootCertificate=process.env.TLS_CA_CERT&&tls?publicCertificate(await readFile(process.env.TLS_CA_CERT),tls.cert):null;
let phoneSetupServer=null;
const installHandler=createInstallHandler({root,certificate:rootCertificate,info:()=>({httpsEnabled:!!tls,networkEnabled,urls:tls?(networkEnabled?addresses():['127.0.0.1']).map(address=>`https://${address}:${server.address().port}`):[],certificate:rootCertificate?{fingerprint:rootCertificate.fingerprint,expiresAt:rootCertificate.expiresAt,url:'/install/root-ca.crt'}:null})});
const households=createHouseholdStore({...(process.env.HOUSEHOLD_DATA_DIR?{directory:process.env.HOUSEHOLD_DATA_DIR}:{})});
const attempts=new Map();
function allowAttempt(address){const time=Date.now(),old=attempts.get(address);if(!old||time-old.start>60000){for(const [key,value]of attempts)if(time-value.start>60000)attempts.delete(key);if(attempts.size>1000)return false;attempts.set(address,{start:time,count:1});return true;}return ++old.count<=10;}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const refreshMinutes=Number(process.env.PRICE_REFRESH_MINUTES||360);
const priceService=createPriceService({intervalMs:Number.isFinite(refreshMinutes)&&refreshMinutes>=5&&refreshMinutes<=1440?refreshMinutes*60000:DEFAULT_REFRESH_MS});
let busy=false;
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function body(req,limit=500000){let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>limit)throw new Error('requestTooLarge');}try{return JSON.parse(text);}catch{throw new Error('invalidInput');}}
const handler=async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 res.setHeader('Cache-Control','no-store');
 try {
  const host=req.headers.host;
  const origin=host&&new URL(`${protocol}://${host}`);
  if(!origin||!allowedLocalHost(host,protocol,server.address().port,networkEnabled?addresses():[]))return json(res,403,{error:'localOnly'});
  if(req.headers.origin&&req.headers.origin!==origin.origin)return json(res,403,{error:'originRejected'});
  const url=new URL(req.url,origin);
  if(await installHandler(req,res,url))return;
  if(req.method==='GET'&&url.pathname==='/api/network')return json(res,200,{networkEnabled,urls:networkEnabled?addresses().map(address=>`${protocol}://${address}:${server.address().port}`):[]});
  if(['/api/households','/api/households/join','/api/household','/api/household/invite'].includes(url.pathname)){
   try{
    const write=['POST','PUT'].includes(req.method);
    if(write&&!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'jsonRequired'});
    const auth=req.headers.authorization;
    if(req.method==='POST'&&['/api/households','/api/households/join'].includes(url.pathname)){
     if(!allowAttempt(req.socket.remoteAddress))return json(res,429,{error:'householdRateLimit'});
     const input=await body(req,2000000);
     return json(res,201,url.pathname.endsWith('/join')?await households.join(input):await households.create(input));
    }
    if(url.pathname==='/api/household'){
     if(req.method==='GET')return json(res,200,await households.read(auth));
     if(req.method==='PUT')return json(res,200,await households.update(auth,await body(req,2000000)));
     if(req.method==='DELETE')return json(res,200,await households.leave(auth));
    }
    if(url.pathname==='/api/household/invite'&&req.method==='POST'){await body(req);return json(res,200,await households.rotate(auth));}
    return json(res,405,{error:'methodNotAllowed'});
   }catch(error){
    const code=error.code||error.message;
    const known=/^(invalid[A-Z]|sharedTooLarge|household|sharedConflict|requestTooLarge)/.test(code);
    return json(res,error.status||(known?400:503),{error:known?code:'sharedStoreUnavailable',...(error.snapshot?{snapshot:error.snapshot}:{})});
   }
  }
  if(url.pathname==='/api/prices'){
   if(req.method==='POST'){
    if(req.headers.origin&&req.headers.origin!==origin.origin)return json(res,403,{error:'originRejected'});
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'jsonRequired'});
    await body(req);
    await priceService.check();
   }else if(req.method!=='GET')return json(res,405,{error:'methodNotAllowed'});
   return json(res,200,await priceService.snapshot());
  }
  if(req.method==='POST'&&url.pathname==='/api/plan'){
   if(req.headers.origin&&req.headers.origin!==origin.origin)return json(res,403,{error:'originRejected'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'jsonRequired'});
   if(busy)return json(res,429,{error:'plannerBusy'});
   const {settings,prices,spend={},locked=[]}=await body(req);
   if(!Array.isArray(locked))return json(res,400,{error:'invalidInput'});
   const fallback=generatePlan(settings,prices,{spend,locked});const payload=aiPayload(settings,prices,spend,locked);
   busy=true;
   try {
    const endpoint=new URL('/api/chat',process.env.OLLAMA_URL||'http://127.0.0.1:11434');
    if(!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))throw new Error('localAIOnly');
    const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(process.env.AI_API_KEY?{Authorization:`Bearer ${process.env.AI_API_KEY}`}:{})},body:JSON.stringify({model:process.env.OLLAMA_MODEL||'llama3.2',stream:false,format:'json',options:{temperature:.2,num_ctx:32768},messages:[{role:'system',content:'Plan Filipino ulam. Return JSON only in the supplied shape. Use only supplied dishes and exact ingredient quantities and prices. Respect all constraints. Do not change logged meals.'},{role:'user',content:JSON.stringify(payload)}]}),signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error('aiUnavailable');
    const data=await response.json(),candidate=JSON.parse(data.message.content);
    const plan=validatePlan(candidate,settings,prices,spend);
    for(const m of locked.filter(m=>Object.hasOwn(spend,m.key))){const replacement=plan.meals.find(x=>x.key===m.key);if(replacement?.dishId!==m.dishId||JSON.stringify(replacement.ingredients)!==JSON.stringify(m.ingredients))throw new Error('loggedChanged');}
    return json(res,200,{...plan,generator:'ai'});
   }catch{return json(res,200,{...fallback,generator:'rules',fallbackReason:'aiUnavailable'});}finally{busy=false;}
  }
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{status:'ok',mode:networkEnabled?'household-network':'local'});
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'methodNotAllowed'});
  const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),filename=path.resolve(root,`.${relative}`);
  if(!filename.startsWith(`${root}${path.sep}`)||!types[path.extname(filename)])return json(res,404,{error:'notFound'});
  const data=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]});res.end(req.method==='HEAD'?undefined:data);
 }catch(error){json(res,error.code==='ENOENT'?404:400,{error:error.code||'invalidRequest'});}
};
export const server=tls?https.createServer(tls,handler):http.createServer(handler);
server.listen(port,networkEnabled?'0.0.0.0':'127.0.0.1',()=>{
 console.log(`vAInd is ready at ${protocol}://localhost:${server.address().port}`);
 if(networkEnabled)for(const address of addresses())console.log(`Phone / partner on the same Wi-Fi: ${protocol}://${address}:${server.address().port}`);
 if(rootCertificate)console.log(`Phone certificate SHA-256 (compare before trusting):\n${rootCertificate.fingerprint}`);
 if(process.argv.includes('--mobile')&&tls){
  const setupPort=Number(process.env.INSTALL_PORT??(server.address().port+1));
  if(!Number.isInteger(setupPort)||setupPort<0||setupPort>65535||setupPort===server.address().port){console.error('INSTALL_PORT must be a different available port from 0 to 65535.');server.close();process.exitCode=1;return;}
  phoneSetupServer=createInstallServer({handler:installHandler,addresses,onError:()=>{console.error('The phone setup port is unavailable. Set INSTALL_PORT to another port and restart npm run mobile.');server.close();process.exitCode=1;}});
  phoneSetupServer.listen(setupPort,'0.0.0.0',()=>{for(const address of addresses())console.log(`START HERE on your phone: http://${address}:${phoneSetupServer.address().port}/install`);console.log(`Host setup guide: http://localhost:${phoneSetupServer.address().port}/install`);});
 }
});

server.on('listening',()=>{if(process.env.AUTO_PRICE_REFRESH!=='false')priceService.start();});
server.on('close',()=>{priceService.stop();if(phoneSetupServer?.listening)phoneSetupServer.close();});

server.on('error',error=>{priceService.stop();if(phoneSetupServer?.listening)phoneSetupServer.close();console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Stop the existing vAInd server or choose another PORT.`:'vAInd could not start. Check the local network and port configuration.');process.exitCode=1;});
