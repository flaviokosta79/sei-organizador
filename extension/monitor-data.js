// Read-only SEI requests. A snapshot is accepted only after every unfiltered page was read.
globalThis.seiBlockMonitor = (() => {
  const origin = 'https://sei.rj.gov.br';
  function address(value, block, base = location.href) {
    const url = new URL(value, base);
    if (
      url.origin !== origin ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('acao') !== 'rel_bloco_protocolo_listar' ||
      url.searchParams.get('id_bloco') !== block ||
      url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId
    )
      throw new Error('Endereço de bloco inválido. Abra novamente o bloco no SEI.');
    return url;
  }
  function context() {
    const user = document.querySelector('#lnkUsuarioSistema');
    const actor = user?.title.match(/^(.+)\s+\(([^/()]+)\/([^()]+)\)$/);
    const unit = new URL(user?.getAttribute('href') || location.href, location.href).searchParams.get(
      'infra_unidade_atual',
    );
    if (!actor || actor[3] !== SEI_ORGANIZADOR_CONFIG.org || unit !== SEI_ORGANIZADOR_CONFIG.unitId) return null;
    return { unit, org: actor[3], login: actor[2].trim().toLowerCase() };
  }
  function parse(doc, block, base) {
    const form = doc.querySelector('#frmRelBlocoProtocoloLista');
    const table = doc.querySelector('#tblProtocolosBlocos');
    if (!form || !table || !/Processos do Bloco Interno/i.test(`${doc.title} ${doc.querySelector('h1')?.textContent}`))
      throw new Error('Lista interna não reconhecida. Verifique a sessão do SEI e reabra o bloco.');
    const match = table.querySelector('caption')?.textContent.match(/\(\s*([\d.]+)\s+registros?\b/i);
    if (!match) throw new Error('Não foi possível confirmar a quantidade de processos do bloco.');
    const total = Number(match[1].replaceAll('.', ''));
    if (!Number.isSafeInteger(total) || total > 10000)
      throw new Error('Bloco excede o limite de 10.000 processos do monitor.');
    const items = [];
    for (const row of table.querySelectorAll('tr')) {
      const link = row.querySelector('a[href*="id_procedimento="]');
      if (!link) continue;
      const url = new URL(link.getAttribute('href'), base);
      const id = url.searchParams.get('id_procedimento');
      if (url.origin !== origin || url.pathname !== '/sei/controlador.php' || !/^\d{1,30}$/.test(id || ''))
        throw new Error('Processo não reconhecido na lista do bloco.');
      items.push({ id, number: link.textContent.replace(/\s+/g, ' ').trim().slice(0, 100), url: url.href });
    }
    const body = new URLSearchParams();
    for (const input of form.querySelectorAll('input[name],select[name]')) {
      if (input.disabled || ['button', 'submit', 'checkbox', 'radio', 'file'].includes(input.type)) continue;
      body.set(input.name, input.value);
    }
    body.set('txtPalavrasPesquisaRelBlocoProtocolo', '');
    body.set('hdnInfraItensSelecionados', '');
    body.set('hdnInfraItemId', '');
    const target = address(form.getAttribute('action') || base, block, base);
    return {
      items,
      total,
      body,
      target,
      page: Number(form.querySelector('[name="hdnInfraPaginaAtual"]')?.value || 0),
      filtered: !!form.querySelector('#txtPalavrasPesquisaRelBlocoProtocolo')?.value.trim(),
    };
  }
  async function snapshot(target, signal) {
    signal = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
    const read = async (url, body) => {
      const response = await fetch(address(url, target.block), {
        credentials: 'same-origin',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : {}),
      });
      if (!response.ok) throw new Error(`SEI respondeu HTTP ${response.status}`);
      const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
      return parse(
        new DOMParser().parseFromString(new TextDecoder(charset).decode(await response.arrayBuffer()), 'text/html'),
        target.block,
        url,
      );
    };
    let page = await read(target.url);
    if (page.filtered || page.page !== 0) {
      page.body.set('hdnInfraPaginaAtual', '0');
      page = await read(page.target.href, page.body);
    }
    const total = page.total,
      items = [],
      seen = new Set();
    for (let index = 0; index < 50; index++) {
      if (page.filtered || page.page !== index || page.total !== total)
        throw new Error('A lista mudou durante a consulta; nova tentativa no próximo ciclo.');
      for (const item of page.items) {
        if (seen.has(item.id)) throw new Error('Paginação repetida; a leitura completa do bloco não foi confirmada.');
        seen.add(item.id);
        items.push(item);
      }
      if (items.length === total) return { items, url: page.target.href };
      if (!page.items.length || items.length > total || index === 49) break;
      page.body.set('hdnInfraPaginaAtual', String(index + 1));
      page = await read(page.target.href, page.body);
    }
    throw new Error('Não foi possível ler todas as páginas do bloco. Nenhuma entrada foi presumida.');
  }
  return { address, context, parse, snapshot };
})();
