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
        className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <HelpCircle size={18} />
      </button>
    );
  }

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-lg border text-sm max-w-3xl"
      style={{
        background: 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))',
        borderColor: 'color-mix(in srgb, var(--color-primary) 32%, var(--color-border))',
        color: 'var(--color-text)',
      }}
    >
      <HelpCircle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
      <div className="flex-1 space-y-0.5">
        <p>{line1}</p>
        <p style={{ color: 'var(--color-text-secondary)' }}>{line2}</p>
      </div>
      <button
        onClick={() => setOpen(false)}
        className="shrink-0 transition-colors"
        style={{ color: 'var(--color-primary)' }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
