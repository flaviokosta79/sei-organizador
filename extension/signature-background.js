// Each browser keeps its own acknowledgement; events are shared by the selected internal block.
(() => {
  const storageKey = 'seiCompletedSignatures',
    scanKey = 'seiSignatureScans',
    // History URLs of processes the user opened, shared by the tabs of this browser session only.
    processKey = 'seiSignatureProcesses',
    // Processes whose last history read left a document in a signature block still unsigned.
    waitingKey = 'seiSignatureWaiting',
    recentWindow = 1800000,
    // A signature found more than an hour after it happened (a history read late) is no longer news: no alert.
    alertWindow = 3600000,
    // An alert already in the panel stays until acknowledged, for at most 3 days.
    panelWindow = 3 * 86400000;
  const serial = seiCreateQueue();
  // Each SEI page load syncs signatures: the shared answer is reused for 20 s (new events arrive at most
  // 20 s later); observations sent from this browser clear it.
  const recentSync = seiFreshCache(20000);
  const key = (identity, block) => `${identity.unit}:${identity.org}:${identity.login.trim().toLowerCase()}:${block}`;
  async function records() {
    return (await chrome.storage.local.get(storageKey))[storageKey] || {};
  }
  async function request(block, action, body) {
    const response = await seiServiceFetch(`blocks/${block}/signatures/${action}`, { body, timeout: 15000 });
    if (!response.ok) throw Error(`Assinaturas sem sincronização (HTTP ${response.status}).`);
    return response.json();
  }
  const view = (record) => ({
    events: record.events || [],
    members: record.members || [],
    error: record.error || '',
    notificationError: record.notificationError || '',
  });
  globalThis.seiCompletedSignatures = {
    async pendingCount(owner, block) {
      return (await records())[`${owner}:${block}`]?.events?.length || 0;
    },
    async ack(identity, block) {
      const all = await records(),
        record = all[key(identity, block)];
      if (record) {
        record.events = [];
        await chrome.storage.local.set({ [storageKey]: all });
      }
      await chrome.notifications.clear(`sei-signed:${key(identity, block)}`);
    },
  };
  async function handle(msg, sender) {
    const url = new URL(sender.tab?.url || 'about:blank');
    if (sender.frameId !== 0 || url.origin !== 'https://sei.rj.gov.br' || url.pathname !== '/sei/controlador.php')
      throw Error('Origem não permitida');
    const { identity, block } = msg;
    if (!/^\d{1,30}$/.test(block || '') || !seiValidIdentity(identity)) throw Error('Usuário ou bloco inválido.');
    await seiWorkScopeStore.requireBlock(identity, block);
    // The process page only records its history URL (no SEI request); a list page reads it later.
    // Kept in chrome.storage.session: the process opens in a new tab whose sessionStorage is lost.
    if (msg.type === 'signature:remember' || msg.type === 'signature:processes' || msg.type === 'signature:waiting') {
      const session = Object.assign(
          {},
          ...(await Promise.all([chrome.storage.session.get(processKey), chrome.storage.session.get(waitingKey)])),
        ),
        stored = session[processKey] || {},
        owner = key(identity, block);
      let list = Array.isArray(stored[owner]) ? stored[owner] : [];
      const waitingAll = session[waitingKey] || {},
        waiting = Array.isArray(waitingAll[owner]) ? waitingAll[owner] : [];
      if (msg.type === 'signature:processes') {
        // Read first: documents still waiting for a signature, then processes opened in the last 30 min
        // (a document is usually sent to a signature block shortly after its process is opened).
        const recent = list.filter(([, , at]) => Date.now() - at < recentWindow).map(([process]) => process);
        return { processes: list.map(([process, href]) => [process, href]), waiting, recent };
      }
      if (msg.type === 'signature:waiting') {
        const valid = (ids) =>
          Array.isArray(ids) && ids.length <= 50 && ids.every((id) => typeof id === 'string' && /^\d{1,30}$/.test(id));
        if (!valid(msg.read) || !valid(msg.waiting) || !msg.waiting.every((id) => msg.read.includes(id)))
          throw Error('Leitura de assinaturas inválida.');
        // Every process just read leaves the list; the ones still waiting go back to its end.
        const read = new Set(msg.read),
          next = [...waiting.filter((id) => !read.has(id)), ...msg.waiting].slice(-300);
        if (JSON.stringify(next) !== JSON.stringify(waiting)) {
          waitingAll[owner] = next;
          await chrome.storage.session.set({ [waitingKey]: waitingAll });
        }
        return { ok: true, waiting: next.length };
      }
      const history = new URL(String(msg.url || ''), 'https://sei.rj.gov.br/sei/');
      if (
        !/^\d{1,30}$/.test(msg.process || '') ||
        history.origin !== 'https://sei.rj.gov.br' ||
        history.pathname !== '/sei/controlador.php' ||
        history.searchParams.get('acao') !== 'procedimento_consultar_historico' ||
        history.searchParams.get('id_procedimento') !== msg.process ||
        history.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId
      )
        throw Error('Andamento do processo inválido.');
      // Most recent first, at most 300 processes per user and block.
      list = [[msg.process, history.href, Date.now()], ...list.filter(([process]) => process !== msg.process)].slice(
        0,
        300,
      );
      stored[owner] = list;
      await chrome.storage.session.set({ [processKey]: stored });
      return { ok: true, processes: list.length };
    }
    const all = await records(),
      owner = key(identity, block),
      record = all[owner] || { cursor: null, events: [] };
    // Quiet syncs leave the store untouched; only write when the serialized records differ.
    let stored = JSON.stringify(all);
    const persist = async () => {
      const next = JSON.stringify(all);
      if (next === stored) return;
      await chrome.storage.local.set({ [storageKey]: all });
      stored = next;
    };
    all[owner] = record;
    if (msg.type === 'signature:ack') {
      await seiCompletedSignatures.ack(identity, block);
      return { ...view(record), events: [] };
    }
    if (msg.type === 'signature:progress') {
      const scans = (await chrome.storage.session.get(scanKey))[scanKey] || {};
      if (scans[owner]?.tab === sender.tab.id && scans[owner].until > Date.now()) {
        scans[owner].until = Date.now() + 180000;
        await chrome.storage.session.set({ [scanKey]: scans });
      }
      return { ok: true };
    }
    if (msg.type === 'signature:done') {
      const scans = (await chrome.storage.session.get(scanKey))[scanKey] || {};
      if (scans[owner]?.tab === sender.tab.id) {
        scans[owner].until = 0;
        globalThis.seiActivity?.report('signature:' + owner);
        await chrome.storage.session.set({ [scanKey]: scans });
      }
      return { ok: true };
    }
    if (msg.type === 'signature:observe') {
      if (!Array.isArray(msg.observations) || msg.observations.length > 200) throw Error('Observações inválidas.');
      recentSync.clear();
      await request(block, 'observe', { actor: identity, observations: msg.observations });
      return { ok: true };
    }
    let scan = false;
    try {
      let response = recentSync.get(owner);
      if (!response) {
        response = await request(block, 'sync', { actor: identity, after: record.cursor });
        recentSync.set(owner, response);
      }
      if (
        !Number.isSafeInteger(response.cursor) ||
        response.cursor < 0 ||
        !Array.isArray(response.events) ||
        response.events.length > 100 ||
        !Array.isArray(response.members)
      )
        throw Error('Resposta de assinaturas inválida.');
      const events = response.events;
      for (const e of events)
        if (
          !Number.isSafeInteger(e.id) ||
          !/^\d{1,30}$/.test(e.document) ||
          !/^\d{1,30}$/.test(e.process) ||
          typeof e.signer?.login !== 'string' ||
          typeof e.signer?.name !== 'string' ||
          !Number.isSafeInteger(e.signedAt)
        )
          throw Error('Assinatura compartilhada inválida.');
      const within = (e, window) => Date.now() - e.signedAt <= window;
      const pending = new Map(record.events.filter((e) => within(e, panelWindow)).map((e) => [e.id, e]));
      const arrived = events.filter(
        (e) => within(e, alertWindow) && !pending.has(e.id) && e.id > (record.cursor ?? response.cursor),
      );
      for (const event of arrived) pending.set(event.id, event);
      record.events = [...pending.values()];
      record.cursor = response.cursor;
      record.members = response.members;
      record.error = '';
      // Persist the cursor before audio/notifications so retries cannot replay the sound.
      await persist();
      if (arrived.length) {
        record.notificationError = '';
        try {
          await chrome.notifications.create(`sei-signed:${owner}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('monitor-icon.png'),
            title: `${arrived.length} ${arrived.length === 1 ? 'assinatura confirmada' : 'assinaturas confirmadas'} · bloco ${block}`,
            message: arrived
              .slice(0, 3)
              .map(
                (e) =>
                  `Documento ${e.number || e.document} assinado por ${e.signer.name || e.signer.login} (${e.signer.login})`,
              )
              .join('\n'),
            priority: 1,
          });
        } catch {
          record.notificationError = 'Notificação de assinatura indisponível; consulte o painel do SEI.';
        }
        const settings = (await chrome.storage.local.get('seiBlockAlerts')).seiBlockAlerts;
        if (settings?.sound !== false)
          try {
            await seiPlayAlertSound('assinar');
          } catch (e) {
            record.notificationError = `Som de assinatura indisponível: ${e.message}`;
          }
      }
      if (msg.poll) {
        const scans = (await chrome.storage.session.get(scanKey))[scanKey] || {};
        if (
          (globalThis.seiActivity
            ? seiActivity.due('signature:' + owner, scans[owner]?.started)
            : Date.now() - (scans[owner]?.started || 0) >= 55000) &&
          (scans[owner]?.until || 0) <= Date.now()
        ) {
          scan = true;
          scans[owner] = { started: Date.now(), until: Date.now() + 180000, tab: sender.tab.id };
          await chrome.storage.session.set({ [scanKey]: scans });
        }
      }
    } catch (e) {
      record.error = e.message;
    }
    await persist();
    return { ...view(record), scan };
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (
      ![
        'signature:sync',
        'signature:observe',
        'signature:ack',
        'signature:done',
        'signature:progress',
        'signature:remember',
        'signature:processes',
        'signature:waiting',
      ].includes(msg?.type)
    )
      return;
    const operation = serial(() => handle(msg, sender));
    operation.then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
  chrome.notifications.onClicked.addListener((id) => {
    if (!id.startsWith('sei-signed:')) return;
    (async () => {
      const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
      for (const tab of tabs) {
        try {
          const scope = await chrome.tabs.sendMessage(tab.id, { type: 'scope:who' }, { frameId: 0 });
          if (scope?.identity && `sei-signed:${key(scope.identity, scope.block)}` === id) {
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
            await chrome.tabs.sendMessage(tab.id, { type: 'monitor:open' }, { frameId: 0 });
            return;
          }
        } catch {}
      }
      await chrome.runtime.openOptionsPage();
    })().catch(() => {});
  });
})();
