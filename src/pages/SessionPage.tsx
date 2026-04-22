import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Rota relativa utilizando o Proxy do Vite
      const response = await fetch(`/api/sessions/${id}`);
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

  if (loading || !data) {
    return (
      <div className="h-screen bg-[#070B14] flex flex-col items-center justify-center text-blue-500 font-sans">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
        <p className="animate-pulse tracking-[0.3em] uppercase text-[10px] font-black">Sincronizando DB...</p>
      </div>
    );
  }

  const spins = data?.spins ?? [];
  const signals = data?.signals ?? [];

  return (
    <div className="min-h-screen bg-[#070B14] text-white p-6">
      <div className="max-w-5xl mx-auto flex justify-between items-end mb-10">
        <h1 className="text-2xl font-black tracking-tighter">RL.SYS <span className="text-blue-500">HFT</span></h1>
        <p className="text-2xl font-mono text-emerald-400">R$ {data.current_bankroll.toFixed(2)}</p>
      </div>

      <div className="max-w-5xl mx-auto bg-[#0D1424] p-4 rounded-xl flex gap-3 overflow-x-auto mb-10">
        {spins.map((s: any, idx: number) => (
          <div key={idx} className="w-12 h-12 bg-slate-800 flex items-center justify-center rounded-lg font-bold">
            {s.number}
          </div>
        ))}
      </div>

      <div className="max-w-5xl mx-auto grid gap-4">
        {signals.length > 0 ? (
          signals.map((sig: any) => (
            <div key={sig.id} className="bg-blue-600/10 border border-blue-500/30 p-6 rounded-2xl flex justify-between">
              <span className="text-3xl font-black">{sig.target}</span>
              <span className="text-xl font-mono">R$ {sig.suggested_amount.toFixed(2)}</span>
            </div>
          ))
        ) : (
          <p className="text-center text-slate-500 uppercase text-xs tracking-widest py-10">Aguardando Padrões...</p>
        )}
      </div>

      <button onClick={() => navigate('/')} className="mt-10 block mx-auto text-slate-600 text-[10px] uppercase font-bold">
        Finalizar Sessão
      </button>
    </div>
  );
};
