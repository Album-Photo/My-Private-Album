// js/gallery.js
// Chargement et affichage de la galerie : liste paginée, URL signées,
// recherche, tri, filtre par album, favoris, sélection multiple, corbeille.

import { supabase } from "./supabase.js";
import { STORAGE_BUCKET, SIGNED_URL_TTL } from "./config.js";

const PAGE_SIZE = 60;

let signedUrlCache = new Map(); // file_path -> { url, expiresAt }

window.addEventListener("app:private-data-clear", () => {
  signedUrlCache.clear();
});

/**
 * Récupère une page de photos (non supprimées) pour l'utilisateur courant.
 * RLS garantit côté serveur que seules les photos de owner_id = auth.uid()
 * sont retournées, quels que soient les filtres envoyés par le client.
 */
export async function fetchPhotos({
  page = 0,
  search = "",
  sortBy = "created_at",
  sortDir = "desc",
  albumId = null,
  favoritesOnly = false,
} = {}) {
  let query = supabase
    .from("photos")
    .select("id, original_name, mime_type, file_size, created_at, taken_at, is_favorite, file_path", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (search.trim()) {
    query = query.ilike("original_name", `%${search.trim()}%`);
  }
  if (favoritesOnly) {
    query = query.eq("is_favorite", true);
  }
  if (albumId) {
    const { data: links } = await supabase
      .from("album_photos")
      .select("photo_id")
      .eq("album_id", albumId);
    const ids = (links ?? []).map((l) => l.photo_id);
    if (ids.length === 0) return { photos: [], total: 0 };
    query = query.in("id", ids);
  }

  const { data, error, count } = await query;
  if (error) throw new Error("Impossible de charger la galerie.");
  return { photos: data ?? [], total: count ?? 0 };
}

/** Renvoie une URL signée pour une photo, avec cache mémoire + renouvellement. */
export async function getSignedUrl(filePath) {
  const cached = signedUrlCache.get(filePath);
  if (cached && cached.expiresAt > Date.now() + 5000) {
    return cached.url;
  }
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL);
  if (error) throw new Error("Impossible de générer l'URL de la photo.");
  signedUrlCache.set(filePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL * 1000,
  });
  return data.signedUrl;
}

export async function toggleFavorite(photoId, isFavorite) {
  const { error } = await supabase.from("photos").update({ is_favorite: isFavorite }).eq("id", photoId);
  if (error) throw new Error("Impossible de mettre à jour le favori.");
}

/** Envoie une ou plusieurs photos à la corbeille (soft delete). */
export async function moveToTrash(photoIds) {
  const { error } = await supabase
    .from("photos")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", photoIds);
  if (error) throw new Error("Impossible de déplacer vers la corbeille.");
}

export async function downloadPhoto(filePath, originalName) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(filePath);
  if (error) throw new Error("Téléchargement impossible.");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = originalName || "photo";
  a.click();
  URL.revokeObjectURL(url);
}
