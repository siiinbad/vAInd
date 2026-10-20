import { sharedState, equalState, mergeSharedState, validateSharedState, validateHouseholdSnapshot } from './household.js';
import { localStorageOrNull } from './local-state.js';

export const HOUSEHOLD_KEY='vaind:household:v1', PERSONAL_KEY='vaind:personal:v1', DISCONNECTED_KEY='vaind:disconnected:v1';
export function readHouseholdSession(text){
 if(!text)return null;
 const saved=JSON.parse(text),c=saved?.credentials;
 if(!c||!/^[a-f0-9-]{36}$/.test(c.id)||!/^[A-Za-z0-9_-]{43}$/.test(c.token))throw new Error('invalidSharedData');
 validateHouseholdSnapshot({...saved.meta,state:saved.base});
 if(saved.meta.id!==c.id)throw new Error('invalidSharedData');
 return saved;
}
export function createHouseholdSync({fetcher=fetch,storage=localStorageOrNull(),getState,applyState,onStatus=()=>{},canSync=()=>true,setTimer=setInterval,clearTimer=clearInterval}={}){
 let session=null,phase='personal',pending=null,timer=null,conflict=null,storageError=false;
 const credentialsValid=c=>c&&/^[a-f0-9-]{36}$/.test(c.id)&&/^[A-Za-z0-9_-]{43}$/.test(c.token);
 try{
  const saved=readHouseholdSession(storage.getItem(HOUSEHOLD_KEY));
  if(saved){session=saved;phase='pending';}
 }catch{phase='storage';}
 const dirty=()=>session&&!equalState(sharedState(getState()),session.base);
 function status(){return {connected:!!session,phase,pending:!!dirty(),snapshot:session?.meta,conflicts:conflict?.paths||[],storageError};}
 const notify=()=>onStatus(status());
 function saveSession(){try{storage.setItem(HOUSEHOLD_KEY,JSON.stringify(session));storageError=false;}catch{storageError=true;}}
 async function request(url,{method='GET',data,auth=true}={}){
  const response=await fetcher(url,{method,cache:'no-store',headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth&&session?{Authorization:`Bearer ${session.credentials.id}.${session.credentials.token}`}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
  const value=await response.json();
  if(!response.ok){const error=new Error(value.error||'sharedUnavailable');error.snapshot=value.snapshot;error.status=response.status;throw error;}
  return value;
 }
 function accept(snapshot,state=snapshot.state){
  validateHouseholdSnapshot(snapshot);const {state:base,...meta}=snapshot;
  session.base=structuredClone(base);session.meta=meta;saveSession();
  if(!equalState(sharedState(getState()),state))applyState(structuredClone(state));
  conflict=null;phase=dirty()?'pending':'saved';notify();
 }
 function stopForConflict(snapshot,paths){conflict={snapshot,paths};phase='conflict';notify();return false;}
 async function flush(){
  if(!session||conflict)return false;
  if(pending)return pending;
  try{validateSharedState(getState());}catch{phase='invalid';notify();return false;}
  pending=(async()=>{
   phase='syncing';notify();
   try{
    for(let attempt=0;attempt<3;attempt++){
     const snapshot=validateHouseholdSnapshot(await request('/api/household'));
     const local=sharedState(getState()),merged=mergeSharedState(session.base,local,snapshot.state);
     if(merged.conflicts.length)return stopForConflict(snapshot,merged.conflicts);
     try{validateSharedState(merged.state);}catch{return stopForConflict(snapshot,['/months']);}
     if(equalState(merged.state,snapshot.state)){accept(snapshot,merged.state);return true;}
     try{
      const saved=validateHouseholdSnapshot(await request('/api/household',{method:'PUT',data:{revision:snapshot.revision,state:merged.state}}));
      // Preserve an edit made on this device while the network request was in flight.
      const next=mergeSharedState(local,sharedState(getState()),saved.state);
      if(next.conflicts.length)return stopForConflict(saved,next.conflicts);
      try{validateSharedState(next.state);}catch{return stopForConflict(saved,['/months']);}
      accept(saved,next.state);if(!dirty())return true;
     }catch(error){if(error.status!==409)throw error;}
    }
    phase='pending';notify();return false;
   }catch(error){phase=error.status===401?'unauthorized':error.message==='invalidSharedData'?'invalid':'offline';notify();throw error;}
  })().finally(()=>{pending=null;});
  return pending;
 }
 async function connect(kind,data){
  if(session)throw new Error('alreadyConnected');
  try{storage.setItem(PERSONAL_KEY,JSON.stringify(getState()));}catch{throw new Error('storageUnavailable');}
  phase='syncing';notify();
  try{
   const result=await request(kind==='create'?'/api/households':'/api/households/join',{method:'POST',data:kind==='create'?{...data,state:sharedState(getState())}:data,auth:false});
   validateHouseholdSnapshot(result.snapshot);if(!credentialsValid(result.credentials))throw new Error('invalidSharedData');
   session={credentials:result.credentials};accept(result.snapshot);return true;
  }catch(error){phase=session?'offline':'personal';notify();throw error;}
 }
 async function leave(){
  if(pending)await pending;
  if(dirty())throw new Error('sharedPendingLeave');
  const personal=JSON.parse(storage.getItem(PERSONAL_KEY)||'null');
  await request('/api/household',{method:'DELETE'});
  storage.removeItem(HOUSEHOLD_KEY);session=null;conflict=null;phase='personal';
  if(personal)applyState(personal,true);notify();
 }
 function disconnectedBackup(){try{const value=JSON.parse(storage.getItem(DISCONNECTED_KEY)||'null');if(value){validateSharedState(value.state);return value.state;}}catch{}return null;}
 async function disconnectLocal(){
  if(pending)await pending.catch(()=>{});
  if(!session)throw new Error('householdUnauthorized');
  const retained=structuredClone(getState());validateSharedState(retained);
  let personal;try{personal=JSON.parse(storage.getItem(PERSONAL_KEY)||'null');if(personal)validateSharedState(personal);}catch{personal=null;}
  try{
   // Complete the recovery write before dropping membership or restoring personal data.
   storage.setItem(DISCONNECTED_KEY,JSON.stringify({state:retained,createdAt:new Date().toISOString()}));
   storage.removeItem(HOUSEHOLD_KEY);
  }catch{throw new Error('storageUnavailable');}
  session=null;conflict=null;phase='personal';storageError=false;
  applyState(personal||retained,true);notify();
 }
 return {
  status,flush,disconnectLocal,disconnectedBackup,
  create:data=>connect('create',data),join:data=>connect('join',data),leave,
  changed:()=>{if(!session)return;phase=conflict?'conflict':'pending';notify();void flush().catch(()=>{});},
  start:()=>{if(!timer)timer=setTimer(()=>{if(session&&canSync())void flush().catch(()=>{});},10000);notify();},
  stop:()=>{if(timer)clearTimer(timer);timer=null;},
  useShared:()=>{if(!conflict)throw new Error('sharedConflict');accept(conflict.snapshot);},
  forget:()=>{if(phase!=='unauthorized')throw new Error('householdUnauthorized');return disconnectLocal();},
  rotate:async()=>{if(dirty()||pending)throw new Error('sharedPendingLeave');const snapshot=await request('/api/household/invite',{method:'POST',data:{}});accept(snapshot);},
 };
}
