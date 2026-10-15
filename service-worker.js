// service-worker.js
//
// RÈGLE DE SÉCURITÉ ESSENTIELLE : ce service worker ne met en cache QUE le
// squelette statique de l'application (HTML/CSS/JS/icônes). Il ne doit
// JAMAIS mettre en cache :
//   - les réponses de l'API Supabase (auth, Postgres REST, Storage)
//   - les URL signées ou toute réponse contenant des photos
//   - tout ce qui contient un jeton ou une donnée personnelle
//
// Toute requête vers le domaine Supabase, ou contenant "token=" / "sign",
// passe directement au réseau sans jamais toucher au cache.

const CACHE_NAME = "mpa-static-v1";
const STATIC_ASSETS = [
  "index.html",
  "login.html",
  "css/style.css",
  "css/auth.css",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPrivateOrDynamic(url) {
  return (
    url.hostname.endsWith(".supabase.co") ||
    url.pathname.includes("/storage/") ||
    url.pathname.includes("/auth/") ||
    url.pathname.includes("/rest/") ||
    url.searchParams.has("token")
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Jamais de cache pour Supabase ou toute donnée privée/dynamique.
  if (isPrivateOrDynamic(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first pour les ressources statiques de l'app uniquement (même origine).
  if (url.origin === self.location.origin && event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
