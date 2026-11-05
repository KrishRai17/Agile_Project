/**
 * Content-Security-Policy builder shared by `proxy.ts` (per-request nonce) and `next.config.ts`
 * (static fallback for routes the proxy does not match, e.g. static assets).
 *
 * - Scripts: `'nonce-…' 'strict-dynamic'` in place of `'unsafe-inline'`. `'unsafe-eval'` only in development
 *   (React uses eval for dev-only error stack reconstruction).
 * - Styles keep `'unsafe-inline'`: React `style={}` props, MapLibre GL's canvas/marker positioning and
 *   next/font all inject inline styles that cannot carry a nonce.
 * - MapLibre: tiles/glyphs/sprites from tiles.openfreemap.org, workers from `blob:`.
 */
export const MAP_TILE_ORIGIN = "https://tiles.openfreemap.org";

export function buildCsp(options: { nonce?: string; isDev: boolean }): string {
  const { nonce, isDev } = options;
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' blob:${isDev ? " 'unsafe-eval'" : ""}`
    : // Static fallback (no nonce available): static assets do not execute inline scripts.
      `script-src 'self' blob:${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `font-src 'self' data: https://fonts.gstatic.com ${MAP_TILE_ORIGIN}`,
    `img-src 'self' data: blob: ${MAP_TILE_ORIGIN} https://*.openstreetmap.org`,
    `connect-src 'self' ${MAP_TILE_ORIGIN}${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

