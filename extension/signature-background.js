// Each browser keeps its own acknowledgement; events are shared by the selected internal block.
(() => {
  const storageKey = 'seiCompletedSignatures',
    scanKey = 'seiSignatureScans';
  let queue = Promise.resolve();
  const key = (identity, block) => `${identity.unit}:${identity.org}:${identity.login.trim().toLowerCase()}:${block}`;
  async function records() {
    return (await chrome.storage.local.get(storageKey))[storageKey] || {};
  }
  async function request(block, action, body) {
    const response = await fetch(
      new URL(
        `/v1/units/${SEI_ORGANIZADOR_CONFIG.unitId}/blocks/${block}/signatures/${action}`,
        SEI_ORGANIZADOR_CONFIG.serviceUrl,
      ),
      {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
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
    if (
      !/^\d{1,30}$/.test(block || '') ||
      !identity ||
      identity.unit !== SEI_ORGANIZADOR_CONFIG.unitId ||
      identity.org !== SEI_ORGANIZADOR_CONFIG.org ||
      typeof identity.login !== 'string' ||
      !identity.login.trim() ||
      identity.login.length > 100
    )
      throw Error('Usuário ou bloco inválido.');
    await seiWorkScopeStore.requireBlock(identity, block);
    const all = await records(),
      owner = key(identity, block),
      record = all[owner] || { cursor: null, events: [] };
    all[owner] = record;
    if (msg.type === 'signature:ack') {
      await seiCompletedSignatures.ack(identity, block);
      return { ...view(record), events: [] };
    }
    if (msg.type === 'signature:done') {
      const scans = (await chrome.storage.session.get(scanKey))[scanKey] || {};
      if (scans[owner]?.tab === sender.tab.id) {
        scans[owner].until = 0;
        await chrome.storage.session.set({ [scanKey]: scans });
      }
      return { ok: true };
    }
    if (msg.type === 'signature:observe') {
      if (!Array.isArray(msg.observations) || msg.observations.length > 200) throw Error('Observações inválidas.');
      await request(block, 'observe', { actor: identity, observations: msg.observations });
      return { ok: true };
    }
    let scan = false;
    try {
      const response = await request(block, 'sync', { actor: identity, after: record.cursor });
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
      const pending = new Map(record.events.map((e) => [e.id, e]));
      const arrived = events.filter((e) => !pending.has(e.id) && e.id > (record.cursor ?? response.cursor));
      for (const event of arrived) pending.set(event.id, event);
      record.events = [...pending.values()];
      record.cursor = response.cursor;
      record.members = response.members;
      record.error = '';
      // Persist the cursor before audio/notifications so retries cannot replay the sound.
      await chrome.storage.local.set({ [storageKey]: all });
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
        if (Date.now() - (scans[owner]?.started || 0) >= 55000 && (scans[owner]?.until || 0) <= Date.now()) {
          scan = true;
          scans[owner] = { started: Date.now(), until: Date.now() + 120000, tab: sender.tab.id };
          await chrome.storage.session.set({ [scanKey]: scans });
        }
      }
    } catch (e) {
      record.error = e.message;
    }
    await chrome.storage.local.set({ [storageKey]: all });
    return { ...view(record), scan };
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!['signature:sync', 'signature:observe', 'signature:ack', 'signature:done'].includes(msg?.type)) return;
    const operation = queue.then(() => handle(msg, sender));
    queue = operation.catch(() => {});
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
