import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

const controlStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: 12,
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
};

export function SelectControl({ style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select style={{ ...controlStyle, ...style }} {...props} />;
}

export function TextInput({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input style={{ ...controlStyle, ...style }} {...props} />;
}
