import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Activity, Zap, Database } from 'lucide-react';
import { motion } from 'framer-motion';

export const SetupSession: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // O radar captura os números enviados invisivelmente pelo Laboratório (se existirem)
  const injectedNumbers = location.state?.injectedNumbers || null;

  const [startBankroll, setStartBankroll] = useState("100.00");
  const [minChip, setMinChip] = useState<number>(0.10);
  const [loading, setLoading] = useState(false);

  const initSession = async () => {
    setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) throw new Error("Valor de banca inválido.");
      
      // Define a rota e o payload dinamicamente com base na presença de dados do OCR
      const endpoint = injectedNumbers ? "/api/sessions/warm-start" : "/api/sessions";
      const payload: any = { initial_bankroll, min_chip: minChip };
      
      if (injectedNumbers) {
          payload.numbers = injectedNumbers;
      }

      const res = await fetch(endpoint, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(payload) 
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no servidor HFT.");
      
      // O warm-start retorna { success: true, session: {...} }, enquanto a rota normal retorna direto {...}
      const sessionId = json.session ? json.session.id : json.id;
      
      if (!sessionId) throw new Error("ID da sessão não localizado.");

      localStorage.setItem("rlsys_active_session", sessionId); 
      
      // Se for uma injeção, força o recarregamento total da página para a IA montar o Painel Central do zero
      if (injectedNumbers) {
          window.location.href = `/session/${sessionId}`;
      } else {
          navigate(`/session/${sessionId}`);
      }
      
    } catch (err: any) {
      alert(err.message || "Falha de comunicação com a Base HFT.");
      setLoading(false);
    } 
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col space-y-6 max-w-sm mx-auto mt-4">
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
            {injectedNumbers ? 'Setup de Injeção' : 'Setup Inicial'}
        </h2>
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${injectedNumbers ? 'text-emerald-500' : 'text-slate-500'}`}>
            {injectedNumbers ? 'Operação Warm-Start' : 'Parâmetros de Risco'}
        </p>
      </div>

      {injectedNumbers && (
        <div className="bg-emerald-900/20 border border-emerald-900/50 p-4 rounded-xl flex items-center justify-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                {injectedNumbers.length} números em memória prontos
            </span>
        </div>
      )}
      
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
        <button 
          onClick={() => initSession()} 
          disabled={loading} 
          className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 ${
              injectedNumbers 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]'
          } disabled:opacity-50`}
        >
          {loading ? (
            <Activity className="animate-spin w-5 h-5" />
          ) : (
            injectedNumbers ? <><Zap className="w-5 h-5 fill-current" /> INJETAR MESA E OPERAR</> : <><Play className="w-5 h-5 fill-current" /> DESDOBRAR MESA LIMPA</>
          )}
        </button>
        <button onClick={() => navigate("/")} className="w-full py-4 text-slate-500 font-black uppercase tracking-widest text-xs hover:text-slate-300 transition-colors">Cancelar</button>
      </div>
    </motion.div>
  );
};
