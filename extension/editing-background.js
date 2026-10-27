// Ephemeral presence: no offline replay and no document contents or authenticated URLs.
(() => {
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!['editing:heartbeat', 'editing:query'].includes(msg?.type)) return;
    (async () => {
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
      const response = await fetch(new URL(`/v1/units/${config.unitId}/${path}`, config.serviceUrl), {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Avisos de edição indisponíveis (HTTP ${response.status}).`);
      return response.json();
    })().then(
      (data) => reply({ data }),
      (error) => reply({ error: error.message }),
    );
    return true;
  });
})();
