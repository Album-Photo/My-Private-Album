// js/albums.js
// Création, renommage, suppression d'albums ; association photos <-> albums.

import { supabase } from "./supabase.js";

export async function fetchAlbums() {
  const { data, error } = await supabase.from("albums").select("id, name, created_at").order("name");
  if (error) throw new Error("Impossible de charger les albums.");
  return data ?? [];
}

export async function createAlbum(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Le nom de l'album est requis.");
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("albums")
    .insert({ name: trimmed, owner_id: userData.user.id })
    .select()
    .single();
  if (error) throw new Error("Impossible de créer l'album.");
  return data;
}

export async function renameAlbum(albumId, newName) {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Le nom de l'album est requis.");
  const { error } = await supabase
    .from("albums")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", albumId);
  if (error) throw new Error("Impossible de renommer l'album.");
}

/** Supprime l'album sans supprimer les photos qu'il contient (seule la liaison disparaît, via ON DELETE CASCADE sur album_photos). */
export async function deleteAlbum(albumId) {
  const { error } = await supabase.from("albums").delete().eq("id", albumId);
  if (error) throw new Error("Impossible de supprimer l'album.");
}

export async function addPhotoToAlbum(photoId, albumId) {
  const { error } = await supabase
    .from("album_photos")
    .upsert({ photo_id: photoId, album_id: albumId }, { onConflict: "album_id,photo_id" });
  if (error) throw new Error("Impossible d'ajouter la photo à l'album.");
}

export async function removePhotoFromAlbum(photoId, albumId) {
  const { error } = await supabase
    .from("album_photos")
    .delete()
    .eq("photo_id", photoId)
    .eq("album_id", albumId);
  if (error) throw new Error("Impossible de retirer la photo de l'album.");
}
