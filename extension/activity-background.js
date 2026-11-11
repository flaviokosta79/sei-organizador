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
    storageKey = 'seiActivityIntervals',
    sessionKey = 'seiSessionMarks',
    // Everything kept per browser session that holds SEI addresses (they are signed per SEI login).
    sessionStores = ['seiBlockTargets', 'seiSecretariatReceiptTargets', 'seiSignatureProcesses', 'seiSignatureScans'];
  let session = null,
    sessionQueue = Promise.resolve();
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
    .catch(() => {})
    .then(() => chrome.storage.session.get(sessionKey))
    .then((stored) => {
      session = stored?.[sessionKey] || null;
    })
    .catch(() => {});
  // The SEI signs every address with the login session (infra_hash) and ends the session of whoever
  // asks for an address signed by another one. Each page reports the signature of fixed header links
  // ("marks"): when a newer page shows different marks the user logged in again, so the addresses kept
  // from the previous login are dropped; a page older than that belongs to the previous login and must
  // not read the SEI. Resolves to true for such a stale page.
  const checkSession = (marks, pageLoaded) =>
    (sessionQueue = sessionQueue
      .then(() => loaded)
      .then(async () => {
        if (!Number.isFinite(pageLoaded)) return false;
        // A page from before the SEI ended a session (endSession) is stale whatever its marks are.
        const ended = session?.ended || 0;
        if (pageLoaded <= ended) return true;
        if (!marks || typeof marks !== 'object') return false;
        const seen = Object.fromEntries(
          ['u', 't'].filter((k) => /^[0-9a-f]{16,128}$/.test(marks[k] || '')).map((k) => [k, marks[k]]),
        );
        const known = session?.marks || {},
          first = !Object.keys(known).length;
        const common = Object.keys(seen).filter((k) => known[k]);
        if (!Object.keys(seen).length || (!first && !common.length)) return false;
        const changed = common.some((k) => known[k] !== seen[k]);
        if (changed && pageLoaded <= session.loaded) return true;
        if (changed) await chrome.storage.session.remove(sessionStores);
        const next = {
          ...(changed || first
            ? { marks: seen, loaded: pageLoaded }
            : { marks: { ...known, ...seen }, loaded: Math.max(session.loaded, pageLoaded) }),
          ...(ended && { ended }),
        };
        if (JSON.stringify(next) !== JSON.stringify(session)) {
          session = next;
          await chrome.storage.session.set({ [sessionKey]: session });
        }
        return false;
      })
      .catch(() => false));
  // A background read was answered with a redirect: the SEI ended the session (expired, logged out or
  // taken down). The addresses kept so far are dropped and the pages loaded so far stop reading, even
  // when the new login cannot be told by the marks (e.g. it lands on another unit).
  const endSession = (at) =>
    (sessionQueue = sessionQueue
      .then(() => loaded)
      .then(async () => {
        await chrome.storage.session.remove(sessionStores);
        session = {
          marks: session?.marks || {},
          loaded: session?.loaded || 0,
          ended: Math.max(session?.ended || 0, at),
        };
        await chrome.storage.session.set({ [sessionKey]: session });
      })
      .catch(() => {}));
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
    if (msg?.type === 'sei:session') {
      checkSession(msg.marks, msg.loaded).then((stale) => reply({ stale }));
      return true;
    }
    if (msg?.type === 'sei:session-ended') {
      endSession(now).then(() => reply({ ok: true }));
      return true;
    }
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
    checkSession,
    endSession,
  };
})();
