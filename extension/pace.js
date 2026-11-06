// Background SEI reads (monitor, signatures, receipts) go through here. The service worker hands out
// one slot at a time for all tabs (activity-background.js): spaced by the last response time
// (1–10 s) and after the user's navigation settled, so the user's pages never queue behind a scan.
// Timeouts count only the time spent reading, never the time spent waiting for a slot.
globalThis.seiPacedFetch = (() => {
  const navigationLimit = 5000, // per request, waiting for the user's navigation
    slotLimit = 30000; // per request, waiting for other tabs' reads; then read anyway
  let waited = 0,
    waitingSince = 0;
  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  const waitedNow = () => waited + (waitingSince ? Date.now() - waitingSince : 0);
  async function acquire(signal) {
    const started = Date.now();
    let navigation = 0;
    waitingSince = started;
    try {
      for (;;) {
        signal?.throwIfAborted();
        let answer;
        try {
          answer = await chrome.runtime.sendMessage({
            type: 'sei:slot',
            ignoreNavigation: navigation >= navigationLimit,
          });
        } catch {
          return null;
        }
        if (!answer || answer.id) return answer?.id || null;
        if (Date.now() - started >= slotLimit) return null;
        const wait = Math.min(Math.max(Number(answer.wait) || 0, 50), 1000);
        if (answer.navigation) navigation += wait;
        await sleep(wait, signal);
      }
    } finally {
      waited += Date.now() - waitingSince;
      waitingSince = 0;
    }
  }
  async function paced(url, { timeout, ...init } = {}) {
    const id = await acquire(init.signal);
    const signal = timeout ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)].filter(Boolean)) : init.signal;
    const started = Date.now();
    try {
      return await fetch(url, { ...init, signal });
    } finally {
      if (id) chrome.runtime.sendMessage({ type: 'sei:slot-done', id, latency: Date.now() - started }).catch(() => {});
    }
  }
  // Like AbortSignal.timeout(limit), but the time spent waiting for a slot does not count.
  paced.timeout = (limit) => {
    const controller = new AbortController(),
      start = Date.now(),
      base = waitedNow();
    const check = () => {
      const active = Date.now() - start - (waitedNow() - base);
      if (active >= limit) controller.abort(new DOMException('signal timed out', 'TimeoutError'));
      else setTimeout(check, limit - active);
    };
    setTimeout(check, limit);
    return controller.signal;
  };
  return paced;
})();
