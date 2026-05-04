import { Request, Response } from 'express';
import { getSupabaseClient } from '../SupabaseClient.ts';
import { StrategyOrchestrator } from '../services/StrategyOrchestrator.ts';

export class SessionController {
  /**
   * Abre uma nova sessão de PaperTrading no Supabase
   */
  public static async create(req: Request, res: Response) {
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Conexão Supabase falhou" });

    try {
      const { initial_bankroll } = req.body;

      const { data, error } = await supabase
        .from('sessions')
        .insert([{
          initial_bankroll: parseFloat(initial_bankroll),
          current_bankroll: parseFloat(initial_bankroll),
          highest_bankroll: parseFloat(initial_bankroll),
          status: "OPEN"
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    } catch (error: any) {
      console.error("Erro ao criar sessão:", error.message);
      return res.status(500).json({ error: "Falha ao registrar sessão na nuvem" });
    }
  }

  /**
   * Sincroniza o Dashboard da ActiveSession (Giros, Heatmap e Sinais)
   */
  public static async getById(req: Request, res: Response) {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Cérebro Offline" });

    try {
      // Busca dados da sessão atual
      const { data: session, error: sError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (sError || !session) return res.status(404).json({ error: "Mesa não encontrada" });

      // Busca histórico de giros (amostragem para VIX/Entropia)
      const { data: spins } = await supabase
        .from('spins')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      // Busca sinais disparados pelo Oráculo
      const { data: signals } = await supabase
        .from('signals')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      return res.json({
        session: {
          ...session,
          spins: spins || [],
          signals: signals || []
        }
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Registra giro e executa análise estatística em tempo real
   */
  public static async registerSpin(req: Request, res: Response) {
    const { id } = req.params;
    const { number } = req.body;
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Erro de conexão" });

    try {
      // 1. Persiste o número no banco
      await supabase.from('spins').insert([{ session_id: id, number }]);

      // 2. Coleta amostragem para o Oráculo
      const { data: history } = await supabase
        .from('spins')
        .select('number')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(100);

      const numbers = history?.map(s => s.number).reverse() || [];
      
      // 3. Processamento de Estratégia HFT
      const analysis = StrategyOrchestrator.analyze(numbers);

      if (analysis) {
        await supabase.from('signals').insert([{
          session_id: id,
          strategy_name: analysis.strategyName,
          target_bet: analysis.targetBet,
          suggested_amount: analysis.suggestedAmount,
          martingale_step: analysis.step || 0,
          result: 'SUGGESTED'
        }]);
      }

      return res.json({ success: true, signalDetected: !!analysis });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
