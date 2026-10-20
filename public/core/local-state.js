// Read-only loader also used by the public phone-installation guide.
export function localStorageOrNull(){try{return globalThis.localStorage;}catch{return null;}}
export function loadState(storage=localStorageOrNull()){
 let raw;try{raw=storage.getItem('vaind:v1');}catch{return {data:null,error:'storageUnavailable'};}
 if(!raw)return {data:null};
 try{const data=JSON.parse(raw);if(data.version!==1||!data.months||typeof data.months!=='object')throw new Error();return {data,raw};}catch{return {data:null,raw,error:'storageCorrupt'};}
}
