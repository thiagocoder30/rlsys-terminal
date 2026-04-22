import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// --- DEFINIÇÃO DE TIPOS ENTERPRISE ---
interface Spin {
  id: string;
  number: number;
  color: 'RED' | 'BLACK' | 'GREEN';
}

interface Strategy {
  name: string;
}

interface Signal {
  id: string;
  target: string;
  suggested_amount: number;
  result: string;
  strategy?: Strategy;
}

interface SessionData {
  id: string;
  current_bankroll: number;
  initial_bankroll: number;
  spins: Spin[];
  signals: Signal[];
}

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Estado inicial como null para controlar o primeiro carregamento (Sincronização)
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Usando rota relativa graças ao Proxy configurado no vite.config.ts
      const response = await fetch(`/api/sessions/${id}`);
      
      if (!response.ok) {
        throw new Error(`Erro na conexão: ${response.status}`);
      }
      
      const json = await response.json();
      
      // Seta os dados e desativa o loading apenas se houver sucesso
      setData(json);
      setLoading(false);
    } catch (err) {
      // Log silencioso para manter a UI estável durante tentativas de reconexão
      console.warn("[HFT-SYNC] Falha na telemetria. Tentando reconectar ao banco local...");
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    fetchData();
    // Polling de alta frequência para monitoramento em tempo real
    const interval = setInterval(fetchData, 3000);
    
    return () => clearInterval(interval);
  }, [id, fetchData]);

  // PROTEÇÃO CONTRA TELA BRANCA: Estado de sincronização inicial
  if (loading || !data) {
    return (
      <div className="h-screen bg-[#070B14] flex flex-col items-center justify-center text-blue-500 font-sans">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
        <div className="text-center">
          <p className="animate-pulse tracking-[0.3em] uppercase text-[10px] font-black">Sincronizando Banco Local</p>
          <p className="text-slate-600 text-[9px] mt-2 font-mono uppercase">RL.SYS Terminal v1.0</p>
        </div>
      </div>
    );
  }

  // BLINDAGEM DE DADOS: Fallbacks para evitar erros de leitura (undefined/null)
  const spins = data?.spins ?? [];
  const signals = data?.signals ?? [];
  const currentBankroll = Number(data?.current_bankroll ?? 0);
  const initialBankroll = Number(data?.initial_bankroll ?? 0);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-200 p-6 font-sans selection:bg-blue-500/30">
      
      {/* HEADER: TELEMETRIA FINANCEIRA */}
      <div className="max-w-5xl mx-auto flex justify-between items-end mb-10">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tighter">RL.SYS <span className="text-blue-500">HFT</span></h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Painel Operacional Local</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Banca Atualizada</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">R$ {currentBankroll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* RADAR SEQUENCIAL: ÚLTIMOS RESULTADOS */}
      <div className="max-w-5xl mx-auto mb-10">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4 px-1">Radar de Mesa</h2>
        <div className="bg-[#0D1424] border border-slate-800/50 p-4 rounded-2xl flex gap-3 overflow-x-auto no-scrollbar shadow-2xl">
          {spins.length > 0 ? (
            spins.slice(0, 15).map((s, idx) => (
              <div 
                key={s.id || idx} 
                className={`flex-shrink-0 w-12 h-12 flex flex-col items-center justify-center rounded-xl font-black text-lg border-b-4 transition-transform hover:scale-105 ${
                  s.color === 'RED' ? 'bg-red-600 border-red-900 text-white' : 
                  s.color === 'GREEN' ? 'bg-emerald-600 border-emerald-900 text-white' : 'bg-slate-800 border-slate-950 text-slate-300'
                } ${idx === 0 ? 'ring-2 ring-blue-500 ring-offset-4 ring-offset-[#0D1424]' : ''}`}
              >
                {s.number}
              </div>
            ))
          ) : (
            <p className="text-slate-600 text-[10px] py-4 uppercase font-bold tracking-widest w-full text-center">
              Aguardando telemetria inicial...
            </p>
          )}
        </div>
      </div>

      {/* PAINEL DE EXECUÇÃO: SINAIS PENDENTES */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4 px-1">Sinais em Execução</h2>
        <div className="grid grid-cols-1 gap-4">
          {signals.filter(sig => sig.result === "PENDING").length > 0 ? (
            signals.filter(sig => sig.result === "PENDING").map((sig) => (
              <div key={sig.id} className="group bg-gradient-to-r from-blue-600/20 to-transparent border border-blue-500/30 p-6 rounded-2xl flex justify-between items-center transition-all hover:border-blue-500/60 shadow-lg">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    <span className="text-blue-400 text-[10px] font-black uppercase tracking-widest">
                      {sig.strategy?.name ?? "PADRÃO MATEMÁTICO"}
                    </span>
                  </div>
                  <h3 className="text-4xl font-black text-white tracking-widest group-hover:text-blue-400 transition-colors">
                    {sig.target}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Entrada</p>
                  <p className="text-3xl font-mono font-black text-white">
                    R$ {(sig.suggested_amount ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 border-2 border-dashed border-slate-800/50 rounded-3xl flex flex-col items-center justify-center bg-[#0D1424]/30">
              <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full animate-ping mb-4"></div>
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                Varrendo Anomalias Operacionais...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="max-w-5xl mx-auto mt-12 pt-6 border-t border-slate-900">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 mx-auto text-slate-600 text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-colors group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Encerrar Sessão & Desconectar
        </button>
      </div>
    </div>
  );
};
