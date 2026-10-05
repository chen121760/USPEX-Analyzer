/** Escape external text before it enters an HTML label or tooltip. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Preserve only the attribute-free formatting used by chart labels. */
export function safePlotHtml(text: string): string {
  const safeToken = /^(?:<\/?(?:sub|sup|b|strong|i|em)>|<br\s*\/?>|&(?:amp|lt|gt|quot|#39|Delta|minus|nbsp);)$/i;
  return text.split(/(<\/?(?:sub|sup|b|strong|i|em)>|<br\s*\/?>|&(?:amp|lt|gt|quot|#39|Delta|minus|nbsp);)/gi)
    .map(token => safeToken.test(token) ? token : escapeHtml(token)).join('');
}
