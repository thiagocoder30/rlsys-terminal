import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Definição de interface para garantir estabilidade dos dados
interface Spin {
  number: number;
  color: 'RED' | 'BLACK' | 'GREEN';
}

interface Signal {
  id: string;
  target: string;
  suggested_amount: number;
  result: string;
  strategy?: { name: string };
}

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // O caminho relativo utiliza o Proxy definido no vite.config.ts para a porta 3001
      const response = await fetch(`/api/sessions/${id}`);
      
      if (!response.ok) throw new Error("Falha na Sincronização");
      
      const json = await response.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      // Polling resiliente: continua tentando conectar em silêncio se o servidor oscilar
      console.warn("[HFT-SYNC] Tentando restabelecer link com porta 3001...");
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    fetchData();
    // Intervalo de 3 segundos para monitoramento em tempo real no smartphone
    const interval = setInterval(fetchData, 3000);
    
    return () => clearInterval(interval);
  }, [id, fetchData]);

  // Tela de carregamento blindada
  if (loading || !data) {
    return (
      <div className="h-screen bg-[#070B14] flex flex-col items-center justify-center text-blue-500 font-sans p-6">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
        <div className="text-center">
          <p className="animate-pulse tracking-[0.3em] uppercase text-[10px] font-black">Link_Data_Sync...</p>
          <p className="text-slate-600 text-[9px] mt-2 font-mono uppercase">Aguardando Telemetria Port 3001</p>
        </div>
      </div>
    );
  }

  // Fallbacks de segurança para evitar que o app quebre se o banco retornar vazio
  const spins = data?.spins ?? [];
  const signals = data?.signals ?? [];
  const currentBankroll = Number(data?.current_bankroll ?? 0);

  return (
    <div className="min-h-screen bg-[#070B14] text-white p-6 font-sans selection:bg-blue-500/30">
      
      {/* Header de Telemetria */}
      <div className="max-w-5xl mx-auto flex justify-between items-end mb-10">
        <div>
          <h1 className="text-xl font-black tracking-tighter italic">RL.SYS <span className="text-blue-500">HFT</span></h1>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">High Frequency Terminal</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Banca Atual</p>
          <p className="text-xl font-mono font-bold text-emerald-400">
            R$ {currentBankroll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Radar de Giros da Mesa */}
      <div className="max-w-5xl mx-auto mb-8">
        <p className="text-[9px] font-bold uppercase text-slate-500 mb-3 tracking-widest px-1">Últimos Resultados</p>
        <div className="bg-[#0D1424] p-4 rounded-xl flex gap-2 overflow-x-auto border border-slate-800 shadow-inner no-scrollbar">
          {spins.length > 0 ? (
            spins.slice(0, 12).map((s: Spin, i: number) => (
              <div 
                key={i} 
                className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm border-b-2 transition-all ${
                  s.color === 'RED' ? 'bg-red-600 border-red-900 text-white' : 
                  s.color === 'GREEN' ? 'bg-emerald-600 border-emerald-900 text-white' : 
                  'bg-slate-800 border-slate-950 text-slate-300'
                }`}
              >
                {s.number}
              </div>
            ))
          ) : (
            <p className="text-slate-600 text-[10px] py-2 uppercase font-bold tracking-tighter">Sincronizando dados da mesa...</p>
          )}
        </div>
      </div>

      {/* Painel de Sinais Ativos */}
      <div className="max-w-5xl mx-auto space-y-4">
        <p className="text-[9px] font-bold uppercase text-slate-500 mb-1 tracking-widest px-1">Sinais Pendentes</p>
        {signals.filter((sig: Signal) => sig.result === "PENDING").length > 0 ? (
          signals.filter((sig: Signal) => sig.result === "PENDING").map((sig: Signal) => (
            <div key={sig.id} className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl flex justify-between items-center shadow-lg animate-in fade-in slide-in-from-bottom-2">
              <div>
                <span className="text-blue-500 text-[9px] font-black uppercase tracking-widest block mb-1">
                  {sig.strategy?.name ?? "PADRÃO HFT"}
                </span>
                <span className="text-2xl font-black tracking-[0.2em]">{sig.target}</span>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-[9px] font-bold uppercase mb-1">Entrada</p>
                <span className="text-lg font-mono text-blue-400 font-bold">
                  R$ {Number(sig.suggested_amount).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="py-16 border-2 border-dashed border-slate-800/50 rounded-2xl flex flex-col items-center justify-center">
            <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full animate-ping mb-3"></div>
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">Varrendo Anomalias...</p>
          </div>
        )}
      </div>

      {/* Botão de Encerramento */}
      <button 
        onClick={() => navigate('/')} 
        className="mt-12 block mx-auto text-slate-600 text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-colors py-4"
      >
        Encerrar Terminal
      </button>
    </div>
  );
};
