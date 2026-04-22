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
      if (!response.ok) throw new Error("Offline");
      const json = await response.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      // Mantém tentando silenciosamente
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [id, fetchData]);

  if (loading || !data) {
    return (
      <div className="h-screen bg-[#070B14] flex flex-col items-center justify-center text-blue-500 font-sans">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="animate-pulse tracking-widest text-[10px] font-black">SINCRO_DATA_LINK...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] text-white p-6 font-sans">
      <div className="flex justify-between items-center mb-10">
        <h1 className="font-black text-xl tracking-tighter italic">RL.SYS <span className="text-blue-500">HFT</span></h1>
        <p className="text-xl font-mono text-emerald-400 font-bold">R$ {data.current_bankroll.toFixed(2)}</p>
      </div>

      <div className="bg-[#0D1424] p-4 rounded-xl flex gap-2 overflow-x-auto mb-8 border border-slate-800">
        {(data.spins || []).map((s: any, i: number) => (
          <div key={i} className="flex-shrink-0 w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center font-bold text-xs border-b-2 border-slate-950">
            {s.number}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {(data.signals || []).filter((sig: any) => sig.result === "PENDING").map((sig: any) => (
          <div key={sig.id} className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl flex justify-between items-center shadow-lg">
            <span className="text-2xl font-black tracking-widest">{sig.target}</span>
            <span className="text-lg font-mono text-blue-400">R$ {sig.suggested_amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
