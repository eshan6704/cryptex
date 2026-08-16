// ============ NETWORK CONTROL ============
// Shared fetch-timeout helper, reused across core engine and feature modules.

// ============ NETWORK CONTROL: shared fetch timeout helper ============
// Wraps fetch() with a hard timeout via AbortController so a stalled connection can't
// leave a request hanging indefinitely (and blocking whatever retry/refresh logic is
// waiting on it). Declared once here, at the top of the first script block, so both
// script blocks in this page can use the same global helper.
async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

