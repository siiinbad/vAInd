// Only public app files are cached. Household APIs, credentials and AI responses never enter CacheStorage.
const CACHE='vaind-shell-v6';
const ASSETS=['/','/index.html','/app.js','/styles.css','/icons/favicon.png','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/logo/AI.png','/household-view.js','/data/prices.json','/data/price-sources.json',...['file-household','phone-prices','price-reports','local-state','startup','price-cache','on-device-ai','android','ai','catalog','household','household-sync','i18n','locations','menu-migration','planner','price-sync','ready-prices','regional-prices','state-validation','storage'].map(name=>`/core/${name}.js`)];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('vaind-shell-')&&key!==CACHE).map(key=>caches.delete(key)))));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
  return response;
 }).catch(async()=>{const saved=await caches.match(event.request);if(saved)return saved;throw new Error('offline');}));
});
