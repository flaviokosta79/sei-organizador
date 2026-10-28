// All authenticated URLs stay in this page/session, never in the shared service.
globalThis.seiSignatureScanner = (() => {
  const D = seiSignatureData;
  let owner = '',
    processCursor = 0,
    blockCursor = 0,
    lastList = 0;
  let blocks = new Map(),
    processes = new Map();
  let knownBlocks = new Set();
  const save = () => {
    try {
      sessionStorage.setItem(
        'seiSignatureScanner:' + owner,
        JSON.stringify({
          blocks: [...blocks],
          processes: [...processes],
          knownBlocks: [...knownBlocks],
          processCursor,
          blockCursor,
        }),
      );
    } catch {}
  };
  const remember = (value, base = location.href) => {
    try {
      const url = D.address(value, base, ['procedimento_consultar_historico']);
      const id = url.searchParams.get('id_procedimento');
      if (/^\d{1,30}$/.test(id || '')) processes.set(id, url.href);
      if (processes.size > 10000) throw Error('Limite de 10.000 processos no acompanhamento de assinaturas.');
    } catch (e) {
      if (e.message.startsWith('Limite')) throw e;
    }
  };
  async function scan(identity, block, signal) {
    const next = JSON.stringify([identity, block]);
    if (next !== owner) {
      owner = next;
      blocks = new Map();
      processes = new Map();
      processCursor = 0;
      blockCursor = 0;
      lastList = 0;
      knownBlocks = new Set();
      try {
        const saved = JSON.parse(sessionStorage.getItem('seiSignatureScanner:' + owner));
        if (saved) {
          blocks = new Map(saved.blocks);
          processes = new Map(
            saved.processes.filter(([, url]) => {
              try {
                D.address(url, location.href, ['procedimento_consultar_historico']);
                return true;
              } catch {
                return false;
              }
            }),
          );
          knownBlocks = new Set(saved.knownBlocks);
          processCursor = saved.processCursor || 0;
          blockCursor = saved.blockCursor || 0;
        }
      } catch {}
    }
    const unit = document.querySelector('#lnkInfraUnidade')?.textContent.trim();
    if (!unit) throw Error('Unidade do SEI indisponível para acompanhar assinaturas.');
    remember(location.href);
    for (const link of document.querySelectorAll('a[href*="id_procedimento="]')) remember(link.getAttribute('href'));
    try {
      const tree = document.querySelector('#ifrArvore')?.contentDocument;
      const anchor = tree?.querySelector('a[onclick*="procedimento_consultar_historico"]');
      const href = anchor?.getAttribute('onclick').match(/'([^']*procedimento_consultar_historico[^']*)'/)?.[1];
      if (href) remember(href, tree.location.href);
    } catch {}
    if (Date.now() - lastList >= 120000) {
      const link = document.querySelector('a[href*="acao=bloco_assinatura_listar"]');
      if (!link) throw Error('Abra uma tela do SEI com o menu Blocos de Assinatura para iniciar o acompanhamento.');
      const result = await D.list(link.getAttribute('href'), '#tblBlocos', ['bloco_assinatura_listar'], signal);
      const found = new Map();
      for (const row of result.rows) {
        const link = row.querySelector('a[href*="acao=rel_bloco_protocolo_listar"][href*="id_bloco="]');
        if (!link) continue;
        const url = D.address(link.getAttribute('href'), result.url, ['rel_bloco_protocolo_listar']);
        const id = url.searchParams.get('id_bloco');
        if (/^\d{1,30}$/.test(id || '')) found.set(id, url.href);
      }
      blocks = found;
      for (const id of found.keys()) knownBlocks.add(id);
      lastList = Date.now();
    }
    const errors = [];
    // Only history URLs obtained from pages the user has already opened are polled.
    const observations = [],
      processItems = [...processes];
    save();
    for (let index = 0; index < Math.min(5, processItems.length); index++) {
      const [process, url] = processItems[processCursor++ % processItems.length];
      try {
        const doc = await D.history(url, process, signal);
        observations.push(...D.observations(doc, process, knownBlocks, unit));
      } catch (e) {
        errors.push(e.message);
      }
    }
    save();
    return {
      observations,
      error: errors.length ? `Acompanhamento parcial: ${errors[0]}` : '',
      processes: processes.size,
      blocks: blocks.size,
    };
  }
  return { scan };
})();
