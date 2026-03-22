// src/components/HawkEye.tsx
import { useState, useEffect, useRef } from "react";

export const HawkEye = ({ onCapture, isProcessing }: { onCapture: (base64: string) => void, isProcessing: boolean }) => {
  const [isWatching, setIsWatching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPixelData = useRef<Uint8ClampedArray | null>(null);

  const startRadar = async () => {
    try {
      setErrorMsg("");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsWatching(true);
      }
    } catch (err: any) {
      setIsWatching(false);
      setErrorMsg("Navegador bloqueou a captura (Restrição do Android).");
    }
  };

  const stopRadar = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsWatching(false);
    lastPixelData.current = null;
  };

  useEffect(() => {
    if (!isWatching) return;
    
    const interval = setInterval(() => {
      if (isProcessing || !videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      
      if (!ctx || video.videoWidth === 0) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Captura uma amostra em baixa resolução para comparar os pixels (Sensor de Movimento)
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 100; sampleCanvas.height = 100;
      const sampleCtx = sampleCanvas.getContext("2d");
      if (!sampleCtx) return;
      sampleCtx.drawImage(canvas, 0, 0, 100, 100);
      
      const currentPixels = sampleCtx.getImageData(0, 0, 100, 100).data;
      
      if (lastPixelData.current) {
        let diff = 0;
        for (let i = 0; i < currentPixels.length; i += 4) {
          diff += Math.abs(currentPixels[i] - lastPixelData.current[i]) +
                  Math.abs(currentPixels[i+1] - lastPixelData.current[i+1]) +
                  Math.abs(currentPixels[i+2] - lastPixelData.current[i+2]);
        }
        const diffPercentage = diff / (currentPixels.length / 4 * 255 * 3);
        
        // Se a tela mudar mais de 1%, o crupiê girou a roleta! Dispara o OCR.
        if (diffPercentage > 0.01) {
          const base64Image = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
          onCapture(base64Image);
        }
      }
      lastPixelData.current = currentPixels;
      
    }, 5000); // Checa a tela a cada 5 segundos

    return () => clearInterval(interval);
  }, [isWatching, isProcessing, onCapture]);

  return (
    <div className="bg-gray-900 border border-indigo-900/50 p-4 rounded-xl text-center shadow-lg relative overflow-hidden">
      {isWatching && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse" />}
      <span className="block text-[10px] uppercase font-black tracking-widest mb-3 text-indigo-400">Radar Hawk-Eye (Autônomo)</span>
      
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {errorMsg && <p className="text-[9px] text-red-500 font-bold mb-2 uppercase">{errorMsg}</p>}

      {!isWatching ? (
        <button onClick={startRadar} className="w-full bg-indigo-600/30 border border-indigo-500 hover:bg-indigo-600 text-white text-xs font-black uppercase py-3 rounded-lg transition-all flex items-center justify-center gap-2">
          👁️ Ligar Radar Contínuo
        </button>
      ) : (
        <button onClick={stopRadar} className="w-full bg-red-600/30 border border-red-500 hover:bg-red-600 text-white text-xs font-black uppercase py-3 rounded-lg transition-all flex items-center justify-center gap-2 animate-pulse">
          🛑 Desativar Radar
        </button>
      )}
    </div>
  );
};
