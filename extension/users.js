// Local suggestions only: no SEI requests, process visits or shared API writes.
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
    const initial = globalThis.SEI_ORGANIZADOR_USERS;
    return matches(initial) && valid(initial.users) ? initial.users.map((user) => ({ ...user })) : [];
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
  globalThis.seiUnitUsers = { list, parse };
  // Only the native assignment page is observed. Other pages do no background work.
  if (new URL(location.href).searchParams.get('acao') !== 'procedimento_atribuicao_listar') return;
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
  window.addEventListener('pageshow', start);
  start();
})();
