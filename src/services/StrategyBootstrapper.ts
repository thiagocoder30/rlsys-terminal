import { getSupabaseClient } from './supabaseClient.ts';

/**
 * Definição das Matrizes Táticas Padrão
 */
const defaultStrategies = [
  {
    name: "Triplications: Color Surf",
    description: "Aposta a favor da repetição de Cores (Surfe) em sequências de alta tendência.",
    is_active: true,
  },
  {
    name: "Race: Vizinhos 1 & 21",
    description: "Monitoramento de setores físicos específicos para detecção de anomalias cinéticas.",
    is_active: true,
  },
  {
    name: "Oráculo: Padrão Voisins",
    description: "Estratégia baseada no setor Grande Vizinhos com análise de atraso estatístico.",
    is_active: true,
  }
];

/**
 * Sincroniza as estratégias com o banco de dados Supabase
 */
export async function syncStrategiesToDatabase() {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    console.error("[BOOTSTRAP] Erro crítico: Cliente Supabase não inicializado.");
    return;
  }

  console.log("[BOOTSTRAP] Iniciando sincronização de estratégias com Supabase...");

  for (const strat of defaultStrategies) {
    try {
      // Usamos o upsert para inserir se não existir ou atualizar se já existir (baseado no nome)
      const { error } = await supabase
        .from('strategies')
        .upsert(
          { 
            name: strat.name, 
            description: strat.description, 
            is_active: strat.is_active 
          }, 
          { onConflict: 'name' }
        );

      if (error) {
        console.error(`[BOOTSTRAP] Falha ao sincronizar estratégia ${strat.name}:`, error.message);
      }
    } catch (err) {
      console.error(`[BOOTSTRAP] Erro inesperado na estratégia ${strat.name}:`, err);
    }
  }
  
  console.log("[BOOTSTRAP] Matrizes táticas prontas para operação.");
}
