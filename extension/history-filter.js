// Filter the history and display 30 matching records per page. Native records/forms remain unchanged.
(() => {
  if (new URL(location.href).searchParams.get('acao') !== 'procedimento_consultar_historico') return;
  if (globalThis.seiHistoryFilterLifecycle) return;
  const D = globalThis.seiDocumentData;
  let current = null,
    scheduled = false,
    active = true;
  const context = () => {
    const url = new URL(location.href);
    if (url.searchParams.get('acao') !== 'procedimento_consultar_historico') return null;
    const identity = D.seiContext(window, url, SEI_ORGANIZADOR_CONFIG);
    const table = document.querySelector('#tblHistorico');
    if (!identity || !table) return null;
    return {
      ...identity,
      table,
      key: `${SEI_ORGANIZADOR_CONFIG.unitId}:${identity.actor.org}:${identity.actor.login.toLowerCase()}:${D.sigla(identity.unit)}`,
    };
  };
  function mount(info) {
    const host = document.createElement('div');
    host.id = 'sei-organizador-filtro-andamento';
    const shadow = host.attachShadow({ mode: 'open' });
    const node = (tag, text, parent) => {
      const element = document.createElement(tag);
      if (text) element.textContent = text;
      parent?.append(element);
      return element;
    };
    const style = node('style', null, shadow);
    style.textContent = `
      :host{display:block;margin:6px 0;font:12px/1.4 Arial,sans-serif;color:#243b53}
      section{padding:7px 10px;border:1px solid #9dbbe0;background:#eaf3fd;border-radius:4px}
      .controls{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px}
      label{display:inline-flex;align-items:center;gap:4px}select,button{font:inherit;padding:3px 5px}button{cursor:pointer}
      p{margin:5px 0 0;color:#46566a}@media print{button{display:none}}
      .pages{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
    `;
    const section = node('section', null, shadow),
      controls = node('div', null, section);
    section.setAttribute('aria-label', 'Filtros do andamento do SEI Organizador');
    controls.className = 'controls';
    node('strong', 'Filtrar andamento', controls);
    const select = (label, options) => {
      const wrapper = node('label', label, controls),
        input = node('select', null, wrapper);
      for (const [value, text] of options) {
        const option = node('option', text, input);
        option.value = value;
      }
      return input;
    };
    const unit = select('Unidade', [
      ['unit', `Minha unidade (${info.unit})`],
      ['all', 'Todas as unidades'],
    ]);
    const type = select('Movimentações', [
      ['transport', 'Envios e recebimentos'],
      ['all', 'Todas as movimentações'],
    ]);
    const order = select('Ordem', [
      ['native', 'Ordem do SEI'],
      ['recent', 'Mais recentes primeiro'],
    ]);
    const reset = node('button', 'Ver tudo', controls);
    reset.type = 'button';
    const status = node('p', null, section);
    status.setAttribute('role', 'status');
    const navigation = node('div', null, section);
    navigation.className = 'pages';
    const previous = node('button', 'Anterior', navigation),
      pageLabel = node('span', null, navigation),
      next = node('button', 'Próxima', navigation);
    previous.type = 'button';
    next.type = 'button';
    previous.setAttribute('aria-label', 'Página anterior do andamento filtrado');
    next.setAttribute('aria-label', 'Próxima página do andamento filtrado');
    let page = 0,
      complete = false,
      loading = true,
      loadError = '',
      disposed = false;
    const controller = new AbortController(),
      imported = new Set(),
      nativePagination = new Set();
    const originalCaption = info.table.querySelector('caption');
    const captionNodes = [...(originalCaption?.childNodes || [])];
    let captionChanged = false;
    const preference = 'seiOrganizador:historyFilter:' + info.key;
    try {
      const saved = JSON.parse(localStorage.getItem(preference));
      if (saved?.unit === 'all') unit.value = 'all';
      if (saved?.type === 'all') type.value = 'all';
      if (saved?.order === 'recent') order.value = 'recent';
    } catch {}
    const rows = new Set();
    let nativeOrder = [...info.table.querySelectorAll('tr')].filter((row) => row.querySelectorAll('td').length >= 4);
    const originalPositions = nativeOrder.map((row) => ({ row, parent: row.parentNode, next: row.nextSibling }));
    const tableStyle = document.createElement('style');
    tableStyle.textContent =
      '#tblHistorico tr.so-history-filtered,.so-history-native-pagination{display:none!important}';
    host.append(tableStyle);
    info.table.before(host);
    const apply = () => {
      let total = 0,
        visible = 0;
      const currentRows = [...info.table.querySelectorAll('tr')].filter(
        (row) => row.querySelectorAll('td').length >= 4,
      );
      const knownRows = new Set(nativeOrder);
      for (const row of currentRows)
        if (!knownRows.has(row)) {
          nativeOrder.push(row);
          knownRows.add(row);
        }
      const rank = new Map(nativeOrder.map((row, index) => [row, index]));
      const desired = [...currentRows].sort((a, b) =>
        order.value === 'recent' && !loading
          ? (D.parseDate(b.cells[0].textContent)?.getTime() || 0) -
              (D.parseDate(a.cells[0].textContent)?.getTime() || 0) || rank.get(a) - rank.get(b)
          : rank.get(a) - rank.get(b),
      );
      order.disabled = loading;
      if (
        !loading &&
        desired.some((row, index) => row !== currentRows[index]) &&
        new Set(desired.map((row) => row.parentNode)).size === 1
      ) {
        const parent = desired[0]?.parentNode;
        for (const row of desired) parent.append(row);
      }
      const matchesByRow = new Map(),
        matching = [];
      for (const row of info.table.querySelectorAll('tr')) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) continue;
        rows.add(row);
        total++;
        const destination = D.sigla(cells[1].textContent);
        const text = cells[3].textContent.replace(/\s+/g, ' ').trim();
        const sent = text.match(/^Processo remetido pela unidade (.+)$/);
        const received = /^Processo recebido na unidade\b/.test(text);
        const own = destination === D.sigla(info.unit) || (sent && D.sigla(sent[1]) === D.sigla(info.unit));
        const matches = (unit.value === 'all' || own) && (type.value === 'all' || sent || received);
        matchesByRow.set(row, !!matches);
        if (matches && !row.hidden) matching.push(row);
      }
      const pages = Math.max(1, Math.ceil(matching.length / 30));
      page = Math.min(page, pages - 1);
      const shown = new Set(matching.slice(page * 30, (page + 1) * 30));
      visible = shown.size;
      for (const [row, matches] of matchesByRow)
        row.classList.toggle('so-history-filtered', !matches || (!row.hidden && !shown.has(row)));
      previous.disabled = page === 0;
      next.disabled = page >= pages - 1;
      pageLabel.textContent = `Página ${page + 1} de ${pages} · 30 registros por página`;
      const expected = D.recordCount(info.table);
      const verified = complete && expected !== null && expected === total;
      const text = `${visible} de ${matching.length} registros correspondentes · ${total}${expected !== null ? ` de ${expected}` : ''} registros carregados. ${loading ? 'Carregando as outras páginas do SEI…' : loadError ? `Leitura incompleta: ${loadError} Use a paginação nativa para consultar os demais registros.` : !verified ? (expected !== null && expected > total ? 'Há outras páginas; o filtro se aplica somente aos registros carregados.' : 'Quantidade total não confirmada; filtro somente nos registros carregados.') : 'Leitura completa; os registros originais são preservados.'}`;
      if (status.textContent !== text) status.textContent = text;
    };
    const save = () => {
      try {
        localStorage.setItem(preference, JSON.stringify({ unit: unit.value, type: type.value, order: order.value }));
      } catch {}
      page = 0;
      apply();
    };
    unit.addEventListener('change', save);
    type.addEventListener('change', save);
    order.addEventListener('change', save);
    reset.addEventListener('click', () => {
      unit.value = 'all';
      type.value = 'all';
      save();
    });
    previous.addEventListener('click', () => {
      if (page > 0) {
        page--;
        apply();
      }
    });
    next.addEventListener('click', () => {
      page++;
      apply();
    });
    apply();
    const original = [...info.table.querySelectorAll('tr')].filter((row) => row.querySelectorAll('td').length >= 4);
    seiLoadHistoryPages(info.table, controller.signal)
      .then((result) => {
        if (disposed) return;
        complete = result.complete;
        loading = false;
        if (original.length) {
          for (const row of [...result.before, ...result.after]) imported.add(row);
          original[0].before(...result.before);
          original.at(-1).after(...result.after);
        }
        nativeOrder = [...info.table.querySelectorAll('tr')].filter((row) => row.querySelectorAll('td').length >= 4);
        if (complete)
          for (const element of document.querySelectorAll(
            '#divInfraAreaPaginacaoSuperior,#divInfraAreaPaginacaoInferior',
          )) {
            nativePagination.add(element);
            element.classList.add('so-history-native-pagination');
          }
        if (complete && originalCaption) {
          const text = originalCaption.textContent.replace(
            /(\(\s*[\d.]+\s+registros?)\s*[-–—]\s*\d+\s+a\s+\d+\s*\)/i,
            '$1)',
          );
          if (text !== originalCaption.textContent) {
            originalCaption.textContent = text;
            captionChanged = true;
          }
        }
        apply();
        if (complete) {
          const data = D.parseHistory(document);
          seiFullHistory.write(new URL(location.href).searchParams.get('id_procedimento'), info.actor, data, info.top);
        }
      })
      .catch((error) => {
        if (!disposed) {
          loading = false;
          loadError = error.message;
          apply();
        }
      });
    return {
      table: info.table,
      key: info.key,
      host,
      apply,
      dispose: () => {
        disposed = true;
        controller.abort();
        for (const row of rows) row.classList.remove('so-history-filtered');
        for (const row of imported) row.remove();
        for (const { row, parent, next } of [...originalPositions].reverse())
          if (row.isConnected && parent.isConnected)
            parent.insertBefore(row, next?.parentNode === parent ? next : null);
        for (const element of nativePagination) element.classList.remove('so-history-native-pagination');
        if (captionChanged) originalCaption.replaceChildren(...captionNodes);
        host.remove();
      },
    };
  }
  function reconcile() {
    scheduled = false;
    if (!active) return;
    const next = context();
    if (current && (!next || next.table !== current.table || next.key !== current.key)) {
      current.dispose();
      current = null;
    }
    if (!next) return;
    if (current && !current.host.isConnected) {
      current.dispose();
      current = null;
    }
    if (!current) current = mount(next);
    else current.apply();
  }
  const schedule = () => {
    if (active && !scheduled) {
      scheduled = true;
      queueMicrotask(reconcile);
    }
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('pagehide', () => {
    active = false;
    observer.disconnect();
    current?.dispose();
    current = null;
  });
  window.addEventListener('pageshow', () => {
    active = true;
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    schedule();
  });
  window.addEventListener('popstate', schedule);
  globalThis.seiHistoryFilterLifecycle = { reconcile };
  reconcile();
})();
