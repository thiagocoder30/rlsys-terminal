import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando Seed de Estratégias Institucionais...");

  // 1. Estratégia Race: Vizinhos 1 & 21
  await prisma.strategy.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: { name: "Race: Vizinhos 1 & 21", is_active: true },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Race: Vizinhos 1 & 21",
      bayes_weight: 0.7,
      is_active: true,
    },
  });

  // 2. Estratégia Race: Fusion
  await prisma.strategy.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: { name: "Race: Fusion", is_active: true },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Race: Fusion",
      bayes_weight: 0.65,
      is_active: true,
    },
  });

  // 3. Estratégia James Bond
  await prisma.strategy.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: { name: "James Bond", is_active: true },
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      name: "James Bond",
      bayes_weight: 0.6,
      is_active: true,
    },
  });

  console.log("✅ Estratégias Institucionais populadas com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
