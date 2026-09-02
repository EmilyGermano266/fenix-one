const CACHE_NAME = "fenix-one-v23-20260902";
const APP_SHELL = ["/", "/index.html", "/style.css?v=20260902-v23", "/script.js?v=20260902-v23", "/manifest.json"];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL).catch(()=>{})));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);

  if(url.origin===location.origin &&
     (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".html") || url.pathname==="/")){
    event.respondWith(
      fetch(event.request)
        .then(r=>{
          const copy=r.clone();
          caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));
          return r;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
