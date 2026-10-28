// Detect editor presence without reading text, values, clipboard or document contents.
(() => {
  if (globalThis.seiEditingInstalled) return;
  globalThis.seiEditingInstalled = true;
  const config = SEI_ORGANIZADOR_CONFIG;
  const editable = '[contenteditable="true"],textarea:not([readonly]):not([disabled])';
  const page = () => new URL(location.href);
  function context() {
    if (globalThis.seiWorkScope) {
      if (!seiWorkScope.block) return null;
      if (
        page().searchParams.get('acao') === 'rel_bloco_protocolo_listar' &&
        !seiWorkScope.allows(page().searchParams.get('id_bloco'))
      )
        return null;
    }
    const requestedUnit = page().searchParams.get('infra_unidade_atual');
    if (requestedUnit && requestedUnit !== config.unitId) return null;
    const candidates = [window];
    try {
      candidates.push(window.top);
    } catch {}
    try {
      if (window.opener && !window.opener.closed) candidates.push(window.opener, window.opener.top);
    } catch {}
    for (const source of candidates) {
      try {
        const user = source.document.querySelector('#lnkUsuarioSistema');
        const match = user?.title.match(/^(.+?)\s*\(([^/()]+)\/([^()]+)\)$/);
        const unit =
          new URL(user?.getAttribute('href') || source.location.href, source.location.href).searchParams.get(
            'infra_unidade_atual',
          ) || page().searchParams.get('infra_unidade_atual');
        if (match && unit === config.unitId && match[3] === config.org)
          return {
            unit,
            org: match[3],
            login: match[2].trim().toLowerCase(),
            name: match[1].trim(),
            block: globalThis.seiWorkScope?.block,
          };
      } catch {}
    }
    return null;
  }
  async function call(type, data) {
    const result = await chrome.runtime.sendMessage({ type, ...data });
    if (result?.error) throw new Error(result.error);
    if (!result?.data) throw new Error('Avisos de edição sem resposta.');
    return result.data;
  }
  let stopped = false,
    reporting = null,
    lastInput = null,
    lastSent = 0,
    sending = false,
    banner;
  const session = crypto.randomUUID(),
    hooked = new WeakSet();
  function editorDocuments() {
    const docs = [],
      visited = new Set();
    function visit(doc, depth = 0) {
      if (visited.has(doc) || depth > 4) return;
      visited.add(doc);
      docs.push(doc);
      for (const frame of doc.querySelectorAll('iframe')) {
        try {
          if (frame.contentDocument) visit(frame.contentDocument, depth + 1);
        } catch {}
        if (!hooked.has(frame)) {
          hooked.add(frame);
          frame.addEventListener('load', scanEditor);
        }
      }
    }
    visit(document);
    return docs;
  }
  function editorOwner() {
    const url = page();
    if (
      url.searchParams.get('acao') !== 'editor_montar' ||
      url.searchParams.get('infra_unidade_atual') !== config.unitId
    )
      return false;
    try {
      if (window.parent !== window && new URL(window.parent.location.href).searchParams.get('acao') === 'editor_montar')
        return false;
    } catch {}
    return (
      /^\d{1,30}$/.test(url.searchParams.get('id_procedimento') || '') &&
      /^\d{1,30}$/.test(url.searchParams.get('id_documento') || '')
    );
  }
  function number() {
    const own = document.title.match(/ - (\d{1,30}) - /)?.[1];
    if (own) return own;
    try {
      const source = window.opener?.top?.document.querySelector('#ifrArvore')?.contentDocument;
      if (source && globalThis.seiDocumentData) {
        const tree = seiDocumentData.parseTree([...source.scripts].map((script) => script.textContent).join('\n'));
        const protocol = tree.document(page().searchParams.get('id_documento'))?.protocol;
        if (/^\d{1,30}$/.test(protocol || '')) return protocol;
      }
    } catch {}
    return '';
  }
  function showBanner(text, error = false) {
    if (!banner?.isConnected) {
      banner = document.createElement('div');
      banner.dataset.seiEditingBanner = '';
      banner.setAttribute('role', 'status');
      document.body.prepend(banner);
    }
    banner.style.cssText =
      'font:12px/1.5 Arial;padding:5px 10px;border-bottom:1px solid #b7cde4;background:' +
      (error ? '#fff2d6' : '#eef6ff') +
      ';color:#24445f;';
    if (banner.textContent !== text) banner.textContent = text;
  }
  async function release() {
    const old = reporting;
    reporting = null;
    banner?.remove();
    if (old) {
      try {
        await call('editing:heartbeat', { ...old, session, stop: true, activityAgeMs: null });
      } catch {}
    }
  }
  async function pulse() {
    if (stopped || sending || !reporting) return;
    const identity = context();
    if (
      !editorOwner() ||
      !identity ||
      identity.login !== reporting.identity.login ||
      identity.unit !== reporting.identity.unit ||
      identity.block !== reporting.identity.block
    ) {
      await release();
      return;
    }
    sending = true;
    lastSent = Date.now();
    const age = lastInput === null ? null : Date.now() - lastInput;
    try {
      await call('editing:heartbeat', {
        ...reporting,
        session,
        activityAgeMs: age !== null && age <= 60000 ? Math.max(0, age) : null,
      });
      if (reporting && !stopped)
        showBanner(
          age !== null && age < 60000
            ? '✏️ Edição recente informada aos colegas.'
            : '✏️ Editor aberto informado aos colegas.',
        );
    } catch {
      if (reporting && !stopped)
        showBanner('Aviso de edição sem conexão; os colegas podem não ver sua presença.', true);
    } finally {
      sending = false;
    }
  }
  function scanEditor() {
    if (stopped) return;
    if (!editorOwner()) {
      if (reporting) release();
      return;
    }
    const identity = context();
    if (!identity) {
      if (reporting) release();
      return;
    }
    let found = false;
    for (const doc of editorDocuments()) {
      if (doc.querySelector(editable) || doc.designMode === 'on') found = true;
      if (!hooked.has(doc)) {
        hooked.add(doc);
        doc.addEventListener(
          'input',
          (event) => {
            if (!reporting || !(doc.designMode === 'on' || event.target?.closest?.(editable))) return;
            lastInput = Date.now();
            if (Date.now() - lastSent >= 5000) pulse();
          },
          true,
        );
      }
    }
    if (found && !reporting) {
      reporting = {
        identity,
        process: page().searchParams.get('id_procedimento'),
        document: page().searchParams.get('id_documento'),
        number: number(),
      };
      lastInput = null;
      pulse();
    } else if (!found && reporting) release();
  }
  let cached = null,
    receivedAt = 0,
    error = '',
    busy = false,
    targetKey = '',
    timer,
    scheduled;
  function targets() {
    const rows = [...document.querySelectorAll('#tblProtocolosBlocos tr')].flatMap((row) => {
      const link = row.querySelector('a[href*="id_procedimento="]');
      if (!link) return [];
      try {
        const id = new URL(link.getAttribute('href'), location.href).searchParams.get('id_procedimento');
        return /^\d{1,30}$/.test(id || '') ? [{ id, cell: link.closest('td') }] : [];
      } catch {
        return [];
      }
    });
    const host = document.querySelector('#sei-organizador-documento');
    const process = host?.dataset.process;
    return {
      rows,
      host,
      ids: [...new Set([...rows.map((r) => r.id), ...(/^\d{1,30}$/.test(process || '') ? [process] : [])])],
    };
  }
  function description(entry, now) {
    const actor = entry.actor,
      who = actor.name ? `${actor.name} (${actor.login})` : actor.login;
    const doc = entry.number ? `documento nº ${entry.number}` : `documento (ID ${entry.document})`;
    const recent = entry.activityAt !== null && now - entry.activityAt < 60000;
    const age = recent ? ` · atividade há ${Math.max(0, Math.floor((now - entry.activityAt) / 1000))} s` : '';
    return `✏️ ${who} · ${recent ? 'edição recente' : 'editor aberto'} · ${doc}${age}`;
  }
  function paint() {
    const { rows, host } = targets(),
      identity = context();
    const now = cached ? cached.serverTime + (Date.now() - receivedAt) : Date.now();
    const entries = identity ? (cached?.entries || []).filter((entry) => entry.expiresAt > now) : [];
    for (const { id, cell } of rows) {
      if (!cell) continue;
      const items = entries.filter((e) => e.process === id),
        text = items.map((e) => description(e, now)).join('\n');
      let label = cell.querySelector('.so-editing-presence');
      if (!text) {
        label?.remove();
        continue;
      }
      if (!label) {
        label = document.createElement('span');
        label.className = 'so-editing-presence';
        label.style.cssText =
          'display:block;font:11px/1.45 Arial;color:#714900;background:#fff5d9;border-radius:3px;padding:3px 5px;margin-top:4px;white-space:pre-line;overflow-wrap:anywhere;';
        label.setAttribute('role', 'status');
        cell.append(label);
      }
      const visible = text + (error ? '\nÚltima consulta; sincronização indisponível.' : '');
      if (label.textContent !== visible) label.textContent = visible;
    }
    const root = host?.shadowRoot,
      list = root?.querySelector('ul');
    if (!list) return;
    if (!identity) {
      root.querySelector('.editing-presence')?.remove();
      return;
    }
    const items = entries.filter((e) => e.process === host.dataset.process),
      text = items.map((e) => description(e, now)).join('\n');
    let panel = root.querySelector('.editing-presence');
    if (!text && !error) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('li');
      panel.className = 'editing-presence';
      panel.style.cssText = 'border-color:#dfc277;background:#fff8e5;';
      const label = document.createElement('b');
      label.textContent = 'Edição de documentos';
      const value = document.createElement('div');
      value.style.cssText = 'white-space:pre-line;';
      value.setAttribute('role', 'status');
      panel.append(label, value);
      list.insertBefore(panel, list.querySelector('.activity-section,.arrival-section,.type-section'));
    }
    const visible =
      text +
      (error
        ? text
          ? '\nÚltima consulta; sincronização indisponível.'
          : 'Não foi possível confirmar editores abertos.'
        : '');
    if (panel.lastElementChild.textContent !== visible) panel.lastElementChild.textContent = visible;
  }
  async function refresh() {
    if (stopped || busy) return;
    const identity = context(),
      { ids } = targets();
    if (!identity || !ids.length) {
      cached = null;
      paint();
      return;
    }
    if (document.hidden) {
      paint();
      return;
    }
    busy = true;
    const key = JSON.stringify([identity, ids]);
    targetKey = key;
    try {
      const entries = [];
      let serverTime = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const response = await call('editing:query', { identity, processIds: ids.slice(i, i + 500) });
        if (!Array.isArray(response.entries) || !Number.isFinite(response.serverTime)) throw Error('Resposta inválida');
        entries.push(...response.entries);
        serverTime = response.serverTime;
      }
      if (stopped || JSON.stringify([context(), targets().ids]) !== key) return;
      cached = { entries, serverTime };
      receivedAt = Date.now();
      error = '';
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
      if (!stopped) paint();
    }
  }
  function scan() {
    if (stopped) return;
    scanEditor();
    const identity = context(),
      { ids } = targets();
    if (!identity) {
      cached = null;
      paint();
      return;
    }
    const key = JSON.stringify([identity, ids]);
    paint();
    if (ids.length && key !== targetKey && !busy) {
      targetKey = key;
      clearTimeout(scheduled);
      scheduled = setTimeout(refresh, 100);
    }
  }
  let scanTimer;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 50);
  });
  const start = () => {
    stopped = false;
    observer.observe(document.documentElement, { childList: true, subtree: true });
    clearInterval(timer);
    timer = setInterval(() => {
      scanEditor();
      pulse();
      refresh();
    }, 20000);
    scan();
  };
  window.addEventListener('pagehide', () => {
    stopped = true;
    observer.disconnect();
    clearTimeout(scheduled);
    clearTimeout(scanTimer);
    scanTimer = null;
    clearInterval(timer);
    release();
  });
  window.addEventListener('pageshow', start);
  window.addEventListener('sei-organizador:scope', async () => {
    cached = null;
    targetKey = '';
    await release();
    scan();
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      scanEditor();
      pulse();
      refresh();
    }
  });
  start();
})();
