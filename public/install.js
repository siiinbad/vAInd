import { t, today } from './core/i18n.js';
import { installPlatform, validateInstallInfo } from './core/install.js';
import { loadState } from './core/local-state.js';
const root=document.querySelector('#install-root'),esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let info=null,error=false,trustAcknowledged=false,platform=installPlatform(navigator.userAgent,navigator.maxTouchPoints),backup=loadState().data;
function render(){
 const ready=info?.httpsEnabled&&info?.networkEnabled,certificate=info?.certificate;
 const urls=[...(info?.urls||[])].sort((a,b)=>Number(new URL(b).hostname===location.hostname)-Number(new URL(a).hostname===location.hostname));
 root.setAttribute('aria-busy','false');
 root.innerHTML=`<header><img src="/icons/icon-192.png" width="76" height="76" alt=""><div><p class="eyebrow">${t('installEyebrow')}</p><h1>${t('installTitle')}</h1><p>${t('installSubtitle')}</p></div></header>${error?`<p class="notice" role="alert">${t('installInfoError')}</p><button id="retry" class="button">${t('reload')}</button>`:''}
 <section class="card"><span class="step">1</span><h2>${t(ready?'installConnectTitle':'installStartTitle')}</h2><p>${t(ready?'installConnectHint':'installStartHint')}</p>${!ready?`<code class="command">npm run mobile</code>`:''}${info?.httpsEnabled&&info?.networkEnabled&&!info.urls.length?`<p class="notice">${t('noNetworkAddress')}</p>`:''}<p class="note">${t('installKeepHost')}</p><div class="notice"><p>${t('installOriginChange')}</p>${backup?`<button id="export-personal" class="button secondary">${t('export')}</button>`:''}</div></section>
 ${ready?`<section class="card"><span class="step">2</span><h2>${t('installTrustTitle')}</h2>${certificate?`<p>${t('installCompare')}</p><p class="fingerprint">${esc(certificate.fingerprint)}</p><p class="note">${t('installCertificateExpiry',{date:new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium'}).format(new Date(certificate.expiresAt))})}</p><div class="notice"><p>${t('installTrustScope')}</p></div><label class="consent"><input type="checkbox" id="certificate-ack" ${trustAcknowledged?'checked':''}>${t('installTrustAck')}</label><button class="button" id="download-certificate" ${trustAcknowledged?'':'disabled'}>${t('installDownloadCertificate')}</button><p class="note">${t('installDownloadMeaning')}</p>`:`<p>${t('installExistingTrust')}</p>`}
 <div role="group" class="platform-tabs" aria-label="${t('installChooseDevice')}">${['android','ios','desktop'].map(p=>`<button data-platform="${p}" aria-pressed="${platform===p}">${t('installPlatform_'+p)}</button>`).join('')}</div><h3>${t('installTrustStepsTitle')}</h3><p>${t('installTrust_'+platform)}</p><p class="note">${t('installWarningHelp')}</p></section>
 <section class="card"><span class="step">3</span><h2>${t('installOpenTitle')}</h2><p>${t('installOpenHint')}</p>${urls.map((url,i)=>`<a class="button ${i?'secondary':''}" href="${esc(url)}">${t('installOpenApp')}<small>${esc(url)}</small></a>`).join('')}<h3>${t('installHomeScreenTitle')}</h3><p>${t('installHome_'+platform)}</p><p class="note">${t('installHouseholdHint')}</p></section>`:''}
 <footer><p>${t('installOfficialHelp')}</p><a href="https://support.apple.com/en-gb/102390" target="_blank" rel="noopener noreferrer">${t('installAppleHelp')}</a><a href="https://support.google.com/pixelphone/answer/2844832?hl=en" target="_blank" rel="noopener noreferrer">${t('installAndroidHelp')}</a><p>${t('installRemoveTrust')}</p></footer>`;
}
async function load(){try{const response=await fetch('/api/install-info',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();info=validateInstallInfo(await response.json());error=false;}catch{info=null;trustAcknowledged=false;error=true;}render();}
root.addEventListener('change',event=>{if(event.target.id==='certificate-ack'){trustAcknowledged=event.target.checked;document.querySelector('#download-certificate').disabled=!trustAcknowledged;}});
root.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.platform){platform=button.dataset.platform;render();document.querySelector(`[data-platform="${platform}"]`).focus();}
 if(button.id==='retry')void load();
 if(button.id==='download-certificate'&&document.querySelector('#certificate-ack')?.checked&&info?.certificate)location.assign(info.certificate.url);
 if(button.id==='export-personal'&&backup){const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`vaind-backup-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
});
void load();
