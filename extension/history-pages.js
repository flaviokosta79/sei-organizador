// Read the remaining native history pages without submitting or changing the visible form.
globalThis.seiLoadHistoryPages = async (table, signal, baseUrl = location.href) => {
  const rows = (table) => [...table.querySelectorAll('tr')].filter((row) => row.querySelectorAll('td').length >= 4);
  const total = globalThis.seiDocumentData.recordCount;
  const initial = rows(table),
    expected = total(table),
    form = table.closest('form');
  if (expected === null || expected < initial.length) return { before: [], after: [], complete: false };
  if (expected === initial.length) return { before: [], after: [], complete: true };
  if (!form?.querySelector('[name="hdnInfraPaginaAtual"]') || !form.getAttribute('action'))
    return { before: [], after: [], complete: false };
  if (expected > 10000) throw new Error('O andamento excede o limite de 10.000 registros desta leitura.');
  const current = Number(form.querySelector('[name="hdnInfraPaginaAtual"]').value);
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('Página do andamento não reconhecida.');
  const base = new URL(baseUrl),
    process = base.searchParams.get('id_procedimento');
  if (!/^\d+$/.test(process || '')) throw new Error('Processo do andamento não reconhecido.');
  const address = (value, origin) => {
    const url = new URL(value, origin);
    if (
      url.origin !== base.origin ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('acao') !== 'procedimento_consultar_historico' ||
      url.searchParams.get('id_procedimento') !== process ||
      url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId
    )
      throw new Error('Endereço do andamento inválido.');
    return url;
  };
  const pages = new Map([[current, initial]]),
    fingerprints = new Set();
  let source = form,
    url = address(form.getAttribute('action'), base),
    loaded = initial.length;
  const signature = (items) =>
    items
      .map((row) => {
        const clone = row.cloneNode(true);
        clone.classList.remove('so-history-filtered');
        return clone.outerHTML;
      })
      .join('');
  fingerprints.add(signature(initial));
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  for (let index = 0; index < 50 && loaded < expected; index++) {
    if (index === current) continue;
    const body = new URLSearchParams();
    for (const input of source.querySelectorAll('input[name],select[name]')) {
      if (input.disabled || ['button', 'submit', 'checkbox', 'radio', 'file'].includes(input.type)) continue;
      body.set(input.name, input.value);
    }
    body.set('hdnInfraPaginaAtual', String(index));
    body.set('hdnInfraItensSelecionados', '');
    body.set('hdnInfraItemId', '');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error(`SEI respondeu HTTP ${response.status}.`);
    const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
    const doc = new DOMParser().parseFromString(
      new TextDecoder(charset).decode(await response.arrayBuffer()),
      'text/html',
    );
    const next = doc.querySelector('#tblHistorico'),
      nextForm = doc.querySelector('#frmProcedimentoHistorico');
    if (!next || !nextForm) throw new Error('Andamento não reconhecido. Verifique a sessão do SEI.');
    const nextRows = rows(next);
    if (
      total(next) !== expected ||
      Number(nextForm.querySelector('[name="hdnInfraPaginaAtual"]')?.value) !== index ||
      !nextRows.length ||
      fingerprints.has(signature(nextRows))
    )
      throw new Error('A paginação mudou ou se repetiu durante a consulta.');
    pages.set(index, nextRows);
    loaded += nextRows.length;
    fingerprints.add(signature(nextRows));
    source = nextForm;
    url = address(nextForm.getAttribute('action') || url, url);
  }
  if (loaded !== expected || [...pages.keys()].some((_, index) => !pages.has(index)))
    throw new Error('Não foi possível ler todas as páginas do andamento.');
  const before = [],
    after = [],
    ids = new Set();
  for (const [index, items] of [...pages].sort((a, b) => a[0] - b[0]))
    for (const row of items) {
      let previous = row.previousSibling;
      while (previous?.nodeType === 3 && !previous.textContent.trim()) previous = previous.previousSibling;
      const id = previous?.nodeType === 8 && previous.textContent.trim().match(/^\d+$/)?.[0];
      if (id) {
        if (ids.has(id)) throw new Error('Registros repetidos entre as páginas do andamento.');
        ids.add(id);
      }
      if (index !== current) (index < current ? before : after).push(document.importNode(row, true));
    }
  return { before, after, complete: true };
};

globalThis.seiFullHistory = {
  key(process, actor) {
    return `seiOrganizador:fullHistory:v1:${SEI_ORGANIZADOR_CONFIG.unitId}:${actor.org}:${actor.login.toLowerCase()}:${process}`;
  },
  read(process, actor) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(this.key(process, actor)));
      if (saved && Date.now() - saved.time < 60000 && saved.page.complete && !saved.page.partial)
        return { ...saved.page, rows: saved.page.rows.map((row) => ({ ...row, time: new Date(row.time) })) };
    } catch {}
    return null;
  },
  write(process, actor, page, top) {
    if (!page.complete || page.partial) return;
    try {
      sessionStorage.setItem(this.key(process, actor), JSON.stringify({ time: Date.now(), page }));
    } catch {}
    if (top) {
      const event = top.createEvent('CustomEvent');
      event.initCustomEvent('sei-organizador:history-ready', false, false, {
        process,
        actor,
        unit: SEI_ORGANIZADOR_CONFIG.unitId,
        page,
      });
      top.dispatchEvent(event);
    }
  },
  async finish(doc, url, signal) {
    const table = doc.querySelector('#tblHistorico');
    if (!table) throw new Error('Andamento não reconhecido.');
    const original = [...table.querySelectorAll('tr')].filter((row) => row.querySelectorAll('td').length >= 4);
    const result = await seiLoadHistoryPages(table, signal, url);
    if (original.length) {
      original[0].before(...result.before);
      original.at(-1).after(...result.after);
    }
    const page = seiDocumentData.parseHistory(doc);
    return { ...page, partial: page.partial || !result.complete };
  },
};
