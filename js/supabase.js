// js/supabase.js
// Point d'entrée unique pour le client Supabase, chargé via CDN en ES module.
// Toutes les requêtes à Postgres/Storage/Auth passent par ce client, qui
// utilise uniquement la clé publique "anon" : les règles RLS côté serveur
// sont la seule barrière de sécurité réelle.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_CONFIG } from "./config.js";

export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
