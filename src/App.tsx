import { useState, useEffect, useCallback } from "react";
import { HeaderStatus } from "./components/HeaderStatus";
import { SignalsAlertPanel } from "./components/SignalsAlertPanel";
import { ZScoreSparkline } from "./components/ZScoreSparkline";
import { SpinTimeline } from "./components/SpinTimeline";
import { ManualEntryInput } from "./components/ManualEntryInput";
import { OcrButton } from "./components/OcrButton";
import { motion } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zHistory, setZHistory] = useState<number[]>([]);

  // Inicializar Sessão com Retry
  const initSession = async (retries = 3) => {
    setError(null);
    try {
      // 1. Verificar Saúde do Banco
      const healthRes = await fetch("/api/health");
      const health = await healthRes.json();
      
      if (health.status === "error") {
        const errorMsg = health.hint ? `${health.message}\n\n${health.hint}` : (health.message || "Banco de dados inacessível.");
        throw new Error(errorMsg);
      }

      // 2. Criar Sessão
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_bankroll: 1000 }),
      });
      
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Erro na resposta do servidor");
      }
      
      setSessionId(json.id);
    } catch (err: any) {
      console.error(`Erro ao iniciar sessão (Tentativas restantes: ${retries}):`, err);
      if (retries > 0 && err.message === "Failed to fetch") {
        setTimeout(() => initSession(retries - 1), 2000);
      } else {
        setError(err.message || "Não foi possível conectar ao servidor.");
      }
    }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || "Falha na sincronização");
      }
      const json = await res.json();
      setData(json);
      setZHistory((prev) => [...prev.slice(-49), json.zScore]);
      setError(null); // Limpa erro se conseguir buscar
    } catch (err: any) {
      console.error("Erro ao buscar dados:", err.message);
      if (err.message === "Failed to fetch") {
        // Não limpamos o sessionId, mas avisamos que a conexão caiu
        console.warn("Conexão com o servidor perdida. Tentando reconectar...");
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId && !error) {
      initSession();
    } else if (sessionId) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [sessionId, fetchData, error]);

  const handleNumberClick = async (number: number) => {
    if (!sessionId) return;
    try {
      await fetch(`/api/sessions/${sessionId}/spins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number }),
      });
      fetchData();
    } catch (err) {
      console.error("Erro ao enviar número", err);
    }
  };

  const handleOcrUpload = async (file: File) => {
    if (!sessionId) return;
    setLoading(true);

    try {
      // 1. Compressão Client-Side (Performance Institucional)
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxWidth = 800;
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
              height = (maxWidth / width) * height;
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
            resolve(compressedBase64);
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });

      // 2. Chamada Resiliente ao Gemini (Retry Logic)
      const maxRetries = 3;
      let attempt = 0;
      let extractedText = "";

      // Usando a chave de ambiente obrigatória para este runtime
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave da API não configurada (GEMINI_API_KEY)");
      
      while (attempt < maxRetries) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          // Usamos gemini-3-flash-preview para máxima eficiência e conformidade
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
              parts: [
                {
                  text: "Extraia todos os números do histórico de giros desta imagem de roleta. Retorne APENAS os números separados por vírgula, seguindo a ordem visual (primeiro a barra superior, depois a grade). Exemplo: 14,24,4... Responda EXCLUSIVAMENTE com a string de números.",
                },
                {
                  inlineData: {
                    data: base64Image,
                    mimeType: "image/jpeg",
                  },
                },
              ],
            },
          });
          
          extractedText = response.text || "";
          break; // Sucesso, sai do loop
        } catch (apiErr: any) {
          attempt++;
          const errMsg = apiErr.message || "";
          const isRateLimit = errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("High Demand") || errMsg.includes("quota");
          
          if (isRateLimit && attempt < maxRetries) {
            console.warn(`[OCR] Gemini sob alta demanda (Tentativa ${attempt}/${maxRetries}). Aguardando 2s...`);
            await new Promise(r => setTimeout(r, 2000));
          } else {
            throw apiErr; // Falha crítica ou exauriu tentativas
          }
        }
      }

      if (!extractedText) throw new Error("A IA não conseguiu ler os números.");

      // 3. Parse e Sincronização
      const numbers = extractedText.split(",")
        .map(n => parseInt(n.trim()))
        .filter(n => !isNaN(n) && n >= 0 && n <= 36)
        .reverse();

      if (numbers.length === 0) throw new Error("Nenhum número detectado na imagem.");

      // Sincronização com o Backend (usando caminho relativo para garantir compatibilidade com o proxy)
      const res = await fetch(`/api/sessions/${sessionId}/ocr/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers }),
      });
      
      const resultData = await res.json();
      if (!res.ok) throw new Error(resultData.error || "Falha na sincronização");
      
      if (resultData.count > 0) {
        console.log(`[RL.sys] Sucesso: ${resultData.count} novos giros sincronizados.`);
        alert(`Sucesso! ${resultData.count} giros lidos e injetados.`);
      } else {
        alert(resultData.message || "Nenhum novo giro detectado na imagem.");
      }
      
      if (typeof fetchData === 'function') fetchData();
      
    } catch (err: any) {
      console.error("Erro no OCR Institucional:", err);
      const errMsg = err.message || "";
      const isHighDemand = errMsg.includes("503") || errMsg.includes("High Demand");
      
      if (isHighDemand) {
        alert("A rede de IA está congestionada no momento. Aguarde alguns segundos e clique novamente.");
      } else {
        alert(errMsg || "Erro ao processar imagem institucional.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    const isUnreachable = error.includes("BANCO INACESSÍVEL") || error.includes("P1001");
    
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 border border-red-500 p-6 rounded-2xl max-w-sm">
          <h2 className="text-red-500 font-black text-xl mb-2 uppercase">Erro de Conexão</h2>
          <p className="text-gray-400 text-sm mb-6 whitespace-pre-wrap text-left bg-black/40 p-4 rounded-lg border border-red-500/20">
            {error}
          </p>
          
          {isUnreachable && (
            <div className="bg-indigo-500/20 border border-indigo-500/50 p-4 rounded-xl mb-6 text-left">
              <p className="text-indigo-300 text-xs font-bold uppercase mb-2">💡 Dica do Especialista:</p>
              <p className="text-indigo-100 text-[11px] leading-relaxed">
                Muitos projetos Supabase funcionam melhor na porta <span className="text-white font-bold">6543</span> em vez da 5432.
                <br /><br />
                Tente atualizar sua URL para:
                <code className="block bg-black/50 p-2 mt-2 rounded text-[10px] break-all">
                  postgresql://postgres:VSpE6P9FtjKUwhHl@db.iseocnrxqbvliirqlmrj.supabase.co:6543/postgres?pgbouncer=true
                </code>
              </p>
            </div>
          )}

          <button 
            onClick={() => initSession()}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 mb-4 shadow-lg shadow-red-900/20"
          >
            TENTAR NOVAMENTE
          </button>
          <p className="text-gray-500 text-[10px] uppercase tracking-widest">
            Ajuste os Secrets no AI Studio e clique acima
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="text-indigo-500 animate-pulse font-black text-2xl tracking-tighter mb-2">RL.SYS INITIALIZING...</div>
        <div className="text-gray-600 text-[10px] uppercase tracking-[0.3em]">Verificando Protocolos de Dados</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden">
      {/* Metade Superior: Analytics (Autônomo) */}
      <div className="flex-shrink-0">
        <HeaderStatus 
          bankroll={data.session.current_bankroll} 
          zScore={data.zScore} 
          isConnected={true} 
        />
        
        <div className="mt-4">
          <span className="px-4 text-[10px] uppercase font-bold text-gray-500 tracking-widest">Volatilidade Z-Score</span>
          <ZScoreSparkline data={zHistory} />
        </div>

        <SignalsAlertPanel signals={data.session.signals} />
        
        <SpinTimeline spins={data.session.spins} />
      </div>

      {/* Metade Inferior: Ação (Comandos) */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="flex-grow bg-gray-950 rounded-t-[32px] border-t border-gray-800 p-4 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
      >
        <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-6" />
        
        <div className="space-y-6">
          <section>
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3 px-2">Entrada Manual</span>
            <ManualEntryInput onNumberSubmit={handleNumberClick} isLoading={loading} />
          </section>

          <section>
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3 px-2">Leitura Óptica (OCR)</span>
            <OcrButton onUpload={handleOcrUpload} isLoading={loading} />
          </section>
        </div>
      </motion.div>

      {/* Overlay de Alerta Crítico */}
      {data.session.signals.some((s: any) => s.result === "PENDING") && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 pointer-events-none border-[8px] border-red-500/30 animate-pulse z-50"
        />
      )}
    </div>
  );
}
