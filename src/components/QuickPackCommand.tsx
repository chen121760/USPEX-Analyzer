import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';

// Collect available retained-ID tables without distinguishing composition modes.
// Geometry already comes from gatheredPOSCARS; no duplicate retained POSCARS file.
const COMMAND = `missing=""; for f in Individuals gatheredPOSCARS; do [ -f "$f" ] || missing="$missing $f"; done; is25=0; [ -f Individuals ] && head -n 1 Individuals | grep -Eq '^[[:space:]]*generation[[:space:]]+number[[:space:]]+num_atoms_all' && is25=1; [ -f gatheredPOSCARS ] && grep -m1 -Eq '^number=[0-9]+' gatheredPOSCARS && is25=1; if [ "$is25" -eq 0 ]; then for f in origin Parameters.txt; do [ -f "$f" ] || missing="$missing $f"; done; fi; if [ -n "$missing" ]; then echo "Missing:$missing"; else out="uspex_$(date +%Y%m%d_%H%M%S).tar.gz"; tar -czf "$out" Individuals gatheredPOSCARS $(ls origin Parameters.txt parameters parameter extended_convex_hull goodStructures convex_hull Pareto_ranking MLProperties gatheredPOSCARS_unrelaxed gatheredPOSCARS_unrelaxed_all BESTIndividuals BESTgatheredPOSCARS Individuals_all Individuals_extended generation_properties uspex.output 2>/dev/null) && echo "Done. Download $out to local and drag into the web page (no need to extract)."; fi`;

export function QuickPackCommand() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(COMMAND);
      setStatus('copied');
      timer.current = window.setTimeout(() => setStatus('idle'), 2400);
    } catch {
      setStatus('failed');
    }
  };

  return (
    <section className="upload-pack" aria-labelledby="quickpack-title">
      <h2 id="quickpack-title">{t('quickpack.title')}</h2>
      <p id="quickpack-instruction">{t('quickpack.instruction')}</p>
      <button className="btn btn-primary upload-copy" type="button" onClick={handleCopy}
        aria-describedby="quickpack-instruction">
        {status === 'copied' ? <Check size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}
        {t('quickpack.copy')}
      </button>
      <p className="upload-copy-status" role="status">
        {status !== 'idle' && t(status === 'copied' ? 'quickpack.copied' : 'quickpack.copyFailed')}
      </p>
      {status === 'failed' && (
        <textarea className="upload-copy-fallback" aria-label={t('quickpack.copy')} value={COMMAND}
          rows={3} readOnly onFocus={event => event.currentTarget.select()} />
      )}
    </section>
  );
}
