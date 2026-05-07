/**
 * Archive extraction for .tar.gz / .tgz / .zip files.
 * Uses fflate for zip and a minimal USTAR parser for tar (no extra tar library).
 */

import { unzipSync, gunzipSync } from 'fflate';

/** Dictionary mapping file path → raw bytes */
export type ArchiveEntries = Record<string, Uint8Array>;

// ── Public API ────────────────────────────────────────────────

/** Detect archive type from filename extension */
function archiveType(name: string): 'zip' | 'targz' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'targz';
  return null;
}

/** Check if a file is a supported archive */
export function isArchive(file: File): boolean {
  return archiveType(file.name) !== null;
}

/**
 * Extract a .zip, .tar.gz, or .tgz File into a { path: bytes } dictionary.
 * Auto-flattens: if all entries share one top-level directory prefix, it is stripped.
 */
export async function extractArchive(file: File): Promise<ArchiveEntries> {
  const type = archiveType(file.name);
  if (!type) throw new Error(`Unsupported archive format: ${file.name}`);

  const buf = new Uint8Array(await file.arrayBuffer());

  if (type === 'zip') {
    return extractZip(buf);
  } else {
    return extractTarGz(buf);
  }
}

/**
 * Convert an ArchiveEntries dict into File[].
 * Each File's name is the basename of the archive path.
 */
export function entriesToFiles(entries: ArchiveEntries): File[] {
  return Object.entries(entries).map(([path, bytes]) => {
    const basename = path.split('/').pop() || path;
    return new File([bytes as BlobPart], basename);
  });
}

// ── ZIP (fflate) ──────────────────────────────────────────────

function extractZip(buf: Uint8Array): ArchiveEntries {
  const data = unzipSync(buf);
  const entries: ArchiveEntries = {};
  for (const [path, bytes] of Object.entries(data)) {
    // fflate includes directory entries as empty buffers — skip them
    if (bytes.length === 0 && path.endsWith('/')) continue;
    entries[path] = bytes;
  }
  return flattenIfNeeded(entries);
}

// ── TAR.GZ (fflate gunzip + minimal USTAR parser) ────────────

function extractTarGz(buf: Uint8Array): ArchiveEntries {
  const decompressed = gunzipSync(buf);
  return parseTar(decompressed);
}

/**
 * Minimal USTAR / GNU tar parser.
 * Each entry = 512-byte header block + N × 512-byte content blocks.
 */
function parseTar(data: Uint8Array): ArchiveEntries {
  const entries: ArchiveEntries = {};
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);

    // Check for end-of-archive: two consecutive zero blocks
    if (isZeroBlock(header)) {
      // Peek at next block
      if (offset + 1024 <= data.length) {
        const next = data.subarray(offset + 512, offset + 1024);
        if (isZeroBlock(next)) break; // two zero blocks → end
      } else {
        break; // not enough data for a second block
      }
    }

    // Parse header fields
    const name = readCString(header, 0, 100);
    // file size is an octal ASCII string at offset 124, length 12
    const sizeStr = readCString(header, 124, 12).trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    // type flag at offset 156
    const typeFlag = header[156];

    offset += 512;

    if (typeFlag === 0x30 || typeFlag === 0 || typeFlag === 0x37) {
      // Regular file ('0' or '\0') or contiguous file ('7' in GNU tar)
      if (size > 0 && name) {
        entries[name] = data.subarray(offset, offset + size);
      }
    }
    // Skip: directories ('5'), symlinks ('2'), hardlinks ('1'), long names ('L'/'K'), etc.

    // Advance past content, rounded up to next 512-byte block
    offset += Math.ceil(size / 512) * 512;
  }

  if (Object.keys(entries).length === 0) {
    throw new Error('TAR parsing found no files. The archive may be empty or in an unsupported format.');
  }

  return flattenIfNeeded(entries);
}

function isZeroBlock(buf: Uint8Array): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

/** Read a null-terminated (or space-padded) C string from a byte buffer */
function readCString(buf: Uint8Array, start: number, maxLen: number): string {
  let end = start;
  while (end < start + maxLen && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(start, end));
}

// ── Flatten ───────────────────────────────────────────────────

/**
 * If every entry shares a single top-level directory prefix, strip it.
 * This handles the case where the user packed the parent directory
 * instead of being inside the result directory.
 */
function flattenIfNeeded(entries: ArchiveEntries): ArchiveEntries {
  const paths = Object.keys(entries);
  if (paths.length === 0) return entries;

  // Find the common prefix (first path component before "/")
  const firstSlash = paths[0].indexOf('/');
  if (firstSlash === -1) return entries; // already flat — no directory prefix

  const prefix = paths[0].substring(0, firstSlash + 1); // e.g. "my-run/"
  const allSharePrefix = paths.every((p) => p.startsWith(prefix));
  if (!allSharePrefix) return entries; // mixed — leave as-is

  const result: ArchiveEntries = {};
  for (const [path, bytes] of Object.entries(entries)) {
    result[path.slice(prefix.length)] = bytes;
  }
  return result;
}
