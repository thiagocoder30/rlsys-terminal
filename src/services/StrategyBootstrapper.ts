import { PrismaClient } from "@prisma/client";

const OFFICIAL_STRATEGIES = [
  { name: "Race: Vizinhos 1 & 21", bayes_weight: 1.0 },
  { name: "James Bond", bayes_weight: 1.0 },
  { name: "Dúzia 1", bayes_weight: 1.0 },
  { name: "Dúzia 2", bayes_weight: 1.0 },
  { name: "Dúzia 3", bayes_weight: 1.0 },
  { name: "Coluna 1", bayes_weight: 1.0 },
  { name: "Coluna 2", bayes_weight: 1.0 },
  { name: "Coluna 3", bayes_weight: 1.0 }
];

export async function syncStrategiesToDatabase(prisma: PrismaClient) {
  try {
    const existing = await prisma.strategy.findMany();
    const existingNames = new Set(existing.map(s => s.name));

    for (const strategy of OFFICIAL_STRATEGIES) {
      if (!existingNames.has(strategy.name)) {
        await prisma.strategy.create({
          data: {
            name: strategy.name,
            bayes_weight: strategy.bayes_weight,
            is_active: true
          }
        });
        console.log(`[BOOTSTRAP] Arsenal Estatístico Injetado: ${strategy.name}`);
      }
    }
  } catch (error) {
    console.error("[BOOTSTRAP ERROR]:", error);
  }
}
