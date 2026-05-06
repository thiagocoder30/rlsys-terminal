/**
 * RL.sys - AuditReport
 * Finaliza a sessão com uma análise forense da performance e saúde da banca.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, Activity, ArrowLeft, AlertTriangle, FileText, 
  CheckCircle2, TrendingUp, TrendingDown, MinusCircle 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';

// ==========================================
// LÓGICA DE AUDITORIA E CÁLCULO
// ==========================================

const getPayoutRatio = (stratName: string, targetBet?: string) => {
  if (!stratName) return 1.0;
  const name = stratName.toLowerCase();
  if (name.includes("vizinhos")) return 36 / 5; 
  if (name.includes("james bond")) return 2.0;
  if (name.includes("dúzia") || name.includes("coluna")) return 2.0;
  if (name.includes("zero") || name.includes("quantum")) return 35.0;
  return 1.0;
};

const calculateEntropy = (spins: any[]) => {
  if (!spins || spins.length < 10) return 0;
  const sample = spins.slice(0, 37).map((s:any) => s.number !== undefined ? s.number : s);
  const counts: Record<number, number> = {};
  sample.forEach((n:number) => counts[n] = (counts[n] || 0) + 1);
  let entropy = 0;
  for (const key in counts) {
    const p = counts[key] / sample.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
};

const generateDiagnostic = (auditData: any, pnl: number) => {
  if (pnl >= 0) return { 
    title: "OPERAÇÃO BEM SUCEDIDA", 
    text: "Sessão concluída com capital preservado. O motor tático garantiu a execução no lucro dentro dos parâmetros de risco.", 
    color: "text-emerald-400", bg: "bg-emerald-950/30", border: "border-emerald-900/50" 
  };
  
  const entropy = calculateEntropy(auditData.spins || []);
  const durationMs = new Date(auditData.closed_at || Date.now()).getTime() - new Date(auditData.created_at).getTime();
  const mins = durationMs / 60000;

  if (entropy > 4.5) return { 
    title: "CAUSA: INSTABILIDADE ALGORÍTMICA", 
    text: "A entropia da mesa atingiu dispersão crítica (VIX Alto). O Stop Loss atuou para evitar a exposição em uma mesa sem viés.", 
    color: "text-red-400", bg: "bg-red-950/30", border: "border-red-900/50" 
  };

  if (mins >= 45) return { 
    title: "CAUSA: FADIGA DE EXPOSIÇÃO", 
    text: "O tempo de permanência no mercado superou a janela de eficiência. A liquidação foi forçada para proteger o saldo restante.", 
    color: "text-orange-400", bg: "bg-orange-950/30", border: "border-orange-900/50" 
  };

  return { 
    title: "CAUSA: VARIÂNCIA AGUDA", 
    text: "O sistema detectou anomalias estatísticas consecutivas. O encerramento protegeu a banca contra sequências de erro atípicas.", 
    color: "text-yellow-400", bg: "bg-yellow-950/30", border: "border-yellow-900/50" 
  };
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export const AuditReport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [auditData, setAuditData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadSessionAudit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Conexão com o servidor 3001 para buscar auditoria
      const res = await fetch(`http://127.0.0.1:3001/api/sessions/${id}/audit`);
      if (!res.ok) throw new Error("Falha ao buscar dados de auditoria.");
      setAuditData(await res.json());
    } catch (err) {
      console.error("Erro na auditoria:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSessionAudit();
  }, [loadSessionAudit]);

  if (loading || !auditData) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Activity className="w-12 h-12 text-blue-600 animate-spin mb-4 opacity-20" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gerando Gráficos Forenses...</span>
      </div>
    );
  }

  // Processamento de Dados Financeiros
  const pnl = auditData.current_bankroll - auditData.initial_bankroll;
  const diag = generateDiagnostic(auditData, pnl);
  const isGreen = pnl >= 0;

  const allSignals = auditData.signals || [];
  const executedSignals = allSignals
    .filter((s:any) => s.result === 'WIN' || s.result === 'LOSS')
    .sort((a:any, b:any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  const totalSignals = allSignals.length;
  const executedCount = executedSignals.length;
  const missedCount = totalSignals - executedCount;
  
  const wins = executedSignals.filter((s:any) => s.result === 'WIN').length;
  const losses = executedSignals.filter((s:any) => s.result === 'LOSS').length;
  const winRate = executedCount > 0 ? ((wins / executedCount) * 100).toFixed(1) : "0.0";

  // Construção da Curva de Capital
  let currentBal = auditData.initial_bankroll;
  const chartData = [{ name: 'START', balance: currentBal }];

  executedSignals.forEach((sig: any, index: number) => {
      const payout = getPayoutRatio(sig.strategy_name || sig.strategy?.name, sig.target_bet);
      const profitNet = sig.result === 'WIN' ? (sig.suggested_amount * payout) : -sig.suggested_amount;
      currentBal += profitNet;
      chartData.push({ name: `OP${index + 1}`, balance: parseFloat(currentBal.toFixed(2)) });
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111827] border border-slate-700 p-3 rounded-xl shadow-2xl">
          <p className="text-lg font-mono font-black text-white">R$ {payload[0].value.toFixed(2)}</p>
          <span className="text-[9px] font-bold text-slate-500 uppercase">Equity Level</span>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div 
        initial={{ opacity: 0, scale: 0.98 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="flex flex-col space-y-6 pb-12"
    >
      {/* HEADER */}
      <div className="flex justify-between items-center mt-2 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
            <ShieldCheck className="text-blue-500 w-6 h-6" /> RELATÓRIO HFT
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">ID: {id?.slice(0, 8)}... (Audit Mode)</p>
        </div>
        <button 
            onClick={() => navigate("/")} 
            className="text-[10px] font-black uppercase tracking-widest text-slate-300 border border-slate-700 px-4 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-700 transition-all"
        >
          FECHAR
        </button>
      </div>

      {/* DIAGNÓSTICO DE BANCA */}
      <div className={`p-6 rounded-3xl border-2 shadow-2xl ${diag.bg} ${diag.border}`}>
        <div className="flex justify-between items-start mb-8 border-b border-slate-800/50 pb-5">
          <div>
            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">P&L Líquido</span>
            <span className={`text-4xl font-black font-mono tracking-tighter ${isGreen ? 'text-emerald-400' : 'text-red-400'}`}>
              {isGreen ? '+' : ''}R$ {pnl.toFixed(2)}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Exposure Time</span>
            <span className="text-2xl font-black font-mono text-white">
              {Math.floor((new Date(auditData.closed_at || Date.now()).getTime() - new Date(auditData.created_at).getTime()) / 60000)} MIN
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${diag.color}`}>
            {isGreen ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {diag.title}
          </h3>
          <p className="text-xs text-slate-400 font-bold leading-relaxed bg-[#0B101E]/80 p-5 rounded-2xl border border-slate-800">
            {diag.text}
          </p>
        </div>
      </div>

      {/* EQUITY CURVE CHART */}
      <div className="bg-[#111827] border border-slate-800 p-6 rounded-3xl shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-blue-500" /> Curva de Patrimônio
          </span>
          <span className="text-[9px] px-2 py-1 rounded-lg bg-blue-900/20 text-blue-400 font-black uppercase border border-blue-500/20">
            Filtro de Execução Ativo
          </span>
        </div>
        
        {executedCount === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl bg-[#0B101E]/30">
             <MinusCircle className="w-8 h-8 text-slate-700 mb-2" />
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Nenhum sinal confirmado na mesa</span>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                <XAxis dataKey="name" hide />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={auditData.initial_bankroll} stroke="#334155" strokeDasharray="5 5" />
                <Line 
                  type="stepAfter" 
                  dataKey="balance" 
                  stroke={isGreen ? "#10b981" : "#ef4444"} 
                  strokeWidth={4} 
                  dot={false} 
                  activeDot={{ r: 8, fill: "#fff", stroke: isGreen ? "#10b981" : "#ef4444", strokeWidth: 4 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* OPERATIONAL RAIO-X */}
      <div className="bg-[#111827] border border-slate-800 p-6 rounded-3xl shadow-xl grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <div>
            <span className="text-[9px] uppercase text-slate-500 font-black block mb-1">Win Rate Efetivo</span>
            <span className="text-3xl font-mono font-black text-white">{winRate}%</span>
          </div>
          <div>
            <span className="text-[9px] uppercase text-emerald-500 font-black block mb-1">Wins Confirmados</span>
            <span className="text-xl font-mono font-black text-emerald-400">{wins}</span>
          </div>
        </div>
        
        <div className="space-y-6">
          <div>
            <span className="text-[9px] uppercase text-slate-500 font-black block mb-1">Sinais Ignorados</span>
            <span className="text-3xl font-mono font-black text-slate-600 italic">{missedCount}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase text-red-500 font-black block mb-1">Loss / Gale Stop</span>
            <span className="text-xl font-mono font-black text-red-400">{losses}</span>
          </div>
        </div>
      </div>

    </motion.div>
  );
};
