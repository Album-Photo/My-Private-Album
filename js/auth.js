// js/auth.js
// Authentification, gestion de session, protection des pages privées.
//
// IMPORTANT : ce module ne fait que piloter l'UI. La véritable barrière de
// sécurité est côté serveur (RLS). Même si ce fichier était contourné ou
// modifié dans le navigateur, un utilisateur non autorisé ne pourrait pas
// lire les données d'un autre compte, car Postgres et Storage vérifient
// l'identité authentifiée à chaque requête.

import { supabase } from "./supabase.js";

const LOGIN_PAGE = "login.html";

/** Retourne la session active, ou null. Ne lève jamais d'exception. */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Erreur de récupération de session :", error.message);
    return null;
  }
  return data.session ?? null;
}

/**
 * À appeler en haut de toute page protégée (index.html, etc.).
 * Redirige vers login.html si aucune session valide n'est trouvée.
 * Doit être appelé AVANT d'afficher la moindre donnée privée.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirectToLogin();
    return null;
  }
  return session;
}

export function redirectToLogin() {
  const base = basePath();
  if (!location.pathname.endsWith(LOGIN_PAGE)) {
    location.replace(`${base}${LOGIN_PAGE}`);
  }
}

/** Calcule le chemin de base (utile si le site est servi depuis un sous-répertoire GitHub Pages). */
function basePath() {
  const path = location.pathname;
  const idx = path.lastIndexOf("/");
  return path.substring(0, idx + 1);
}

/**
 * Écoute les changements de session en continu (expiration, déconnexion
 * dans un autre onglet, etc.) et redirige si la session devient invalide.
 */
export function watchSession() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      clearPrivateUIState();
      if (!location.pathname.endsWith(LOGIN_PAGE)) {
        redirectToLogin();
      }
    }
  });
}

/**
 * Connexion par e-mail / mot de passe.
 * Ne révèle jamais si c'est l'e-mail ou le mot de passe qui est erroné
 * (message générique), pour ne pas faciliter l'énumération de comptes.
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "Identifiants incorrects ou compte non autorisé." };
  }
  return { ok: true, session: data.session };
}

export async function logout() {
  await supabase.auth.signOut();
  clearPrivateUIState();
  redirectToLogin();
}

/** Déclenche l'envoi d'un e-mail de réinitialisation de mot de passe. */
export async function requestPasswordReset(email) {
  const redirectTo = `${location.origin}${basePath()}login.html`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    return { ok: false, message: "Impossible d'envoyer l'e-mail pour le moment." };
  }
  return { ok: true };
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, message: "Le mot de passe n'a pas pu être modifié." };
  }
  return { ok: true };
}

/**
 * Nettoie tout état privé conservé en mémoire côté client (caches d'URL
 * signées, listes de photos en mémoire, etc.) après déconnexion.
 * gallery.js/albums.js/trash.js exposent chacun un reset() appelé ici.
 */
function clearPrivateUIState() {
  window.dispatchEvent(new CustomEvent("app:private-data-clear"));
}
