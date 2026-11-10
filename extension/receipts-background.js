// Receipt is confirmed by the SEI's list, never by opening an alert or marking it as seen.
(() => {
  const localKey = 'seiSecretariatReceipts',
    sessionKey = 'seiSecretariatReceiptTargets';
  const ownerKey = (identity) => `${identity.unit}:${identity.org}:${identity.login.trim().toLowerCase()}`;
  const maxObservationAge = 90000;
  // A snapshot is fresh while no cycle could have been expected yet (cycles wait for navigation
  // and slow down with a slow SEI), plus 90 s for the cycle itself.
  const observationLimit = (owner) =>
    globalThis.seiActivity
      ? Math.max(maxObservationAge, seiActivity.longestGap('receipts:' + owner) + maxObservationAge)
      : maxObservationAge;
  const serial = seiCreateQueue();
  // Each SEI page load syncs the receipts: the shared list is reused for 20 s (a receipt confirmed by a
  // colleague shows up at most 20 s later). A reading sent by this browser clears it, and a reading
  // about to start always asks again, so it never starts from an old version.
  const recent = seiFreshCache(20000);
  function address(value, process) {
    const url = new URL(value);
    if (
      url.origin !== 'https://sei.rj.gov.br' ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId ||
      (process
        ? url.searchParams.get('acao') !== 'procedimento_trabalhar' ||
          url.searchParams.get('id_procedimento') !== process
        : url.searchParams.get('acao') !== 'procedimento_controlar')
    )
      throw Error('Endereço de recebimento inválido.');
    return url.href;
  }
  async function load() {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(localKey),
      chrome.storage.session.get(sessionKey),
    ]);
    const data = { local: local[localKey] || {}, session: session[sessionKey] || {} };
    data.stored = { local: JSON.stringify(data.local), session: JSON.stringify(data.session) };
    return data;
  }
  // Writes only the areas that changed; tab navigation and quiet polls usually change nothing.
  async function save(data) {
    const local = JSON.stringify(data.local),
      session = JSON.stringify(data.session),
      writes = [];
    if (local !== data.stored?.local) writes.push(chrome.storage.local.set({ [localKey]: data.local }));
    if (session !== data.stored?.session) writes.push(chrome.storage.session.set({ [sessionKey]: data.session }));
    await Promise.all(writes);
    data.stored = { local, session };
  }
  async function shared(body) {
    if (body) recent.clear();
    const response = await seiServiceFetch('secretariat/receipts', { body, timeout: 15000 });
    if (!response.ok)
      throw Error(
        response.status === 409
          ? 'Consulta de recebidos substituída; aguardando próxima leitura.'
          : `Recebidos sem sincronização (HTTP ${response.status}).`,
      );
    return response.json();
  }
  function apply(record, state, maxAge = maxObservationAge) {
    // A lower version twice in a row means the service was restored from a backup: start again from
    // its state, without alerts, instead of rejecting every reading from then on.
    if (Number.isSafeInteger(state?.version) && state.version >= 0 && state.version < record.version) {
      record.regressed = (record.regressed || 0) + 1;
      if (record.regressed < 2) throw Error('Resposta de recebidos inválida ou desatualizada.');
      record.version = state.version;
      record.known = null;
    }
    delete record.regressed;
    if (
      !Number.isSafeInteger(state.version) ||
      state.version < 0 ||
      state.version < record.version ||
      typeof state.initialized !== 'boolean' ||
      !Number.isSafeInteger(state.observed) ||
      state.observed < 0 ||
      !Array.isArray(state.pending) ||
      state.pending.length > 10000 ||
      !state.pending.every(
        (p) =>
          p &&
          /^\d{1,30}$/.test(p.id) &&
          typeof p.number === 'string' &&
          p.number.length <= 100 &&
          typeof p.token === 'string' &&
          p.token.length <= 100 &&
          !!p.token &&
          typeof p.baseline === 'boolean',
      ) ||
      new Set(state.pending.map((p) => p.id)).size !== state.pending.length
    )
      throw Error('Resposta de recebidos inválida ou desatualizada.');
    const age = Date.now() - state.observed;
    const fresh = state.initialized && state.observed > 0 && age >= -30000 && age <= maxAge;
    const known = new Set(record.known || []);
    const arrived =
      !fresh || record.known === null ? [] : state.pending.filter((p) => !p.baseline && !known.has(p.token));
    // A stale snapshot is display-only. Keep unseen tokens eligible for a later fresh confirmation.
    if (state.initialized && (fresh || record.known === null)) record.known = state.pending.map((p) => p.token);
    record.stale = state.initialized && !fresh;
    record.pending = state.pending;
    record.version = state.version;
    record.checked = state.observed;
    record.initialized = state.initialized;
    return arrived;
  }
  function view(record, target) {
    return {
      pending: record.pending.map((p) => ({ ...p, url: target?.links?.[p.id] || target?.url || null })),
      checked: record.checked || null,
      initialized: !!record.initialized,
      stale: !!record.stale,
      error: record.error || '',
      notificationError: record.notificationError || '',
      soundError: record.soundError || '',
      url: target?.url || null,
    };
  }
  async function notify(record, arrived, owner, data) {
    if (!arrived.length) return;
    record.notificationError = '';
    record.soundError = '';
    try {
      await chrome.notifications.create(`sei-receipt:${owner}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('monitor-icon.png'),
        title: `Secretaria · ${arrived.length} ${arrived.length === 1 ? 'novo processo para receber' : 'novos processos para receber'}`,
        message:
          arrived
            .slice(0, 3)
            .map((p) => p.number)
            .join('\n') + (arrived.length > 3 ? `\nE mais ${arrived.length - 3}.` : ''),
        contextMessage: 'Controle de Processos · aguardando recebimento na unidade',
        priority: 1,
      });
    } catch {
      record.notificationError = 'Notificação da Secretaria indisponível; consulte o painel do SEI.';
    }
    const settings = (await chrome.storage.local.get('seiBlockAlerts')).seiBlockAlerts;
    if (settings?.sound !== false)
      try {
        await seiPlayAlertSound('novosei');
      } catch (e) {
        record.soundError = `Som da Secretaria indisponível: ${e.message}`;
      }
    await save(data);
  }
  globalThis.seiSecretariatReceipts = {
    async pendingCount(owner, block) {
      if (block !== '1396') return 0;
      return (await load()).local[owner]?.pending?.length || 0;
    },
  };
  async function handle(msg, sender) {
    const from = new URL(sender.tab?.url || 'about:blank'),
      identity = msg.identity;
    if (sender.frameId !== 0 || from.origin !== 'https://sei.rj.gov.br' || from.pathname !== '/sei/controlador.php')
      throw Error('Origem não permitida');
    if (
      identity?.unit !== SEI_ORGANIZADOR_CONFIG.unitId ||
      identity.org !== SEI_ORGANIZADOR_CONFIG.org ||
      typeof identity.login !== 'string' ||
      !identity.login.trim() ||
      identity.login.length > 100
    )
      throw Error('Usuário da Secretaria inválido.');
    await seiWorkScopeStore.requireBlock(identity, '1396');
    const data = await load(),
      owner = ownerKey(identity),
      record = data.local[owner] || { known: null, pending: [], version: 0 },
      target = data.session[owner] || { links: {}, lastPoll: 0 };
    data.local[owner] = record;
    data.session[owner] = target;
    if (msg.type === 'receipts:progress') {
      if (target.lease?.id === msg.lease && target.lease.tab === sender.tab.id && target.lease.until >= Date.now()) {
        target.lease.until = Date.now() + 180000;
        await save(data);
      }
      return view(record, target);
    }
    if (msg.type === 'receipts:done') {
      if (target.lease?.id === msg.lease && target.lease.tab === sender.tab.id) {
        delete target.lease;
        globalThis.seiActivity?.report('receipts:' + owner);
      }
      await save(data);
      return view(record, target);
    }
    if (msg.type === 'receipts:sync') {
      if (msg.url) target.url = address(msg.url);
      let poll = null;
      const due =
        msg.poll &&
        target.url &&
        (!target.lease || target.lease.until < Date.now()) &&
        (globalThis.seiActivity
          ? seiActivity.due('receipts:' + owner, target.lastPoll)
          : Date.now() - target.lastPoll >= 55000);
      try {
        const reused = due ? undefined : recent.get('state'),
          state = reused || (await shared());
        const arrived = apply(record, state, observationLimit(owner));
        // Kept only after it was accepted: a rejected answer must be asked again, not replayed.
        if (!reused) recent.set('state', state);
        record.error = record.stale
          ? 'Leitura de recebidos antiga; aguardando confirmação recente no SEI. Aviso sonoro suspenso.'
          : '';
        await save(data);
        await notify(record, arrived, owner, data);
        if (due) {
          poll = { id: crypto.randomUUID(), version: record.version, url: target.url };
          target.lease = { id: poll.id, version: poll.version, tab: sender.tab.id, until: Date.now() + 180000 };
          target.lastPoll = Date.now();
        }
        if (msg.poll && !target.url)
          record.error =
            'Abra uma tela do SEI com acesso ao Controle de Processos para iniciar os alertas da Secretaria.';
      } catch (e) {
        record.error = e.message;
      }
      await save(data);
      return { ...view(record, target), poll };
    }
    if (msg.type === 'receipts:result') {
      if (target.lease?.id !== msg.lease || target.lease.tab !== sender.tab.id || target.lease.until < Date.now())
        throw Error('Consulta de recebidos substituída.');
      if (msg.error) record.error = String(msg.error).slice(0, 240);
      else {
        if (
          msg.complete !== true ||
          !Array.isArray(msg.items) ||
          msg.items.length > 10000 ||
          !msg.items.every(
            (p) =>
              p &&
              /^\d{1,30}$/.test(p.id) &&
              typeof p.number === 'string' &&
              p.number.trim() &&
              p.number.length <= 100 &&
              typeof p.pending === 'boolean',
          ) ||
          new Set(msg.items.map((p) => p.id)).size !== msg.items.length
        )
          throw Error('Lista completa de recebidos inválida.');
        const links = {};
        for (const p of msg.items) if (p.pending) links[p.id] = address(p.url, p.id);
        const url = address(msg.url || target.url);
        try {
          const state = await shared({
            block: '1396',
            actor: identity,
            version: target.lease.version,
            complete: true,
            items: msg.items.map(({ id, number, pending }) => ({ id, number, pending })),
          });
          const arrived = apply(record, state, observationLimit(owner));
          target.url = url;
          target.links = links;
          record.error = '';
          await save(data);
          await notify(record, arrived, owner, data);
        } catch (e) {
          record.error = e.message;
        }
      }
      await save(data);
      return view(record, target);
    }
    throw Error('Mensagem de recebimento inválida.');
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!['receipts:sync', 'receipts:result', 'receipts:done', 'receipts:progress'].includes(msg?.type)) return;
    const operation = serial(() => handle(msg, sender));
    operation.then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
  chrome.notifications.onClicked.addListener((id) => {
    if (!id.startsWith('sei-receipt:')) return;
    (async () => {
      const target = (await load()).session[id.slice('sei-receipt:'.length)];
      if (target?.url) await chrome.tabs.create({ url: address(target.url) });
    })().catch(() => {});
  });
  const release = (id) => {
    serial(async () => {
      const data = await load();
      for (const target of Object.values(data.session)) if (target.lease?.tab === id) delete target.lease;
      await save(data);
    }).catch(() => {});
  };
  chrome.tabs.onRemoved.addListener(release);
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (change.status === 'loading') release(id);
  });
})();
