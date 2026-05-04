import { Request, Response } from 'express';
import { getSupabaseClient } from '../SupabaseClient';
import { StrategyOrchestrator } from '../services/StrategyOrchestrator';

export class SessionController {
  /**
   * Cria uma nova sessão no Supabase e inicia o monitoramento HFT
   */
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
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json(data);
    } catch (error: any) {
      console.error("Erro ao criar sessão no Supabase:", error.message);
      return res.status(500).json({ error: "Falha na abertura de caixa no Supabase" });
    }
  }

  /**
   * Dashboard da Sessão: Busca o pulso atual da mesa (Giro + Sinais)
   */
  public static async getById(req: Request, res: Response) {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Cérebro Offline" });

    try {
      // 1. Busca dados da sessão
      const { data: session, error: sError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (sError || !session) return res.status(404).json({ error: "Sessão não localizada" });

      // 2. Busca últimos 50 giros (para o Heatmap e Linha do Tempo)
      const { data: spins } = await supabase
        .from('spins')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      // 3. Busca sinais ativos (Sugestões do Oráculo)
      const { data: signals } = await supabase
        .from('signals')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      // Retorna o objeto formatado exatamente como o seu Frontend (ActiveSession.tsx) precisa
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
   * O Motor do Oráculo: Recebe o número e decide a estratégia
   */
  public static async registerSpin(req: Request, res: Response) {
    const { id } = req.params;
    const { number } = req.body;
    const supabase = getSupabaseClient();
    if (!supabase) return res.status(500).json({ error: "Cérebro Offline" });

    try {
      // Grava o giro
      await supabase.from('spins').insert([{ session_id: id, number }]);

      // Recupera histórico para o Oráculo
      const { data: history } = await supabase
        .from('spins')
        .select('number')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(100);

      const numbers = history?.map(s => s.number).reverse() || [];
      
      // Aciona a Inteligência do Sistema
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
