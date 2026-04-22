import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

// --- TIPAGENS ---
interface Spin {
  id: string;
  number: number;
}

interface Signal {
  id: string;
  target: string;
  suggested_amount: number;
  martingale_step: number;
  result: string;
  strategy?: { name: string };
}

interface SessionData {
  id: string;
  current_bankroll: number;
  initial_bankroll: number;
  spins: Spin[];
  signals: Signal[];
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export const Session: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);

  // Função para garantir a cor correta da roleta no Radar
  const getNumberColor = (num: number) => {
    if (num === 0) return "bg-green-600 text-white";
    if (RED_NUMBERS.includes(num)) return "bg-red-600 text-white";
    return "bg-[#1E293B] text-white"; // Preto/Cinza escuro
  };

  useEffect(() => {
    let isMounted = true;

    const fetchSession = async () => {
      try {
        // Tenta a rota padrão e faz fallback para a de dashboard se necessário
        let res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) {
          res = await fetch(`/api/sessions/${id}/dashboard`);
          if (!res.ok) throw new Error("Erro de comunicação com o servidor local.");
        }
        
        const data = await res.json();
        
        if (!isMounted) return;

        // Blinda contra diferenças de formato no JSON vindo do SQLite
        const safeData = data.session ? data.session : data;
        setSession(safeData);

      } catch (err) {
        console.error("[Front-end] Erro silenciado para evitar tela branca:", err);
        // Não apagamos o estado `session` aqui para manter a última tela visível
      }
    };

    fetchSession();
    const interval = setInterval(fetchSession, 3000); // Polling a cada 3s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [id]);

  // PROTEÇÃO INICIAL: Evita a tela branca se a sessão demorar a carregar
  if (!session) {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center text-slate-500 font-sans">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs uppercase tracking-widest">Sincronizando com banco local...</p>
      </div>
    );
  }

  // VARIÁVEIS SEGURAS: Se o SQLite mandar nulo, assumimos array vazio ou zero
  const spins = session.spins ?? [];
  const signals = session.signals ?? [];
  const activeSignals = signals.filter(s => s.result === "PENDING" || s.result === "SUGGESTED");

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-200 p-4 font-sans selection:bg-blue-500/30">
      
      {/* HEADER: RL.SYS HFT */}
      <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
          <h1 className="text-xl font-black tracking-widest text-white">RL.SYS <span className="text-blue-500">HFT</span></h1>
        </div>
        <div className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded text-emerald-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span className="text-xs font-bold uppercase tracking-wider">Sistema ON</span>
        </div>
      </div>

      {/* SESSÃO: RADAR SEQUENCIAL */}
      <div className="mb-8">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 px-1">Radar Sequencial</h2>
        
        <div className="bg-[#0D1424] border border-slate-800/50 p-4 rounded-xl shadow-lg">
          {spins.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {spins.slice(0, 15).map((spin, index) => (
                <div 
                  key={spin.id || index} 
                  className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-lg font-bold shadow-sm transition-all
                    ${getNumberColor(spin.number)} 
                    ${index === 0 ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-[#0D1424] scale-105 z-10' : 'opacity-90'}
                  `}
                >
                  {spin.number}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-slate-600 text-xs uppercase">Aguardando o primeiro giro...</div>
          )}
        </div>
      </div>

      {/* SESSÃO: STATUS DE PADRÃO MATEMÁTICO E SINAIS */}
      <div className="flex flex-col items-center justify-center mt-12 bg-[#0D1424]/50 border border-slate-800/50 rounded-xl p-8 min-h-[150px]">
        {activeSignals.length === 0 ? (
          <>
            <svg className="w-8 h-8 text-blue-500/50 mb-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center animate-pulse">
              Aguardando Padrão Matemático...
            </p>
          </>
        ) : (
          <div className="w-full space-y-3">
            {activeSignals.map((signal) => (
              <div key={signal.id} className="w-full bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-1">{signal.strategy?.name ?? "Anomalia Operacional"}</p>
                  <p className="text-lg font-bold text-white tracking-widest">{signal.target}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-300">R$ {(signal.suggested_amount ?? 0).toFixed(2)}</p>
                  {signal.martingale_step > 0 && (
                    <p className="text-[10px] font-bold text-orange-400 uppercase mt-1">Gale {signal.martingale_step}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botão de Emergência para sair da tela caso precise */}
      <button 
        onClick={() => navigate('/')}
        className="mt-12 block w-full text-center text-slate-600 hover:text-slate-400 text-[10px] uppercase tracking-widest transition-colors"
      >
        Encerrar Sessão & Voltar
      </button>

    </div>
  );
};
