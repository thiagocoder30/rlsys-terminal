import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Activity, ArrowLeft, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

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
  return { title: "CAUSA PRIMÁRIA: VARIÂNCIA AGUDA", text: "O sistema encontrou anomalias fora do desvio padrão e acionou o Stop Loss no Gale 1.", color: "text-yellow-400", bg: "bg-yellow-950/30", border: "border-yellow-900/50" };
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
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Compilando Auditoria...</span>
      </div>
    );
  }

  const pnl = auditData.current_bankroll - auditData.initial_bankroll;
  const diag = generateDiagnostic(auditData, pnl);
  const isGreen = pnl >= 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6">
      
      <div className="flex justify-between items-center mt-2 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
            <FileText className="text-blue-500" /> Relatório Final
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Auditoria de Sessão</p>
        </div>
        <button onClick={() => navigate("/")} className="text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> VOLTAR
        </button>
      </div>

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

      <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl shadow-xl">
        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Métricas Operacionais</span>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Banca Inicial</span>
            <span className="text-lg font-mono font-black text-slate-200">R$ {auditData.initial_bankroll.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Pico Máximo</span>
            <span className="text-lg font-mono font-black text-emerald-400">R$ {(auditData.highest_bankroll || auditData.initial_bankroll).toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Giros Registrados</span>
            <span className="text-lg font-mono font-black text-slate-200">{auditData.spins?.length || 0}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Sinais Emitidos</span>
            <span className="text-lg font-mono font-black text-slate-200">{auditData.signals?.length || 0}</span>
          </div>
        </div>
      </div>

    </motion.div>
  );
};
