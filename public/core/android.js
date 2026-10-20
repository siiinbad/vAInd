// The APK owns its storage and AI. The only network bridge reads approved public price reports.
export const isAndroidApp=()=>typeof globalThis.VaindAndroid?.request==='function';
export function createAndroidTransport(bridge,{fetcher=globalThis.fetch,origin='https://appassets.androidplatform.net',setTimer=setTimeout,clearTimer=clearTimeout}={}){
 // Reloads get distinct IDs so an old host's response cannot satisfy a new page's request.
 const pending=new Map(),session=globalThis.crypto.randomUUID();let sequence=0;
 function complete(id,result){const entry=pending.get(id);if(!entry)return;pending.delete(id);clearTimer(entry.timer);entry.signal?.removeEventListener('abort',entry.abort);if(result.error)entry.reject(new Error(result.error));else entry.resolve(result);}
 function send(payload,{signal}={}){
  if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));
  if(pending.size>=24)return Promise.reject(new Error('sharedUnavailable'));
  return new Promise((resolve,reject)=>{
   const id=`${session}-${++sequence}`,abort=()=>{try{bridge.cancel(id);}catch{}complete(id,{error:'sharedUnavailable'});};
   const timer=setTimer(abort,payload.kind==='save'?600000:payload.kind==='ai'?180000:30000);pending.set(id,{resolve,reject,timer,signal,abort});signal?.addEventListener('abort',abort,{once:true});
   try{bridge.request(JSON.stringify({id,...payload}));}catch{complete(id,{error:'sharedUnavailable'});}
  });
 }
 async function fetch(input,options={}){
  const url=new URL(typeof input==='string'?input:input.url,origin);
  if(url.origin!==origin||!url.pathname.startsWith('/api/'))return fetcher(input,options);
  throw new Error('deviceLocalOnly');
 }
 return {fetch,complete,report:(url,options)=>send({kind:'report',url},options),infer:payload=>send({kind:'ai',...payload}),save:async(data,name,type)=>{const result=await send({kind:'save',body:data,name,type});return !result.cancelled;}};
}
let transport;
if(isAndroidApp()){
 transport=createAndroidTransport(globalThis.VaindAndroid,{fetcher:globalThis.fetch.bind(globalThis),origin:globalThis.location.origin});
 globalThis.vaindNativeComplete=(id,result)=>transport.complete(id,result);
 globalThis.fetch=transport.fetch;
}
export const fetchAndroidReport=(url,options)=>transport.report(url,options);
export const saveAndroidFile=(data,name,type)=>transport.save(data,name,type);
export const inferAndroidPlan=payload=>transport.infer(payload);
