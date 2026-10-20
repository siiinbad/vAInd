import { loadState, preserveUnreadableState } from './storage.js';
import { validateState } from './state-validation.js';
import { readHouseholdSession, HOUSEHOLD_KEY } from './household-sync.js';
import { FILE_HOUSEHOLD_KEY, readFileHouseholdSession } from './file-household.js';
import { localStorageOrNull } from './local-state.js';

// A missing/broken device copy is never interpreted as an intentional shared deletion.
export function loadStartupState(storage=localStorageOrNull()){
 const loaded=loadState(storage);
 try{if(loaded.data){validateState(loaded.data);return loaded;}}catch{loaded.error='storageCorrupt';}
 if(loaded.raw)preserveUnreadableState(loaded.raw,storage);
 try{
  const fileSession=readFileHouseholdSession(storage.getItem(FILE_HOUSEHOLD_KEY));
  if(fileSession){const data=structuredClone(fileSession.lastState);data.lastMonth=data.settings?.month||Object.keys(data.months).sort().at(-1);return {data,error:'fileCacheRecovered',recovered:true};}
 }catch{}
 try{
  const session=readHouseholdSession(storage.getItem(HOUSEHOLD_KEY));
  if(session){const data=structuredClone(session.base);data.lastMonth=data.settings?.month||Object.keys(data.months).sort().at(-1);return {data,error:'sharedCacheRecovered',recovered:true};}
 }catch{}
 return {data:null,error:loaded.error};
}
