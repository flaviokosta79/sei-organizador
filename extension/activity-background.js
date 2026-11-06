// User navigation has priority over background SEI scans (they share the user's SEI session).
globalThis.seiActivity = (() => {
  const quietStart = 15000, // a scan cycle starts only after this long without navigation...
    starvation = 300000, // ...unless no cycle ran for this long
    settle = 2500, // between requests of a running cycle, wait this long after the last navigation
    base = 55000,
    longest = 300000;
  let last = 0;
  const intervals = new Map();
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!sender.tab?.url?.startsWith('https://sei.rj.gov.br/')) return;
    if (msg?.type === 'sei:activity') last = Date.now();
    else if (msg?.type === 'sei:activity-wait') reply({ wait: Math.max(0, last + settle - Date.now()) });
  });
  return {
    // Whether a cycle of `kind` (last started at `lastPoll`) may start now.
    due(kind, lastPoll, now = Date.now()) {
      const interval = intervals.get(kind) || base,
        elapsed = now - (lastPoll || 0);
      if (elapsed < interval) return false;
      return now - last >= quietStart || elapsed >= Math.max(starvation, interval);
    },
    // A slow SEI doubles the interval of that kind of cycle (up to 5 min); a normal one restores it.
    report(kind, slow) {
      intervals.set(kind, slow ? Math.min((intervals.get(kind) || base) * 2, longest) : base);
    },
    interval: (kind) => intervals.get(kind) || base,
    touch(now = Date.now()) {
      last = now;
    },
  };
})();
