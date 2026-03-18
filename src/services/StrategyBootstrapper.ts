import { PrismaClient } from "@prisma/client";

const OFFICIAL_STRATEGIES = [
  { name: "Race: Vizinhos 1 & 21", bayes_weight: 1.0 },
  { name: "Race: Fusion", bayes_weight: 1.0 },
  { name: "Race: P2", bayes_weight: 1.0 },
  { name: "James Bond", bayes_weight: 1.0 },
  { name: "Cross: D1 ➔ Col 2 e 3", bayes_weight: 1.0 },
  { name: "Cross: D2 ➔ Col 1 e 3", bayes_weight: 1.0 },
  { name: "Cross: D3 ➔ Col 1 e 2", bayes_weight: 1.0 },
  { name: "Cross: C1 ➔ Duz 2 e 3", bayes_weight: 1.0 },
  { name: "Cross: C2 ➔ Duz 1 e 3", bayes_weight: 1.0 },
  { name: "Cross: C3 ➔ Duz 1 e 2", bayes_weight: 1.0 },
  { name: "Macro: Red + Zero", bayes_weight: 1.0 },
  { name: "Macro: Black + Zero", bayes_weight: 1.0 },
  { name: "Macro: Even + Zero", bayes_weight: 1.0 },
  { name: "Macro: Odd + Zero", bayes_weight: 1.0 },
  { name: "Hedge: Red + Col 2 + Zero", bayes_weight: 1.0 },
  { name: "Hedge: Black + Col 3 + Zero", bayes_weight: 1.0 },
  { name: "Macro: Low (1-18) + Zero", bayes_weight: 1.0 },
  { name: "Macro: High (19-36) + Zero", bayes_weight: 1.0 },
  { name: "Race: Sector Alpha", bayes_weight: 1.0 },
  { name: "Race: Sector Omega", bayes_weight: 1.0 },
  
  // NOVA ARMA: IA FÍSICA
  { name: "Dynamic: Drop Zone", bayes_weight: 1.0 }
];

export async function syncStrategiesToDatabase(prisma: PrismaClient) {
  try {
    const officialNames = OFFICIAL_STRATEGIES.map(s => s.name);

    await prisma.strategy.updateMany({
      where: { name: { notIn: officialNames } },
      data: { is_active: false }
    });

    for (const strategy of OFFICIAL_STRATEGIES) {
      await prisma.strategy.upsert({
        where: { name: strategy.name },
        update: { is_active: true }, 
        create: { name: strategy.name, bayes_weight: strategy.bayes_weight, is_active: true }
      });
      console.log(`[BOOTSTRAP] Arsenal Tático Ativo: ${strategy.name}`);
    }
  } catch (error) { console.error("[BOOTSTRAP ERROR]:", error); }
}
