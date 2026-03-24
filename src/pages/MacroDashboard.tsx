import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, FlaskConical, History, Activity, Lock, Unlock, Target, AlertOctagon } from 'lucide-react';
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
    const activeSession = localStorage.getItem("rlsys_active_session");
    if (activeSession) {
      navigate(`/session/${activeSession}`);
    } else {
      fetchMacro();
    }
  }, [fetchMacro, navigate]);

  if (loadingMacro || !macroData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Activity className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sincronizando DB...</span>
      </div>
    );
  }

  // ==========================================
  // MOTOR DO COFRE GLOBAL (CÁLCULO DIÁRIO)
  // ==========================================
  const today = new Date().setHours(0, 0, 0, 0);
  const todaysSessions = (macroData.sessions || []).filter((s: any) => new Date(s.created_at).setHours(0, 0, 0, 0) === today);
  
  // Ordenar da mais antiga para a mais nova para pegar a primeira banca do dia
  todaysSessions.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let todayInitialBankroll = 0;
  let todayPnL = 0;

  if (todaysSessions.length > 0) {
    todayInitialBankroll = todaysSessions[0].initial_bankroll;
    todayPnL = todaysSessions.reduce((acc: number, s: any) => acc + (s.current_bankroll - s.initial_bankroll), 0);
  }

  // Parâmetros de Gestão Institucional (%)
  const STOP_LOSS_PERCENT = 0.15; // -15% ao dia
  const TAKE_PROFIT_PERCENT = 0.25; // +25% ao dia

  const dailyStopLimit = todayInitialBankroll * STOP_LOSS_PERCENT;
  const dailyTargetLimit = todayInitialBankroll * TAKE_PROFIT_PERCENT;

  // Verificação de Quebra de Limite
  const isStopLossHit = todaysSessions.length > 0 && todayPnL <= -dailyStopLimit;
  const isTargetHit = todaysSessions.length > 0 && todayPnL >= dailyTargetLimit;

  // Barra de Progresso do Dia
  let progressPercent = 0;
  if (todaysSessions.length > 0) {
    if (todayPnL >= 0) {
      progressPercent = Math.min((todayPnL / dailyTargetLimit) * 100, 100);
    } else {
      progressPercent = Math.min((Math.abs(todayPnL) / dailyStopLimit) * 100, 100);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6">
      
      <div className="text-center space-y-1 mt-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Painel Central</h2>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Gestão de Patrimônio</p>
      </div>

      {/* COFRE GLOBAL DIÁRIO (HUD DE PROTEÇÃO) */}
      <div className={`border p-5 rounded-2xl shadow-xl transition-all ${isStopLossHit ? 'bg-red-950/30 border-red-900/50' : isTargetHit ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-[#111827] border-slate-800/80'}`}>
        <div className="flex justify-between items-center mb-4 border-b border-slate-800/50 pb-3">
          <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {isStopLossHit ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5 text-blue-500" />} 
            Cofre Diário (Hoje)
          </span>
          {todaysSessions.length > 0 && (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Base: R$ {todayInitialBankroll.toFixed(2)}</span>
          )}
        </div>

        {todaysSessions.length === 0 ? (
          <div className="text-center py-4 opacity-50">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aguardando Início do Expediente</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Resultado de Hoje</span>
                <span className={`text-3xl font-black font-mono tracking-tight ${todayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {todayPnL >= 0 ? '+' : ''}R$ {todayPnL.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</span>
                {isStopLossHit ? (
                  <span className="text-xs font-black text-red-400 uppercase tracking-widest flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> STOPADO</span>
                ) : isTargetHit ? (
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1"><Target className="w-3 h-3" /> META BATIDA</span>
                ) : (
                  <span className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-1"><Activity className="w-3 h-3" /> OPERANDO</span>
                )}
              </div>
            </div>

            {/* Barra de Pressão Diária */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest">
                <span className="text-red-500">Stop: -R$ {dailyStopLimit.toFixed(2)}</span>
                <span className="text-emerald-500">Meta: +R$ {dailyTargetLimit.toFixed(2)}</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex">
                {todayPnL < 0 ? (
                  <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${progressPercent}%`, marginLeft: '0' }}></div>
                ) : (
                  <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${progressPercent}%`, marginLeft: 'auto' }}></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTÕES DE AÇÃO (Bloqueados se o Stop for atingido) */}
      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={() => navigate("/setup")} 
          disabled={isStopLossHit}
          className={`flex flex-col items-center justify-center font-black uppercase tracking-widest py-6 rounded-2xl transition-all ${
            isStopLossHit 
              ? 'bg-red-950/20 text-red-900/50 border border-red-900/30 cursor-not-allowed shadow-none' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]'
          }`}
        >
          {isStopLossHit ? <Lock className="w-6 h-6 mb-2" /> : <Play className="w-6 h-6 mb-2 fill-current" />}
          {isStopLossHit ? 'MESA TRAVADA' : 'INICIAR MESA'}
        </button>
        <button onClick={() => navigate("/lab")} className="flex flex-col items-center justify-center bg-[#111827] border border-blue-900/50 hover:bg-slate-800 text-blue-400 font-black uppercase tracking-widest py-6 rounded-2xl shadow-lg transition-all">
          <FlaskConical className="w-6 h-6 mb-2" /> SIMULADOR
        </button>
      </div>

      {/* HISTÓRICO GERAL DE SESSÕES */}
      <div className="mt-4">
        <span className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-500 tracking-widest mb-3 px-1">
          <History className="w-3 h-3" /> Histórico de Sessões (Todas)
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
                  <span className="text-sm text-slate-200 font-bold block">
                    {new Date(s.created_at).toLocaleDateString('pt-BR')} <span className="text-slate-500 text-xs ml-1">{new Date(s.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                  </span>
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
