import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sdk=resolve(process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||join(root,'.android-sdk'));
const cmake=process.env.CMAKE||join(sdk,'cmake','3.22.1','bin','cmake');
const ndk=process.env.ANDROID_NDK_HOME||join(sdk,'ndk','28.2.13676358');
const host=process.argv.includes('--host'),build=join(root,'android','native-build',host?'host':'arm64-v8a');
const run=(file,args)=>execFileSync(file,args,{cwd:root,stdio:'inherit'});
try{
 if(!existsSync(join(root,'android','vendor','llama.cpp','include','llama.h')))throw new Error('Pinned llama.cpp source is missing. See android/ai-dependencies.json and README.md.');
 if(!existsSync(cmake))throw new Error('CMake 3.22.1 is required. Set CMAKE to its executable or install the Android SDK CMake package.');
 mkdirSync(build,{recursive:true});
 const options=['-S',join(root,'android','native'),'-B',build,'-G','Unix Makefiles','-DCMAKE_BUILD_TYPE=Release','-DLLAMA_BUILD_IS_DEV=OFF'];
 if(!host){if(!existsSync(join(ndk,'build','cmake','android.toolchain.cmake')))throw new Error('Android NDK 28.2.13676358 is required. Set ANDROID_NDK_HOME or install that SDK package.');options.push(`-DCMAKE_TOOLCHAIN_FILE=${join(ndk,'build','cmake','android.toolchain.cmake')}`,'-DANDROID_ABI=arm64-v8a','-DANDROID_PLATFORM=android-26','-DANDROID_STL=c++_static');}
 run(cmake,options);run(cmake,['--build',build,'--target',host?'vaind-ai-check':'vaind_ai','--parallel','4']);
 if(!host){const output=join(root,'android','native-build','lib','arm64-v8a');mkdirSync(output,{recursive:true});copyFileSync(join(build,'libvaind_ai.so'),join(output,'libvaind_ai.so'));const strip=join(ndk,'toolchains','llvm','prebuilt','linux-x86_64','bin','llvm-strip');if(existsSync(strip))run(strip,['--strip-unneeded',join(output,'libvaind_ai.so')]);}
}catch(error){console.error(`AI engine build failed: ${error.message}`);process.exitCode=1;}
