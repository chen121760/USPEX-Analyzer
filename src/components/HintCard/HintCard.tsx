import { useState, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HintCardProps {
  storageKey: string;
  line1: string;
  line2: string;
}

export function HintCard({ storageKey, line1, line2 }: HintCardProps) {
  const lsKey = `hint-dismissed-${storageKey}`;
  const [open, setOpen] = useState(() => localStorage.getItem(lsKey) !== 'true');

  useEffect(() => {
    if (!open) localStorage.setItem(lsKey, 'true');
  }, [open, lsKey]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Show page guide"
        className="flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <HelpCircle size={18} />
      </button>
    );
  }

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 text-sm text-blue-800 dark:text-blue-200 max-w-3xl">
      <HelpCircle size={16} className="mt-0.5 shrink-0 text-blue-400" />
      <div className="flex-1 space-y-0.5">
        <p>{line1}</p>
        <p className="text-blue-600 dark:text-blue-300">{line2}</p>
      </div>
      <button
        onClick={() => setOpen(false)}
        className="shrink-0 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
