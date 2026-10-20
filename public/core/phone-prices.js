import { parseCdn, parseFeed, discoverReports, trustedReportHost } from './price-reports.js';
import { mergePriceBooks } from './price-cache.js';
import { validatePriceSnapshot, PRICE_SYNC_MS } from './price-sync.js';
import { localStorageOrNull } from './local-state.js';

const STATUS_KEY='vaind:phone-prices:v1', INTERVAL=6*60*60*1000;
export function reportURL(value){
 const url=new URL(value);
 if(value.length>2048||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!trustedReportHost(url.hostname))throw new Error('loadPricesError');
 return url.href;
}
// Only public reports leave the phone; personal settings and plans never enter this request.
export function createPhonePriceSync({getBook,fetchReport,getSources=async()=>{const response=await fetch('/data/price-sources.json');if(!response.ok)throw new Error();return (await response.json()).sources;},storage=localStorageOrNull(),onSnapshot=()=>{},onError=()=>{},isActive=()=>true,now=Date.now,setTimer=setInterval,clearTimer=clearInterval}={}){
 let pending=null,timer=null,initialized=false,refresh={state:'idle',intervalMinutes:360};
 function loadStatus(){if(initialized)return;initialized=true;try{const saved=JSON.parse(storage.getItem(STATUS_KEY)||'null');if(saved){validatePriceSnapshot({...getBook(),refresh:saved});refresh={...saved,state:saved.state==='checking'?'idle':saved.state};}}catch{}}
 async function text(url){
  const target=reportURL(url),result=await fetchReport(target,{signal:AbortSignal.timeout(25000)});
  if(!result||typeof result.text!=='string'||result.text.length>6000000||reportURL(result.url||target)!==(result.url||target))throw new Error('loadPricesError');
  return {text:result.text,url:result.url||target};
 }
 function emit(book=getBook()){onSnapshot({...book,refresh:{...refresh}});}
 async function read(manual=false){
  loadStatus();
  if(pending)return pending;
  const current=now(),last=Date.parse(refresh.lastAttemptAt||'');
  if(Number.isFinite(last)&&current-last<(manual?60000:INTERVAL)){emit();return {...getBook(),refresh};}
  pending=Promise.resolve().then(async()=>{
   refresh={...refresh,state:'checking',lastAttemptAt:new Date(current).toISOString()};emit();
   try{
    const sources=await getSources();
    if(!Array.isArray(sources)||!sources.length||sources.length>8)throw new Error();
    const results=await Promise.allSettled(sources.map(async source=>{
     if(!source||typeof source.name!=='string'||!['cdn','csv','cdn-index','index'].includes(source.kind))throw new Error();
     const report=await text(source.url);let rows=[],failures=0;
     if(source.kind==='cdn')rows=parseCdn(report.text,report.url,getBook().prices);
     else if(source.kind==='csv')rows=parseFeed(report.text,{...source,url:report.url},getBook().prices);
     else{
      const links=discoverReports(report.text,report.url,source.kind==='cdn-index'?'cdn':'da').filter(link=>source.kind==='cdn-index'||new URL(link).pathname.endsWith('.csv')).slice(0,3);
      const children=await Promise.allSettled(links.map(async url=>{const child=await text(url);return source.kind==='cdn-index'?parseCdn(child.text,child.url,getBook().prices):parseFeed(child.text,{...source,url:child.url},getBook().prices);}));
      for(const child of children)if(child.status==='fulfilled')rows.push(...child.value);else failures++;
     }
     return {name:source.name,rows,state:failures?'partial':rows.length?'parsed':'noRows'};
    }));
    const rows=results.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]),book=getBook();
    const merged=mergePriceBooks(book,{prices:book.prices,observations:rows});
    const parsed=rows.length>0,failed=results.some(r=>r.status==='rejected'||r.value.state==='partial'),changed=JSON.stringify(book)!==JSON.stringify(merged),finished=new Date(now()).toISOString();
    refresh={...refresh,state:!parsed?'unavailable':failed?'partial':changed?'updated':'unchanged',lastCheckedAt:finished,...(parsed?{lastSuccessAt:finished}:{}),nextCheckAt:new Date(current+INTERVAL).toISOString(),sources:results.map((r,i)=>({name:typeof sources[i]?.name==='string'?sources[i].name:'vAInd',state:r.status==='fulfilled'?r.value.state:'unavailable'}))};
    emit(merged);try{storage.setItem(STATUS_KEY,JSON.stringify(refresh));}catch{onError(new Error('storageUnavailable'));}
    return {...merged,refresh};
   }catch(error){refresh={...refresh,state:'unavailable',lastCheckedAt:new Date(now()).toISOString(),nextCheckAt:new Date(current+INTERVAL).toISOString()};try{storage.setItem(STATUS_KEY,JSON.stringify(refresh));}catch{}emit();onError(error);throw error;}
  }).finally(()=>{pending=null;});
  return pending;
 }
 return {read,refresh:()=>read(true),start:()=>{if(timer===null)timer=setTimer(()=>{if(isActive())void read().catch(()=>{});},PRICE_SYNC_MS);},stop:()=>{if(timer!==null)clearTimer(timer);timer=null;}};
}
