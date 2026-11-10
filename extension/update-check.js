// "Nova versão disponível": the extension is installed from a ZIP (no automatic update), so the worker
// checks the latest GitHub release at most every 6 h (1 h after a failure) and the SEI footer shows it.
// Only the version number and the release page are kept; nothing about the user is sent.
globalThis.seiUpdateCheck = (() => {
  const storageKey = 'seiUpdateCheck',
    every = 6 * 60 * 60000,
    retry = 60 * 60000;
  const { updateFeed, releasesPage } = SEI_ORGANIZADOR_CONFIG;
  const parse = (value) =>
    /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/
      .exec(String(value || ''))
      ?.slice(1)
      .map(Number);
  const newer = (candidate, current) => {
    const a = parse(candidate),
      b = parse(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };
  let pending = null;
  async function refresh(state) {
    try {
      const response = await fetch(updateFeed, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const release = await response.json();
      const latest = String(release?.tag_name || '').replace(/^v/, '');
      const url = String(release?.html_url || '');
      if (!parse(latest) || !url.startsWith(releasesPage)) throw Error('Release inválida');
      return { latest, url, nextAt: Date.now() + every };
    } catch {
      // Keep the last known release; try again later.
      return { ...state, nextAt: Date.now() + retry };
    }
  }
  // Installed from the Chrome Web Store (the store adds update_url): Chrome updates it by itself, so
  // nothing is asked to GitHub and no notice is shown.
  const managed = () => !!chrome.runtime.getManifest().update_url || !updateFeed;
  async function status() {
    if (managed()) return { current: chrome.runtime.getManifest().version, latest: null, url: null, available: false };
    let state = (await chrome.storage.local.get(storageKey))[storageKey] || {};
    const now = Date.now();
    if (!(state.nextAt > now) || state.nextAt > now + every) {
      pending ||= refresh(state).then(async (next) => {
        await chrome.storage.local.set({ [storageKey]: next });
        return next;
      });
      try {
        state = await pending;
      } finally {
        pending = null;
      }
    }
    const current = chrome.runtime.getManifest().version;
    const available = newer(state.latest, current);
    return { current, latest: state.latest || null, url: available ? state.url : null, available };
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type !== 'update:status') return;
    const from = new URL(sender.tab?.url || 'about:blank');
    if (from.origin !== 'https://sei.rj.gov.br' || sender.frameId !== 0) {
      reply({ error: 'Origem não permitida' });
      return;
    }
    status().then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
  return { status, newer };
})();
