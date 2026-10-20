import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';

// No Gradle or remote dependencies: compile the Java shell with official SDK tools.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sdk=resolve(process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||join(root,'.android-sdk'));
const tools=join(sdk,'build-tools','36.0.0'),platform=join(sdk,'platforms','android-36','android.jar');
const build=join(root,'android','build'),dist=join(root,'dist');
const run=(file,args,options={})=>execFileSync(file,args,{cwd:root,stdio:'inherit',...options});
const files=(path,extension)=>readdirSync(path,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(path,item.name),extension):item.name.endsWith(extension)?[join(path,item.name)]:[]);
try{
 if(!existsSync(platform)||!existsSync(join(tools,'aapt2')))throw new Error('Android SDK packages platforms;android-36 and build-tools;36.0.0 are required. Set ANDROID_SDK_ROOT to your SDK folder. See README.md.');
 const model=join(root,'android','models','model.gguf'),dependencies=JSON.parse(readFileSync(join(root,'android','ai-dependencies.json'),'utf8'));
 if(!existsSync(model)||createHash('sha256').update(readFileSync(model)).digest('hex')!==dependencies.model.sha256)throw new Error('The pinned built-in AI model is missing or failed SHA-256 verification. See android/ai-dependencies.json.');
 run(process.execPath,[join(root,'scripts','build-native-ai.mjs')]);
 mkdirSync(build,{recursive:true});mkdirSync(dist,{recursive:true});
 for(const name of ['res','assets','classes','dex','generated']){rmSync(join(build,name),{recursive:true,force:true});mkdirSync(join(build,name),{recursive:true});}
 cpSync(join(root,'android','res'),join(build,'res'),{recursive:true});
 run('java',['-Djava.awt.headless=true',join(root,'android','tools','LauncherIcons.java'),join(root,'public','logo','AI.png'),join(build,'res')]);
 // Copy only public app resources. Never package .env, household data or signing material.
 const web=join(build,'assets','web');mkdirSync(web,{recursive:true});
 for(const name of ['index.html','app.js','styles.css','household-view.js','manifest.webmanifest','core','icons','data'])cpSync(join(root,'public',name),join(web,name),{recursive:true});
 cpSync(join(root,'android','models'),join(build,'assets','ai'),{recursive:true});
 cpSync(join(root,'android','licenses'),join(build,'assets','licenses'),{recursive:true});
 run(join(tools,'aapt2'),['compile','--dir',join(build,'res'),'-o',join(build,'resources.zip')]);
 run(join(tools,'aapt2'),['link','-o',join(build,'unsigned.apk'),'--manifest',join(root,'android','AndroidManifest.xml'),'-I',platform,'--java',join(build,'generated'),'-A',join(build,'assets'),'-0','gguf',join(build,'resources.zip')]);
 run('javac',['--release','8','-encoding','UTF-8','-classpath',platform,'-d',join(build,'classes'),...files(join(root,'android','src'),'.java'),...files(join(build,'generated'),'.java')]);
 run(join(tools,'d8'),['--min-api','26','--lib',platform,'--output',join(build,'dex'),...files(join(build,'classes'),'.class')]);
 // jar is part of the JDK and adds the compiled bytecode without another ZIP dependency.
 run('jar',['uf',join(build,'unsigned.apk'),'-C',join(build,'dex'),'classes.dex']);
 run('jar',['uf',join(build,'unsigned.apk'),'-C',join(root,'android','native-build'),'lib']);
 run(join(tools,'zipalign'),['-f','-P','16','4',join(build,'unsigned.apk'),join(build,'aligned.apk')]);
 const signing=join(root,'android','.signing'),key=join(signing,'vaind.jks'),password=join(signing,'password');
 mkdirSync(signing,{recursive:true,mode:0o700});chmodSync(signing,0o700);
 if(existsSync(key)!==existsSync(password))throw new Error('Signing files are incomplete. Restore android/.signing from your backup; existing keys will not be replaced.');
 if(!existsSync(key)){
  writeFileSync(password,randomBytes(32).toString('hex'),{mode:0o600});
  try{run('keytool',['-genkeypair','-keystore',key,'-alias','vaind','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=vAInd Local Android, O=vAInd','-storetype','JKS','-storepass:file',password,'-keypass:file',password]);}catch(error){if(!existsSync(key))rmSync(password,{force:true});throw error;}
 }
 chmodSync(key,0o600);chmodSync(password,0o600);
 const apk=join(dist,'vAInd-1.2.0.apk');
 run(join(tools,'apksigner'),['sign','--ks',key,'--ks-key-alias','vaind','--ks-pass',`file:${password}`,'--out',apk,join(build,'aligned.apk')]);
 run(join(tools,'apksigner'),['verify','--verbose','--print-certs',apk]);
 run(join(tools,'zipalign'),['-c','-P','16','4',apk]);
 const hash=createHash('sha256').update(readFileSync(apk)).digest('hex');writeFileSync(join(dist,'vAInd-1.2.0.apk.sha256'),`${hash}  vAInd-1.2.0.apk\n`);
 console.log(`\nAPK ready: ${apk}\nBack up android/.signing privately so future APK updates use the same signature.`);
}catch(error){console.error(`Android build failed: ${error.message}`);process.exitCode=1;}
