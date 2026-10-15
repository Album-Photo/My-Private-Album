// js/security.js
// Contrôles de sécurité côté interface uniquement. Rappel : ces contrôles
// AMÉLIORENT l'expérience (feedback immédiat) mais ne remplacent jamais les
// politiques RLS côté serveur, qui sont la seule protection fiable.

import { ALLOWED_MIME_TYPES, HEIC_MIME_TYPES, MAX_FILE_SIZE } from "./config.js";

/** Échappe une chaîne avant insertion dans le DOM via innerHTML. */
export function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

/** Crée un élément texte en toute sécurité (préférer à innerHTML partout où possible). */
export function textNode(str) {
  return document.createTextNode(String(str ?? ""));
}

/** Valide un fichier avant téléversement. Retourne { ok, reason? }. */
export function validateFile(file) {
  if (HEIC_MIME_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    return {
      ok: false,
      reason:
        "Format HEIC/HEIF non pris en charge par le navigateur. Convertis cette photo en JPEG ou PNG avant de l'ajouter.",
    };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, reason: `Format non autorisé : ${file.type || "inconnu"}.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    const maxMo = Math.round(MAX_FILE_SIZE / 1024 / 1024);
    return { ok: false, reason: `Fichier trop volumineux (max ${maxMo} Mo).` };
  }
  return { ok: true };
}

/**
 * Génère un nom de fichier de stockage sûr et unique : évite les collisions,
 * les caractères spéciaux et ne fait JAMAIS confiance au nom original pour
 * construire un chemin (risque de traversal / injection de chemin).
 */
export function safeStorageName(ownerId, originalName) {
  const ext = (originalName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const uuid = crypto.randomUUID();
  return `${ownerId}/${uuid}.${ext}`;
}

/** Formate une taille en octets de façon lisible. */
export function formatBytes(bytes) {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Formate une date en français. */
export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Jours restants avant purge définitive d'un élément de la corbeille. */
export function daysRemaining(deletedAtIso, retentionDays) {
  const deletedAt = new Date(deletedAtIso).getTime();
  const purgeAt = deletedAt + retentionDays * 24 * 60 * 60 * 1000;
  const remainingMs = purgeAt - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}
