'use client';

import { useEffect } from 'react';

/**
 * Globally prevents mouse wheel from changing values on focused number inputs.
 * Without this, scrolling while a number field is focused silently mutates its value.
 */
export function NumberInputScrollGuard() {
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
        document.activeElement.blur();
      }
    };
    document.addEventListener('wheel', handler, { passive: true });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  return null;
}
