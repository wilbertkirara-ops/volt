// Voltline (Kirehe & Ngoma) — offline app shell. Bump CACHE on every release.
var CACHE='voltline-v27';
var ASSETS=['./','./index.html','./app.js','./tracker.html','./manifest.webmanifest',
  './voltline-transformers.js','./voltline-villages.js','./voltline-customers.js',
  './exceljs.min.js','./jszip.min.js','./zxing.min.js','./voltline-template.xlsx',
  './leaflet/leaflet.js','./leaflet/leaflet.css','./leaflet/images/layers.png','./leaflet/images/layers-2x.png',
  './leaflet/images/marker-icon.png','./leaflet/images/marker-icon-2x.png','./leaflet/images/marker-shadow.png',
  './icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png','./favicon-32.png','./logo-mark.png','./author.png'];
// files that change with each release: taken from the network first (fresh), the cache is only the offline fallback
var FRESH=/(\/|\.html|app\.js|voltline-[a-z]+\.js|manifest\.webmanifest)$/;
self.addEventListener('install',function(e){
  // cache:'reload' bypasses the browser HTTP cache, so a new version never installs old files
  e.waitUntil(caches.open(CACHE).then(function(c){
    // the app itself first (small, must succeed); the big libraries and lists may arrive later:
    // on a weak network a single failed download must not block the update
    var CORE=['./','./index.html','./app.js'];
    function get(u){ return fetch(new Request(u,{cache:'reload'})).then(function(r){ if(r.ok) return c.put(u,r); throw new Error(u); }); }
    return Promise.all(CORE.map(get)).then(function(){
      return Promise.all(ASSETS.filter(function(u){return CORE.indexOf(u)<0;}).map(function(u){ return get(u).catch(function(){}); }));
    });
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return (k.indexOf('voltline')===0||k.indexOf('lvwk')===0)&&k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}).then(function(){
    // an app window left in the background on an old version is reloaded on the new one
    // (the visible window updates itself, so nothing being typed is lost)
    return self.clients.matchAll({type:'window'}).then(function(cs){
      cs.forEach(function(c){ if(c.visibilityState==='hidden'&&c.navigate) c.navigate(c.url).catch(function(){}); });
    });
  }));
});
self.addEventListener('message',function(e){ if(e.data==='skipWaiting') self.skipWaiting(); });
function fromCache(req){ return caches.match(req,{ignoreSearch:true}).then(function(r){ return r||caches.match('./index.html'); }); }
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET') return;
  var url=new URL(e.request.url);
  // Only our own files. Satellite tiles go to the network (the app keeps its own offline tile store).
  if(url.origin!==self.location.origin) return;
  if(/repair\.html$/.test(url.pathname)) return; // the repair page always comes from the network
  if(e.request.mode==='navigate'||FRESH.test(url.pathname)){
    // network first, 5 s at most (weak field network), then the offline copy
    e.respondWith(new Promise(function(resolve){
      var done=false, t=setTimeout(function(){ if(!done){ done=true; resolve(fromCache(e.request)); } },5000);
      fetch(e.request,{cache:'no-cache'}).then(function(resp){
        if(resp&&resp.ok){ var copy=resp.clone(); caches.open(CACHE).then(function(c){ c.put(e.request,copy).catch(function(){}); }); }
        if(!done){ done=true; clearTimeout(t); resolve(resp&&resp.ok?resp:fromCache(e.request)); }
      }).catch(function(){ if(!done){ done=true; clearTimeout(t); resolve(fromCache(e.request)); } });
    }));
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(function(r){
    return r || fetch(e.request).then(function(resp){
      var copy=resp.clone();
      caches.open(CACHE).then(function(c){ try{c.put(e.request,copy);}catch(err){} });
      return resp;
    }).catch(function(){ return caches.match('./index.html'); });
  }));
});
