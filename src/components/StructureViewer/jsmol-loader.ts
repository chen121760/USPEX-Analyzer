/**
 * JSmol loader — singleton async loader for JSmol.min.js.
 *
 * JSmol is not on npm. We host it under public/jsmol/ and inject the
 * <script> tag on first use. Subsequent calls return the cached promise.
 */

// Vite injects the configured `base` (e.g. "/uspex-analyzer/") here.
// In dev `import.meta.env.BASE_URL` is "/", in built site it's the base.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // strip trailing /
const JSMOL_DIR = `${BASE}/jsmol`;
const JSMOL_SCRIPT = `${JSMOL_DIR}/JSmol.min.js`;

// Tell TypeScript that window.Jmol exists once loaded.
declare global {
  interface Window {
    Jmol: any;
    j2sPath?: string;
  }
}

let loadPromise: Promise<typeof window.Jmol> | null = null;

export function loadJSmol(): Promise<typeof window.Jmol> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Already loaded by a previous mount? Just return it.
    if (typeof window !== 'undefined' && window.Jmol) {
      resolve(window.Jmol);
      return;
    }

    const script = document.createElement('script');
    script.src = JSMOL_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.Jmol) {
        // JSmol's corejmol.js overwrites String.prototype.replaceAll with a
        // regex-based version (treats the search string as a RegExp pattern).
        // This breaks tanstack/react-table's column ID generation:
        //   accessorKey.replaceAll('.', '_') → replaces EVERY char with '_'
        //   because '.' is a regex wildcard, turning e.g. 'spaceGroup' → '__________'
        // Restore a correct implementation immediately after JSmol loads.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.defineProperty(String.prototype, 'replaceAll', {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value: function(this: string, search: any, replacement: string) {
            if (search instanceof RegExp) {
              if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
              return this.replace(search, replacement);
            }
            // Literal string — escape regex special chars so '.' is not a wildcard
            const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return this.replace(new RegExp(escaped, 'g'), replacement);
          },
          writable: true,
          configurable: true,
        });
        resolve(window.Jmol);
      } else {
        reject(new Error('JSmol.min.js loaded but window.Jmol is undefined'));
      }
    };
    script.onerror = () => reject(new Error(`Failed to load ${JSMOL_SCRIPT}`));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Path to the j2s/ directory — JSmol needs this in its config. */
export const J2S_PATH = `${JSMOL_DIR}/j2s`;
