// Local suggestions only: no SEI requests, process visits or shared API writes. The catalog is read from
// the native assignment selector when the user opens it, and stays in this browser.
(() => {
  if (globalThis.seiUnitUsers) return;
  const key = 'seiUnitUsers';
  const config = globalThis.SEI_ORGANIZADOR_CONFIG;
  const matches = (identity) => identity?.unit === config?.unitId && identity?.org === config?.org;
  const valid = (users) =>
    Array.isArray(users) &&
    users.length > 0 &&
    users.length <= 1000 &&
    users.every(
      (user) =>
        user &&
        typeof user.login === 'string' &&
        /^[a-z0-9._-]{1,100}$/.test(user.login) &&
        typeof user.name === 'string' &&
        !!user.name.trim() &&
        user.name.length <= 150,
    ) &&
    new Set(users.map((user) => user.login)).size === users.length;
  function parse(doc) {
    const select = doc.querySelector('#selAtribuicao');
    if (!select) return [];
    const users = new Map();
    for (const option of select.options) {
      if (!/^\d{1,30}$/.test(option.value)) continue;
      const text = option.textContent.replace(/\s+/g, ' ').trim();
      const match = text.match(/^([a-z0-9._-]{1,100})\s+-\s+(.{1,150})$/i);
      if (!match) return [];
      const login = match[1].toLowerCase(),
        name = match[2].trim();
      if (users.has(login) && users.get(login).name !== name) return [];
      users.set(login, { login, name });
    }
    const result = [...users.values()];
    return valid(result) ? result : [];
  }
  async function list(identity) {
    if (!matches(identity)) return [];
    try {
      const saved = (await chrome.storage.local.get(key))[key];
      if (matches(saved) && valid(saved.users)) return saved.users;
    } catch {}
    // No list ships with the extension: names and logins come only from the SEI of the user's own unit.
    return [];
  }
  function pageIdentity() {
    try {
      const url = new URL(location.href);
      const topUser = window.top.document.querySelector('#lnkUsuarioSistema');
      const org = topUser?.title.match(/\/([^()]+)\)$/)?.[1];
      return { unit: url.searchParams.get('infra_unidade_atual'), org };
    } catch {
      return null;
    }
  }
  let last = '',
    timer;
  async function capture() {
    const identity = pageIdentity();
    if (!matches(identity)) return;
    const users = parse(document);
    if (!users.length) return;
    const signature = JSON.stringify(users);
    if (signature === last) return;
    try {
      await chrome.storage.local.set({ [key]: { ...identity, users, observed: Date.now() } });
      last = signature;
    } catch {}
  }
  // On request only (the user is searching and nothing was captured yet): read the native "Atribuir
  // Processo" page once and keep its selector. At most two SEI reads, both paced like the other
  // background reads, and never repeated while one is running.
  const assignment = 'procedimento_atribuicao_cadastrar';
  function seiUrl(value, base, action) {
    try {
      const url = new URL(value, base);
      return url.origin === 'https://sei.rj.gov.br' &&
        url.pathname === '/sei/controlador.php' &&
        url.searchParams.get('acao') === action &&
        url.searchParams.get('infra_unidade_atual') === config.unitId
        ? url
        : null;
    } catch {
      return null;
    }
  }
  function assignmentUrl(doc, base) {
    for (const link of doc.querySelectorAll(`a[href*="${assignment}"],a[onclick*="${assignment}"]`)) {
      const href = link.getAttribute('href') || '';
      const raw = href.includes(assignment)
        ? href
        : (link.getAttribute('onclick') || '').match(/'([^']*procedimento_atribuicao_cadastrar[^']*)'/)?.[1];
      const url = raw && seiUrl(raw, base, assignment);
      if (url) return url;
    }
    return null;
  }
  async function read(url) {
    const init = { credentials: 'same-origin', redirect: 'error' };
    const response = globalThis.seiPacedFetch
      ? await seiPacedFetch(url, { ...init, timeout: 15000, urgent: true })
      : await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('SEI respondeu HTTP ' + response.status);
    const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
    return new DOMParser().parseFromString(new TextDecoder(charset).decode(await response.arrayBuffer()), 'text/html');
  }
  let fetching = null;
  function fetchCatalog(identity) {
    if (!matches(identity)) return Promise.resolve([]);
    fetching ||= (async () => {
      // 1. A link already on this tab: Controle de Processos, or the process toolbar in a frame.
      let url = assignmentUrl(document, location.href);
      for (const frame of url ? [] : document.querySelectorAll('iframe')) {
        try {
          const inner = frame.contentDocument;
          url = inner && assignmentUrl(inner, inner.location.href);
        } catch {}
        if (url) break;
      }
      // 2. Otherwise the menu's Controle de Processos page has it.
      if (!url) {
        const menu = document.querySelector('a[href*="acao=procedimento_controlar"]');
        const control = menu && seiUrl(menu.getAttribute('href'), location.href, 'procedimento_controlar');
        if (control) url = assignmentUrl(await read(control), control.href);
      }
      if (!url) return [];
      const users = parse(await read(url));
      if (!users.length) return [];
      await chrome.storage.local.set({
        [key]: { unit: identity.unit, org: identity.org, users, observed: Date.now() },
      });
      return users;
    })().finally(() => {
      fetching = null;
    });
    return fetching;
  }
  globalThis.seiUnitUsers = { list, parse, fetchCatalog };
  // Only the native assignment pages are observed; other pages do no background work. "Atribuir Processo"
  // (button of the process and of Controle de Processos) is procedimento_atribuicao_cadastrar; the list of
  // processes assigned to a user is procedimento_atribuicao_listar.
  const assignmentPages = ['procedimento_atribuicao_cadastrar', 'procedimento_atribuicao_listar'];
  if (!assignmentPages.includes(new URL(location.href).searchParams.get('acao'))) return;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      capture();
    }, 50);
  });
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    capture();
  };
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearTimeout(timer);
    timer = null;
  });
  // Only a back/forward cache restore; pageshow also fires on the first load.
  window.addEventListener('pageshow', (event) => event.persisted && start());
  start();
})();
