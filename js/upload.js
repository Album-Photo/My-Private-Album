// js/upload.js
// Import et téléversement des photos : sélection, glisser-déposer, aperçu,
// progression, validation, écriture Storage + métadonnées PostgreSQL.

import { supabase } from "./supabase.js";
import { STORAGE_BUCKET } from "./config.js";
import { validateFile, safeStorageName } from "./security.js";

/**
 * Téléverse une liste de fichiers. Appelle onProgress(fileIndex, status)
 * pour chaque étape ("pending" | "uploading" | "done" | "error").
 * Gère les échecs partiels : si l'insertion en base échoue après un envoi
 * Storage réussi, le fichier Storage orphelin est supprimé pour éviter une
 * incohérence (fichier sans métadonnées, ou inversement).
 */
export async function uploadPhotos(files, { onProgress } = {}) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("Session invalide : reconnecte-toi avant d'importer des photos.");
  }
  const ownerId = userData.user.id;

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, { status: "pending" });

    const check = validateFile(file);
    if (!check.ok) {
      onProgress?.(i, { status: "error", message: check.reason });
      results.push({ file, ok: false, reason: check.reason });
      continue;
    }

    const storagePath = safeStorageName(ownerId, file.name);

    try {
      onProgress?.(i, { status: "uploading" });

      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("photos").insert({
        owner_id: ownerId,
        file_path: storagePath,
        original_name: file.name,
        mime_type: file.type,
        file_size: file.size,
      });

      if (insertErr) {
        // Échec partiel : on retire le fichier orphelin du Storage.
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw insertErr;
      }

      onProgress?.(i, { status: "done" });
      results.push({ file, ok: true });
    } catch (err) {
      console.error("Échec d'import :", err.message);
      onProgress?.(i, { status: "error", message: "Échec du téléversement." });
      results.push({ file, ok: false, reason: "Échec du téléversement." });
    }
  }

  return results;
}

/** Détection basique de doublons évidents : même nom + même taille déjà présents. */
export async function findObviousDuplicate(file) {
  const { data, error } = await supabase
    .from("photos")
    .select("id")
    .is("deleted_at", null)
    .eq("original_name", file.name)
    .eq("file_size", file.size)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
