importScripts('config.js');
importScripts('service-client.js');
importScripts('scope-background.js');
importScripts('monitor-sounds.js');
importScripts('monitor-sign.js');
importScripts('monitor-background.js');
importScripts('signature-background.js');
importScripts('receipts-background.js');
importScripts('editing-background.js');
// Tabs, the process card and the monitor poll the same block every few seconds: identical reads within
// a short window share one request. Any write from this browser to the block drops its cached reads.
// A read that started before a write is never reused afterwards (generation per block).
const readCache = new Map(),
  generations = new Map(),
  readTtl = 4000;
async function blockRequest(msg) {
  const path = `blocks/${msg.block}${msg.history ? '/history' : ''}`;
  if (msg.body) {
    generations.set(msg.block, (generations.get(msg.block) || 0) + 1);
    readCache.delete(`blocks/${msg.block}`);
    readCache.delete(`blocks/${msg.block}/history`);
    return request(path, msg.body);
  }
  const generation = generations.get(msg.block) || 0;
  const cached = readCache.get(path);
  if (cached && cached.generation === generation && Date.now() - cached.at < readTtl)
    return structuredClone(await cached.data);
  const entry = { at: Date.now(), generation, data: request(path) };
  readCache.set(path, entry);
  try {
    return structuredClone(await entry.data);
  } catch (e) {
    if (readCache.get(path) === entry) readCache.delete(path);
    throw e;
  }
}
async function request(path, body) {
  const response = await seiServiceFetch(path, { body });
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
  if (!data || typeof data !== 'object') throw new Error('Resposta inválida do serviço. Tente novamente em instantes.');
  return data;
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'api') return;
  (async () => {
    if (!sender.tab?.url?.startsWith('https://sei.rj.gov.br/sei/controlador.php'))
      throw new Error('Origem não permitida');
    const { unitId } = globalThis.SEI_ORGANIZADOR_CONFIG;
    if (msg.unit !== unitId || !/^\d+$/.test(msg.block)) throw new Error('Unidade ou bloco inválido');
    if (globalThis.seiWorkScopeStore) await seiWorkScopeStore.requireBlock(msg.identity, msg.block);
    return blockRequest(msg);
  })().then(
    (data) => reply({ data }),
    (e) => reply({ error: e.message }),
  );
  return true;
});
