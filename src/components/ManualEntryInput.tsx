import React, { useState } from "react";
import { Send } from "lucide-react";

interface ManualEntryInputProps {
  onNumberSubmit: (n: number) => void;
  isLoading?: boolean;
}

export const ManualEntryInput: React.FC<ManualEntryInputProps> = ({ onNumberSubmit, isLoading }) => {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0 && num <= 36) {
      onNumberSubmit(num);
      setValue("");
      // Haptic feedback
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
    } else {
      alert("Por favor, insira um número válido entre 0 e 36.");
    }
  };

  return (
    <form 
      onSubmit={handleSubmit}
      className="flex gap-2 p-4 bg-gray-900/50 rounded-2xl border border-gray-800 backdrop-blur-sm"
    >
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Digitar número (0-36)"
        min="0"
        max="36"
        className="flex-grow bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-600"
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || value === ""}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white p-3 rounded-xl transition-all active:scale-90 shadow-lg shadow-indigo-900/20"
      >
        <Send size={24} />
      </button>
    </form>
  );
};
