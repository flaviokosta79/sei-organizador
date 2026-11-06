// All authenticated URLs stay in this page/session, never in the shared service.
// Only the histories of processes the user already opened are read. The list of Blocos de Assinatura
// is not read: in the real SEI one of its pages took about 35 s, and the session (one request at a
// time) held the user's next click for that long. A document "inserido no bloco" in the history is
// enough: only documents go to signature (or meeting) blocks; processes go to internal blocks.
globalThis.seiSignatureScanner = (() => {
  const D = seiSignatureData;
  let owner = '',
    processCursor = 0;
  let processes = new Map();
  const save = () => {
    try {
      sessionStorage.setItem(
        'seiSignatureScanner:' + owner,
        JSON.stringify({ processes: [...processes], processCursor }),
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
  async function scan(identity, block, signal, progress) {
    const next = JSON.stringify([identity, block]);
    if (next !== owner) {
      owner = next;
      processes = new Map();
      processCursor = 0;
      try {
        const saved = JSON.parse(sessionStorage.getItem('seiSignatureScanner:' + owner));
        if (saved) {
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
          processCursor = saved.processCursor || 0;
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
    const errors = [];
    const observations = [],
      processItems = [...processes];
    save();
    for (let index = 0; index < Math.min(5, processItems.length); index++) {
      const [process, url] = processItems[processCursor++ % processItems.length];
      try {
        const doc = await D.history(url, process, signal);
        progress?.();
        observations.push(...D.observations(doc, process, null, unit));
      } catch (e) {
        errors.push(e.message);
      }
    }
    save();
    return {
      observations,
      error: errors.length ? `Acompanhamento parcial: ${errors[0]}` : '',
      processes: processes.size,
    };
  }
  return { scan };
})();
