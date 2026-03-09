import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface Signal {
  id: string;
  target_bet: string;
  suggested_amount: number;
  result: string;
  created_at: string;
}

interface Props {
  signals: Signal[];
}

export function SignalsAlertPanel({ signals }: Props) {
  const activeSignals = signals.filter(s => s.result === "PENDING");
  
  // Controle de Estado Blindado para evitar repetição de áudio
  const lastSpokenId = useRef<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  useEffect(() => {
    // Se há um sinal ativo, o áudio está ligado, e o motor de voz existe no navegador
    if (activeSignals.length > 0 && isAudioEnabled && "speechSynthesis" in window) {
      const latestSignal = activeSignals[0]; // Pega o sinal mais recente
      
      // Só fala se for um sinal INÉDITO (compara as IDs)
      if (latestSignal.id !== lastSpokenId.current) {
        lastSpokenId.current = latestSignal.id;
        triggerTacticalAudio(latestSignal);
      }
    }
  }, [activeSignals, isAudioEnabled]);

  const triggerTacticalAudio = (signal: Signal) => {
    // Limpa a fila de áudio caso a mesa esteja muito rápida
    window.speechSynthesis.cancel(); 

    // Dicionário Tático de Tradução
    const targetMap: Record<string, string> = {
      "RED": "Vermelho",
      "BLACK": "Preto",
      "FUSION_ZONE": "Zona Fúsion",
      "CUSTOM_SECTOR_1_21": "Setor Vizinhos",
      "JAMES_BOND_SET": "Matriz James Bond"
    };

    const targetName = targetMap[signal.target_bet] || signal.target_bet.replace(/_/g, " ");
    
    // Frase curta, direta e militar
    const phrase = `Atenção. Alvo: ${targetName}. Ficha: ${signal.suggested_amount}.`;

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = "pt-BR";
    utterance.rate = 1.2;  // Velocidade levemente acelerada para não perder o timing
    utterance.pitch = 0.9; // Tom mais grave e sério
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  };

  const toggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled);
    if (isAudioEnabled) window.speechSynthesis.cancel(); // Cala a boca da IA na hora se mutar
  };

  if (activeSignals.length === 0) {
    return (
      <div className="mt-6 mx-4 bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center shadow-inner relative group">
        <button 
          onClick={toggleAudio}
          className="absolute top-2 right-3 text-[10px] uppercase font-bold tracking-widest text-gray-600 hover:text-gray-400 transition-colors"
        >
          {isAudioEnabled ? "🔊 ON" : "🔇 OFF"}
        </button>
        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping mx-auto mb-3" />
        <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em]">Radar Institucional</span>
        <p className="text-gray-600 text-xs mt-2 font-medium">Aguardando viés estatístico da mesa...</p>
      </div>
    );
  }

  return (
    <div className="mt-6 mx-4 space-y-3">
      <div className="flex justify-between items-center px-1">
        <span className="block text-[10px] uppercase font-black text-red-500 tracking-[0.2em] animate-pulse flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          Oportunidade Detectada
        </span>
        <button 
          onClick={toggleAudio}
          className={`text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded border ${isAudioEnabled ? 'bg-indigo-900/50 text-indigo-400 border-indigo-500/50' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
        >
          {isAudioEnabled ? "🔊 Áudio ON" : "🔇 Mute"}
        </button>
      </div>
      
      <AnimatePresence>
        {activeSignals.map((signal) => (
          <motion.div
            key={signal.id}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-950/80 border border-red-500 rounded-2xl p-5 relative overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.2)]"
          >
            <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />
            
            <div className="flex justify-between items-center relative z-10">
              <div>
                <p className="text-[10px] uppercase font-black text-red-400 tracking-widest mb-1">
                  Alvo de Entrada
                </p>
                <p className="text-2xl font-black text-white uppercase tracking-tighter drop-shadow-md">
                  {signal.target_bet.replace(/_/g, " ")}
                </p>
              </div>
              
              <div className="text-right bg-black/40 px-4 py-2 rounded-xl border border-red-500/30">
                <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-1">
                  Ficha (R$)
                </p>
                <p className="text-xl font-bold text-green-400 drop-shadow-md">
                  {signal.suggested_amount.toFixed(2)}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
  }
    
