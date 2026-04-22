import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface Signal {
  id: string;
  target: string;
  suggested_amount: number;
  martingale_step: number;
  result: string;
  strategy?: { name: string };
}

interface Session {
  id: string;
  current_bankroll: number;
  initial_bankroll: number;
  signals: Signal[];
}

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions/${id}`);
      if (!response.ok) throw new Error("Sessão não encontrada");
      const data = await response.json();
      setSession(data);
    } catch (err) {
      console.error("Erro na busca:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    const timer = setInterval(fetchSession, 3000);
    return () => clearInterval(timer);
  }, [id]);

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white">Sincronizando com Banco Local...</div>;
  if (!session) return <div className="h-screen bg-black flex items-center justify-center text-red-500">Erro: Sessão Inválida.</div>;

  const profit = (session.current_bankroll ?? 0) - (session.initial_bankroll ?? 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans">
      {/* Header com Banca */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Banca em Tempo Real</p>
          <h2 className="text-3xl font-black text-emerald-400">
            R$ {(session.current_bankroll ?? 0).toFixed(2)}
          </h2>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Resultado Líquido</p>
          <h2 className={`text-3xl font-black ${profit >= 0 ? 'text-sky-400' : 'text-rose-500'}`}>
            R$ {profit.toFixed(2)}
          </h2>
        </div>
      </div>

      {/* Lista de Sinais de Alta Frequência */}
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-slate-800/50 p-4 border-b border-slate-700">
          <h3 className="text-sm font-bold text-slate-400 uppercase">Monitor de Estratégias HFT</h3>
        </div>
        
        <div className="divide-y divide-slate-800">
          {session.signals && session.signals.length > 0 ? (
            session.signals.map((sig) => (
              <div key={sig.id} className="p-4 flex justify-between items-center hover:bg-slate-800/30 transition">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{sig.strategy?.name ?? "Anomalia Detectada"}</p>
                  </div>
                  <p className="font-mono text-lg text-white font-bold tracking-tighter">{sig.target}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">R$ {(sig.suggested_amount ?? 0).toFixed(2)}</p>
                  <p className={`text-[10px] font-black px-2 py-0.5 rounded inline-block ${
                    sig.result === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 
                    sig.result === 'LOSS' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {sig.result} {sig.martingale_step > 0 ? `| GALE ${sig.martingale_step}` : ''}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-20 text-center text-slate-600">
              <p className="animate-pulse">Aguardando entrada confirmada pelo orquestrador...</p>
            </div>
          )}
        </div>
      </div>
      
      <button 
        onClick={() => navigate('/')}
        className="mt-8 block mx-auto text-slate-500 hover:text-white text-xs uppercase tracking-tighter transition"
      >
        Encerrar e Voltar ao Terminal
      </button>
    </div>
  );
};
