import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { progressPercent, ProgressBar, Spinner } from './Spinner';

function LoadingCard({
  title,
  detail,
  progress,
}: {
  title: string;
  detail?: string | null;
  progress?: number | null;
}) {
  const percent = progressPercent(progress);
  return (
    <div className="loading-card">
      <Spinner size={26} />
      <p className="loading-title">{title}</p>
      {detail ? <p className="loading-detail">{detail}</p> : null}
      <div className="loading-progress">
        <ProgressBar value={progress} />
        {/* The bar carries aria-valuenow; the number is also shown because a
            multi-second wait is easier to judge with a figure. */}
        {percent != null ? <span className="loading-percent">{percent}%</span> : null}
      </div>
    </div>
  );
}

/**
 * Global loading overlay for long operations (parsing an archive, loading a
 * saved project).
 *
 * `role="status"` + `aria-live` announce the state to assistive tech, and the
 * indicator only uses transform/opacity so it keeps animating while the main
 * thread is busy parsing. A short delay keeps near-instant work from flashing it.
 * While the parser reports steps the bar is determinate; otherwise it slides.
 */
export function LoadingOverlay() {
  const { t } = useTranslation();
  const isLoading = useProjectStore((s) => s.isLoading);
  const stage = useProjectStore((s) => s.loadingStage);
  const detail = useProjectStore((s) => s.loadingDetail);
  const progress = useProjectStore((s) => s.loadingProgress);
  const visible = useDelayedFlag(isLoading, 150);

  if (!visible) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <LoadingCard title={t(stage ?? 'loading')} detail={detail} progress={progress} />
    </div>
  );
}

/** Full-screen boot state, used while the previous session is being restored. */
export function LoadingScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-busy="true">
      <LoadingCard title={title} detail={detail} />
    </div>
  );
}
