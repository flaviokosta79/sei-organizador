// Background SEI reads (monitor, signatures, receipts) go through here. The service worker hands out
// one slot at a time for all tabs (activity-background.js): spaced by the last response time
// (1–10 s) and after the user's navigation settled, so the user's pages never queue behind a scan.
// Timeouts count only the time spent reading, never the time spent waiting for a slot.
globalThis.seiPacedFetch = (() => {
  const navigationLimit = 5000, // per request, waiting for the user's navigation
    slotLimit = 30000, // per request, waiting for other tabs' reads; then read anyway
    retryPause = 3000; // before the single retry of a read that failed on the network
  // Time during which at least one read of this page was waiting (overlapping waits count once).
  let waited = 0,
    waiting = 0,
    waitingSince = 0;
  const waitedNow = () => waited + (waiting ? Date.now() - waitingSince : 0);
  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', abort, { once: true });
    });
  // `urgent`: a read the user has just asked for (not a background scan) does not wait for the
  // navigation to settle; it still takes its turn, one SEI request at a time.
  async function acquire(signal, urgent = false) {
    const since = Date.now();
    let navigation = 0;
    if (!waiting++) waitingSince = since;
    try {
      for (;;) {
        signal?.throwIfAborted();
        let answer;
        try {
          answer = await chrome.runtime.sendMessage({
            type: 'sei:slot',
            ignoreNavigation: urgent || navigation >= navigationLimit,
          });
        } catch {
          return null;
        }
        if (!answer || answer.id) return answer?.id || null;
        if (Date.now() - since >= slotLimit) return null;
        const pause = Math.min(Math.max(Number(answer.wait) || 0, 50), 1000);
        if (answer.navigation) navigation += pause;
        await sleep(pause, signal);
      }
    } finally {
      if (!--waiting) waited += Date.now() - waitingSince;
    }
  }
  // The slot is released only after the body arrived: the SEI is busy until the page is sent.
  async function paced(url, { timeout, urgent, ...init } = {}) {
    const id = await acquire(init.signal, urgent === true);
    const started = Date.now();
    const attempt = async () => {
      const signal = timeout
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)].filter(Boolean))
        : init.signal;
      const response = await fetch(url, { ...init, signal });
      const body = [101, 204, 205, 304].includes(response.status) ? null : await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
    try {
      try {
        return await attempt();
      } catch (e) {
        // A momentary network failure (network change, computer waking up) is tried once more
        // before it becomes an error on the panel. The reads are read-only, so repeating is safe.
        if (e?.name !== 'TypeError') throw e;
        await sleep(retryPause, init.signal);
        return await attempt();
      }
    } catch (e) {
      // The browser reports "Failed to fetch" for no connection and for a blocked redirect (the SEI
      // sends an expired session to the login page). Aborts and timeouts keep their own errors.
      if (e?.name === 'TypeError')
        throw new Error('o SEI não respondeu (sem conexão ou sessão expirada). Recarregue a página do SEI.');
      throw e;
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
      else setTimeout(check, Math.min(limit - active, limit));
    };
    setTimeout(check, limit);
    return controller.signal;
  };
  return paced;
})();
