interface Props {
  onClick: () => void;
  label?: string;
  style?: React.CSSProperties;
}

export function ExportDataButton({ onClick, label = 'Export Data', style }: Props) {
  return (
    <button
      className="btn btn-outline btn-sm"
      onClick={onClick}
      title="Export chart data as CSV (Origin-compatible)"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, ...style }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v8M5 7l3 3 3-3" />
        <path d="M3 12h10" />
      </svg>
      {label}
    </button>
  );
}
