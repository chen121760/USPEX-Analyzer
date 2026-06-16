import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';

export function WorkshopContent({
  hasData,
  pageTitle,
  emptyTitle,
  emptyHint,
  children,
}: {
  hasData: boolean;
  pageTitle: string;
  emptyTitle: string;
  emptyHint: string;
  children: ReactNode;
}) {
  return (
    <div className="workshop-content fade-in">
      {hasData ? (
        <>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{pageTitle}</h1>
          {children}
        </>
      ) : (
        <div className="workshop-empty">
          <FlaskConical size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
            {emptyTitle}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {emptyHint}
          </div>
        </div>
      )}
    </div>
  );
}
