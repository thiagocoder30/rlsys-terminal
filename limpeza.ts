import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cirurgiaFinanceira() {
  console.log("[SISTEMA] Iniciando resgate de banca...");
  
  const sessoes = await prisma.session.findMany();
  
  for (const sessao of sessoes) {
    await prisma.session.update({
      where: { id: sessao.id },
      data: { current_bankroll: sessao.initial_bankroll }
    });
  }
  
  console.log("[SISTEMA] Cirurgia concluída! Todas as sessões foram equalizadas (Perda R$ 0.00).");
  console.log("[SISTEMA] Histórico de giros e Cérebro da IA mantidos intactos.");
}

cirurgiaFinanceira()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
