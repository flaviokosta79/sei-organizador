// Preferences are local to this browser and keyed by unit, organization and SEI login.
(() => {
  const key = 'seiWorkScopes';
  const profile = (identity) => `${identity.unit}:${identity.org}:${identity.login.trim().toLowerCase()}`;
  const valid = (identity) =>
    identity?.unit === SEI_ORGANIZADOR_CONFIG.unitId &&
    identity.org === SEI_ORGANIZADOR_CONFIG.org &&
    typeof identity.login === 'string' &&
    !!identity.login.trim() &&
    identity.login.length <= 100;
  let queue = Promise.resolve();
  const serial = (fn) => {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  };
  async function load() {
    return (await chrome.storage.local.get(key))[key] || {};
  }
  async function get(identity) {
    if (!valid(identity)) throw Error('Unidade ou usuário inválido');
    const records = await load();
    return records[profile(identity)] || { identity, block: null, catalog: [] };
  }
  async function requireBlock(identity, block) {
    const pref = await get(identity);
    if (!pref.block || pref.block !== block) throw Error('Este bloco não é o bloco de trabalho escolhido nas opções.');
    return pref.block;
  }
  globalThis.seiWorkScopeStore = { get, requireBlock, profile };
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!['scope:get', 'scope:remember', 'scope:options', 'scope:set', 'scope:open-options'].includes(msg?.type))
      return;
    serial(async () => {
      const url = new URL(sender.url || sender.tab?.url || 'about:blank');
      const options = url.href === chrome.runtime.getURL('options.html');
      const sei = url.origin === 'https://sei.rj.gov.br' && url.pathname === '/sei/controlador.php';
      if (!options && !sei) throw Error('Origem não permitida');
      if (msg.type === 'scope:open-options') {
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      }
      if (msg.type === 'scope:options') {
        if (!options) throw Error('Origem não permitida');
        const records = await load();
        return { profiles: Object.entries(records).map(([id, value]) => ({ id, ...value })) };
      }
      const records = await load();
      const identity = options ? records[msg.profile]?.identity : msg.identity;
      if (!valid(identity)) throw Error('Abra o SEI na unidade atendida para identificar seu usuário.');
      const id = profile(identity),
        pref = records[id] || { identity, block: null, catalog: [] };
      if (msg.type === 'scope:remember') {
        const sourceBlock = url.searchParams.get('id_bloco');
        const listing = url.searchParams.get('acao') === 'bloco_interno_listar';
        if (
          !Array.isArray(msg.blocks) ||
          msg.blocks.length > 200 ||
          !msg.blocks.every(
            (b) =>
              /^\d{1,30}$/.test(b.id) &&
              typeof b.name === 'string' &&
              b.name.length <= 150 &&
              (b.group === undefined || (typeof b.group === 'string' && b.group.length <= 150)),
          )
        )
          throw Error('Lista de blocos inválida');
        if (
          !listing &&
          !msg.catalog &&
          !(
            url.searchParams.get('acao') === 'rel_bloco_protocolo_listar' &&
            msg.blocks.length === 1 &&
            msg.blocks[0].id === sourceBlock
          )
        )
          throw Error('Bloco não confirmado nesta página');
        const catalog = new Map(pref.catalog.map((b) => [b.id, b]));
        for (const block of msg.blocks) {
          const previous = catalog.get(block.id);
          const name = !block.name || block.name === `Bloco ${block.id}` ? previous?.name || block.name : block.name;
          catalog.set(block.id, { ...previous, ...block, name });
        }
        pref.catalog = [...catalog.values()].slice(-200);
        if (!pref.block && !listing && !msg.catalog) pref.block = sourceBlock;
      }
      if (msg.type === 'scope:set') {
        if (!/^\d{1,30}$/.test(msg.block || '') || !pref.catalog.some((b) => b.id === msg.block))
          throw Error('Escolha um bloco disponível na lista.');
        pref.block = msg.block;
      }
      pref.lastUsed = Date.now();
      records[id] = pref;
      await chrome.storage.local.set({ [key]: records });
      if (msg.type === 'scope:set') {
        const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
        await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'scope:changed' })));
      }
      return pref;
    }).then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
})();
