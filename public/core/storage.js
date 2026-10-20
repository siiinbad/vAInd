import { validateState } from './state-validation.js';
import { mergePriceBooks } from './price-cache.js';
import { loadState, localStorageOrNull } from './local-state.js';
export { loadState } from './local-state.js';
const KEY='vaind:v1';
export const RECOVERY_KEY='vaind:recovery:v1';
export function preserveUnreadableState(raw,storage=localStorageOrNull()){try{if(storage.getItem(RECOVERY_KEY)!==raw)storage.setItem(RECOVERY_KEY,raw);return true;}catch{return false;}}
export function saveState(data,storage=localStorageOrNull()){try{
 const next={...data,version:1};validateState(next);
 const current=storage.getItem(KEY);
 if(current){let invalid=false;try{validateState(JSON.parse(current));}catch{invalid=true;}if(invalid&&!preserveUnreadableState(current,storage))return false;}
 storage.setItem(KEY,JSON.stringify(next));return true;
}catch{return false;}}

// Background price sync must not overwrite spend/preferences saved by another tab.
export function savePriceFile(value, fallbackState) {
 const book=Array.isArray(value)?{prices:value}:value;
 const latest=loadState();
 if(latest.error)return false;
 try{
  const state=latest.data||fallbackState,merged=mergePriceBooks(state.priceData||(state.priceFile?.length?{prices:state.priceFile}:null),book);
  return saveState({...state,priceFile:merged.prices,priceData:merged});
 }catch{return false;}
}
