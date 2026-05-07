import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';

const COMMAND = `missing=""; for f in Individuals origin Parameters.txt gatheredPOSCARS; do [ -f "$f" ] || missing="$missing $f"; done; if [ -n "$missing" ]; then echo "Missing:$missing"; else out="uspex_$(date +%Y%m%d_%H%M%S).tar.gz"; tar -czf "$out" Individuals origin Parameters.txt gatheredPOSCARS $(ls extended_convex_hull Pareto_ranking MLProperties 2>/dev/null) && echo "Done. Download $out to local and drag into the web page (no need to extract)."; fi`;

export function QuickPackCommand() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = COMMAND;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 560,
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        background: 'var(--color-surface)',
        padding: '10px 14px',
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          {t('quickpack.title')}
        </h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleCopy}
          style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
        >
          {copied ? (
            <>
              <Check size={12} />
              Copied
            </>
          ) : (
            <>
              <Copy size={12} />
              {t('quickpack.copy')}
            </>
          )}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
        {t('quickpack.instruction')}
      </p>
    </div>
  );
}
