import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensureLocalTLS } from '../server/local-tls.mjs';

try{
 const tls=await ensureLocalTLS({directory:process.env.MOBILE_TLS_DIR||path.resolve('.vaind/tls')});
 console.log('vAInd local HTTPS files are ready. No device trust settings were changed.');
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url)),'--share','--mobile'],{stdio:'inherit',env:{...process.env,TLS_CERT:tls.cert,TLS_KEY:tls.key,TLS_CA_CERT:tls.ca}});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 child.once('error',()=>{console.error('Could not start vAInd. Check the local server configuration.');process.exitCode=1;});
 child.once('exit',code=>{process.exitCode=code||0;});
}catch(error){console.error(`Phone setup stopped: ${error.message}`);process.exitCode=1;}
