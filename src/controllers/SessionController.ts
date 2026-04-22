import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class SessionController {
  /**
   * Cria uma nova sessão após o setup
   */
  public static async create(req: Request, res: Response) {
    try {
      const { initial_bankroll, min_chip } = req.body;

      const session = await prisma.session.create({
        data: {
          initial_bankroll: parseFloat(initial_bankroll),
          current_bankroll: parseFloat(initial_bankroll),
          highest_bankroll: parseFloat(initial_bankroll),
          min_chip: parseFloat(min_chip),
          status: "ACTIVE"
        }
      });

      return res.status(201).json(session);
    } catch (error: any) {
      console.error("Erro ao criar sessão:", error.message);
      return res.status(500).json({ error: "Erro ao salvar sessão no SQLite" });
    }
  }

  /**
   * Busca os detalhes da sessão para a tela principal
   */
  public static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          signals: {
            orderBy: { created_at: 'desc' },
            include: { strategy: true }
          },
          spins: {
            orderBy: { created_at: 'desc' },
            take: 20
          }
        }
      });

      if (!session) return res.status(404).json({ error: "Sessão não encontrada" });

      return res.json(session);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
