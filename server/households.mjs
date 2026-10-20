import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateMemberName, normalizeInvite, validateSharedState } from '../public/core/household.js';

export class HouseholdError extends Error {
 constructor(code,status=400,snapshot){super(code);this.code=code;this.status=status;this.snapshot=snapshot;}
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const matches=(value,digest)=>typeof digest==='string'&&digest.length===64&&timingSafeEqual(Buffer.from(hash(value),'hex'),Buffer.from(digest,'hex'));
const newInvite=()=>randomBytes(8).toString('hex').toUpperCase();
const expires=now=>new Date(now+7*86400000).toISOString();
export function createHouseholdStore({directory=new URL('../.vaind/',import.meta.url),now=()=>Date.now()}={}) {
 const file=new URL('households.json',directory instanceof URL?directory:pathToFileURL(`${path.resolve(directory)}${path.sep}`));
 let queue=Promise.resolve();
 function transaction(action,write=true) {
  const job=queue.then(async()=>{
   let data={version:1,households:[]},previous;
   try{previous=await readFile(file,'utf8');data=JSON.parse(previous);if(data.version!==1||!Array.isArray(data.households))throw new Error();}
   catch(error){if(error.code!=='ENOENT')throw new HouseholdError('sharedStoreUnavailable',503);}
   const result=await action(data);
   if(write){
    await mkdir(new URL('./',file),{recursive:true,mode:0o700});
    const temporary=new URL(`households.${randomUUID()}.tmp`,file);
    try{
     if(previous)await writeFile(new URL('households.backup.json',file),previous,{mode:0o600});
     await writeFile(temporary,JSON.stringify(data),{mode:0o600});await rename(temporary,file);
    }finally{await unlink(temporary).catch(()=>{});}
   }
   return result;
  });
  queue=job.catch(()=>{});return job;
 }
 const snapshot=room=>({id:room.id,name:room.name,revision:room.revision,state:structuredClone(room.state),members:room.members.map(({id,name})=>({id,name})),inviteCode:room.inviteCode,inviteExpiresAt:room.inviteExpiresAt,updatedAt:room.updatedAt,updatedBy:room.updatedBy});
 const checkedState=value=>{try{return validateSharedState(value);}catch(error){throw new HouseholdError(error.message==='sharedTooLarge'?'sharedTooLarge':'invalidSharedData');}};
 function authenticate(data,authorization){
  const match=/^Bearer ([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(authorization||'');
  const room=match&&data.households.find(r=>r.id===match[1]);
  const member=room?.members.find(m=>matches(match[2],m.tokenHash));
  if(!member)throw new HouseholdError('householdUnauthorized',401);
  return {room,member};
 }
 const member=name=>{const token=randomBytes(32).toString('base64url');return {record:{id:randomUUID(),name:validateMemberName(name),tokenHash:hash(token)},token};};
 const touch=(room,by)=>{room.revision++;room.updatedAt=new Date(now()).toISOString();room.updatedBy=by;};
 return {
  create:({name,householdName,state})=>transaction(data=>{
   if(data.households.length>=25)throw new HouseholdError('householdLimit',409);
   const user=member(name),room={id:randomUUID(),name:validateMemberName(householdName,60),state:checkedState(state),members:[user.record],inviteCode:newInvite(),inviteExpiresAt:expires(now()),revision:1,updatedAt:new Date(now()).toISOString(),updatedBy:user.record.name};
   data.households.push(room);return {credentials:{id:room.id,token:user.token},snapshot:snapshot(room)};
  }),
  join:({name,code})=>transaction(data=>{
   const normalized=normalizeInvite(code),room=data.households.find(r=>r.inviteCode===normalized&&Date.parse(r.inviteExpiresAt)>now());
   if(!room)throw new HouseholdError('invalidInvite',404);
   if(room.members.length>=12)throw new HouseholdError('householdFull',409);
   const user=member(name);room.members.push(user.record);touch(room,user.record.name);
   return {credentials:{id:room.id,token:user.token},snapshot:snapshot(room)};
  }),
  read:authorization=>transaction(data=>snapshot(authenticate(data,authorization).room),false),
  update:(authorization,{revision,state})=>transaction(data=>{
   const {room,member}=authenticate(data,authorization);
   if(!Number.isSafeInteger(revision)||revision!==room.revision)throw new HouseholdError('sharedConflict',409,snapshot(room));
   room.state=checkedState(state);touch(room,member.name);return snapshot(room);
  }),
  rotate:authorization=>transaction(data=>{
   const {room,member}=authenticate(data,authorization);room.inviteCode=newInvite();room.inviteExpiresAt=expires(now());touch(room,member.name);return snapshot(room);
  }),
  leave:authorization=>transaction(data=>{
   const {room,member}=authenticate(data,authorization);room.members=room.members.filter(m=>m.id!==member.id);touch(room,member.name);return {left:true};
  })
 };
}
