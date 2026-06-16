import { ArrowLeftRight } from 'lucide-react';

export function CompareEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="fade-in" style={{ padding: 60, textAlign: 'center' }}>
      <ArrowLeftRight size={48} color="var(--color-text-muted)" style={{ marginBottom: 16 }} />
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        {title}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, maxWidth: 400, margin: '8px auto' }}>
        {hint}
      </p>
    </div>
  );
}
