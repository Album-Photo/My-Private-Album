// js/config.js
// Configuration PUBLIQUE de Supabase.
// La clé "publishable"/"anon" n'est PAS un secret : elle est conçue pour être
// exposée côté client. La sécurité réelle repose sur les politiques RLS
// définies dans supabase/schema.sql et supabase/storage.sql — jamais sur le
// caractère "caché" de cette clé.
//
// Ne mets JAMAIS la clé "service_role" ici ou dans un autre fichier frontend.

export const SUPABASE_CONFIG = {
  url: "https://cxlrhjqvifyhuvhlalay.supabase.co",
  anonKey: "sb_publishable_BrvbQOxWiA4OQJJSdVt1cQ_9KK5SqDY",
};

// Nom du bucket de stockage privé (créé dans Supabase Storage).
export const STORAGE_BUCKET = "photos";

// Durée de vie des URL signées pour l'affichage des photos (en secondes).
export const SIGNED_URL_TTL = 60 * 10; // 10 minutes

// Nombre de jours de rétention dans la corbeille avant purge définitive.
export const TRASH_RETENTION_DAYS = 30;

// Taille max d'un fichier à l'import (en octets). 25 Mo par défaut.
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Types MIME autorisés à l'import.
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// Extensions HEIC/HEIF : non affichables nativement par la plupart des
// navigateurs. On les détecte explicitement pour avertir l'utilisateur
// (voir js/upload.js).
export const HEIC_MIME_TYPES = ["image/heic", "image/heif"];
