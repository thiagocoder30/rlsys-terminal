/**
 * RL.sys - SetupSession Page
 * Gerencia a entrada de capital e o roteamento para sessões limpas ou injetadas (Warm-Start).
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Activity, Zap, Database } from 'lucide-react';
import { motion } from 'framer-motion';

export const SetupSession: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Captura números vindos do LabSimulator via estado de navegação
  const injectedNumbers = location.state?.injectedNumbers || null;

  const [startBankroll, setStartBankroll] = useState("100.00");
  const [minChip, setMinChip] = useState<number>(0.10);
  const [loading, setLoading] = useState(false);

  /**
   * Inicializa a sessão no Backend.
   * Diferencia entre uma nova sessão comum e um Warm-Start (com histórico pré-existente).
   */
  const initSession = async () => {
    setLoading(true);
    try {
      // Saneamento básico do input de valor
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) {
          throw new Error("Defina um valor de banca válido para iniciar.");
      }
      
      // Lógica de Endpoint Dinâmico
      const endpoint = injectedNumbers ? "/api/sessions/warm-start" : "/api/sessions";
      const payload: any = { 
        initial_bankroll, 
        min_chip: minChip 
      };
      
      if (injectedNumbers) {
          payload.numbers = injectedNumbers;
      }

      const res = await fetch(endpoint, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(payload) 
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na resposta do servidor HFT.");
      
      // Extração do ID (suporta diferentes formatos de retorno do backend)
      const sessionId = json.session ? json.session.id : json.id;
      
      if (!sessionId) throw new Error("ID da sessão não gerado pelo núcleo.");

      // Persistência local para recuperação em caso de refresh
      localStorage.setItem("rlsys_active_session", sessionId); 
      
      if (injectedNumbers) {
          // No Warm-Start, forçamos o recarregamento para limpar caches de análise anteriores
          window.location.href = `/session/${sessionId}`;
      } else {
          navigate(`/session/${sessionId}`);
      }
      
    } catch (err: any) {
      alert(`[SETUP-FAIL]: ${err.message}`);
      setLoading(false);
    } 
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }} 
      className="flex flex-col space-y-6 max-w-sm mx-auto mt-4"
    >
      {/* HEADER DINÂMICO */}
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white italic">
            {injectedNumbers ? 'Warm-Start Injection' : 'Neutral Setup'}
        </h2>
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${injectedNumbers ? 'text-emerald-500 animate-pulse' : 'text-slate-500'}`}>
            {injectedNumbers ? 'Mesa Pré-Analizada Detectada' : 'Aguardando Definição de Risco'}
        </p>
      </div>

      {/* INDICADOR DE MEMÓRIA */}
      {injectedNumbers && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Payload Ativo</span>
            </div>
            <span className="text-xs font-mono font-bold text-white bg-emerald-500/20 px-2 py-0.5 rounded">
                {injectedNumbers.length} SPINS
            </span>
        </div>
      )}
      
      {/* PAINEL DE INPUTS */}
      <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl space-y-5 shadow-2xl">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Capital de Giro (R$)</label>
          <input 
            type="number" 
            step="0.01" 
            autoFocus
            value={startBankroll} 
            onChange={(e) => setStartBankroll(e.target.value)} 
            className="w-full bg-[#0B101E] text-white font-mono text-2xl p-4 rounded-xl border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-center" 
          />
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Software da Mesa (Ficha Mín.)</label>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setMinChip(0.10)} 
              className={`py-3 rounded-xl font-mono font-bold border transition-all ${minChip === 0.10 ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40' : 'bg-[#0B101E] border-slate-700 text-slate-500 hover:border-slate-500'}`}
            >
              0.10
            </button>
            <button 
              onClick={() => setMinChip(0.50)} 
              className={`py-3 rounded-xl font-mono font-bold border transition-all ${minChip === 0.50 ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40' : 'bg-[#0B101E] border-slate-700 text-slate-500 hover:border-slate-500'}`}
            >
              0.50
            </button>
          </div>
        </div>
      </div>

      {/* BOTÕES DE AÇÃO */}
      <div className="grid gap-3">
        <button 
          onClick={() => initSession()} 
          disabled={loading} 
          className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 active:scale-95 ${
              injectedNumbers 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_5px_20px_rgba(16,185,129,0.4)]' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_5px_20px_rgba(37,99,235,0.4)]'
          } disabled:opacity-50`}
        >
          {loading ? (
            <Activity className="animate-spin w-5 h-5" />
          ) : (
            injectedNumbers ? <><Zap className="w-5 h-5 fill-current" /> ENGATAR INJEÇÃO</> : <><Play className="w-5 h-5 fill-current" /> INICIAR SESSÃO</>
          )}
        </button>
        <button 
          onClick={() => navigate("/")} 
          className="w-full py-2 text-slate-600 font-bold uppercase tracking-widest text-[9px] hover:text-slate-400 transition-colors"
        >
          Abortar Operação
        </button>
      </div>
    </motion.div>
  );
};
