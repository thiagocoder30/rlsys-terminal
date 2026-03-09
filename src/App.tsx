import { useState, useEffect, useCallback } from "react";
import { HeaderStatus } from "./components/HeaderStatus";
import { SignalsAlertPanel } from "./components/SignalsAlertPanel";
import { ZScoreSparkline } from "./components/ZScoreSparkline";
import { SpinTimeline } from "./components/SpinTimeline";
import { ManualEntryInput } from "./components/ManualEntryInput";
import { OcrButton } from "./components/OcrButton";
import { motion } from "motion/react";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function App() {
  const [setupMode, setSetupMode] = useState(true);
  const [startBankroll, setStartBankroll] = useState("1000.00");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zHistory, setZHistory] = useState<number[]>([]);

  const initSession = async (retries = 3) => {
    setError(null); setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) throw new Error("Valor inválido.");
      const res = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no servidor");
      setSessionId(json.id); setSetupMode(false);
    } catch (err: any) {
      if (retries > 0) setTimeout(() => initSession(retries - 1), 2000);
      else setError(err.message || "Erro de conexão.");
    } finally { setLoading(false); }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      if (!res.ok) throw new Error("Falha na sincronização");
      const json = await res.json();
      setData(json);
      setZHistory((prev) => [...prev.slice(-49), json.zScore]);
    } catch (err: any) { console.error("Erro dashboard:", err.message); }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) { fetchData(); const int = setInterval(fetchData, 5000); return () => clearInterval(int); }
  }, [sessionId, fetchData]);

  const handleNumberClick = async (number: number) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await fetch(`http://localhost:3000/api/sessions/${sessionId}/spins`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }),
      });
      fetchData();
    } catch (err: any) { alert("Erro ao inserir."); } finally { setLoading(false); }
  };

  const handleOcrUpload = async (file: File) => {
    if (!sessionId) return;
    setLoading(true);
    const startTime = Date.now();

    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image(); img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let w = img.width, h = img.height; const maxDim = 1200;
            if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } } 
            else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h); }
            resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
          }; img.onerror = reject;
        }; reader.onerror = reject;
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave não configurada.");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", generationConfig: { temperature: 0.0, maxOutputTokens: 1000 } });

      // --- TÁTICA DE RESILIÊNCIA EXTREMA (EXPONENTIAL BACKOFF) ---
      const maxRetries = 15; // Tenta até 15 vezes (pode levar 1 a 2 minutos em silêncio)
      let attempt = 0; 
      let extractedText = "";

      while (attempt <= maxRetries) {
        try {
          const result = await model.generateContent([
            "Execute High-Precision OCR Protocol. Study the PROVIDE IMAGE. 1) LOCATE the highlighted top horizontal bar (starting with number 34) and IGNORE it completely. 2) LOCATE the massive rectangular grid of historical numbers in red/black squares below it. 3) Your EXPLICIT TASK is to extract EVERY SINGLE NUMBER from this large grid (approx. 90-100 spins). 4) Scan Line-by-Line, Left-to-Right, Top-to-Bottom. You MUST continue until the very last number at the bottom right cell. DO NOT STOP EARLY. If you do not deliver all ~100 numbers, you fail. OUTPUT STRICTLY comma-separated digits (e.g., 34,10,28,9,30,2,36,5,5,7,20,32,30,15...). No text.",
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
          ]);
          extractedText = result.response.text();
          if (extractedText) break;
        } catch (apiErr: any) {
          attempt++;
          const errString = String(apiErr.message || JSON.stringify(apiErr)).toLowerCase();
          
          // Se for 503 (Servidor Lotado) ou 429 (Cota de Minuto)
          if (errString.includes("503") || errString.includes("high demand") || errString.includes("429")) {
            if (attempt > maxRetries) throw apiErr; // Desiste só depois de 15 tentativas
            
            // Recuo Exponencial: 3s, 6s, 9s...
            const waitTime = attempt * 3000;
            console.warn(`[OCR] Servidor Google ocupado. Tentativa ${attempt}/${maxRetries}. Aguardando ${waitTime/1000}s...`);
            await new Promise(r => setTimeout(r, waitTime));
          } else {
            // Se for um erro real (ex: API Key inválida), lança na hora
            throw apiErr;
          }
        }
      }

      const rawNumbers = (extractedText.match(/\b([0-9]|[12][0-9]|3[0-6])\b/g) || []).map(n => parseInt(n));
      const numbers = rawNumbers.reverse(); 

      if (numbers.length === 0) throw new Error("Nenhum número detectado.");

      const res = await fetch(`http://localhost:3000/api/sessions/${sessionId}/ocr/sync`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbers }),
      });
      const resultData = await res.json();
      if (!res.ok) throw new Error(resultData.error);
      
      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

      if (resultData.count > 0) alert(`⚡ Extração Total da Matriz: ${numbers.length} números detectados.\nSucesso: ${resultData.count} novos giros injetados em ${timeTaken}s!\nSemente de calibração ativa.`);
      else alert(`Extração: ${numbers.length} números lidos na matriz.\nNenhum giro novo detectado.`);
      
      fetchData();
    } catch (err: any) { alert("Erro OCR: " + err.message); } finally { setLoading(false); }
  };

  if (setupMode && !error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Terminal Institucional</p>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
          <label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Banca Atual (R$)</label>
          <input type="number" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-black border border-gray-700 rounded-xl p-4 text-white text-2xl font-black focus:outline-none focus:border-indigo-500 transition-colors mb-6 text-center" />
          <button onClick={() => initSession()} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg disabled:opacity-50">
            {loading ? "Conectando..." : "Iniciar Sessão"}
          </button>
        </div>
      </div>
    );
  }

  if (error) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center"><div className="bg-red-500/10 border border-red-500 p-6 rounded-2xl max-w-sm"><h2 className="text-red-500 font-black mb-2">Erro</h2><p className="text-gray-400 text-sm mb-4">{error}</p><button onClick={() => initSession()} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl">TENTAR NOVAMENTE</button></div></div>);
  if (!data) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center"><div className="text-indigo-500 animate-pulse font-black text-2xl mb-2">RL.SYS</div><div className="text-gray-600 text-[10px] uppercase">Sincronizando...</div></div>);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden">
      <div className="flex-shrink-0">
        <HeaderStatus bankroll={data.session.current_bankroll} initialBankroll={data.session.initial_bankroll} zScore={data.zScore} isConnected={true} />
        <div className="mt-4"><span className="px-4 text-[10px] uppercase font-bold text-gray-500">Volatilidade Z-Score</span><ZScoreSparkline data={zHistory} /></div>
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
      {data.session.signals.some((s: any) => s.result === "PENDING") && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 pointer-events-none border-[8px] border-red-500/30 animate-pulse z-50" />)}
    </div>
  );
                    }
                                                          
