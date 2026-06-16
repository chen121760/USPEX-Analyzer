/**
 * Interaction boundary for Plotly charts.
 *
 * Browser translation extensions can rewrite Plotly's transient SVG hover text
 * after it appears. Marking the chart subtree as non-translatable keeps the
 * hover label, drag layer, and click hit-testing DOM under Plotly's control.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  onClickCapture?: HTMLAttributes<HTMLDivElement>['onClickCapture'];
  onPointerDownCapture?: HTMLAttributes<HTMLDivElement>['onPointerDownCapture'];
  onPointerLeave?: HTMLAttributes<HTMLDivElement>['onPointerLeave'];
  onPointerMoveCapture?: HTMLAttributes<HTMLDivElement>['onPointerMoveCapture'];
  style?: CSSProperties;
}

const PLOTLY_DYNAMIC_SELECTOR = [
  '.js-plotly-plot',
  '.plotly',
  '.svg-container',
  '.main-svg',
  '.draglayer',
  '.hoverlayer',
  '.infolayer',
  '.modebar-container',
  '#js-plotly-tester',
].join(',');

export function PlotlyInteractionBoundary({
  children,
  className = '',
  onClickCapture,
  onPointerDownCapture,
  onPointerLeave,
  onPointerMoveCapture,
  style,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const classes = ['plotly-interaction-boundary', 'notranslate', className].filter(Boolean).join(' ');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frameId: number | null = null;
    const scheduleProtection = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        protectPlotlyDom(root);
      });
    };

    protectPlotlyDom(root);

    // Plotly recreates SVG hover and drag nodes during interaction; protect
    // newly inserted nodes so extensions do not rewrite coordinates or text.
    const rootObserver = new MutationObserver(scheduleProtection);
    rootObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'transform', 'translate'],
    });

    // Plotly's off-screen text-measurement SVG is shared at document.body level,
    // outside React's chart subtree, so it needs a small global observer.
    const bodyObserver = new MutationObserver(scheduleProtection);
    bodyObserver.observe(document.body, { childList: true, subtree: false });

    return () => {
      rootObserver.disconnect();
      bodyObserver.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  const handlePointerActivity = () => {
    const root = rootRef.current;
    if (root) protectPlotlyDom(root);
  };

  const handlePointerDownCapture: HTMLAttributes<HTMLDivElement>['onPointerDownCapture'] = (event) => {
    handlePointerActivity();
    onPointerDownCapture?.(event);
  };

  return (
    <div
      ref={rootRef}
      className={classes}
      translate="no"
      style={{ position: 'relative', ...style }}
      onClickCapture={onClickCapture}
      onPointerEnter={handlePointerActivity}
      onPointerLeave={onPointerLeave}
      onPointerMove={handlePointerActivity}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerDownCapture={handlePointerDownCapture}
    >
      {children}
    </div>
  );
}

function protectPlotlyDom(root: HTMLElement) {
  markNonTranslatable(root);

  root.querySelectorAll(PLOTLY_DYNAMIC_SELECTOR).forEach(markNonTranslatable);

  const tester = document.getElementById('js-plotly-tester');
  if (!tester) return;

  markNonTranslatable(tester);
  tester.setAttribute('aria-hidden', 'true');

  // The tester is a Plotly-owned off-screen SVG used only for text measurement.
  // It should never intercept pointer events or become visible UI.
  tester.style.pointerEvents = 'none';
  tester.style.userSelect = 'none';
}

function markNonTranslatable(element: Element) {
  element.setAttribute('translate', 'no');
  element.setAttribute('data-no-translate', 'true');
  element.setAttribute('data-notranslate', 'true');
  element.classList.add('notranslate');
}
