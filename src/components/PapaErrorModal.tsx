import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface PapaErrorModalProps {
  message: string | null;
  onClose: () => void;
}

export const PapaErrorModal: React.FC<PapaErrorModalProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#ffb37c] bg-gradient-to-b from-[#2a1a0d] to-[#1a1008] p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
        </div>
        <p className="text-sm font-medium leading-6 text-amber-100">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-[#2a1a0d] shadow-lg hover:brightness-110"
        >
          OK papa
        </button>
      </div>
    </div>
  );
};
