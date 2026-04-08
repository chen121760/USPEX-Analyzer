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
