// Native electronic signatures, independent of the Organizer's manual "Assinar" status.
globalThis.seiSignatureData = (() => {
  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
  const id = (v) => /^\d{1,30}$/.test(v || '');
  function address(value, base = location.href, actions) {
    const url = new URL(value, base);
    if (
      url.origin !== 'https://sei.rj.gov.br' ||
      url.pathname !== '/sei/controlador.php' ||
      url.searchParams.get('infra_unidade_atual') !== SEI_ORGANIZADOR_CONFIG.unitId ||
      (actions && !actions.includes(url.searchParams.get('acao')))
    )
      throw Error('Endereço de acompanhamento de assinatura inválido.');
    return url;
  }
  async function page(value, signal, body, base) {
    const url = address(value, base);
    const response = await fetch(url, {
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : {}),
    });
    if (!response.ok) throw Error(`SEI respondeu HTTP ${response.status}.`);
    const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
    return {
      doc: new DOMParser().parseFromString(new TextDecoder(charset).decode(await response.arrayBuffer()), 'text/html'),
      url,
    };
  }
  // Iterate every page without changing the user's form or accepting filtered/incomplete results.
  async function list(value, tableId, actions, signal) {
    let source = await page(address(value, location.href, actions), signal);
    const initialForm = source.doc.querySelector(tableId)?.closest('form');
    if (!initialForm) throw Error('Lista de assinatura indisponível.');
    const bodyFor = (form) => {
      const body = new URLSearchParams();
      for (const field of form.querySelectorAll('input[name],select[name]')) {
        if (field.disabled || ['button', 'submit', 'radio', 'file'].includes(field.type)) continue;
        if (field.type === 'checkbox' && !field.name.startsWith('chkSinEstado')) continue;
        body.set(field.name, field.value);
      }
      for (const name of [
        'txtPalavrasPesquisaBloco',
        'txtPalavrasPesquisaRelBlocoProtocolo',
        'selGrupoBloco',
        'selUnidadeGeradora',
      ])
        if (body.has(name)) body.set(name, '');
      if (body.has('hdnMeusBlocos')) body.set('hdnMeusBlocos', 'T');
      body.set('hdnInfraItensSelecionados', '');
      body.set('hdnInfraItemId', '');
      return body;
    };
    const initialBody = bodyFor(initialForm);
    initialBody.set('hdnInfraPaginaAtual', '0');
    source = await page(address(initialForm.getAttribute('action'), source.url, actions), signal, initialBody);
    const found = [],
      seen = new Set();
    let expected;
    for (let index = 0; index < 50; index++) {
      const table = source.doc.querySelector(tableId),
        form = table?.closest('form');
      if (!table || !form) throw Error('Lista de assinatura indisponível; verifique a sessão do SEI.');
      if (Number(form.querySelector('[name="hdnInfraPaginaAtual"]')?.value || 0) !== index)
        throw Error('Página de assinatura não confirmada.');
      for (const field of form.querySelectorAll(
        '[name^="txtPalavrasPesquisa"],select[name="selGrupoBloco"],select[name="selUnidadeGeradora"]',
      ))
        if (field.value.trim()) throw Error('A lista de assinatura continua filtrada.');
      if (form.querySelector('[name="hdnMeusBlocos"]')?.value === 'M')
        throw Error('A lista está restrita aos blocos atribuídos a um usuário.');
      const total = seiDocumentData.recordCount(table);
      if (total === null || total > 10000 || (expected !== undefined && total !== expected))
        throw Error('Lista de assinatura incompleta ou alterada durante a leitura.');
      expected = total;
      const rows = [...table.rows].filter((r) => r.querySelector('td'));
      const fingerprint = rows.map((r) => clean(r.textContent)).join('|');
      if (seen.has(fingerprint)) throw Error('Paginação de assinatura repetida.');
      seen.add(fingerprint);
      found.push(...rows);
      if (found.length === expected) return { rows: found, url: source.url };
      if (!rows.length || found.length > expected) break;
      const input = form.querySelector('[name="hdnInfraPaginaAtual"]');
      if (!input || Number(input.value) !== index) throw Error('Paginação de assinatura não reconhecida.');
      const body = bodyFor(form);
      body.set('hdnInfraPaginaAtual', String(index + 1));
      body.set('hdnInfraItensSelecionados', '');
      body.set('hdnInfraItemId', '');
      source = await page(address(form.getAttribute('action'), source.url, actions), signal, body);
    }
    throw Error('Não foi possível ler todas as páginas de assinatura.');
  }
  function observations(doc, process, signatureBlocks, unit) {
    if (!id(process)) throw Error('Processo inválido.');
    const history = seiDocumentData.parseHistory(doc);
    if (!history.complete || history.partial) throw Error('Histórico incompleto; assinatura não presumida.');
    const active = new Map(),
      result = [];
    // The SEI lists newest first; reversing also preserves its order within the same minute.
    const rows = [...doc.querySelectorAll('#tblHistorico tr')].reverse();
    const rowTime = (row) => seiDocumentData.parseDate(clean(row.querySelector('td')?.textContent))?.getTime() || 0;
    rows.sort((a, b) => rowTime(a) - rowTime(b));
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) continue;
      const at = seiDocumentData.parseDate(clean(cells[0].textContent))?.getTime();
      if (!at) continue;
      const text = clean(cells[3].textContent);
      const documentLink = cells[3].querySelector('a[href*="id_documento="]');
      if (!documentLink) continue;
      const documentUrl = new URL(documentLink.getAttribute('href'), location.href);
      const document = documentUrl.searchParams.get('id_documento');
      if (!id(document)) continue;
      const entry = text.match(/^Documento \d+\b.*? (inserido no|retirado do) bloco (\d+)\b/);
      if (
        entry &&
        seiDocumentData.sigla(cells[1].textContent) === seiDocumentData.sigla(unit) &&
        signatureBlocks.has(entry[2])
      ) {
        const key = `${document}:${entry[2]}`;
        if (entry[1] === 'retirado do') {
          active.delete(key);
          continue;
        }
        const user = cells[2].querySelector('a[title]');
        const observation = {
          process,
          document,
          number: clean(documentLink.textContent),
          signatureBlock: entry[2],
          includedAt: at,
          includedBy: {
            login: clean(cells[2].textContent).toLowerCase(),
            name: clean(user?.title || cells[2].textContent),
          },
        };
        active.set(key, observation);
      }
      if (/^Assinado Documento\b/.test(text)) {
        // The signer in the description is authoritative; the row's actor can be a delegate.
        const signer = [...cells[3].querySelectorAll('a')].find(
          (a) => a !== documentLink && !a.getAttribute('href')?.includes('id_bloco='),
        );
        if (!signer || !clean(signer.textContent)) continue;
        for (const observation of active.values())
          if (observation.document === document)
            result.push({
              ...observation,
              signature: {
                time: at,
                signer: {
                  login: clean(signer.textContent).toLowerCase(),
                  name: clean(signer.title || signer.textContent),
                },
              },
            });
      }
    }
    return [...active.values(), ...result];
  }
  async function history(value, process, signal) {
    if (new URL(value, location.href).searchParams.get('id_procedimento') !== process)
      throw Error('Processo do acompanhamento inválido.');
    let source = await page(address(value, location.href, ['procedimento_consultar_historico']), signal);
    if (!source.doc.querySelector('#tblHistorico')) throw Error('Andamento indisponível; verifique a sessão do SEI.');
    let parsed = seiDocumentData.parseHistory(source.doc);
    if (!parsed.complete) {
      const form = source.doc.querySelector('#frmProcedimentoHistorico');
      if (!parsed.completeValue || !form) throw Error('Histórico completo indisponível.');
      const body = new URLSearchParams();
      for (const field of form.querySelectorAll('input[name]')) body.set(field.name, field.value);
      body.set('hdnTipoHistorico', parsed.completeValue);
      source = await page(
        address(form.getAttribute('action'), source.url, ['procedimento_consultar_historico']),
        signal,
        body,
      );
    }
    parsed = await seiFullHistory.finish(source.doc, source.url.href, signal);
    if (!parsed.complete || parsed.partial) throw Error('Histórico incompleto; aguardando próxima leitura.');
    return source.doc;
  }
  return { address, page, list, observations, history };
})();
