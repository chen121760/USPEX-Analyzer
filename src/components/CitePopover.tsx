import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Copy, Check, ExternalLink } from 'lucide-react';
import { citations, uspexUrl } from '@/utils/citations';

export function CitePopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCopyAll = () => {
    const text = citations
      .map((c) => `[${c.category}]\n${c.refs.join('\n')}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={popoverRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(!open)}
        title={t('cite.title')}
        style={{
          color: open ? '#68b88e' : undefined,
          background: open ? 'rgba(104,184,142,0.12)' : undefined,
          borderRadius: 6,
        }}
      >
        <BookOpen size={16} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            width: 480,
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            padding: 16,
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('cite.title')}</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleCopyAll}
              style={{ fontSize: 12, gap: 4 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('cite.copied') : t('cite.copyAll')}
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            {t('cite.description')}
          </p>

          {/* Citation sections */}
          {citations.map((section) => (
            <div key={section.category} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>
                {section.category}
              </div>
              {section.refs.map((ref, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: 'var(--color-text-secondary)',
                    margin: '0 0 6px',
                    paddingLeft: 8,
                    borderLeft: '2px solid var(--color-border)',
                  }}
                >
                  {ref}
                </p>
              ))}
            </div>
          ))}

          {/* Footer link */}
          <a
            href={uspexUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--color-primary)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            {t('cite.moreInfo')} <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  );
}
