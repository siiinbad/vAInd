import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import https from 'node:https';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ensureLocalTLS } from '../server/local-tls.mjs';
import { publicCertificate, allowedLocalHost } from '../server/install-service.mjs';
import { installPlatform, validateInstallInfo } from '../public/core/install.js';

test('local TLS covers the host addresses and reuses its CA while renewing new LAN addresses',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vaind-tls-'));
 try{
  const first=await ensureLocalTLS({directory,addresses:['192.168.1.10']}),caPEM=await readFile(first.ca),leafPEM=await readFile(first.cert),leaf=new X509Certificate(leafPEM),ca=new X509Certificate(caPEM);
  assert(ca.ca);assert(leaf.verify(ca.publicKey));assert(leaf.checkHost('localhost'));assert(leaf.checkIP('127.0.0.1'));assert(leaf.checkIP('192.168.1.10'));
  assert.equal((await stat(first.key)).mode&0o777,0o600);assert.equal((await stat(path.join(directory,'vaind-local-ca.key'))).mode&0o777,0o600);
  const again=await ensureLocalTLS({directory,addresses:['192.168.1.10']});assert.equal(again.renewed,false);assert.deepEqual(await readFile(again.cert),leafPEM);
  const moved=await ensureLocalTLS({directory,addresses:['192.168.1.11']});assert.equal(moved.renewed,true);assert.deepEqual(await readFile(moved.ca),caPEM);assert(new X509Certificate(await readFile(moved.cert)).checkIP('192.168.1.11'));
  const downloadable=publicCertificate(Buffer.concat([caPEM,Buffer.from('\nPRIVATE KEY MUST NOT BE DISTRIBUTED')]),await readFile(moved.cert));
  assert.equal(downloadable.fingerprint,ca.fingerprint256);assert(!downloadable.pem.includes('PRIVATE KEY'));
  await assert.rejects(()=>ensureLocalTLS({directory,addresses:['malformed-address']}));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('incomplete CA storage fails without replacing established trust',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vaind-ca-'));
 try{await writeFile(path.join(directory,'vaind-local-ca.crt'),'saved certificate');await assert.rejects(()=>ensureLocalTLS({directory,addresses:[]}),/incomplete/);assert.equal(await readFile(path.join(directory,'vaind-local-ca.crt'),'utf8'),'saved certificate');}
 finally{await rm(directory,{recursive:true,force:true});}
});
test('phone setup accepts only local HTTPS destinations and detects iPadOS desktop user agents',()=>{
 assert.equal(installPlatform('Mozilla iPhone'), 'ios');assert.equal(installPlatform('Mozilla Macintosh',5),'ios');assert.equal(installPlatform('Mozilla Macintosh',0),'desktop');assert.equal(installPlatform('Mozilla Android'),'android');
 const info={httpsEnabled:true,networkEnabled:true,urls:['https://192.168.1.10:5173'],certificate:null};validateInstallInfo(info);
 for(const urls of [['http://192.168.1.10:5173'],['https://evil.example'],['https://192.168.evil.example'],['https://user:secret@192.168.1.10:5173'],['https://192.168.1.10:5173/private']])assert.throws(()=>validateInstallInfo({...info,urls}));
 assert.throws(()=>validateInstallInfo({...info,certificate:{fingerprint:'bad',expiresAt:'today',url:'/private.key'}}));
 assert(allowedLocalHost('192.168.1.10:5174','http',5174,['192.168.1.10']));assert(!allowedLocalHost('evil.example:5174','http',5174,['192.168.1.10']));assert(!allowedLocalHost('localhost:5173','http',5174));
});
test('manifest and Apple home-screen icons have real installation dimensions',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url)));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.short_name,'vAInd');assert.equal(manifest.start_url,'/');
 for(const size of [192,512]){
  const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`);assert(icon);
  const png=await readFile(new URL(`../public${icon.src}`,import.meta.url));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 }
 const apple=await readFile(new URL('../public/icons/apple-touch-icon.png',import.meta.url));assert.equal(apple.readUInt32BE(16),180);assert.equal(apple.readUInt32BE(20),180);
});
const secureGet=(url,ca)=>new Promise((resolve,reject)=>{https.get(url,{...(ca?{ca}:{})},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text:Buffer.concat(chunks).toString()}));}).on('error',reject);});
test('mobile launcher serves a verifiable HTTPS app and limits HTTP bootstrap to setup files',{timeout:30000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vaind-mobile-http-'));let child;
 try{
  child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/mobile.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:'0',INSTALL_PORT:'0',MOBILE_TLS_DIR:path.join(directory,'tls'),HOUSEHOLD_DATA_DIR:path.join(directory,'households'),AUTO_PRICE_REFRESH:'false'},stdio:['ignore','pipe','pipe']});
  const ports=await new Promise((resolve,reject)=>{
   let output='';const timeout=setTimeout(()=>reject(new Error('Mobile setup did not become ready')),20000);
   child.stdout.on('data',data=>{output+=data;const app=/ready at https:\/\/localhost:(\d+)/.exec(output),setup=/Host setup guide: http:\/\/localhost:(\d+)/.exec(output);if(app&&setup){clearTimeout(timeout);resolve({app:+app[1],setup:+setup[1]});}});
   child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Mobile launcher stopped (${code})`));});
  });
  const ca=await readFile(path.join(directory,'tls/vaind-local-ca.crt')),app=`https://127.0.0.1:${ports.app}`,setup=`http://127.0.0.1:${ports.setup}`;
  assert.equal((await secureGet(`${app}/`,ca)).status,200);await assert.rejects(()=>secureGet(`${app}/`));
  const info=validateInstallInfo(await (await fetch(`${setup}/api/install-info`)).json());assert(info.httpsEnabled);assert(info.networkEnabled);assert.equal(info.certificate.fingerprint,new X509Certificate(ca).fingerprint256);
  const downloaded=await (await fetch(`${setup}/install/root-ca.crt`)).text();assert.equal(new X509Certificate(downloaded).fingerprint256,info.certificate.fingerprint);assert(!downloaded.includes('PRIVATE KEY'));
  for(const route of ['/install','/install.js','/install.css','/icons/icon-192.png','/core/install.js','/core/local-state.js','/core/i18n.js'])assert.equal((await fetch(`${setup}${route}`)).status,200,route);
  const installScript=await (await fetch(`${setup}/install.js`)).text();assert(installScript.includes('./core/local-state.js'));
  for(const route of ['/api/household','/api/plan','/app.js','/.vaind/tls/vaind-local-ca.key','/server.key'])assert.equal((await fetch(`${setup}${route}`)).status,404,route);
  const health=await secureGet(`${app}/api/health`,ca);assert.equal(JSON.parse(health.text).mode,'household-network');
 }finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(directory,{recursive:true,force:true});}
});
