import { PrismaClient } from "@prisma/client";

const defaultStrategies = [
  // OS 4 NOVOS SNIPERS DE TRIPLICAÇÕES (CADEIA DE MARKOV)
  { name: "Triplications: Color Surf", description: "Aposta a favor da repetição de Cores (Surfe)", is_active: true },
  { name: "Triplications: Color Break", description: "Aposta contra a repetição de Cores (Quebra)", is_active: true },
  { name: "Triplications: Parity Surf", description: "Aposta a favor da repetição de Paridade (Surfe)", is_active: true },
  { name: "Triplications: Parity Break", description: "Aposta contra a repetição de Paridade (Quebra)", is_active: true },
  
  // O SEU ARSENAL ANTERIOR (Mantido para backup tático)
  { name: "Dynamic: Drop Zone", description: "Rastreio físico balístico da roleta", is_active: true },
  { name: "Cross: C2 -> Duz 1 e 3", description: "Cruzamento de Coluna com Dúzias", is_active: true },
  { name: "Race: P2", description: "Estratégia de corrida em blocos", is_active: true },
  { name: "Race: Fusion", description: "Estratégia híbrida de alta cobertura", is_active: true }
];

export async function syncStrategiesToDatabase(prisma: PrismaClient) {
  console.log("[BOOTSTRAP] Sincronizando Matrizes Táticas com o Banco de Dados...");
  
  for (const strat of defaultStrategies) {
    await prisma.strategy.upsert({
      where: { name: strat.name },
      update: { description: strat.description },
      create: {
        name: strat.name,
        description: strat.description,
        is_active: strat.is_active,
        bayes_weight: 1.0
      }
    });
  }
  
  console.log("[BOOTSTRAP] Arsenal de Matrizes Carregado e Pronto para Combate.");
}
