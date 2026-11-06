importScripts('config.js');
importScripts('service-client.js');
importScripts('scope-background.js');
importScripts('monitor-sounds.js');
importScripts('monitor-sign.js');
importScripts('monitor-background.js');
importScripts('signature-background.js');
importScripts('receipts-background.js');
importScripts('editing-background.js');
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'api') return;
  (async () => {
    if (!sender.tab?.url?.startsWith('https://sei.rj.gov.br/sei/controlador.php'))
      throw new Error('Origem não permitida');
    const { unitId } = globalThis.SEI_ORGANIZADOR_CONFIG;
    if (msg.unit !== unitId || !/^\d+$/.test(msg.block)) throw new Error('Unidade ou bloco inválido');
    if (globalThis.seiWorkScopeStore) await seiWorkScopeStore.requireBlock(msg.identity, msg.block);
    const response = await seiServiceFetch(`blocks/${msg.block}${msg.history ? '/history' : ''}`, {
      body: msg.body,
    });
    // Proxies may answer with HTML (e.g. 502); never show a parser error to the user.
    let data = null;
    try {
      data = await response.json();
    } catch {}
    if (!response.ok)
      throw new Error(
        typeof data?.error === 'string' && data.error
          ? data.error
          : `Serviço indisponível (HTTP ${response.status}). Tente novamente em instantes.`,
      );
    if (!data || typeof data !== 'object')
      throw new Error('Resposta inválida do serviço. Tente novamente em instantes.');
    return data;
  })().then(
    (data) => reply({ data }),
    (e) => reply({ error: e.message }),
  );
  return true;
});
