import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase isolado no servidor para operações administrativas ou 
 * integração com serviços do Supabase (Auth, Storage, Realtime).
 * As chaves são lidas apenas do ambiente do servidor para segurança máxima.
 */
export const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ Supabase URL ou Anon Key não configurados nos Secrets.");
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};
