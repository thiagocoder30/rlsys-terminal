import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export const SetupSession: React.FC = () => {
  const navigate = useNavigate();
  const [startBankroll, setStartBankroll] = useState("100.00");
  const [minChip, setMinChip] = useState<number>(0.50);
  const [loading, setLoading] = useState(false);

  const initSession = async (retries = 3) => {
    setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) throw new Error("Valor inválido.");
      const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll, min_chip: minChip }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no servidor");
      
      localStorage.setItem("rlsys_active_session", json.id); 
      navigate(`/session/${json.id}`);
    } catch (err: any) {
      if (retries > 0) {
        setTimeout(() => initSession(retries - 1), 2000);
      } else {
        alert(err.message || "Erro de conexão.");
        setLoading(false);
      }
    } 
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col space-y-6 max-w-sm mx-auto mt-4">
      <div className="text-center space-y-1 mb-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Setup Inicial</h2>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Parâmetros de Risco</p>
      </div>
      
      <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Banca Inicial (R$)</label>
          <input type="number" step="0.01" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-[#0B101E] text-white font-mono text-xl p-4 rounded-xl border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Ficha Mínima (R$)</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMinChip(0.10)} className={`py-3 rounded-xl font-mono font-bold border transition-colors ${minChip === 0.10 ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#0B101E] border-slate-700 text-slate-400'}`}>0.10 (Pragmatic)</button>
            <button onClick={() => setMinChip(0.50)} className={`py-3 rounded-xl font-mono font-bold border transition-colors ${minChip === 0.50 ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#0B101E] border-slate-700 text-slate-400'}`}>0.50 (Evolution)</button>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <button onClick={() => initSession()} disabled={loading} className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all flex justify-center items-center gap-2">
          {loading ? <Activity className="animate-spin w-5 h-5" /> : <><Play className="w-5 h-5 fill-current" /> DESDOBRAR MESA LIMPA</>}
        </button>
        <button onClick={() => navigate("/")} className="w-full py-4 text-slate-500 font-black uppercase tracking-widest text-xs hover:text-slate-300 transition-colors">Cancelar</button>
      </div>
    </motion.div>
  );
};
