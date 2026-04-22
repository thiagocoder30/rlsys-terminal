import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${id}`);
      if (!response.ok) throw new Error("Erro na API");
      const json = await response.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      console.warn("Tentando reconectar...");
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="h-screen bg-[#070B14] flex flex-col items-center justify-center text-blue-500 p-6">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
        <p className="animate-pulse tracking-widest uppercase text-xs font-black">Sincronizando DB...</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 text-[10px] text-slate-500 border border-slate-800 px-4 py-2 rounded"
        >
          REPETIR CONEXÃO
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] text-white p-6 font-sans">
      <div className="flex justify-between items-center mb-10">
        <h1 className="font-black text-xl italic">RL.SYS <span className="text-blue-500">HFT</span></h1>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Banca</p>
          <p className="text-xl font-mono font-bold text-emerald-400">R$ {data.current_bankroll.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-[#0D1424] p-4 rounded-xl flex gap-2 overflow-x-auto mb-8">
        {(data.spins || []).slice(0, 10).map((s: any, i: number) => (
          <div key={i} className="flex-shrink-0 w-10 h-10 bg-slate-800 rounded flex items-center justify-center font-bold text-sm">
            {s.number}
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        {(data.signals || []).filter((sig: any) => sig.result === "PENDING").map((sig: any) => (
          <div key={sig.id} className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl flex justify-between items-center">
            <span className="text-2xl font-black">{sig.target}</span>
            <span className="text-lg font-mono">R$ {sig.suggested_amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
