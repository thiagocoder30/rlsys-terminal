import { PrismaClient } from "@prisma/client";

/**
 * RL.sys - Strategy Bootstrapper
 * Engenharia DevOps & Arquitetura Sênior
 * 
 * Este módulo garante que as estratégias institucionais estejam sempre presentes no banco
 * de dados sem a necessidade de comandos manuais de seed.
 */

interface InstitutionalStrategy {
  id: string;
  name: string;
  bayes_weight: number;
}

const OFFICIAL_STRATEGIES: InstitutionalStrategy[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Race: Vizinhos 1 & 21",
    bayes_weight: 0.7,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Race: Fusion",
    bayes_weight: 0.65,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "James Bond",
    bayes_weight: 0.6,
  }
];

export async function syncStrategiesToDatabase(prisma: PrismaClient) {
  console.log("[BOOTSTRAP] Iniciando sincronização de estratégias institucionais...");

  try {
    // 1. Buscar estratégias existentes para evitar duplicidade
    const existingStrategies = await prisma.strategy.findMany({
      select: { name: true }
    });
    
    const existingNames = new Set(existingStrategies.map(s => s.name));

    // 2. Iterar sobre a "Fonte da Verdade" e criar as que faltam
    for (const strategy of OFFICIAL_STRATEGIES) {
      if (!existingNames.has(strategy.name)) {
        await prisma.strategy.create({
          data: {
            id: strategy.id,
            name: strategy.name,
            bayes_weight: strategy.bayes_weight,
            is_active: true
          }
        });
        console.log(`[BOOTSTRAP] Nova estratégia cadastrada: ${strategy.name}`);
      }
    }

    console.log("[BOOTSTRAP] Sincronização concluída com sucesso.");
  } catch (error) {
    console.error("[BOOTSTRAP] Erro crítico ao sincronizar estratégias:", error);
    // Não interrompemos o boot do servidor, mas logamos o erro
  }
}
