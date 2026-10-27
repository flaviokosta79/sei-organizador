// One poller per user, even with several SEI tabs. Authenticated links live only in session storage.
(() => {
  const alarm = 'sei-block-monitor',
    localKey = 'seiBlockAlerts',
    sessionKey = 'seiBlockTargets';
  let queue = Promise.resolve();
  const serial = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const identityKey = (identity) => `${identity.unit}:${identity.org}:${identity.login.trim().toLowerCase()}`;
  const chiefKey = `${SEI_ORGANIZADOR_CONFIG.unitId}:${SEI_ORGANIZADOR_CONFIG.org}`;
  const chiefs = (data) => data.local.chiefs?.[chiefKey] || [];
  const eligible = (data, owner) => chiefs(data).some((login) => owner === `${chiefKey}:${login}`);
  const validUrl = (value, block) => {
    const url = new URL(value);
    if (
      url.origin !== 'https://sei.rj.gov.br' ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('acao') !== 'rel_bloco_protocolo_listar' ||
      url.searchParams.get('id_bloco') !== block ||
      url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId
    )
      throw new Error('Bloco inválido');
    return url.href;
  };
  async function load() {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(localKey),
      chrome.storage.session.get(sessionKey),
    ]);
    return {
      local: local[localKey] || { sound: true, records: {} },
      session: session[sessionKey] || { targets: {}, leases: {}, lastPoll: {} },
    };
  }
  async function save(data, owner) {
    await Promise.all([
      chrome.storage.local.set({ [localKey]: data.local }),
      chrome.storage.session.set({ [sessionKey]: data.session }),
    ]);
    const count = Object.entries(data.session.targets)
      .filter(([, target]) => target.owner === owner)
      .reduce(
        (sum, [key]) =>
          sum +
          (data.local.records[key]?.pending.length || 0) +
          (eligible(data, owner) ? data.local.records[key]?.signPending?.length || 0 : 0),
        0,
      );
    await chrome.action.setBadgeText({ text: count ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  }
  async function sound(soundId) {
    const url = chrome.runtime.getURL('monitor-audio.html');
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
    if (!contexts.length)
      await chrome.offscreen.createDocument({
        url: 'monitor-audio.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Tocar aviso curto de novos processos nos blocos internos monitorados.',
      });
    let ready = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        ready = (await chrome.runtime.sendMessage({ type: 'monitor:audio-ready' }))?.ready === true;
      } catch {}
      if (ready) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!ready) throw new Error('O reprodutor do aviso não respondeu. Recarregue a extensão e o SEI.');
    const result = await chrome.runtime.sendMessage({ type: 'monitor:audio', soundId });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível reproduzir o som.');
  }
  const view = (data, owner) => ({
    sound: data.local.sound,
    chiefLogins: chiefs(data),
    chiefEligible: eligible(data, owner),
    soundError: data.local.soundError || '',
    soundPlayedAt: data.local.soundPlayedAt || null,
    records: Object.entries(data.session.targets)
      .filter(([, t]) => t.owner === owner)
      .map(([key, t]) => {
        const r = data.local.records[key];
        return {
          block: t.block,
          name: t.name,
          url: t.url,
          pending: (r?.pending || []).map((p) => ({ ...p, url: t.links?.[p.id] || t.url })),
          signPending: (eligible(data, owner) ? r?.signPending || [] : []).map((p) => ({
            ...p,
            url: t.links?.[p.id] || t.url,
          })),
          signError: r?.signError || '',
          signNotificationError: r?.signNotificationError || '',
          checked: r?.checked,
          error: r?.error || '',
          notificationError: r?.notificationError || '',
        };
      }),
  });
  async function handle(msg, sender) {
    const from = new URL(sender.tab?.url || 'about:blank');
    if (from.origin !== 'https://sei.rj.gov.br' || from.pathname !== '/sei/controlador.php' || sender.frameId !== 0)
      throw new Error('Origem não permitida');
    const identity = msg.identity;
    if (
      identity?.unit !== SEI_ORGANIZADOR_CONFIG.unitId ||
      identity.org !== SEI_ORGANIZADOR_CONFIG.org ||
      typeof identity.login !== 'string' ||
      !identity.login.trim() ||
      identity.login.length > 100
    )
      throw new Error('Unidade ou usuário inválido');
    const owner = identityKey(identity),
      data = await load();
    if (msg.type === 'monitor:sync') {
      const registration = msg.registration;
      if (registration) {
        if (!/^\d{1,30}$/.test(registration.block)) throw new Error('Bloco inválido');
        const key = `${owner}:${registration.block}`;
        if (
          !data.session.targets[key] &&
          Object.values(data.session.targets).filter((t) => t.owner === owner).length >= 20
        )
          throw new Error('Limite de 20 blocos monitorados nesta sessão.');
        data.session.targets[key] = {
          ...data.session.targets[key],
          owner,
          block: registration.block,
          name: String(registration.name || registration.block).slice(0, 120),
          url: validUrl(registration.url, registration.block),
        };
      }
      const targets = Object.values(data.session.targets).filter((t) => t.owner === owner);
      const lease = data.session.leases[owner],
        now = Date.now();
      let poll = null;
      if (
        msg.poll &&
        targets.length &&
        (!lease || lease.until < now) &&
        (msg.force || now - (data.session.lastPoll[owner] || 0) >= 55000)
      ) {
        poll = { id: crypto.randomUUID(), targets: targets.map(({ block, url }) => ({ block, url })) };
        data.session.leases[owner] = { id: poll.id, tab: sender.tab.id, until: now + 180000 };
        data.session.lastPoll[owner] = now;
      }
      await save(data, owner);
      return { ...view(data, owner), poll };
    }
    if (msg.type === 'monitor:done') {
      const lease = data.session.leases[owner];
      if (lease?.id === msg.lease && lease.tab === sender.tab.id) delete data.session.leases[owner];
    } else if (msg.type === 'monitor:result') {
      const lease = data.session.leases[owner],
        key = `${owner}:${msg.block}`,
        target = data.session.targets[key];
      if (!target || lease?.id !== msg.lease || lease.tab !== sender.tab.id || lease.until < Date.now())
        throw new Error('Consulta substituída');
      lease.until = Date.now() + 180000;
      const record = data.local.records[key] || { seen: null, pending: [] };
      data.local.records[key] = record;
      if (msg.error) record.error = String(msg.error).slice(0, 240);
      else {
        if (
          !Array.isArray(msg.items) ||
          msg.items.length > 10000 ||
          !msg.items.every((p) => /^\d{1,30}$/.test(p.id) && typeof p.number === 'string' && p.number.length <= 100)
        )
          throw new Error('Lista inválida');
        const ids = msg.items.map((p) => p.id);
        if (new Set(ids).size !== ids.length) throw new Error('Lista duplicada');
        const previous = new Set(record.seen || []),
          arrived = record.seen === null ? [] : msg.items.filter((p) => !previous.has(p.id));
        const present = new Set(ids);
        const pending = new Map(record.pending.filter((p) => present.has(p.id)).map((p) => [p.id, p]));
        for (const p of arrived) pending.set(p.id, { id: p.id, number: p.number });
        record.seen = ids;
        record.pending = [...pending.values()];
        record.checked = Date.now();
        record.error = '';
        let signArrived = [];
        if (msg.organizer) {
          try {
            signArrived = seiSignAlerts.update(record, msg.organizer, msg.items, eligible(data, owner));
          } catch (e) {
            record.signError = e.message;
          }
        } else if (msg.organizerError) record.signError = String(msg.organizerError).slice(0, 240);
        const signIds = new Set((record.signPending || []).map((p) => p.id));
        target.links = {};
        for (const p of msg.items) {
          const link = new URL(p.url);
          if (
            link.origin !== 'https://sei.rj.gov.br' ||
            link.pathname !== '/sei/controlador.php' ||
            link.searchParams.get('id_procedimento') !== p.id
          )
            throw new Error('Link de processo inválido');
          if ((pending.has(p.id) || signIds.has(p.id)) && Object.keys(target.links).length < 200)
            target.links[p.id] = link.href;
        }
        if (msg.url) target.url = validUrl(msg.url, msg.block);
        if (arrived.length) {
          record.notificationError = '';
          try {
            await chrome.notifications.create(`sei-block:${key}`, {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('monitor-icon.png'),
              title: `${arrived.length} ${arrived.length === 1 ? 'novo processo' : 'novos processos'} · bloco ${target.block}`,
              message:
                arrived
                  .slice(0, 3)
                  .map((p) => p.number || p.id)
                  .join('\n') + (arrived.length > 3 ? `\nE mais ${arrived.length - 3}.` : ''),
              contextMessage: target.name,
              priority: 1,
            });
          } catch {
            record.notificationError = 'Notificação do sistema indisponível; consulte os alertas no SEI.';
          }
          if (data.local.sound)
            try {
              await sound('novosei');
              data.local.soundError = '';
              data.local.soundPlayedAt = Date.now();
            } catch (e) {
              data.local.soundError = `Som indisponível: ${e.message}`;
            }
        }
        if (signArrived.length) {
          record.signNotificationError = '';
          try {
            await chrome.notifications.create(`sei-sign:${key}`, {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('monitor-icon.png'),
              title: `${signArrived.length} ${signArrived.length === 1 ? 'processo para assinar' : 'processos para assinar'} · bloco ${target.block}`,
              message: signArrived
                .slice(0, 3)
                .map((p) => p.number || p.id)
                .join('\n'),
              contextMessage: target.name,
              priority: 1,
            });
          } catch {
            record.signNotificationError = 'Notificação de Assinar indisponível; consulte o painel.';
          }
          if (data.local.sound)
            try {
              await sound('assinar');
              data.local.soundError = '';
              data.local.soundPlayedAt = Date.now();
            } catch (e) {
              data.local.soundError = `Som indisponível: ${e.message}`;
            }
        }
      }
    } else if (msg.type === 'monitor:ack') {
      for (const [key, target] of Object.entries(data.session.targets))
        if (target.owner === owner && (!msg.block || msg.block === target.block)) {
          if (data.local.records[key]) {
            data.local.records[key].pending = [];
            data.local.records[key].signPending = [];
          }
          await chrome.notifications.clear(`sei-block:${key}`);
          await chrome.notifications.clear(`sei-sign:${key}`);
        }
    } else if (msg.type === 'monitor:sound') {
      if (msg.soundId !== undefined) {
        if (!seiAlertSounds.some((item) => item.id === msg.soundId)) throw new Error('Áudio inválido.');
      }
      if (typeof msg.enabled === 'boolean') data.local.sound = msg.enabled;
      if (!data.local.sound) data.local.soundError = '';
      if (msg.test) {
        try {
          await sound(msg.soundId || 'novosei');
          data.local.soundError = '';
          data.local.soundPlayedAt = Date.now();
        } catch (e) {
          data.local.soundError = `Som indisponível: ${e.message}`;
        }
      }
    } else if (msg.type === 'monitor:chiefs') {
      if (
        !Array.isArray(msg.logins) ||
        msg.logins.length > 50 ||
        !msg.logins.every((login) => typeof login === 'string' && /^[a-z0-9._-]{1,100}$/i.test(login))
      )
        throw new Error('Informe até 50 logins válidos do SEI, separados por vírgula ou por linha.');
      data.local.chiefs ??= {};
      data.local.chiefs[chiefKey] = [...new Set(msg.logins.map((login) => login.trim().toLowerCase()))];
      for (const [key, record] of Object.entries(data.local.records)) {
        const recordOwner = key.slice(0, key.lastIndexOf(':'));
        if (!eligible(data, recordOwner)) {
          record.signPending = [];
          await chrome.notifications.clear(`sei-sign:${key}`);
        }
      }
    } else throw new Error('Operação inválida');
    await save(data, owner);
    if (['monitor:result', 'monitor:ack', 'monitor:sound', 'monitor:chiefs'].includes(msg.type)) {
      const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
      await Promise.allSettled(
        tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'monitor:changed' }, { frameId: 0 })),
      );
    }
    return view(data, owner);
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (
      !['monitor:sync', 'monitor:result', 'monitor:done', 'monitor:ack', 'monitor:sound', 'monitor:chiefs'].includes(
        msg?.type,
      )
    )
      return;
    serial(() => handle(msg, sender)).then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
  const wake = async () => {
    const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
    await Promise.allSettled(
      tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'monitor:tick' }, { frameId: 0 })),
    );
  };
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === alarm) wake().catch(() => {});
  });
  chrome.alarms
    .get(alarm)
    .then((existing) => {
      if (!existing) return chrome.alarms.create(alarm, { periodInMinutes: 1 });
    })
    .catch(() => {});
  chrome.notifications.onClicked.addListener((id) => {
    if (!id.startsWith('sei-block:') && !id.startsWith('sei-sign:')) return;
    serial(async () => {
      const data = await load(),
        target = data.session.targets[id.slice(id.startsWith('sei-sign:') ? 'sei-sign:'.length : 'sei-block:'.length)];
      if (target) await chrome.tabs.create({ url: validUrl(target.url, target.block) });
    }).catch(() => {});
  });
  chrome.action.onClicked.addListener(async (tab) => {
    const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
    const target = tabs.find((t) => t.id === tab.id) || tabs[0];
    if (!target) return chrome.runtime.openOptionsPage();
    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
    await chrome.tabs.sendMessage(target.id, { type: 'monitor:open' }, { frameId: 0 }).catch(() => {});
  });
  const releaseTab = (id) =>
    serial(async () => {
      const data = await load();
      let changed = false;
      for (const [owner, lease] of Object.entries(data.session.leases))
        if (lease.tab === id) {
          delete data.session.leases[owner];
          changed = true;
        }
      if (changed) await chrome.storage.session.set({ [sessionKey]: data.session });
    }).catch(() => {});
  chrome.tabs.onRemoved.addListener(releaseTab);
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (change.status === 'loading') releaseTab(id);
  });
})();
