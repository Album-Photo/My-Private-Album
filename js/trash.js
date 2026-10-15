// js/trash.js
// Corbeille : liste des photos supprimées (deleted_at non nul), restauration,
// suppression définitive manuelle. La purge AUTOMATIQUE après 30 jours est
// gérée côté serveur (voir supabase/schema.sql, fonction + pg_cron) — ce
// fichier ne fait que piloter l'UI, il ne doit jamais être la seule garantie
// de suppression réelle.

import { supabase } from "./supabase.js";
import { STORAGE_BUCKET, TRASH_RETENTION_DAYS } from "./config.js";
import { daysRemaining } from "./security.js";

export async function fetchTrash() {
  const { data, error } = await supabase
    .from("photos")
    .select("id, original_name, file_path, deleted_at, file_size")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw new Error("Impossible de charger la corbeille.");
  return (data ?? []).map((p) => ({
    ...p,
    daysLeft: daysRemaining(p.deleted_at, TRASH_RETENTION_DAYS),
  }));
}

export async function restorePhotos(photoIds) {
  const { error } = await supabase.from("photos").update({ deleted_at: null }).in("id", photoIds);
  if (error) throw new Error("Impossible de restaurer la photo.");
}

/**
 * Suppression définitive manuelle (avant les 30 jours, à la demande de
 * l'utilisateur). Supprime d'abord l'objet Storage puis la ligne en base,
 * pour ne jamais laisser une métadonnée pointer vers un fichier déjà
 * supprimé sans trace si l'étape Storage échoue.
 */
export async function permanentlyDelete(photos) {
  const paths = photos.map((p) => p.file_path);
  const ids = photos.map((p) => p.id);

  const { error: storageErr } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (storageErr) {
    throw new Error("Échec de la suppression du fichier : réessaie plus tard.");
  }

  const { error: dbErr } = await supabase.from("photos").delete().in("id", ids);
  if (dbErr) {
    throw new Error(
      "Le fichier a été supprimé mais la métadonnée n'a pas pu être retirée. Réessaie ou contacte l'assistance."
    );
  }
}

export async function emptyTrash() {
  const trash = await fetchTrash();
  if (trash.length === 0) return;
  await permanentlyDelete(trash);
}
