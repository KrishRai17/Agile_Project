import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./support/load-ts.mjs";

const csp = await loadTs("lib/csp.ts");

test("production CSP uses a nonce + strict-dynamic and never unsafe-eval or unsafe-inline scripts", () => {
  const policy = csp.buildCsp({ nonce: "abc123", isDev: false });
  const scriptSrc = policy.split("; ").find((d) => d.startsWith("script-src"));
  assert.match(scriptSrc, /'nonce-abc123'/);
  assert.match(scriptSrc, /'strict-dynamic'/);
  assert.ok(!scriptSrc.includes("'unsafe-eval'"), "no unsafe-eval in production");
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "no unsafe-inline scripts in production");

  // MapLibre map tiles, glyphs, workers and fonts remain allowed
  assert.match(policy, /worker-src 'self' blob:/);
  assert.match(policy, /connect-src [^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.match(policy, /img-src [^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.match(policy, /font-src [^;]*https:\/\/fonts\.gstatic\.com/);
  assert.match(policy, /object-src 'none'/);
});

test("static fallback CSP (no nonce) has no unsafe-eval in production; dev keeps unsafe-eval", () => {
  const prodFallback = csp.buildCsp({ isDev: false });
  assert.ok(!prodFallback.includes("'unsafe-eval'"));
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(prodFallback));

  const dev = csp.buildCsp({ nonce: "n", isDev: true });
  assert.match(dev, /script-src[^;]*'unsafe-eval'/);
});

