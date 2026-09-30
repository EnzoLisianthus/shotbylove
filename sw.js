const CACHE="shotbylove-v0.1.2-shell";
const CORE=[
  "./",
  "./index.html",
  "./style.css?v=0.1.2",
  "./manifest.webmanifest",
  "./icon.svg",
  "./src/app.js?v=0.1.2",
  "./src/signaling.js?v=0.1.2",
  "./src/peer.js?v=0.1.2",
  "./src/transfer.js?v=0.1.2",
  "./src/storage.js"
];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()){
      if(key!==CACHE)await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const fresh=await fetch(request,{cache:"no-store"});
    if(fresh.ok)cache.put(request,fresh.clone());
    return fresh;
  }catch{
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith(networkFirst(request));
    return;
  }

  const isMutableAsset=
    url.pathname.includes("/src/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".webmanifest");

  if(isMutableAsset){
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    const fresh=await fetch(request);
    if(fresh.ok)(await caches.open(CACHE)).put(request,fresh.clone());
    return fresh;
  })());
});
