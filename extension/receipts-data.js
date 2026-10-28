// Fetch only the control list. Visiting a process would register its receipt in the SEI.
globalThis.seiSecretariatData = (() => {
  const states = [
    'processoNaoVisualizado',
    'processoVisualizado',
    'processoNaoVisualizadoSigiloso',
    'processoVisualizadoSigiloso',
  ];
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  function address(value, base = location.href) {
    const url = new URL(value, base);
    if (
      url.origin !== 'https://sei.rj.gov.br' ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('acao') !== 'procedimento_controlar' ||
      url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId
    )
      throw Error('Endereço do Controle de Processos inválido.');
    return url;
  }
  function source() {
    const form = document.querySelector('#frmProcedimentoControlar');
    const link = document.querySelector('a[href*="acao=procedimento_controlar"]');
    try {
      return address(form?.getAttribute('action') || link?.getAttribute('href')).href;
    } catch {
      return null;
    }
  }
  function body(form, page, normalize = false) {
    const result = new URLSearchParams();
    for (const field of form.querySelectorAll('input[name],select[name]')) {
      if (field.disabled || ['checkbox', 'radio', 'button', 'submit', 'file'].includes(field.type)) continue;
      result.set(field.name, field.value);
    }
    for (const prefix of ['Recebidos', 'Gerados', 'Detalhado']) {
      result.set(`hdn${prefix}ItemId`, '');
      result.set(`hdn${prefix}ItensSelecionados`, '');
    }
    result.set('hdnRecebidosPaginaAtual', String(page));
    if (normalize) {
      result.set('hdnTipoVisualizacao', 'R');
      result.set('hdnMeusProcessos', 'T');
      result.set('hdnGeradosPaginaAtual', '0');
      result.set('hdnIdBloco', '');
      result.set('txtBloco', '');
      for (const prefix of ['hdnIdMarcador', 'hdnIdTipoProcedimento', 'hdnIdTipoPrioridade'])
        result.set(prefix + SEI_ORGANIZADOR_CONFIG.unitId, '');
    }
    return result;
  }
  function parse(doc, base) {
    const form = doc.querySelector('#frmProcedimentoControlar'),
      table = doc.querySelector('#tblProcessosRecebidos');
    if (!form || !table || !/Controle de Processos/i.test(doc.title + ' ' + doc.querySelector('h1')?.textContent))
      throw Error('Controle de Processos indisponível; verifique a sessão do SEI.');
    const field = (name) => form.querySelector(`[name="${name}"]`)?.value;
    if (field('hdnTipoVisualizacao') !== 'R' || field('hdnMeusProcessos') !== 'T')
      throw Error('A lista de recebidos está filtrada ou em outra visualização.');
    for (const prefix of ['hdnIdMarcador', 'hdnIdTipoProcedimento', 'hdnIdTipoPrioridade'])
      if (field(prefix + SEI_ORGANIZADOR_CONFIG.unitId) !== '') throw Error('A lista de recebidos continua filtrada.');
    const count = clean(table.caption?.textContent).match(/\(([\d.]+) registros?(?:\s*-\s*([\d.]+) a ([\d.]+))?\)/i);
    if (!count) throw Error('Quantidade de recebidos não confirmada.');
    const total = Number(count[1].replaceAll('.', '')),
      start = Number(count[2]?.replaceAll('.', '') || 0),
      end = Number(count[3]?.replaceAll('.', '') || 0);
    if (!Number.isSafeInteger(total) || total > 10000 || (total > 0 && (!start || end < start || end > total)))
      throw Error('Quantidade de recebidos inválida ou acima de 10.000.');
    const page = Number(field('hdnRecebidosPaginaAtual'));
    if (!Number.isSafeInteger(page) || page < 0 || field('hdnRecebidosPaginaAtual') === undefined)
      throw Error('Página de recebidos não reconhecida.');
    const items = [],
      rows = [...table.querySelectorAll('tr')].filter((row) => row.querySelector('td'));
    for (const row of rows) {
      const links = row.querySelectorAll(states.map((state) => `a.${state}`).join(','));
      if (links.length !== 1) throw Error('Situação de recebimento não reconhecida na linha do processo.');
      const link = links[0],
        matched = states.filter((state) => link.classList.contains(state));
      const url = new URL(link.getAttribute('href'), base),
        id = url.searchParams.get('id_procedimento');
      if (
        matched.length !== 1 ||
        !/^\d{1,30}$/.test(id || '') ||
        row.id !== `P${id}` ||
        url.origin !== 'https://sei.rj.gov.br' ||
        url.pathname !== '/sei/controlador.php' ||
        url.searchParams.get('acao') !== 'procedimento_trabalhar' ||
        url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId
      )
        throw Error('Processo não reconhecido no Controle de Processos.');
      const number = clean(link.textContent);
      if (!number || number.length > 100) throw Error('Número de processo inválido.');
      items.push({ id, number, pending: matched[0].startsWith('processoNaoVisualizado'), url: url.href });
    }
    if (items.length !== (total ? end - start + 1 : 0) || new Set(items.map((p) => p.id)).size !== items.length)
      throw Error('Página de recebidos incompleta ou duplicada.');
    const criteria = field('hdnRecebidosHashCriterios');
    if (typeof criteria !== 'string' || !criteria) throw Error('Critérios da listagem não confirmados.');
    return { items, total, start, end, page, criteria, form, url: address(form.getAttribute('action'), base) };
  }
  async function snapshot(value, signal) {
    signal = AbortSignal.any([signal, AbortSignal.timeout(110000)]);
    async function read(value, data) {
      const url = address(value);
      const response = await fetch(url, {
        credentials: 'same-origin',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        ...(data
          ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data }
          : {}),
      });
      if (!response.ok) throw Error(`SEI respondeu HTTP ${response.status}.`);
      const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
      return {
        doc: new DOMParser().parseFromString(
          new TextDecoder(charset).decode(await response.arrayBuffer()),
          'text/html',
        ),
        url,
      };
    }
    let loaded = await read(value),
      current;
    // Normalize a detached form; never submit or alter the visible page.
    try {
      current = parse(loaded.doc, loaded.url);
    } catch {
      current = null;
    }
    if (!current || current.page !== 0) {
      const form = loaded.doc.querySelector('#frmProcedimentoControlar');
      if (!form) throw Error('Controle de Processos indisponível; verifique a sessão do SEI.');
      loaded = await read(address(form.getAttribute('action'), loaded.url), body(form, 0, true));
      current = parse(loaded.doc, loaded.url);
    }
    const total = current.total,
      size = current.items.length,
      criteria = current.criteria,
      items = [],
      seen = new Set();
    for (let index = 0; index < 250; index++) {
      if (
        current.total !== total ||
        current.page !== index ||
        current.criteria !== criteria ||
        (total && (current.start !== index * size + 1 || current.end !== Math.min(total, (index + 1) * size)))
      )
        throw Error('A lista de recebidos mudou durante a consulta; aguardando próxima leitura.');
      for (const item of current.items) {
        if (seen.has(item.id)) throw Error('Processo repetido entre páginas de recebidos.');
        seen.add(item.id);
        items.push(item);
      }
      if (items.length === total) return { items, complete: true, url: current.url.href };
      if (!current.items.length || items.length > total) break;
      loaded = await read(current.url, body(current.form, index + 1));
      current = parse(loaded.doc, loaded.url);
    }
    throw Error('Não foi possível confirmar a lista completa de recebidos.');
  }
  return { address, source, body, parse, snapshot };
})();
