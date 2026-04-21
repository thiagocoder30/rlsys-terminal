import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando Seed de Estratégias Institucionais...");

  const strategies = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Race: Vizinhos 1 & 21",
      description: "Monitora o setor físico ao redor do 1 e 21 para detecção de anomalias cinéticas.",
      is_active: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Terminal: Heatmap 0-5-8",
      description: "Análise de frequência em terminais críticos e vizinhos do zero.",
      is_active: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Oráculo: Padrão Voisins",
      description: "Estratégia focada no setor Grande Vizinhos com base em atraso estatístico.",
      is_active: true,
    }
  ];

  for (const strat of strategies) {
    await prisma.strategy.upsert({
      where: { id: strat.id },
      update: {
        name: strat.name,
        description: strat.description,
        is_active: strat.is_active,
      },
      create: {
        id: strat.id,
        name: strat.name,
        description: strat.description,
        is_active: strat.is_active,
      },
    });
  }

  console.log("✅ Seed finalizado com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
