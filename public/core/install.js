export function installPlatform(userAgent='',touchPoints=0){
 if(/iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/i.test(userAgent)&&touchPoints>1))return 'ios';
 return /Android/i.test(userAgent)?'android':'desktop';
}
export function validateInstallInfo(value){
 if(!value||typeof value.httpsEnabled!=='boolean'||typeof value.networkEnabled!=='boolean'||!Array.isArray(value.urls)||value.urls.length>30)throw new Error('installInfoError');
 for(const address of value.urls){
  const url=new URL(address);
  const parts=url.hostname.split('.'),ipv4=parts.length===4&&parts.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255);
  const local=ipv4&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(local||['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('installInfoError');
 }
 if(value.certificate&&(!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value.certificate.fingerprint)||!Number.isFinite(Date.parse(value.certificate.expiresAt))||value.certificate.url!=='/install/root-ca.crt'))throw new Error('installInfoError');
 return value;
}
