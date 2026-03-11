import { useState, useEffect, useCallback, useRef } from "react";
import { HeaderStatus } from "./components/HeaderStatus";
import { SignalsAlertPanel } from "./components/SignalsAlertPanel";
import { ZScoreSparkline } from "./components/ZScoreSparkline";
import { SpinTimeline } from "./components/SpinTimeline";
import { ManualEntryInput } from "./components/ManualEntryInput";
import { OcrButton } from "./components/OcrButton";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function App() {
  const [currentView, setCurrentView] = useState<"MACRO" | "SETUP" | "ACTIVE">("MACRO");
  const [macroData, setMacroData] = useState<any>(null);
  const [loadingMacro, setLoadingMacro] = useState(true);

  const [startBankroll, setStartBankroll] = useState("1000.00");
  const [minChip, setMinChip] = useState<number>(0.50); 
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zHistory, setZHistory] = useState<number[]>([]);

  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const spokenSignalsRef = useRef<Set<string>>(new Set());

  const fetchMacro = useCallback(async () => {
    setLoadingMacro(true);
    try { const res = await fetch("/api/macro"); const json = await res.json(); setMacroData(json); } 
    catch (err) { console.error("Erro macro:", err); } finally { setLoadingMacro(false); }
  }, []);

  useEffect(() => { if (currentView === "MACRO") fetchMacro(); }, [currentView, fetchMacro]);

  const initSession = async (retries = 3) => {
    setError(null); setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) throw new Error("Valor inválido.");
      const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll, min_chip: minChip }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no servidor");
      spokenSignalsRef.current.clear(); setSessionId(json.id); setCurrentView("ACTIVE"); 
    } catch (err: any) {
      if (retries > 0) setTimeout(() => initSession(retries - 1), 2000); else setError(err.message || "Erro de conexão.");
    } finally { setLoading(false); }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      if (!res.ok) throw new Error("Falha na sincronização");
      const json = await res.json(); setData(json); setZHistory((prev) => [...prev.slice(-49), json.zScore]);
    } catch (err: any) { console.error("Erro dashboard:", err.message); }
  }, [sessionId]);

  useEffect(() => { if (sessionId) { fetchData(); const int = setInterval(fetchData, 5000); return () => clearInterval(int); } }, [sessionId, fetchData]);

  useEffect(() => {
    if (!data?.session?.signals || !isVoiceEnabled) return;
    const pendingSignals = data.session.signals.filter((s: any) => s.result === "PENDING");
    pendingSignals.forEach((signal: any) => {
      if (!spokenSignalsRef.current.has(signal.id)) {
        spokenSignalsRef.current.add(signal.id);
        const formatCurrencyText = (value: number) => {
          const reais = Math.floor(value); const centavos = Math.round((value - reais) * 100); let text = "";
          if (reais > 0) text += `${reais} reai${reais !== 1 ? 's' : ''}`; if (reais > 0 && centavos > 0) text += " e ";
          if (centavos > 0) text += `${centavos} centavo${centavos !== 1 ? 's' : ''}`; return text || "zero reais";
        };
        const stratName = signal.strategy?.name || "Estratégia detectada";
        const utterance = new SpeechSynthesisUtterance(`Alvo. ${stratName}. Sugestão: ${formatCurrencyText(signal.suggested_amount)}.`);
        utterance.lang = "pt-BR"; utterance.rate = 1.15; window.speechSynthesis.speak(utterance);
      }
    });
  }, [data?.session?.signals, isVoiceEnabled]);

  const handleCloseSession = async () => {
    if (!sessionId || !window.confirm("ATENÇÃO: Deseja liquidar a sessão e fechar o caixa agora?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/close`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao fechar caixa.");
      setIsVoiceEnabled(false); fetchData(); 
    } catch (err: any) { alert("Falha: " + err.message); } finally { setLoading(false); }
  };

  const handleNumberClick = async (number: number) => {
    if (!sessionId || data?.session?.status === "CLOSED") return;
    setLoading(true);
    try { await fetch(`http://localhost:3000/api/sessions/${sessionId}/spins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }) }); fetchData(); } 
    catch (err: any) { alert("Erro ao inserir."); } finally { setLoading(false); }
  };

  const handleOcrUpload = async (file: File) => {
    if (!sessionId || data?.session?.status === "CLOSED") return;
    setLoading(true);
    let rawTextStr = "", extractedNumbersArray: number[] = [];
    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image(); img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas"); let w = img.width, h = img.height; const maxDim = 1200;
            if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } } else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
            canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d");
            if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h); }
            resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
          }; img.onerror = reject;
        }; reader.onerror = reject;
      });
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY; if (!apiKey) throw new Error("Chave não configurada.");
      const genAI = new GoogleGenerativeAI(apiKey); const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", generationConfig: { temperature: 0.0, maxOutputTokens: 8192, responseMimeType: "application/json" } });
      let attempt = 0; 
      while (attempt <= 15) {
        try {
          const result = await model.generateContent([`You are an OCR. Extract ALL numbers from the provided roulette table image. You MUST return a JSON object containing exactly these arrays. DO NOT MISS ANY ROW. Structure: {"top_row": [],"grid_row_1": [],"grid_row_2": [],"grid_row_3": [],"grid_row_4": [],"grid_row_5": [],"grid_row_6": [],"grid_row_7": [],"grid_row_8": [],"grid_row_9_bottom": []}`, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }]);
          rawTextStr = result.response.text(); if (rawTextStr) break;
        } catch (apiErr: any) {
          attempt++; if (attempt > 15) throw apiErr; await new Promise(r => setTimeout(r, attempt * 3000));
        }
      }
      try {
        const jsonObj = JSON.parse(rawTextStr); extractedNumbersArray = [...(jsonObj.top_row || []), ...(jsonObj.grid_row_1 || []), ...(jsonObj.grid_row_2 || []), ...(jsonObj.grid_row_3 || []), ...(jsonObj.grid_row_4 || []), ...(jsonObj.grid_row_5 || []), ...(jsonObj.grid_row_6 || []), ...(jsonObj.grid_row_7 || []), ...(jsonObj.grid_row_8 || []), ...(jsonObj.grid_row_9_bottom || [])];
      } catch (parseError) { extractedNumbersArray = (rawTextStr.match(/\b([0-9]|[12][0-9]|3[0-6])\b/g) || []).map(n => parseInt(n)); }
      const numbers = [...extractedNumbersArray].reverse();
      if (numbers.length === 0) throw new Error("Nenhum número detectado.");
      const res = await fetch(`http://localhost:3000/api/sessions/${sessionId}/ocr/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbers }) });
      if (!res.ok) throw new Error("Falha OCR backend."); fetchData();
    } catch (err: any) { alert("Erro OCR: " + err.message); } finally { setLoading(false); }
  };

  if (currentView === "MACRO") {
    if (loadingMacro) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center"><div className="text-indigo-500 animate-pulse font-black text-2xl mb-2">RL.SYS</div><div className="text-gray-600 text-[10px] uppercase">Carregando Histórico...</div></div>);
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center p-6 select-none overflow-y-auto">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mt-8 mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Painel do Diretor</p>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl mb-6">
          <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-4">Evolução Patrimonial</span>
          <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-4">
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase">P&L Líquido Global</span>
              <span className={`text-3xl font-black ${macroData.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{macroData.totalProfit >= 0 ? '+' : ''}R$ {macroData.totalProfit.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="block text-xs font-bold text-gray-400 uppercase">Operações</span>
              <span className="text-xl font-bold text-white">{macroData.totalSessions}</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 uppercase">WinRate Global</span>
            <span className="text-sm font-black text-indigo-400">{macroData.winRate}%</span>
          </div>
        </div>
        <button onClick={() => setCurrentView("SETUP")} className="w-full max-w-sm bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg mb-8 transition-all">Nova Operação Tática</button>
      </div>
    );
  }

  if (currentView === "SETUP") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Terminal Institucional</p>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
          <div className="mb-6 flex justify-between items-center">
            <span className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Setup da Mesa</span>
            <button onClick={() => setCurrentView("MACRO")} className="text-indigo-500 hover:text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-colors">Voltar</button>
          </div>
          <div className="mb-6">
            <label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Provedor / Ficha Mínima</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMinChip(0.50)} className={`py-3 rounded-xl border ${minChip === 0.50 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500 transition-colors'}`}>EVOLUTION (R$ 0,50)</button>
              <button onClick={() => setMinChip(0.10)} className={`py-3 rounded-xl border ${minChip === 0.10 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500 transition-colors'}`}>PRAGMATIC (R$ 0,10)</button>
            </div>
          </div>
          <label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Banca Atual (R$)</label>
          <input type="number" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-black border border-gray-700 rounded-xl p-4 text-white text-2xl font-black focus:outline-none focus:border-indigo-500 transition-colors mb-6 text-center" />
          <button onClick={() => initSession()} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg disabled:opacity-50 transition-all">{loading ? "Conectando..." : "Iniciar Sessão"}</button>
        </div>
      </div>
    );
  }

  if (error) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center"><div className="bg-red-500/10 border border-red-500 p-6 rounded-2xl max-w-sm"><h2 className="text-red-500 font-black mb-2">Erro</h2><p className="text-gray-400 text-sm mb-4">{error}</p><button onClick={() => setCurrentView("SETUP")} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl">VOLTAR</button></div></div>);
  if (!data) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center"><div className="text-indigo-500 animate-pulse font-black text-2xl mb-2">RL.SYS</div><div className="text-gray-600 text-[10px] uppercase">Sincronizando...</div></div>);

  const isClosed = data.session.status === "CLOSED";
  const profit = data.session.current_bankroll - data.session.initial_bankroll;
  if (isClosed) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-2 ${profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
          <h2 className="text-white text-xl font-black uppercase tracking-widest mb-1">Caixa Fechado</h2>
          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center pt-2"><span className="text-gray-400 text-xs font-bold uppercase">Resultado Líquido</span><span className={`block text-2xl font-black ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{profit >= 0 ? '+' : ''}R$ {profit.toFixed(2)}</span></div>
          </div>
          <button onClick={() => window.location.reload()} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-colors">Voltar para o Painel Macro</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden relative">
      <div className="bg-gray-950 border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" /><span className="text-white font-black tracking-widest uppercase text-xs">RL.sys</span></div>
        <div className="flex gap-2">
          <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`border text-[9px] uppercase font-black px-3 py-2 rounded-lg tracking-widest transition-colors flex items-center gap-1 ${isVoiceEnabled ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-400' : 'bg-gray-900 border-gray-700 text-gray-500'}`}>{isVoiceEnabled ? "🔊 Voz ON" : "🔇 Voz OFF"}</button>
          <button onClick={handleCloseSession} disabled={loading} className="bg-red-950/40 hover:bg-red-900/80 border border-red-900/50 text-red-500 text-[9px] uppercase font-black px-3 py-2 rounded-lg tracking-widest transition-colors flex items-center gap-1">⏹ Fechar</button>
        </div>
      </div>

      <div className="flex-shrink-0 pt-2">
        <HeaderStatus bankroll={data.session.current_bankroll} initialBankroll={data.session.initial_bankroll} zScore={data.zScore} isConnected={true} />
        <div className="mt-4"><span className="px-4 text-[10px] uppercase font-bold text-gray-500">Volatilidade Z-Score</span><ZScoreSparkline data={zHistory} /></div>
        
        {data.strategiesStatus && data.strategiesStatus.length > 0 && (
          <div className="mt-6 mx-4 bg-gray-900/50 border border-gray-800 rounded-xl p-4 shadow-inner">
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3">Ranking Quantitativo</span>
            <div className="grid grid-cols-2 gap-2">
              {data.strategiesStatus.map((strat: any) => (
                <div key={strat.id} className="flex flex-col bg-black/40 p-2.5 rounded-lg border border-gray-800/50">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-gray-300 tracking-wide truncate max-w-[80px]">{strat.name}</span>
                    <span className={`text-[9px] font-mono ${parseFloat(strat.zScore) <= -0.85 ? 'text-red-400' : 'text-gray-500'}`}>Z: {strat.zScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <SignalsAlertPanel signals={data.session.signals} />
        <SpinTimeline spins={data.session.spins} />
      </div>
      
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="flex-grow bg-gray-950 rounded-t-[32px] border-t border-gray-800 p-4 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-6" />
        <div className="space-y-6">
          <section><span className="block text-[10px] uppercase font-black text-gray-500 mb-3 px-2">Entrada Manual</span><ManualEntryInput onNumberSubmit={handleNumberClick} isLoading={loading} /></section>
          <section><span className="block text-[10px] uppercase font-black text-gray-500 mb-3 px-2">Leitura Óptica (OCR)</span><OcrButton onUpload={handleOcrUpload} isLoading={loading} /></section>
        </div>
      </motion.div>
    </div>
  );
}
