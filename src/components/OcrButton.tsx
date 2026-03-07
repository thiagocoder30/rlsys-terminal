import React, { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";

interface OcrButtonProps {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

export const OcrButton: React.FC<OcrButtonProps> = ({ onUpload, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="px-4 py-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <button
        disabled={isLoading}
        onClick={() => fileInputRef.current?.click()}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 h-16 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-[0_0_30px_rgba(79,70,229,0.3)] active:scale-95"
      >
        {isLoading ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : (
          <>
            <Camera className="w-6 h-6 text-white" />
            <span className="text-white font-black text-lg uppercase tracking-widest">Ler Histórico (OCR)</span>
          </>
        )}
      </button>
    </div>
  );
};
