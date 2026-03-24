import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, FlaskConical, History, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export const MacroDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [macroData, setMacroData] = useState<any>(null);
  const [loadingMacro, setLoadingMacro] = useState(true);

  const fetchMacro = useCallback(async () => {
    setLoadingMacro(true);
    try { 
      const res = await fetch("/api/macro"); 
      const json = await res.json(); 
      setMacroData(json); 
    } catch (err) { 
      console.error("Erro macro:", err); 
    } finally { 
      setLoadingMacro(false); 
    }
  }, []);

  useEffect(() => {
    // Redireciona automaticamente se já existir uma sessão ativa no cache
    const activeSession = localStorage.getItem("rlsys_active_session");
    if (activeSession) {
      navigate(`/session/${activeSession}`);
    } else {
      fetchMacro();
    }
  }, [fetchMacro, navigate]);

  if (loadingMacro) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Activity className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sincronizando DB...</span>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6">
      <div className="text-center space-y-1 mt-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Painel Central</h2>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Gestão de Patrimônio</p>
      </div>

      <div className="bg-[#111827] border border-slate-800/80 p-6 rounded-2xl shadow-xl">
        <div className="flex justify-between items-end border-b border-slate-800 pb-4 mb-4">
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">P&L Líquido Global</span>
            <span className={`text-3xl font-black font-mono tracking-tight ${macroData?.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {macroData?.totalProfit >= 0 ? '+' : ''}R$ {macroData?.totalProfit?.toFixed(2) || "0.00"}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Operações</span>
            <span className="text-2xl font-black font-mono text-white">{macroData?.totalSessions || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate("/setup")} className="flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest py-6 rounded-2xl shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all">
          <Play className="w-6 h-6 mb-2 fill-current" /> INICIAR MESA
        </button>
        <button onClick={() => navigate("/lab")} className="flex flex-col items-center justify-center bg-[#111827] border border-blue-900/50 hover:bg-slate-800 text-blue-400 font-black uppercase tracking-widest py-6 rounded-2xl shadow-lg transition-all">
          <FlaskConical className="w-6 h-6 mb-2" /> SIMULADOR
        </button>
      </div>

      <div className="mt-4">
        <span className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-500 tracking-widest mb-3 px-1">
          <History className="w-3 h-3" /> Histórico de Sessões
        </span>
        <div className="space-y-2">
          {(!macroData?.sessions || macroData.sessions.length === 0) && (
            <div className="bg-[#111827] border border-slate-800/50 p-6 rounded-xl text-center">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Nenhuma operação registrada.</span>
            </div>
          )}
          {macroData?.sessions?.map((s: any) => {
            const pnl = s.current_bankroll - s.initial_bankroll;
            return (
              <div key={s.id} onClick={() => navigate(`/audit/${s.id}`)} className="bg-[#111827] border border-slate-800/80 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:border-slate-600 transition-colors">
                <div>
                  <span className="text-sm text-slate-200 font-bold block">{new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
                  <span className="text-[10px] text-blue-400 uppercase tracking-widest block mt-0.5">Auditar Relatório</span>
                </div>
                <span className={`text-lg font-mono font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  );
};
