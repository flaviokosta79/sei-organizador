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
  const message = async (type, extra) => {
    const response = await chrome.runtime.sendMessage({ type, ...extra });
    if (response?.error) throw Error(response.error);
    return response?.data;
  };
  const treeHistory = () => {
    const tree = document.querySelector('#ifrArvore')?.contentDocument;
    const anchor = tree?.querySelector('a[onclick*="procedimento_consultar_historico"]');
    const href = anchor?.getAttribute('onclick').match(/'([^']*procedimento_consultar_historico[^']*)'/)?.[1];
    if (!href) return null;
    const url = D.address(href, tree.location.href, ['procedimento_consultar_historico']);
    const process = url.searchParams.get('id_procedimento');
    return /^\d{1,30}$/.test(process || '') ? { process, url: url.href } : null;
  };
  // Process page: record the history URL for the list page that scans (no SEI request here, so the
  // tree and documents keep the session to themselves). The tree may load after this page.
  let collected = '';
  function collect(identity, block) {
    const attempt = async () => {
      let found;
      try {
        found = treeHistory();
      } catch {
        return false;
      }
      if (!found) return false;
      const done = JSON.stringify([identity, block, found.process]);
      if (done === collected) return true;
      await message('signature:remember', { identity, block, ...found });
      collected = done;
      return true;
    };
    (async () => {
      for (let i = 0; i < 20; i++) {
        if (await attempt().catch(() => false)) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();
  }
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
    // Processes opened in any tab of this browser session (recorded by their process pages).
    try {
      const shared = await message('signature:processes', { identity, block });
      for (const [process, url] of shared?.processes || []) if (!processes.has(process)) remember(url);
    } catch {}
    remember(location.href);
    // Only history links can be kept: asking for those spares checking every process link of a long list.
    for (const link of document.querySelectorAll('a[href*="procedimento_consultar_historico"]'))
      remember(link.getAttribute('href'));
    try {
      const found = treeHistory();
      if (found) remember(found.url);
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
  return { scan, collect };
})();
