// Background SEI reads (monitor, signatures, receipts) go through here: at least 1 s (or the last
// response time, up to 10 s) between requests, and a short wait after the user navigates, so the
// user's own pages never queue behind a scan in the shared SEI session.
globalThis.seiPacedFetch = (() => {
  let last = 0;
  const latencies = [];
  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
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
  async function settle(signal) {
    const gap = Math.min(Math.max(1000, latencies.at(-1) || 0), 10000);
    const spacing = last + gap - Date.now();
    if (spacing > 0) await sleep(spacing, signal);
    // Navigation keeps extending the wait; never more than 5 s per request so a cycle still ends.
    const deadline = Date.now() + 5000;
    for (;;) {
      signal?.throwIfAborted();
      let wait = 0;
      try {
        wait = Number((await chrome.runtime.sendMessage({ type: 'sei:activity-wait' }))?.wait) || 0;
      } catch {}
      wait = Math.min(wait, deadline - Date.now());
      if (wait <= 0) return;
      await sleep(Math.min(wait, 1000), signal);
    }
  }
  async function paced(url, init = {}) {
    await settle(init.signal);
    const started = Date.now();
    try {
      return await fetch(url, init);
    } finally {
      last = Date.now();
      latencies.push(last - started);
      if (latencies.length > 10) latencies.shift();
    }
  }
  // SEI is slow when the median of the recent responses exceeds 4 s.
  paced.slow = () => {
    if (latencies.length < 3) return false;
    const sorted = [...latencies].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] > 4000;
  };
  return paced;
})();
