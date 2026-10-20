import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';

export function allowedLocalHost(host,protocol,port,addresses=[]){
 try{const url=new URL(`${protocol}://${host}`);return !url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&['localhost','127.0.0.1',...addresses].includes(url.hostname)&&Number(url.port||(protocol==='https'?443:80))===port;}catch{return false;}
}
export function publicCertificate(pem,serverPEM){
 const cert=new X509Certificate(pem);
 if(!cert.ca||Date.parse(cert.validTo)<=Date.now()||Date.parse(cert.validFrom)>Date.now()||!new X509Certificate(serverPEM).verify(cert.publicKey))throw new Error('TLS_CA_CERT must be a current CA that signs this server certificate.');
 return {pem:cert.toString(),fingerprint:cert.fingerprint256,expiresAt:new Date(cert.validTo).toISOString()};
}
export function createInstallHandler({root,info,certificate=null}){
 const files=new Map([['/install','install.html'],['/install.html','install.html'],['/install.js','install.js'],['/install.css','install.css'],['/logo/AI.png','logo/AI.png'],['/icons/favicon.png','icons/favicon.png'],['/icons/icon-192.png','icons/icon-192.png'],['/core/i18n.js','core/i18n.js'],['/core/install.js','core/install.js'],['/core/local-state.js','core/local-state.js']]);
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
 return async(req,res,url)=>{
  if(!files.has(url.pathname)&&!['/api/install-info','/install/root-ca.crt'].includes(url.pathname))return false;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return true;}
  if(url.pathname==='/api/install-info'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:JSON.stringify(info()));return true;
  }
  if(url.pathname==='/install/root-ca.crt'){
   if(!certificate){res.writeHead(404);res.end();return true;}
   res.writeHead(200,{'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="vaind-local-ca.crt"'});res.end(req.method==='HEAD'?undefined:certificate.pem);return true;
  }
  const name=files.get(url.pathname),data=await readFile(path.join(root,name));
  res.writeHead(200,{'Content-Type':types[path.extname(name)]});res.end(req.method==='HEAD'?undefined:data);return true;
 };
}
// Certificate setup only: no meal API, household data, private keys or app session storage.
export function createInstallServer({handler,addresses=()=>[],onError=()=>{}}){
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  if(!allowedLocalHost(req.headers.host,'http',server.address().port,addresses())||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)){res.writeHead(403);res.end();return;}
  try{
   const url=new URL(req.url,`http://${req.headers.host}`);
   if(url.pathname==='/'&&req.method==='GET'){res.writeHead(302,{Location:'/install'});res.end();return;}
   if(!await handler(req,res,url)){res.writeHead(404);res.end();}
  }catch{res.writeHead(503);res.end();}
 });
 server.on('error',onError);return server;
}
