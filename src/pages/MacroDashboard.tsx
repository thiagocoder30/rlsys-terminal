import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, FlaskConical, History, Activity, Lock, Unlock, Target, AlertOctagon, Download, BrainCircuit, TrendingUp, TrendingDown, Clock, ShieldAlert, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

// ==========================================
// MOTOR DO ORÁCULO (INTELIGÊNCIA ANALÍTICA)
// ==========================================
const generateTacticalInsights = (sessions: any[]) => {
  if (!sessions || sessions.length === 0) return null;

  const insights: { type: string, title: string, description: string, icon: any, color: string }[] = [];
  const concludedSessions = sessions.filter(s => s.status === "CLOSED" && s.spins && s.spins.length > 0);
  
  if (concludedSessions.length < 3) {
    return [{ type: 'INFO', title: "Fase de Coleta", description: "O Oráculo precisa de pelo menos 3 sessões fechadas para encontrar padrões matemáticos confiáveis.", icon: BrainCircuit, color: "text-blue-400" }];
  }

  // 1. Análise de Fadiga (Tempo de Tela)
  let winTime = 0; let winCount = 0;
  let lossTime = 0; let lossCount = 0;

  concludedSessions.forEach(s => {
    const duration = new Date(s.closed_at).getTime() - new Date(s.created_at).getTime();
    if (s.current_bankroll > s.initial_bankroll) { winTime += duration; winCount++; } 
    else { lossTime += duration; lossCount++; }
  });

  const avgWinTime = winCount > 0 ? (winTime / winCount) / 60000 : 0;
  const avgLossTime = lossCount > 0 ? (lossTime / lossCount) / 60000 : 0;

  if (lossCount > 0 && avgLossTime > avgWinTime * 1.5) {
    insights.push({ type: 'WARNING', title: "Fadiga Operacional Detectada", description: `Suas sessões perdedoras duram em média ${avgLossTime.toFixed(0)} min, enquanto as vitoriosas duram ${avgWinTime.toFixed(0)} min. O algoritmo do cassino está te vencendo pela exaustão. Reduza o tempo de tela.`, icon: Clock, color: "text-orange-400" });
  } else if (winCount > 0 && avgWinTime < 15) {
    insights.push({ type: 'SUCCESS', title: "Execução Sniper Confirmada", description: `Operações cirúrgicas. Você extrai lucro em média aos ${avgWinTime.toFixed(0)} minutos e liquida o caixa antes da roleta corrigir a variância.`, icon: Target, color: "text-emerald-400" });
  }

  // 2. Darwinismo de Matrizes
  const strategyStats: Record<string, { wins: number, losses: number, pnl: number }> = {};
  
  concludedSessions.forEach(s => {
    if (!s.signals) return;
    s.signals.forEach((sig: any) => {
      if (sig.result === 'WIN' || sig.result === 'LOSS') {
        const stratName = sig.strategy?.name || "Desconhecida";
        if (!strategyStats[stratName]) strategyStats[stratName] = { wins: 0, losses: 0, pnl: 0 };
        if (sig.result === 'WIN') {
          strategyStats[stratName].wins++;
          strategyStats[stratName].pnl += sig.suggested_amount;
        } else {
          strategyStats[stratName].losses++;
          strategyStats[stratName].pnl -= sig.suggested_amount;
        }
      }
    });
  });

  let bestStrat = { name: "", winRate: 0, pnl: -999999 };
  let worstStrat = { name: "", winRate: 100, pnl: 999999 };

  Object.entries(strategyStats).forEach(([name, stats]) => {
    const total = stats.wins + stats.losses;
    if (total < 3) return;
    const winRate = (stats.wins / total) * 100;
    
    if (stats.pnl > bestStrat.pnl) bestStrat = { name, winRate, pnl: stats.pnl };
    if (stats.pnl < worstStrat.pnl) worstStrat = { name, winRate, pnl: stats.pnl };
  });

  if (bestStrat.name) {
    insights.push({ type: 'SUCCESS', title: "Matriz Alfa Identificada", description: `A estratégia [${bestStrat.name}] é sua arma mais letal, com Win Rate real de ${bestStrat.winRate.toFixed(1)}%.`, icon: TrendingUp, color: "text-emerald-400" });
  }
  if (worstStrat.name && worstStrat.pnl < 0) {
    insights.push({ type: 'DANGER', title: "Vazamento de Capital", description: `A estratégia [${worstStrat.name}] está sangrando seu caixa (Win Rate: ${worstStrat.winRate.toFixed(1)}%). Considere ignorá-la.`, icon: TrendingDown, color: "text-red-400" });
  }

  // 3. Taxa de Disciplina
  const totalSignals = concludedSessions.reduce((acc, s) => acc + (s.signals?.length || 0), 0);
  const missedSignals = concludedSessions.reduce((acc, s) => acc + (s.signals?.filter((sig:any) => sig.result === 'MISSED').length || 0), 0);
  const executionRate = totalSignals > 0 ? ((totalSignals - missedSignals) / totalSignals) * 100 : 0;

  if (executionRate < 60 && totalSignals > 10) {
    insights.push({ type: 'WARNING', title: "Hesitação Tática (Delay)", description: `Você ignorou ${100 - executionRate.toFixed(0)}% das ordens do sistema. Confie no motor ou pause a operação se houver delay.`, icon: ShieldAlert, color: "text-yellow-400" });
  }

  return insights;
};

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

  const handleExportCSV = () => {
    if (!macroData || !macroData.sessions || macroData.sessions.length === 0) {
      alert("Nenhum dado para exportar.");
      return;
    }
    const headers = ["ID_Sessao", "Data", "Hora", "Status", "Banca_Inicial", "Banca_Final", "Lucro_Prejuizo", "Total_Giros", "Total_Sinais"];
    const rows = macroData.sessions.map((s: any) => {
      const dateObj = new Date(s.created_at);
      return [ s.id, dateObj.toLocaleDateString('pt-BR'), dateObj.toLocaleTimeString('pt-BR'), s.status, s.initial_bankroll.toFixed(2), s.current_bankroll.toFixed(2), (s.current_bankroll - s.initial_bankroll).toFixed(2), s.spins?.length || 0, s.signals?.length || 0 ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", `RLSYS_HFT_DATA_${new Date().getTime()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (loadingMacro || !macroData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Activity className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sincronizando DB...</span>
      </div>
    );
  }

  const today = new Date().setHours(0, 0, 0, 0);
  const todaysSessions = (macroData.sessions || []).filter((s: any) => new Date(s.created_at).setHours(0, 0, 0, 0) === today);
  todaysSessions.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let todayInitialBankroll = 0;
  let todayPnL = 0;
  if (todaysSessions.length > 0) {
    todayInitialBankroll = todaysSessions[0].initial_bankroll;
    todayPnL = todaysSessions.reduce((acc: number, s: any) => acc + (s.current_bankroll - s.initial_bankroll), 0);
  }

  const STOP_LOSS_PERCENT = 0.15; const TAKE_PROFIT_PERCENT = 0.25; 
  const dailyStopLimit = todayInitialBankroll * STOP_LOSS_PERCENT;
  const dailyTargetLimit = todayInitialBankroll * TAKE_PROFIT_PERCENT;

  const isStopLossHit = todaysSessions.length > 0 && todayPnL <= -dailyStopLimit;
  const isTargetHit = todaysSessions.length > 0 && todayPnL >= dailyTargetLimit;

  let progressPercent = 0;
  if (todaysSessions.length > 0) {
    if (todayPnL >= 0) progressPercent = Math.min((todayPnL / dailyTargetLimit) * 100, 100);
    else progressPercent = Math.min((Math.abs(todayPnL) / dailyStopLimit) * 100, 100);
  }

  const tacticalInsights = generateTacticalInsights(macroData.sessions);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6">
      
      <div className="text-center space-y-1 mt-4">
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Painel Central</h2>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Gestão de Patrimônio</p>
      </div>

      {/* COFRE GLOBAL DIÁRIO */}
      <div className={`border p-5 rounded-2xl shadow-xl transition-all ${isStopLossHit ? 'bg-red-950/30 border-red-900/50' : isTargetHit ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-[#111827] border-slate-800/80'}`}>
        <div className="flex justify-between items-center mb-4 border-b border-slate-800/50 pb-3">
          <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {isStopLossHit ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5 text-blue-500" />} Cofre Diário (Hoje)
          </span>
          {todaysSessions.length > 0 && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Base: R$ {todayInitialBankroll.toFixed(2)}</span>}
        </div>

        {todaysSessions.length === 0 ? (
          <div className="text-center py-4 opacity-50"><span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Aguardando Início</span></div>
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
                {isStopLossHit ? <span className="text-xs font-black text-red-400 uppercase tracking-widest flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> STOPADO</span>
                : isTargetHit ? <span className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1"><Target className="w-3 h-3" /> META BATIDA</span>
                : <span className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-1"><Activity className="w-3 h-3" /> OPERANDO</span>}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest"><span className="text-red-500">Stop: -R$ {dailyStopLimit.toFixed(2)}</span><span className="text-emerald-500">Meta: +R$ {dailyTargetLimit.toFixed(2)}</span></div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex">
                {todayPnL < 0 ? <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${progressPercent}%`, marginLeft: '0' }}></div>
                : <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${progressPercent}%`, marginLeft: 'auto' }}></div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTÕES DE AÇÃO */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate("/setup")} disabled={isStopLossHit} className={`flex flex-col items-center justify-center font-black uppercase tracking-widest py-5 rounded-2xl transition-all ${isStopLossHit ? 'bg-red-950/20 text-red-900/50 border border-red-900/30 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]'}`}>
          {isStopLossHit ? <Lock className="w-5 h-5 mb-1" /> : <Play className="w-5 h-5 mb-1 fill-current" />}
          {isStopLossHit ? 'MESA TRAVADA' : 'INICIAR MESA'}
        </button>
        <button onClick={() => navigate("/lab")} className="flex flex-col items-center justify-center bg-[#111827] border border-purple-900/50 hover:bg-slate-800 text-purple-400 font-black uppercase tracking-widest py-5 rounded-2xl shadow-lg transition-all">
          <FlaskConical className="w-5 h-5 mb-1" /> LABORATÓRIO
        </button>
      </div>
      
      {/* BOTÃO DA DOUTRINA (MANUAL) */}
      <button onClick={() => navigate("/guide")} className="w-full flex items-center justify-center gap-2 bg-[#0B101E] border border-slate-700 hover:border-slate-500 text-slate-300 font-black uppercase tracking-widest py-4 rounded-xl shadow-inner transition-all">
        <BookOpen className="w-4 h-4 text-blue-500" /> DOUTRINA OPERACIONAL (MANUAL)
      </button>

      {/* ORÁCULO QUANTITATIVO */}
      {tacticalInsights && tacticalInsights.length > 0 && (
        <div className="mt-2">
          <span className="flex items-center gap-2 text-[10px] uppercase font-black text-purple-400 tracking-widest mb-3 px-1">
            <BrainCircuit className="w-3.5 h-3.5" /> Diagnóstico do Oráculo
          </span>
          <div className="space-y-3">
            {tacticalInsights.map((insight, idx) => {
              const Icon = insight.icon;
              return (
                <div key={idx} className="bg-[#0B101E] border border-slate-800/80 p-4 rounded-xl flex items-start gap-3 shadow-inner">
                  <div className={`p-2 rounded-lg bg-slate-900/50 border border-slate-800 ${insight.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-[11px] font-black uppercase tracking-widest mb-1 ${insight.color}`}>{insight.title}</h4>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">{insight.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HISTÓRICO GERAL E EXPORTAÇÃO */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-500 tracking-widest">
            <History className="w-3 h-3" /> Histórico de Sessões
          </span>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-700 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors">
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>

        <div className="space-y-2 pb-6">
          {(!macroData?.sessions || macroData.sessions.length === 0) && (
            <div className="bg-[#111827] border border-slate-800/50 p-6 rounded-xl text-center">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Nenhuma operação registrada.</span>
            </div>
          )}
          {macroData?.sessions?.map((s: any) => {
            const pnl = s.current_bankroll - s.initial_bankroll;
            return (
              <div key={s.id} onClick={() => navigate(`/audit/${s.id}`)} className="bg-[#111827] border border-slate-800/80 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:border-slate-600 transition-colors shadow-sm">
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
