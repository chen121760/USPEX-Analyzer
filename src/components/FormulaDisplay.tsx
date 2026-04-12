import { formulaToHtml } from '@/parsers/compositionUtils';

/**
 * 把化学式里的数字渲染成下标。
 * 例如 "Fe2O3" 显示为 Fe₂O₃（用 HTML <sub> 标签实现）。
 *
 * formula 字符串由内部 buildFormula() 生成，不含用户输入，
 * 所以用 dangerouslySetInnerHTML 是安全的。
 */
export function FormulaDisplay({
  formula,
  style,
  className,
}: {
  formula: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <span
      style={style}
      className={className}
      dangerouslySetInnerHTML={{ __html: formulaToHtml(formula) }}
    />
  );
}
