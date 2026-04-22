import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3000/api/sessions/${id}`);
      if (!response.ok) throw new Error("Offline");
      const json = await response.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      console.warn("[HFT-SYNC] Tentando reconectar ao banco local...");
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="h-screen bg-[#070B14] flex flex-col items-center justify-center text-blue-500 font-mono">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="animate-pulse tracking-tighter uppercase text-[10px]">Sincronizando Fluxo de Dados...</p>
      </div>
    );
  }

  // TRAVAS DE SEGURANÇA (Se o dado sumir por 1ms no refresh, a tela não fica branca)
  const spins = data?.spins ?? [];
  const signals = data?.signals ?? [];
  const currentBankroll = data?.current_bankroll ?? 0;
  const initialBankroll = data?.initial_bankroll ?? 0;
  const profit = currentBankroll - initialBankroll;

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-200 p-6 font-sans">
      {/* Header HFT */}
      <div className="max-w-5xl mx-auto flex justify-between items-end mb-10">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tighter">RL.SYS <span className="text-blue-500">HFT</span></h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">High Frequency Terminal</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Banca Atual</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">R$ {currentBankroll.toFixed(2)}</p>
        </div>
      </div>

      {/* Radar de Giros (Blindado) */}
      <div className="max-w-5xl mx-auto mb-10">
        <div className="bg-[#0D1424] border border-slate-800 p-4 rounded-xl flex gap-3 overflow-x-auto">
          {spins.length > 0 ? (
            spins.slice(0, 12).map((s: any, idx: number) => (
              <div key={s.id || idx} className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-lg font-bold text-lg border-b-4 ${
                s.color === 'RED' ? 'bg-red-600 border-red-800' : 
                s.color === 'GREEN' ? 'bg-emerald-600 border-emerald-800' : 'bg-slate-800 border-slate-950'
              }`}>
                {s.number}
              </div>
            ))
          ) : (
            <p className="text-slate-600 text-xs py-2">Aguardando telemetria da mesa...</p>
          )}
        </div>
      </div>

      {/* Painel de Sinais Inteligentes */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 gap-4">
        {signals.length > 0 ? (
          signals.filter((sig: any) => sig.result === "PENDING").map((sig: any) => (
            <div key={sig.id} className="bg-blue-600/10 border border-blue-500/30 p-6 rounded-2xl flex justify-between items-center animate-in fade-in zoom-in duration-500">
              <div>
                <span className="bg-blue-500 text-[10px] font-black px-2 py-0.5 rounded text-white uppercase">{sig.strategy?.name ?? "PADRÃO"}</span>
                <h3 className="text-3xl font-black text-white mt-2 tracking-widest">{sig.target}</h3>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs font-bold uppercase">Entrada Sugerida</p>
                <p className="text-2xl font-mono font-black text-white">R$ {(sig.suggested_amount ?? 0).toFixed(2)}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping mb-4"></div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Varrendo padrões de mercado...</p>
          </div>
        )}
      </div>

      <button onClick={() => navigate('/')} className="mt-10 block mx-auto text-slate-600 text-[10px] font-bold uppercase hover:text-white transition">
        Finalizar Operação
      </button>
    </div>
  );
};
