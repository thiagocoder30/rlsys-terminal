import { PrismaClient } from "@prisma/client";

// O Arsenal Enxuto (Foco Exclusivo em Alta Assertividade)
const OFFICIAL_STRATEGIES = [
  { name: "Race: Vizinhos 1 & 21", bayes_weight: 1.0 },
  { name: "James Bond", bayes_weight: 1.0 },
  { name: "Cross: D1 ➔ Col 2 e 3", bayes_weight: 1.0 },
  { name: "Cross: D2 ➔ Col 1 e 3", bayes_weight: 1.0 },
  { name: "Cross: D3 ➔ Col 1 e 2", bayes_weight: 1.0 },
  { name: "Cross: C1 ➔ Duz 2 e 3", bayes_weight: 1.0 },
  { name: "Cross: C2 ➔ Duz 1 e 3", bayes_weight: 1.0 },
  { name: "Cross: C3 ➔ Duz 1 e 2", bayes_weight: 1.0 }
];

export async function syncStrategiesToDatabase(prisma: PrismaClient) {
  try {
    const officialNames = OFFICIAL_STRATEGIES.map(s => s.name);

    // 1. Desliga (Soft Delete) qualquer estratégia que não seja oficial
    await prisma.strategy.updateMany({
      where: { name: { notIn: officialNames } },
      data: { is_active: false }
    });

    // 2. Injeta ou reativa as estratégias de Elite
    for (const strategy of OFFICIAL_STRATEGIES) {
      await prisma.strategy.upsert({
        where: { name: strategy.name },
        update: { is_active: true, bayes_weight: strategy.bayes_weight },
        create: { name: strategy.name, bayes_weight: strategy.bayes_weight, is_active: true }
      });
      console.log(`[BOOTSTRAP] Arsenal Ativo: ${strategy.name}`);
    }
  } catch (error) { console.error("[BOOTSTRAP ERROR]:", error); }
}
