import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createAndroidTransport } from '../public/core/android.js';

test('Android blocks private household and price APIs without sending data off-device',async()=>{
 let calls=0;const transport=createAndroidTransport({request:()=>calls++,cancel:()=>{}});
 for(const path of ['/api/household','/api/prices','/api/network','/api/plan'])await assert.rejects(transport.fetch(path,{method:'PUT',body:'private household'}),/deviceLocalOnly/);
 assert.equal(calls,0);
});
test('Android bundles load normally and public report requests carry no personal data',async()=>{
 let sent,asset;const transport=createAndroidTransport({request:value=>{sent=JSON.parse(value);},cancel:()=>{}},{fetcher:(...args)=>{asset=args;return 'asset';}});
 assert.equal(await transport.fetch('/data/prices.json'),'asset');assert.equal(asset[0],'/data/prices.json');
 const promise=transport.report('https://rfo7.da.gov.ph/report.csv');
 assert.deepEqual({...sent,id:undefined},{id:undefined,kind:'report',url:'https://rfo7.da.gov.ph/report.csv'});
 transport.complete(sent.id,{text:'prices',url:sent.url});assert.equal((await promise).text,'prices');
});
test('Android report cancellation rejects promptly and ignores late native responses',async()=>{
 let sent,cancelled;const controller=new AbortController();
 const transport=createAndroidTransport({request:value=>{sent=JSON.parse(value);},cancel:id=>{cancelled=id;}});
 const promise=transport.report('https://rfo7.da.gov.ph/report.csv',{signal:controller.signal});controller.abort();
 await assert.rejects(promise,/sharedUnavailable/);assert.equal(cancelled,sent.id);
 transport.complete(sent.id,{text:'late'});
 await assert.rejects(transport.report('https://rfo7.da.gov.ph/report.csv',{signal:controller.signal}));
});
test('Android file save reports cancellation instead of claiming a completed export',async()=>{
 let sent;const transport=createAndroidTransport({request:value=>{sent=JSON.parse(value);},cancel:()=>{}});
 const promise=transport.save('{}','vaind-backup-2026-10-21.json','application/json');
 assert.equal(sent.kind,'save');transport.complete(sent.id,{cancelled:true});assert.equal(await promise,false);
 const next=transport.save('{}','vaind-backup-2026-10-21.json','application/json');transport.complete(sent.id,{});assert.equal(await next,true);
});
test('embedded inference uses the native AI bridge without an HTTP request or host',async()=>{
 let sent;const transport=createAndroidTransport({request:value=>{sent=JSON.parse(value);},cancel:()=>{}});
 const promise=transport.infer({prompt:'Choose menu A or B',count:2});assert.equal(sent.kind,'ai');assert.equal(sent.path,undefined);assert.equal(sent.authorization,undefined);
 transport.complete(sent.id,{choice:1});assert.deepEqual(await promise,{choice:1});
 const failed=transport.infer({prompt:'Choose menu A or B',count:2});transport.complete(sent.id,{error:'deviceAiMemory'});await assert.rejects(failed,/deviceAiMemory/);
});
test('responses from before a page reload cannot satisfy requests in the new page',async()=>{
 const sent=[],bridge={request:value=>sent.push(JSON.parse(value)),cancel:()=>{}};
 const old=createAndroidTransport(bridge),current=createAndroidTransport(bridge);
 const first=old.report('https://rfo7.da.gov.ph/prices'),second=current.report('https://rfo7.da.gov.ph/prices');
 assert.notEqual(sent[0].id,sent[1].id);
 current.complete(sent[0].id,{old:true});
 current.complete(sent[1].id,{current:true});
 assert.deepEqual(await second,{current:true});
 old.complete(sent[0].id,{status:200,body:'{}'});await first;
});
test('native price reader permits only public report HTTPS destinations and text responses',async t=>{
 try{execFileSync('javac',['-version'],{stdio:'pipe'});}catch{t.skip('JDK is required for native policy tests');return;}
 const directory=await mkdtemp(join(tmpdir(),'vaind-report-policy-'));
 try{
  const source=`import ph.vaind.app.ReportPolicy;
public class PolicyTest {
 public static void main(String[] args){
  for(String host:new String[]{"https://cebudailynews.inquirer.net/report","https://rfo7.da.gov.ph/","https://www.da.gov.ph:443/report.csv","https://www.gmanetwork.com/prices"})ReportPolicy.normalize(host);
  for(String host:new String[]{"http://www.da.gov.ph/report","https://192.168.1.2","https://localhost","https://evil.example","https://rfo7.da.gov.ph.evil.example/","https://user:password@www.da.gov.ph/","https://www.da.gov.ph:5173/","https://www.da.gov.ph/#secret","https://www.da.gov.ph@evil.example/","file:///etc/passwd","https://[::1]/","https://da.gov.ph./"}){boolean rejected=false;try{ReportPolicy.normalize(host);}catch(Exception e){rejected=true;}if(!rejected)throw new AssertionError(host);}
  if(!ReportPolicy.supportedType("text/csv; charset=utf-8")||!ReportPolicy.supportedType("text/html")||ReportPolicy.supportedType("application/pdf")||ReportPolicy.supportedType("image/png")||ReportPolicy.supportedType(null))throw new AssertionError("type");
 }
}`;
  await writeFile(join(directory,'PolicyTest.java'),source);
  execFileSync('javac',['--release','8','-d',directory,resolve('android/src/ph/vaind/app/ReportPolicy.java'),join(directory,'PolicyTest.java')],{stdio:'pipe'});
  execFileSync('java',['-cp',directory,'PolicyTest'],{stdio:'pipe'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('Android configuration disables OS backups and WebView access to external files',async()=>{
 const manifest=await readFile('android/AndroidManifest.xml','utf8'),source=await readFile('android/src/ph/vaind/app/MainActivity.java','utf8');
 assert.match(manifest,/android:allowBackup="false"/);assert.match(manifest,/android:usesCleartextTraffic="false"/);assert.doesNotMatch(source,/HostPolicy|configureHost|public String getHost|Authorization|setDoOutput/);assert.doesNotMatch(manifest,/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|ACCESS_FINE_LOCATION/);
 assert.match(source,/setAllowFileAccess\(false\)/);assert.match(source,/MIXED_CONTENT_NEVER_ALLOW/);assert.match(source,/setInstanceFollowRedirects\(false\)/);assert.doesNotMatch(source,/\.proceed\(\)/);
});
