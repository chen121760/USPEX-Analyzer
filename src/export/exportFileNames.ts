export function ensureFileExtension(filename: string, extension: string): string {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return filename.toLowerCase().endsWith(normalizedExtension.toLowerCase())
    ? filename
    : `${filename}${normalizedExtension}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
