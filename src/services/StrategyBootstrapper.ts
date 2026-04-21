import { PrismaClient } from "@prisma/client";

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

export async function syncStrategiesToDatabase(prisma: PrismaClient) {
  console.log("[BOOTSTRAP] Sincronizando Matrizes Táticas com o Banco de Dados Local...");

  for (const strat of defaultStrategies) {
    await prisma.strategy.upsert({
      where: { name: strat.name },
      update: {
        description: strat.description,
        is_active: strat.is_active,
      },
      create: {
        name: strat.name,
        description: strat.description,
        is_active: strat.is_active,
      },
    });
  }
  
  console.log("[BOOTSTRAP] Sincronização Concluída.");
}
