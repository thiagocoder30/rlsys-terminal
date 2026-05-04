import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabaseClient.ts';
import { StrategyOrchestrator } from '../services/StrategyOrchestrator.ts';

export class SessionController {
  public static async create(req: Request, res: Response) {
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Cérebro Offline" });

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
        .select().single();

      if (error) throw error;
      return res.status(201).json(data);
    } catch (error: any) {
      return res.status(500).json({ error: "Falha ao criar sessão no Supabase" });
    }
  }

  public static async getById(req: Request, res: Response) {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    
    // Trava de segurança para evitar loop infinito com IDs inválidos
    if (!id || id === 'undefined' || id === 'null' || id.length < 5) {
      return res.status(400).json({ error: "Sessão inválida" });
    }

    try {
      const { data: session, error } = await supabase
        .from('sessions').select('*').eq('id', id).single();

      // Se a sessão não existe no novo Supabase, retornamos 404
      if (error || !session) {
        return res.status(404).json({ error: "Sessão inexistente no novo DB" });
      }

      const { data: spins } = await supabase
        .from('spins').select('*').eq('session_id', id).order('created_at', { ascending: false }).limit(50);

      const { data: signals } = await supabase
        .from('signals').select('*').eq('session_id', id).order('created_at', { ascending: false }).limit(10);

      return res.json({ session: { ...session, spins: spins || [], signals: signals || [] } });
    } catch (error: any) {
      return res.status(500).json({ error: "Erro interno de sincronização" });
    }
  }

  public static async registerSpin(req: Request, res: Response) {
    const { id } = req.params;
    const { number } = req.body;
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Erro de conexão" });

    try {
      await supabase.from('spins').insert([{ session_id: id, number }]);
      const { data: history } = await supabase
        .from('spins').select('number').eq('session_id', id).order('created_at', { ascending: false }).limit(100);

      const numbers = history?.map(s => s.number).reverse() || [];
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
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
