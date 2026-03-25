import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Activity, ArrowLeft, AlertTriangle, FileText, CheckCircle2, TrendingUp, TrendingDown, MinusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const getPayoutRatio = (stratName: string, targetBet?: string) => {
  if (!stratName) return 1.0;
  if (stratName.includes("Vizinhos")) return 10 / 26; 
  if (stratName.includes("James Bond")) return 8 / 20;
  if (stratName.includes("Cross")) return 9 / 21; 
  if (stratName.includes("Dúzia") || stratName.includes("Coluna")) return 2.0;
  if (stratName.includes("Drop Zone")) return 31 / 5;
  if (stratName.includes("Alpha")) return 11 / 25;
  if (stratName.includes("Omega")) return 15 / 21;
  if (stratName.includes("Hedge")) return 9 / 27;
  if (stratName.includes("Macro") || stratName.includes("Zero")) return 17 / 19;
  if (stratName.includes("Quantum Intersection") && targetBet) {
      const numbers = targetBet.replace("INTERSECTION_", "").split("-");
      return 36 / numbers.length;
  }
  if (stratName.includes("Sniper Anomaly") && targetBet) {
      return targetBet.includes("ZERO") ? 17/19 : 2.0;
  }
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
  if (pnl >= 0) return { title: "OPERAÇÃO BEM SUCEDIDA", text: "Sessão concluída com capital preservado. O motor garantiu a execução no lucro ou break-even.", color: "text-emerald-400", bg: "bg-emerald-950/30", border: "border-emerald-900/50" };
  const entropy = calculateEntropy(auditData.spins || []);
  const durationMs = new Date(auditData.closed_at || Date.now()).getTime() - new Date(auditData.created_at).getTime();
  const mins = durationMs / 60000;
  if (entropy > 4.5) return { title: "CAUSA PRIMÁRIA: CAOS ALGORÍTMICO (VIX)", text: "A entropia da mesa atingiu dispersão máxima. O RNG quebrou padrões lógicos. O Stop Loss atuou para evitar a ruína.", color: "text-red-400", bg: "bg-red-950/30", border: "border-red-900/50" };
  if (mins >= 45) return { title: "CAUSA PRIMÁRIA: FADIGA DE MESA", text: "A exposição prolongada no mercado corroeu a margem matemática. O Time-Stop forçou a liquidação.", color: "text-orange-400", bg: "bg-orange-950/30", border: "border-orange-900/50" };
  return { title: "CAUSA PRIMÁRIA: VARIÂNCIA AGUDA", text: "O sistema encontrou anomalias fora do desvio padrão e acionou o Stop Loss no Gale.", color: "text-yellow-400", bg: "bg-yellow-950/30", border: "border-yellow-900/50" };
};

export const AuditReport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [auditData, setAuditData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadSessionAudit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${id}/audit`);
      setAuditData(await res.json());
    } catch (err) {
      console.error("Erro ao carregar auditoria:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSessionAudit();
  }, [loadSessionAudit]);

  if (loading || !auditData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Activity className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Compilando Auditoria Gráfica...</span>
      </div>
    );
  }

  const pnl = auditData.current_bankroll - auditData.initial_bankroll;
  const diag = generateDiagnostic(auditData, pnl);
  const isGreen = pnl >= 0;

  // ==========================================
  // PROCESSAMENTO DE DADOS (FILTRO DE EXECUÇÃO)
  // ==========================================
  const allSignals = auditData.signals || [];
  const executedSignals = allSignals.filter((s:any) => s.result === 'WIN' || s.result === 'LOSS').sort((a:any, b:any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  const totalSignals = allSignals.length;
  const executedCount = executedSignals.length;
  const missedCount = totalSignals - executedCount;
  
  const wins = executedSignals.filter((s:any) => s.result === 'WIN').length;
  const losses = executedSignals.filter((s:any) => s.result === 'LOSS').length;
  const winRate = executedCount > 0 ? ((wins / executedCount) * 100).toFixed(1) : "0.0";

  // Construção da Curva de Capital (Equity Curve)
  let currentBal = auditData.initial_bankroll;
  const chartData = [{ name: 'Início', balance: currentBal }];

  executedSignals.forEach((sig: any, index: number) => {
      const payout = getPayoutRatio(sig.strategy?.name, sig.target_bet);
      const profitNet = sig.result === 'WIN' ? (sig.suggested_amount * payout) : -sig.suggested_amount;
      currentBal += profitNet;
      chartData.push({ name: `Op ${index + 1}`, balance: parseFloat(currentBal.toFixed(2)) });
  });

  // Identificando o Drawdown (Maior queda)
  const minBalance = Math.min(...chartData.map(d => d.balance));
  const maxBalance = Math.max(...chartData.map(d => d.balance));

  // Custom Tooltip para o Gráfico
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111827] border border-slate-700 p-3 rounded-xl shadow-2xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</p>
          <p className="text-lg font-mono font-black text-white">R$ {payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6 pb-6">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mt-2 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
            <FileText className="text-blue-500" /> Relatório Tático
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Auditoria Filtrada</p>
        </div>
        <button onClick={() => navigate("/")} className="text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" /> VOLTAR
        </button>
      </div>

      {/* PAINEL DE PERFORMANCE FINANCEIRA */}
      <div className={`p-6 rounded-2xl border shadow-xl ${diag.bg} ${diag.border}`}>
        <div className="flex justify-between items-start mb-6 border-b border-slate-800/50 pb-4">
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">P&L Final</span>
            <span className={`text-3xl font-black font-mono tracking-tight ${isGreen ? 'text-emerald-400' : 'text-red-400'}`}>
              {isGreen ? '+' : ''}R$ {pnl.toFixed(2)}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duração</span>
            <span className="text-xl font-black font-mono text-white">
              {Math.floor((new Date(auditData.closed_at || Date.now()).getTime() - new Date(auditData.created_at).getTime()) / 60000)} min
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 ${diag.color}`}>
            {isGreen ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {diag.title}
          </h3>
          <p className="text-sm text-slate-300 font-medium leading-relaxed bg-[#0B101E]/50 p-4 rounded-xl border border-slate-800">
            {diag.text}
          </p>
        </div>
      </div>

      {/* CURVA DE CAPITAL (EQUITY CURVE) */}
      <div className="bg-[#111827] border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Evolução do Patrimônio (Equity Curve)</span>
          <span className="text-[9px] px-2 py-0.5 rounded bg-blue-900/30 text-blue-400 font-bold uppercase border border-blue-800/50">Baseado em Operações Reais</span>
        </div>
        
        {executedCount === 0 ? (
          <div className="h-48 flex items-center justify-center border border-dashed border-slate-700 rounded-xl">
             <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nenhuma operação confirmada</span>
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} hide />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(value) => `R$${value}`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={auditData.initial_bankroll} stroke="#64748b" strokeDasharray="3 3" />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
                  stroke={isGreen ? "#10b981" : "#ef4444"} 
                  strokeWidth={3} 
                  dot={false} 
                  activeDot={{ r: 6, fill: isGreen ? "#10b981" : "#ef4444", stroke: "#0B101E", strokeWidth: 2 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* MÉTRICAS DE EXECUÇÃO (O FILTRO REAL) */}
      <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl shadow-xl">
        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Raio-X Operacional (Filtro de Execução)</span>
        
        <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-6 pb-6 border-b border-slate-800/80">
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Total de Sinais do Sistema</span>
            <span className="text-xl font-mono font-black text-slate-300">{totalSignals}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Descarte (Delay / Ignorados)</span>
            <span className="text-xl font-mono font-black text-slate-500 flex items-center gap-1"><MinusCircle className="w-4 h-4" /> {missedCount}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-6 gap-x-4">
          <div>
            <span className="text-[10px] uppercase text-blue-500 font-bold block mb-1">Operações Confirmadas</span>
            <span className="text-2xl font-mono font-black text-white">{executedCount}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-emerald-500 font-bold block mb-1">Taxa de Acerto Real (Win Rate)</span>
            <span className="text-2xl font-mono font-black text-emerald-400">{winRate}%</span>
          </div>
          
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Vitórias (Wins)</span>
            <span className="text-lg font-mono font-black text-emerald-500 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> {wins}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Derrotas (Losses / Gales)</span>
            <span className="text-lg font-mono font-black text-red-500 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> {losses}</span>
          </div>
        </div>
      </div>

    </motion.div>
  );
};
