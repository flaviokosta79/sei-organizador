// Ephemeral presence: no offline replay and no document contents or authenticated URLs.
(() => {
  // Heartbeats of one editor session go out in order: a "stop" never overtakes a heartbeat still in
  // flight, which would re-create the presence for 90 s after the editor was closed.
  const sessions = new Map();
  const ordered = (key, task) => {
    if (!key) return task();
    const run = (sessions.get(key) || Promise.resolve()).catch(() => {}).then(task);
    sessions.set(key, run);
    run.finally(() => sessions.get(key) === run && sessions.delete(key)).catch(() => {});
    return run;
  };
  // Every SEI page asks who is editing its processes: the same question is answered from memory for
  // 15 s (a colleague's editor appears at most 15 s later). This browser's own heartbeats clear it.
  const recentQueries = seiFreshCache(15000);
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!['editing:heartbeat', 'editing:query'].includes(msg?.type)) return;
    ordered(msg.type === 'editing:heartbeat' && typeof msg.session === 'string' ? msg.session : null, async () => {
      const config = SEI_ORGANIZADOR_CONFIG,
        page = new URL(sender.url || sender.tab?.url || 'about:blank');
      if (page.origin !== 'https://sei.rj.gov.br' || page.pathname !== '/sei/controlador.php')
        throw new Error('Origem não permitida');
      if (
        page.searchParams.has('infra_unidade_atual') &&
        page.searchParams.get('infra_unidade_atual') !== config.unitId
      )
        throw new Error('Unidade não permitida');
      const actor = msg.identity;
      if (
        actor?.unit !== config.unitId ||
        actor.org !== config.org ||
        typeof actor.login !== 'string' ||
        !actor.login.trim() ||
        actor.login.length > 100 ||
        typeof actor.name !== 'string' ||
        actor.name.length > 150
      )
        throw new Error('Unidade ou usuário inválido');
      const data =
        msg.type === 'editing:query'
          ? { processIds: msg.processIds }
          : {
              session: msg.session,
              document: msg.document,
              number: msg.number || '',
              activityAgeMs: msg.activityAgeMs ?? null,
              stop: msg.stop === true,
              actor: { login: actor.login, name: actor.name, org: actor.org },
            };
      if (
        msg.type === 'editing:heartbeat' &&
        (page.searchParams.get('acao') !== 'editor_montar' ||
          page.searchParams.get('id_procedimento') !== msg.process ||
          page.searchParams.get('id_documento') !== msg.document ||
          page.searchParams.get('infra_unidade_atual') !== config.unitId ||
          !/^\d{1,30}$/.test(msg.process || ''))
      )
        throw new Error('Editor não confirmado');
      if (globalThis.seiWorkScopeStore) {
        const pref = await seiWorkScopeStore.get(actor);
        if (!pref.block) throw new Error('Escolha um bloco de trabalho nas opções.');
        data.block = pref.block;
      }
      const path = msg.type === 'editing:query' ? 'editing/query' : `processes/${msg.process}/editing`;
      const queryKey =
        msg.type === 'editing:query' ? JSON.stringify([actor.login, data.block ?? null, data.processIds]) : '';
      if (queryKey) {
        const cached = recentQueries.get(queryKey);
        if (cached) return cached;
      } else recentQueries.clear();
      const response = await seiServiceFetch(path, { body: data });
      if (!response.ok) throw new Error(`Avisos de edição indisponíveis (HTTP ${response.status}).`);
      const answer = await response.json();
      if (queryKey) recentQueries.set(queryKey, answer);
      return answer;
    }).then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
})();
