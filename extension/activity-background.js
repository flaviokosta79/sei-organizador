// User navigation has priority over background SEI scans (they share the user's SEI session, and the
// SEI answers one request per session at a time). This worker is the single gate for every tab:
// one background SEI request at a time, spaced, and only once the user's navigation has settled.
globalThis.seiActivity = (() => {
  const quietStart = 15000, // a scan cycle starts only after this long without navigation...
    starvation = 120000, // ...unless no cycle of that kind started for this long
    settle = 2500, // each background request waits this long after the last navigation
    base = 55000,
    longest = 300000,
    slotLease = 30000,
    storageKey = 'seiActivityIntervals';
  let last = 0,
    lastEnd = 0,
    slot = null,
    intervals = {};
  const latencies = [];
  // The slow-SEI backoff survives service-worker restarts within the browser session.
  const loaded = chrome.storage.session
    .get(storageKey)
    .then((stored) => {
      intervals = { ...(stored?.[storageKey] || {}), ...intervals };
    })
    .catch(() => {});
  const gap = () => Math.min(Math.max(1000, latencies.at(-1) || 0), 10000);
  // Median of the recent background responses; null until there are enough of them.
  function slow() {
    if (latencies.length < 3) return null;
    const sorted = [...latencies].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] > 4000;
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!sender.tab?.url?.startsWith('https://sei.rj.gov.br/')) return;
    const now = Date.now();
    if (msg?.type === 'sei:activity') last = now;
    else if (msg?.type === 'sei:slot') {
      if (slot && slot.until <= now) slot = null;
      const navigation = msg.ignoreNavigation ? 0 : last + settle - now,
        wait = Math.max(slot ? Math.min(slot.until - now, 1000) : 0, lastEnd + gap() - now, navigation);
      if (wait > 0) return reply({ wait, navigation: navigation > 0 && navigation >= wait });
      slot = { id: crypto.randomUUID(), until: now + slotLease };
      reply({ wait: 0, id: slot.id });
    } else if (msg?.type === 'sei:slot-done') {
      if (!slot || slot.id !== msg.id) return reply({ ok: false });
      slot = null;
      lastEnd = now;
      if (Number.isFinite(msg.latency) && msg.latency >= 0) {
        latencies.push(msg.latency);
        if (latencies.length > 10) latencies.shift();
      }
      reply({ ok: true });
    }
  });
  const interval = (kind) => intervals[kind] || base;
  return {
    loaded,
    // Whether a cycle of `kind` (last started at `lastPoll`) may start now.
    due(kind, lastPoll, now = Date.now()) {
      const elapsed = now - (lastPoll || 0);
      if (elapsed < interval(kind)) return false;
      return now - last >= quietStart || elapsed >= Math.max(starvation, interval(kind));
    },
    // At the end of a cycle: a slow SEI doubles the interval (up to 5 min); a normal one restores it.
    report(kind) {
      const state = slow();
      if (state === null) return;
      const next = state ? Math.min(interval(kind) * 2, longest) : base;
      if (next === interval(kind)) return;
      if (next === base) delete intervals[kind];
      else intervals[kind] = next;
      chrome.storage.session.set({ [storageKey]: intervals }).catch(() => {});
    },
    interval,
    // Longest normal gap between two cycles of `kind`, for freshness checks of their results.
    longestGap: (kind) => Math.max(starvation, interval(kind)),
    slow,
  };
})();
