/**
 * RL.sys - SessionController
 * Gerencia o ciclo de vida das sessões no Prisma.
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MathEngine } from '../utils/MathEngine';

const prisma = new PrismaClient();

export class SessionController {
  /**
   * Cria uma sessão limpa.
   */
  async create(req: Request, res: Response) {
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
      return res.status(500).json({ error: "Falha ao criar sessão neutra." });
    }
  }

  /**
   * Warm-Start: Cria sessão e já injeta o histórico do OCR.
   */
  async warmStart(req: Request, res: Response) {
    try {
      const { initial_bankroll, min_chip, numbers } = req.body;

      // 1. Criar a sessão
      const session = await prisma.session.create({
        data: {
          initial_bankroll: parseFloat(initial_bankroll),
          current_bankroll: parseFloat(initial_bankroll),
          highest_bankroll: parseFloat(initial_bankroll),
          min_chip: parseFloat(min_chip),
          status: "ACTIVE"
        }
      });

      // 2. Injetar números em massa (Bulk Create)
      if (numbers && Array.isArray(numbers)) {
        const spinData = numbers.map((n: number) => {
          const props = MathEngine.getNumberProps(n);
          return {
            session_id: session.id,
            number: n,
            color: props.color,
            parity: props.parity,
            dozen: props.dozen,
            column: props.col
          };
        });

        await prisma.spin.createMany({ data: spinData });
      }

      return res.status(201).json({ success: true, session });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: "Falha na injeção de dados warm-start." });
    }
  }
}
