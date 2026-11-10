(() => {
  if (globalThis.seiWorkScope) return;
  let resolveReady;
  const state = {
    block: null,
    identity: null,
    catalog: [],
    ready: new Promise((resolve) => {
      resolveReady = resolve;
    }),
    allows: (block) => state.block !== null && state.block === block,
  };
  state.refreshCatalog = async () => {
    await catalog();
    return send('scope:get');
  };
  globalThis.seiWorkScope = state;
  let forceQueued = false,
    retries = 0,
    retryTimer;
  let busy = false,
    last = '';
  function identity() {
    try {
      const user = window.top.document.querySelector('#lnkUsuarioSistema');
      const m = user?.title.match(/^(.+?)\s*\(([^/()]+)\/([^()]+)\)$/);
      const unit = new URL(
        user?.getAttribute('href') || window.top.location.href,
        window.top.location.href,
      ).searchParams.get('infra_unidade_atual');
      if (m && unit === SEI_ORGANIZADOR_CONFIG.unitId && m[3] === SEI_ORGANIZADOR_CONFIG.org)
        return { unit, org: m[3], login: m[2].trim().toLowerCase(), name: m[1].trim() };
    } catch {}
    try {
      const user = window.opener?.top?.document.querySelector('#lnkUsuarioSistema');
      const m = user?.title.match(/^(.+?)\s*\(([^/()]+)\/([^()]+)\)$/);
      const unit = new URL(
        user?.getAttribute('href') || window.opener.top.location.href,
        window.opener.top.location.href,
      ).searchParams.get('infra_unidade_atual');
      if (m && unit === SEI_ORGANIZADOR_CONFIG.unitId && m[3] === SEI_ORGANIZADOR_CONFIG.org)
        return { unit, org: m[3], login: m[2].trim().toLowerCase(), name: m[1].trim() };
    } catch {}
    return null;
  }
  function catalogRows(doc) {
    const table = doc.querySelector('#tblBlocos');
    if (!table) return [];
    const header = [...table.rows].find((row) => row.querySelector('th'));
    const labels = header
      ? [...header.cells].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim().toLowerCase())
      : [];
    const groupIndex = labels.findIndex((label) => /^grupos?$/.test(label));
    const descriptionIndex = labels.findIndex((label) => label === 'descrição');
    const result = new Map();
    for (const link of table.querySelectorAll('a[href*="id_bloco="]')) {
      try {
        const url = new URL(link.getAttribute('href'), location.href),
          id = url.searchParams.get('id_bloco'),
          row = link.closest('tr');
        if (
          url.origin !== location.origin ||
          url.pathname !== '/sei/controlador.php' ||
          url.searchParams.get('acao') !== 'rel_bloco_protocolo_listar' ||
          !/^\d{1,30}$/.test(id || '')
        )
          continue;
        const clean = (index) => row?.cells[index]?.textContent.replace(/\s+/g, ' ').trim().slice(0, 150) || '';
        result.set(id, {
          id,
          name: descriptionIndex >= 0 ? clean(descriptionIndex) : 'Bloco ' + id,
          ...(groupIndex >= 0 ? { group: clean(groupIndex) } : {}),
        });
      } catch {}
    }
    return [...result.values()].slice(0, 200);
  }
  function blocks() {
    const url = new URL(location.href),
      action = url.searchParams.get('acao');
    if (
      action === 'rel_bloco_protocolo_listar' &&
      document.querySelector('#frmRelBlocoProtocoloLista') &&
      /Processos do Bloco Interno/i.test(document.title + ' ' + (document.querySelector('h1')?.textContent || ''))
    ) {
      const id = url.searchParams.get('id_bloco');
      return /^\d{1,30}$/.test(id || '')
        ? [{ id, name: (document.querySelector('#txtDescricao')?.value || `Bloco ${id}`).slice(0, 150) }]
        : [];
    }
    if (action === 'bloco_interno_listar') return catalogRows(document);
    return [];
  }
  async function send(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, identity: state.identity, ...extra });
    if (response?.error) throw Error(response.error);
    if (!response?.data) throw Error('Preferência de bloco indisponível');
    return response.data;
  }
  async function catalog() {
    const current = identity();
    if (!current) throw Error('Abra o SEI na unidade atendida.');
    state.identity = current;
    const link = document.querySelector('a[href*="acao=bloco_interno_listar"]');
    // Without the menu link nothing can be read: say so instead of reporting an updated list.
    if (!link)
      throw Error('Menu de Blocos Internos não encontrado nesta tela. Abra o Controle de Processos e tente de novo.');
    const url = new URL(link.getAttribute('href'), location.href);
    if (
      url.origin !== location.origin ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('acao') !== 'bloco_interno_listar'
    )
      throw Error('Lista de blocos não reconhecida.');
    // Paced like the other background reads when the page has pace.js (top frame).
    const init = { credentials: 'same-origin', redirect: 'error' };
    const response = globalThis.seiPacedFetch
      ? await seiPacedFetch(url, { ...init, timeout: 15000 })
      : await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Não foi possível consultar os blocos do SEI.');
    const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
    const doc = new DOMParser().parseFromString(
      new TextDecoder(charset).decode(await response.arrayBuffer()),
      'text/html',
    );
    if (!doc.querySelector('#tblBlocos')) throw Error('Lista de blocos indisponível; verifique a sessão do SEI.');
    const found = catalogRows(doc);
    await send('scope:remember', { blocks: found, catalog: true });
    await refresh(true);
  }
  async function refresh(force = false) {
    const next = identity(),
      found = blocks(),
      key = JSON.stringify([next, found]);
    if (busy) {
      // A forced refresh (block changed elsewhere) must run after the current one, not be dropped.
      if (force) forceQueued = true;
      return;
    }
    if (!force && key === last) return;
    busy = true;
    last = key;
    const previousIdentity = JSON.stringify(state.identity);
    state.identity = next;
    const previous = state.block;
    try {
      const pref = next
        ? await send(found.length ? 'scope:remember' : 'scope:get', found.length ? { blocks: found } : {})
        : { block: null, catalog: [] };
      state.block = pref.block;
      state.catalog = pref.catalog;
      retries = 0;
    } catch {
      state.block = null;
      if (next && retries < 3) {
        retries++;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => refresh(true), 2000 * retries);
      }
    } finally {
      busy = false;
      resolveReady();
      if (previous !== state.block || previousIdentity !== JSON.stringify(next)) {
        const own = globalThis.seiOwnCard,
          card = own?.host?.isConnected ? own.host : null;
        if (card) {
          card.dispatchEvent(new Event('sei-organizador:dispose-card'));
          card.remove();
        }
        window.dispatchEvent(new Event('sei-organizador:scope'));
        if (card && own.redraw) own.redraw();
        else document.dispatchEvent(new Event('sei-organizador:restore-process'));
      }
      queueMicrotask(() => {
        if (forceQueued) {
          forceQueued = false;
          refresh(true);
        } else if (JSON.stringify([identity(), blocks()]) !== last) refresh();
      });
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'scope:changed') refresh(true);
    if (msg?.type === 'scope:who') reply({ identity: state.identity, block: state.block });
    if (msg?.type === 'scope:catalog-request') {
      catalog().then(
        () => reply({ ok: true }),
        (error) => reply({ error: error.message }),
      );
      return true;
    }
  });
  // Many DOM updates arrive while SEI builds a page; read identity/catalog once per burst.
  let refreshTimer;
  const observer = new MutationObserver(() => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 50);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => {
    clearTimeout(retryTimer);
    observer.disconnect();
    clearTimeout(refreshTimer);
    refreshTimer = null;
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    observer.observe(document.documentElement, { childList: true, subtree: true });
    refresh(true);
  });
  refresh();
})();
