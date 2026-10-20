import { validateState } from './state-validation.js';
import { validatePlan } from './planner.js';

// Device navigation, source refreshes and membership credentials are never shared as plan data.
export function sharedState(state) {
 const data={version:1,profileVersion:state.profileVersion||2,months:state.months,overrides:state.overrides||{},locationOverrides:state.locationOverrides||{},pantry:state.pantry||{}};
 if(state.settings)data.settings=state.settings;
 return structuredClone(data);
}
export function validateSharedState(state) {
 const data=sharedState(state);
 validateState(data);
 for(const record of Object.values(data.months))validatePlan(record.plan,record.settings,record.prices,record.spend,{allowOverBudget:Object.keys(record.spend).length>0,allowLegacyBudget:true,legacyMenu:(record.plan.menuVersion||1)<2});
 if(JSON.stringify(data).length>1500000)throw new Error('sharedTooLarge');
 return data;
}
export const equalState=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
// Independent meal logs / pantry entries merge. Concurrent edits to one value stop for review.
export function mergeSharedState(base,local,remote) {
 const conflicts=[];
 function merge(a,b,c,path) {
  if(equalState(b,a))return structuredClone(c);
  if(equalState(c,a)||equalState(b,c))return structuredClone(b);
  if(object(b)&&object(c)&&(object(a)||a===undefined)){
   const result={};
   for(const key of new Set([...Object.keys(a||{}),...Object.keys(b),...Object.keys(c)])){
    if(['__proto__','constructor','prototype'].includes(key)){conflicts.push(path);continue;}
    const value=merge(a?.[key],b[key],c[key],`${path}/${key}`);
    if(value!==undefined)result[key]=value;
   }
   return result;
  }
  conflicts.push(path);return structuredClone(b);
 }
 return {state:merge(base,local,remote,''),conflicts};
}
export function validateMemberName(value,max=40) {
 if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error('invalidMemberName');
 return value.trim();
}
export function normalizeInvite(value) {
 const code=typeof value==='string'?value.replace(/[\s-]/g,'').toUpperCase():'';
 if(!/^[A-F0-9]{16}$/.test(code))throw new Error('invalidInvite');
 return code;
}
export function validateHouseholdSnapshot(value){
 try{
 if(!value||!Number.isSafeInteger(value.revision)||value.revision<1||!/^[a-f0-9-]{36}$/.test(value.id)||!Array.isArray(value.members)||value.members.length>12||value.members.some(m=>!m||!/^[a-f0-9-]{36}$/.test(m.id)||!validateMemberName(m.name))||!Number.isFinite(Date.parse(value.updatedAt))||!Number.isFinite(Date.parse(value.inviteExpiresAt)))throw new Error('invalidSharedData');
 validateMemberName(value.name,60);validateMemberName(value.updatedBy);normalizeInvite(value.inviteCode);validateSharedState(value.state);
 return value;
 }catch{throw new Error('invalidSharedData');}
}
