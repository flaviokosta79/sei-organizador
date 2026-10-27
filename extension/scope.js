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
  globalThis.seiWorkScope = state;
  let busy = false,
    last = '',
    notice;
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
    if (action === 'bloco_interno_listar')
      return [...document.querySelectorAll('a[href*="id_bloco="]')]
        .flatMap((link) => {
          try {
            const url = new URL(link.getAttribute('href'), location.href);
            const id = url.searchParams.get('id_bloco');
            const row = link.closest('tr');
            return url.searchParams.get('acao') === 'rel_bloco_protocolo_listar' && /^\d{1,30}$/.test(id || '')
              ? [{ id, name: (row?.cells[4]?.textContent?.trim() || `Bloco ${id}`).slice(0, 150) }]
              : [];
          } catch {
            return [];
          }
        })
        .slice(0, 200);
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
    if (!link) {
      await refresh(true);
      return;
    }
    const url = new URL(link.getAttribute('href'), location.href);
    if (
      url.origin !== location.origin ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('acao') !== 'bloco_interno_listar'
    )
      throw Error('Lista de blocos não reconhecida.');
    const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Não foi possível consultar os blocos do SEI.');
    const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
    const doc = new DOMParser().parseFromString(
      new TextDecoder(charset).decode(await response.arrayBuffer()),
      'text/html',
    );
    if (!doc.querySelector('#tblBlocos')) throw Error('Lista de blocos indisponível; verifique a sessão do SEI.');
    const found = [...doc.querySelectorAll('#tblBlocos a[href*="id_bloco="]')]
      .flatMap((link) => {
        try {
          const url = new URL(link.getAttribute('href'), location.href),
            id = url.searchParams.get('id_bloco');
          return url.searchParams.get('acao') === 'rel_bloco_protocolo_listar' && /^\d{1,30}$/.test(id || '')
            ? [{ id, name: (link.closest('tr')?.cells[4]?.textContent?.trim() || `Bloco ${id}`).slice(0, 150) }]
            : [];
        } catch {
          return [];
        }
      })
      .slice(0, 200);
    await send('scope:remember', { blocks: found, catalog: true });
    await refresh(true);
  }
  function banner() {
    const table = document.querySelector('#tblProtocolosBlocos');
    const block = new URL(location.href).searchParams.get('id_bloco');
    if (!table || !state.identity || state.allows(block)) {
      notice?.remove();
      return;
    }
    if (!notice?.isConnected) {
      notice = document.createElement('div');
      notice.style.cssText =
        'padding:10px;margin:8px 0;background:#eef5ff;border:1px solid #adc9eb;border-radius:4px;font:13px Arial;';
      notice.id = 'sei-work-scope-notice';
      const text = document.createElement('span'),
        button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Escolher bloco de trabalho';
      button.addEventListener('click', () => send('scope:open-options'));
      notice.append(text, ' ', button);
      table.before(notice);
    }
    const text = state.block
      ? `Organizador ativo somente no bloco ${state.block}. Esta página mantém os controles nativos do SEI.`
      : 'Identificando o bloco de trabalho do Organizador…';
    if (notice.firstChild.textContent !== text) notice.firstChild.textContent = text;
  }
  async function refresh(force = false) {
    const next = identity(),
      found = blocks(),
      key = JSON.stringify([next, found]);
    if (busy || (!force && key === last)) {
      banner();
      return;
    }
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
    } catch {
      state.block = null;
    } finally {
      busy = false;
      resolveReady();
      banner();
      if (previous !== state.block || previousIdentity !== JSON.stringify(next)) {
        const card = document.querySelector('#sei-organizador-documento');
        if (card) {
          card.dispatchEvent(new Event('sei-organizador:dispose-card'));
          card.remove();
        }
        window.dispatchEvent(new Event('sei-organizador:scope'));
        document.dispatchEvent(new Event('sei-organizador:restore-process'));
      }
      queueMicrotask(() => {
        if (JSON.stringify([identity(), blocks()]) !== last) refresh();
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
  const observer = new MutationObserver(() => refresh());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect());
  window.addEventListener('pageshow', () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    refresh(true);
  });
  refresh();
})();
