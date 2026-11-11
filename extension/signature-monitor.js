// All authenticated URLs stay in this page/session, never in the shared service.
// Only the histories of processes the user already opened are read. The list of Blocos de Assinatura
// is not read: in the real SEI one of its pages took about 35 s, and the session (one request at a
// time) held the user's next click for that long. A document "inserido no bloco" in the history is
// enough: only documents go to signature (or meeting) blocks; processes go to internal blocks.
globalThis.seiSignatureScanner = (() => {
  const D = seiSignatureData;
  let owner = '',
    processCursor = 0,
    recentCursor = 0;
  // History addresses live only in this page's memory and in the worker's session store, which is
  // emptied when the SEI login changes. Up to 0.23.19 they were also kept in the tab's sessionStorage:
  // that survives a new login in the same tab, and reading an address of the previous login ends the
  // new one. Whatever earlier versions left there is removed.
  let processes = new Map();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('seiSignatureScanner:')) sessionStorage.removeItem(key);
    }
  } catch {}
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
    }
    const unit = document.querySelector('#lnkInfraUnidade')?.textContent.trim();
    if (!unit) throw Error('Unidade do SEI indisponível para acompanhar assinaturas.');
    // Processes opened in any tab of this browser session (recorded by their process pages).
    let waiting = [],
      recent = [];
    try {
      const shared = await message('signature:processes', { identity, block });
      // The worker's address is the most recent one recorded for the process: it replaces ours.
      for (const [, url] of shared?.processes || []) remember(url);
      waiting = Array.isArray(shared?.waiting) ? shared.waiting : [];
      recent = Array.isArray(shared?.recent) ? shared.recent : [];
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
      ids = [...processes.keys()];
    // Five histories per round. Up to three go to the processes most likely to get a signature soon:
    // two with a document still unsigned in a signature block, one opened in the last 30 minutes. The
    // rest follows the general rotation, which still reaches every process (e.g. a second signature).
    const picked = [];
    const take = (list, cursor, limit) => {
      const candidates = list.filter((id) => processes.has(id) && !picked.includes(id));
      for (let i = 0; i < Math.min(limit, candidates.length); i++)
        picked.push(candidates[(cursor + i) % candidates.length]);
      return candidates.length ? cursor + Math.min(limit, candidates.length) : cursor;
    };
    // The waiting list is a queue kept by the worker (just read goes to its end): always from its head.
    take(waiting, 0, 2);
    recentCursor = take(recent, recentCursor, 1);
    if (picked.length < 3) take(waiting, 0, 3 - picked.length);
    if (picked.length < 3) recentCursor = take(recent, recentCursor, 3 - picked.length);
    for (let tries = 0; picked.length < Math.min(5, ids.length) && tries < ids.length; tries++) {
      const id = ids[processCursor++ % ids.length];
      if (!picked.includes(id)) picked.push(id);
    }
    const read = [],
      unsigned = [];
    for (const process of picked) {
      try {
        const doc = await D.history(processes.get(process), process, signal);
        progress?.();
        const found = D.observations(doc, process, null, unit);
        observations.push(...found);
        read.push(process);
        // Still in a signature block (not removed) and no signature after that inclusion.
        const signed = new Set(
          found.filter((o) => o.signature).map((o) => `${o.document}:${o.signatureBlock}:${o.includedAt}`),
        );
        if (found.some((o) => !o.signature && !signed.has(`${o.document}:${o.signatureBlock}:${o.includedAt}`)))
          unsigned.push(process);
      } catch (e) {
        errors.push(e.message);
        // A waiting process that failed keeps waiting, but goes to the end so it cannot hold the queue.
        if (waiting.includes(process)) {
          read.push(process);
          unsigned.push(process);
        }
      }
    }
    // The processes just read are reclassified for every tab of this browser.
    if (read.length)
      try {
        await message('signature:waiting', { identity, block, read, waiting: unsigned });
      } catch {}
    return {
      observations,
      error: errors.length ? `Acompanhamento parcial: ${errors[0]}` : '',
      processes: processes.size,
    };
  }
  return { scan, collect };
})();
