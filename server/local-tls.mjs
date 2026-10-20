import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, rename, chmod, rm, stat } from 'node:fs/promises';
import { X509Certificate, randomBytes, createPrivateKey } from 'node:crypto';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
const run=promisify(execFile);
export const privateAddresses=()=>[...new Set(Object.values(networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)).map(n=>n.address))];
const exists=async file=>{try{await stat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
function certificate(pem,key){
 const cert=new X509Certificate(pem),privateKey=createPrivateKey(key);
 if(!cert.checkPrivateKey(privateKey))throw new Error('The local certificate and private key do not match. Restore the matching files from your private backup.');
 return cert;
}
// Generates files only. It never edits OS/browser trust stores or installs a CA on a device.
export async function ensureLocalTLS({directory=path.resolve('.vaind/tls'),addresses=privateAddresses()}={}){
 if(addresses.some(address=>isIP(address)!==4))throw new Error('Only IPv4 LAN addresses are supported.');
 await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const ca=path.join(directory,'vaind-local-ca.crt'),caKey=path.join(directory,'vaind-local-ca.key'),cert=path.join(directory,'server.crt'),key=path.join(directory,'server.key');
 const caExists=await exists(ca),keyExists=await exists(caKey);
 if(caExists!==keyExists)throw new Error('The local CA is incomplete. Restore its certificate and private key from your private backup. Existing trust is never replaced automatically.');
 const temporary=await mkdtemp(path.join(directory,'.prepare-'));
 const openssl=async args=>{try{return await run('openssl',args,{timeout:30000,maxBuffer:1024*1024});}catch(error){if(error.code==='ENOENT')throw new Error('OpenSSL is required for npm run mobile. Install OpenSSL, then run this command again.');throw new Error('Could not prepare the local HTTPS certificate. Existing certificates were retained.');}};
 try{
  if(!caExists){
   const newCA=path.join(temporary,'ca.crt'),newKey=path.join(temporary,'ca.key');
   await openssl(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','365','-subj','/CN=vAInd Local Household CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout',newKey,'-out',newCA]);
   await chmod(newKey,0o600);await rename(newKey,caKey);await rename(newCA,ca);
  }
  const caPEM=await readFile(ca),issuer=certificate(caPEM,await readFile(caKey));
  if(!issuer.ca||Date.parse(issuer.validTo)<Date.now()+7*86400000)throw new Error('The household CA is expired or expires soon. Create a new private TLS directory and approve its new certificate on each phone. The existing CA was kept.');
  const ips=[...new Set(['127.0.0.1',...addresses])];
  let current;
  if(await exists(cert)&&await exists(key)){try{current=certificate(await readFile(cert),await readFile(key));}catch{/* A leaf certificate can be renewed using the same trusted CA. */}}
  const reusable=current&&current.verify(issuer.publicKey)&&current.checkHost('localhost')&&ips.every(ip=>current.checkIP(ip))&&Date.parse(current.validTo)>Date.now()+7*86400000;
  if(!reusable){
   const leafKey=path.join(temporary,'server.key'),csr=path.join(temporary,'server.csr'),leaf=path.join(temporary,'server.crt'),extensions=path.join(temporary,'extensions.cnf');
   await writeFile(extensions,`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,${ips.map(ip=>`IP:${ip}`).join(',')}\n`);
   await openssl(['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=vAInd Local Household','-keyout',leafKey,'-out',csr]);
   await openssl(['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-set_serial',`0x${randomBytes(16).toString('hex')}`,'-days','90','-sha256','-extfile',extensions,'-out',leaf]);
   await chmod(leafKey,0o600);await rename(leafKey,key);await rename(leaf,cert);
  }
  await chmod(caKey,0o600);await chmod(key,0o600);
  const leaf=new X509Certificate(await readFile(cert));
  return {ca,cert,key,fingerprint:issuer.fingerprint256,expiresAt:new Date(issuer.validTo).toISOString(),serverExpiresAt:new Date(leaf.validTo).toISOString(),renewed:!reusable};
 }finally{await rm(temporary,{recursive:true,force:true});}
}
