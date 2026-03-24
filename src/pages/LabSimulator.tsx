import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Activity, UploadCloud } from 'lucide-react';
import { motion } from 'framer-motion';

export const LabSimulator: React.FC = () => {
  const navigate = useNavigate();
  const [startBankroll, setStartBankroll] = useState("100.00");
  const [minChip, setMinChip] = useState<number>(0.50);
  const [loading, setLoading] = useState(false);
  const [simReport, setSimReport] = useState<any>(null);
  const [cachedWarmNumbers, setCachedWarmNumbers] = useState<number[]>([]);
  
  // Referência para o input de arquivo oculto
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Motor de OCR encapsulado no Lab
  const processOCR = async (file: File): Promise<number[]> => {
    const base64Image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); 
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image(); 
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas"); 
          let w = img.width, h = img.height; 
          const maxDim = 1200;
          if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } } 
          else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
          canvas.width = w; canvas.height = h; 
          const ctx = canvas.getContext("2d");
          if (ctx) { 
            ctx.imageSmoothingEnabled = true; 
            ctx.imageSmoothingQuality = 'high'; 
            ctx.drawImage(img, 0, 0, w, h); 
          }
          resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
        }; 
        img.onerror = reject;
      }; 
      reader.onerror = reject;
    });
    
    const response = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64Image })
    });
    
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Erro no OCR.");
    return json.numbers;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const numbers = await processOCR(file);
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      const res = await fetch("/api/simulate", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ numbers, initial_bankroll, min_chip: minChip }) 
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro na simulação do servidor.");
      
      setSimReport(json); 
      setCachedWarmNumbers(numbers); 
    } catch (err: any) { 
      alert("Erro Simulador: " + err.message); 
    } finally { 
      setLoading(false); 
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reseta o input para permitir enviar a mesma foto de novo
    }
  };

  const handleWarmStartDeploy = async () => {
    if (cachedWarmNumbers.length === 0) return alert("Nenhum cache OCR para Warm-Start.");
    setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      const res = await fetch("/api/sessions/warm-start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll, min_chip: minChip, numbers: cachedWarmNumbers }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no deploy warm-start");
      localStorage.setItem("rlsys_active_session", json.id); 
      navigate(`/session/${json.id}`);
    } catch (err: any) { 
      alert(err.message || "Erro no Deploy."); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col space-y-6">
      <div className="flex justify-between items-center mt-2 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2"><FlaskConical className="text-blue-500" /> Laboratório</h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Simulador Monte Carlo</p>
        </div>
        <button onClick={() => { if(simReport) { setSimReport(null); } else { navigate("/"); } }} className="text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors">VOLTAR</button>
      </div>

      {!simReport ? (
        <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Banca de Teste (R$)</label>
            <input type="number" step="0.01" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-[#0B101E] text-white font-mono text-xl p-4 rounded-xl border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Ficha Mínima (R$)</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMinChip(0.10)} className={`py-3 rounded-xl font-mono font-bold border transition-colors ${minChip === 0.10 ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#0B101E] border-slate-700 text-slate-400'}`}>0.10</button>
              <button onClick={() => setMinChip(0.50)} className={`py-3 rounded-xl font-mono font-bold border transition-colors ${minChip === 0.50 ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#0B101E] border-slate-700 text-slate-400'}`}>0.50</button>
            </div>
          </div>
          
          <div className="pt-4 border-t border-slate-800">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">Injetar Histórico (500 Giros)</span>
            
            {/* INPUT DE ARQUIVO OCULTO E BOTÃO CUSTOMIZADO */}
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={loading}
              className="w-full py-4 bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border border-blue-500/50 rounded-xl font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 disabled:opacity-50"
            >
              <UploadCloud className="w-5 h-5" />
              {loading ? "PROCESSANDO IA..." : "ENVIAR PRINT DA ROLETA"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`p-6 rounded-2xl border shadow-xl ${simReport.verdict === 'GREEN_LIGHT' ? 'bg-emerald-950/20 border-emerald-900/50' : simReport.verdict === 'WARNING' ? 'bg-yellow-950/20 border-yellow-900/50' : 'bg-red-950/20 border-red-900/50'}`}>
            <h3 className={`text-center text-xl font-black tracking-widest uppercase mb-6 ${simReport.verdict === 'GREEN_LIGHT' ? 'text-emerald-500' : simReport.verdict === 'WARNING' ? 'text-yellow-500' : 'text-red-500'}`}>
              {simReport.verdict === 'GREEN_LIGHT' ? 'MESA APROVADA' : simReport.verdict === 'WARNING' ? 'MESA VOLÁTIL' : 'MESA REPROVADA'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0B101E]/50 p-3 rounded-xl border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">P&L Simulado</span>
                <span className={`text-lg font-mono font-black ${simReport.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{simReport.netProfit >= 0 ? '+' : ''}R$ {simReport.netProfit.toFixed(2)}</span>
              </div>
              <div className="bg-[#0B101E]/50 p-3 rounded-xl border border-slate-800">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Acerto do Esquadrão</span>
                <span className="text-lg font-mono font-bold text-white">{simReport.winRate}%</span>
              </div>
            </div>
          </div>

          {simReport.verdict !== 'RED_LIGHT' && (
            <button onClick={handleWarmStartDeploy} disabled={loading} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Activity className="w-5 h-5 animate-spin" /> : "DEPLOY: ENTRAR NESTA MESA"}
            </button>
          )}
          
          <button onClick={() => setSimReport(null)} disabled={loading} className="w-full py-4 bg-slate-800 text-slate-400 rounded-xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-50">
            TESTAR OUTRA MESA
          </button>
        </div>
      )}
    </motion.div>
  );
};
