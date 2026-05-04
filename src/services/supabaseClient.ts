import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase isolado para operações na nuvem.
 * Utiliza as variáveis de ambiente definidas no .env da raiz.
 */
export const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ Configurações do Supabase ausentes no arquivo .env.");
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};
