import { sharedState, validateSharedState, validateMemberName, mergeSharedState, equalState } from './household.js';
import { localStorageOrNull } from './local-state.js';

export const FILE_HOUSEHOLD_KEY='vaind:file-household:v1';
const DEVICE_KEY='vaind:device:v1', PERSONAL_KEY='vaind:personal:v1', BACKUP_KEY='vaind:disconnected:v1';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function identity(value,max=40){if(!value||!uuid(value.id))throw new Error('invalidHouseholdFile');validateMemberName(value.name,max);}
export function validateHouseholdFile(value){
 try{
  if(value?.kind!=='vaind-household-file'||value.version!==1||!Number.isSafeInteger(value.sequence)||value.sequence<1)throw new Error();
  identity(value.household,60);identity(value.sender);validateSharedState(value.base);validateSharedState(value.state);
  if(JSON.stringify(value).length>3100000)throw new Error();
  return {kind:'vaind-household-file',version:1,sequence:value.sequence,household:{id:value.household.id,name:validateMemberName(value.household.name,60)},sender:{id:value.sender.id,name:validateMemberName(value.sender.name)},base:validateSharedState(value.base),state:validateSharedState(value.state)};
 }catch{throw new Error('invalidHouseholdFile');}
}
export function readFileHouseholdSession(text){
 if(!text)return null;
 const value=JSON.parse(text);
 identity(value.household,60);identity(value.device);
 if(!Number.isSafeInteger(value.sequence)||value.sequence<0||!value.peers||typeof value.peers!=='object'||Array.isArray(value.peers)||Object.keys(value.peers).length>11)throw new Error('invalidHouseholdFile');
 validateSharedState(value.root);validateSharedState(value.lastState);
 for(const [id,peer] of Object.entries(value.peers)){
  identity({id,name:peer.name});if(!Number.isSafeInteger(peer.sequence)||peer.sequence<1)throw new Error('invalidHouseholdFile');validateSharedState(peer.state);
 }
 return value;
}
// This manager has no network transport or timers. Files move only through user actions.
export function createFileHousehold({storage=localStorageOrNull(),getState,applyState,onStatus=()=>{}}={}){
 let session=null,conflict=null,storageError=false;
 try{session=readFileHouseholdSession(storage.getItem(FILE_HOUSEHOLD_KEY));}catch{storageError=true;}
 function status(){return {fileMode:true,connected:!!session,phase:storageError?'storage':conflict?'conflict':session?'local':'personal',pending:false,storageError,conflicts:conflict?.paths||[],snapshot:session?{...session.household,members:[session.device,...Object.entries(session.peers).map(([id,p])=>({id,name:p.name}))]}:null};}
 const notify=()=>onStatus(status());
 function store(next){try{storage.setItem(FILE_HOUSEHOLD_KEY,JSON.stringify(next));session=next;storageError=false;}catch{storageError=true;notify();throw new Error('storageUnavailable');}}
 function device(name){
  name=validateMemberName(name);let id;
  try{id=storage.getItem(DEVICE_KEY);if(!uuid(id)){id=crypto.randomUUID();storage.setItem(DEVICE_KEY,id);}}catch{throw new Error('storageUnavailable');}
  return {id,name};
 }
 function rememberPersonal(){try{storage.setItem(PERSONAL_KEY,JSON.stringify(getState()));}catch{throw new Error('storageUnavailable');}}
 function accept(next,state){store({...next,lastState:structuredClone(state)});conflict=null;applyState(structuredClone(state));notify();return true;}
 function importFile(raw,name){
  const value=structuredClone(validateHouseholdFile(raw)),current=validateSharedState(getState());
  if(!session){
   const own=device(name);if(own.id===value.sender.id)throw new Error('householdOwnFile');
   const next={household:value.household,device:own,sequence:0,root:value.base,peers:{[value.sender.id]:{name:value.sender.name,sequence:value.sequence,state:value.state}}};
   rememberPersonal();return accept(next,value.state);
  }
  if(value.household.id!==session.household.id||!equalState(value.base,session.root))throw new Error('householdDifferent');
  if(value.sender.id===session.device.id)throw new Error('householdOwnFile');
  const previous=session.peers[value.sender.id];
  if(previous&&value.sequence<=previous.sequence)throw new Error('householdOldFile');
  if(!previous&&Object.keys(session.peers).length>=11)throw new Error('householdFull');
  const merged=mergeSharedState(previous?.state||session.root,current,value.state);
  if(!merged.conflicts.length){try{validateSharedState(merged.state);}catch{merged.conflicts.push('/months');}}
  if(merged.conflicts.length){conflict={value,paths:merged.conflicts};notify();throw new Error('householdFileConflict');}
  const next=structuredClone(session);next.peers[value.sender.id]={name:value.sender.name,sequence:value.sequence,state:value.state};
  return accept(next,merged.state);
 }
 function exportFile(){
  if(!session)throw new Error('householdUnauthorized');
  const state=validateSharedState(getState()),next={...session,sequence:session.sequence+1,lastState:state};
  const file=validateHouseholdFile({kind:'vaind-household-file',version:1,household:next.household,sender:next.device,sequence:next.sequence,base:next.root,state});
  store(next);notify();return file;
 }
 function disconnectedBackup(){try{const data=JSON.parse(storage.getItem(BACKUP_KEY)||'null');return data?validateSharedState(data.state)&&data.state:null;}catch{return null;}}
 function disconnectLocal(){
  if(!session)throw new Error('householdUnauthorized');
  const retained=structuredClone(getState());validateSharedState(retained);let personal;
  try{personal=JSON.parse(storage.getItem(PERSONAL_KEY)||'null');if(personal)validateSharedState(personal);}catch{personal=null;}
  try{storage.setItem(BACKUP_KEY,JSON.stringify({state:retained,createdAt:new Date().toISOString()}));storage.removeItem(FILE_HOUSEHOLD_KEY);storage.removeItem('vaind:household:v1');}catch{throw new Error('storageUnavailable');}
  session=null;conflict=null;storageError=false;applyState(personal||retained,true);notify();return true;
 }
 return {status,importFile,exportFile,disconnectedBackup,disconnectLocal,leave:disconnectLocal,
  create:({name,householdName})=>{
   if(session)throw new Error('alreadyConnected');
   const household={id:crypto.randomUUID(),name:validateMemberName(householdName,60)},own=device(name),current=validateSharedState(getState());
   rememberPersonal();store({household,device:own,sequence:0,root:current,lastState:current,peers:{}});notify();return true;
  },
  changed:()=>{if(!session)return;try{store({...session,lastState:validateSharedState(getState())});}catch{storageError=true;}notify();},
  useShared:()=>{
   if(!conflict)throw new Error('householdFileConflict');
   const value=conflict.value,next=structuredClone(session);next.peers[value.sender.id]={name:value.sender.name,sequence:value.sequence,state:value.state};return accept(next,value.state);
  },
  flush:async()=>true,start:notify,stop:()=>{},
 };
}
