(() => {
  if (globalThis.seiOrganizerLifecycle) {
    globalThis.seiOrganizerLifecycle.reconcile();
    return;
  }
  let current = null,
    queued = false;
  function context() {
    const url = new URL(location.href);
    if (url.searchParams.get('acao') !== 'rel_bloco_protocolo_listar') return null;
    const table = document.querySelector('#tblProtocolosBlocos'),
      form = document.querySelector('#frmRelBlocoProtocoloLista');
    const internal =
      /Processos do Bloco Interno/i.test(document.title) ||
      Array.from(document.querySelectorAll('h1')).some((h) => /Processos do Bloco Interno/i.test(h.textContent));
    if (url.searchParams.get('acao') !== 'rel_bloco_protocolo_listar' || !internal || !table || !form) return null;
    const user = document.querySelector('a#lnkUsuarioSistema');
    let unit;
    try {
      unit = new URL(user?.getAttribute('href'), location.href).searchParams.get('infra_unidade_atual');
    } catch {}
    const block = url.searchParams.get('id_bloco'),
      org = (user?.title || '').match(/\/([^()]+)\)$/)?.[1];
    if (
      unit !== globalThis.SEI_ORGANIZADOR_CONFIG?.unitId ||
      !/^\d+$/.test(unit || '') ||
      !/^\d+$/.test(block || '') ||
      (org && org !== globalThis.SEI_ORGANIZADOR_CONFIG?.org)
    )
      return null;
    if (globalThis.seiWorkScope && !seiWorkScope.allows(block)) return null;
    return { table, form, user, unit, block, key: unit + ':' + block + ':' + (user?.title || '') };
  }
  function reconcile() {
    queued = false;
    const next = context();
    if (current && (!next || next.table !== current.table || next.form !== current.form || next.key !== current.key)) {
      current.dispose();
      current = null;
    }
    if (!next) return;
    if (current) {
      if (!current.root.isConnected) current.restore();
      return;
    }
    try {
      current = mount(next);
    } catch (error) {
      console.error('SEI Organizador: falha na inicialização', error);
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(reconcile);
  }
  const lifecycleObserver = new MutationObserver(schedule);
  lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  });
  window.addEventListener('pagehide', () => {
    lifecycleObserver.disconnect();
    current?.dispose();
    current = null;
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('sei-organizador:scope', schedule);
  globalThis.seiOrganizerLifecycle = { reconcile };
  reconcile();
  function mount(initial) {
    let disposed = false;
    const cleanups = [],
      originalRows = new Map();
    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    }
    function observe(observer, target, options) {
      observer.observe(target, options);
      cleanups.push(() => observer.disconnect());
      return observer;
    }
    // context() already validated page, unit, block and organization.
    const { table, form, user, unit, block } = initial;
    if (document.querySelector('#sei-organizador')) return;
    const match = (user?.title || '').match(/^(.+)\s+\(([^/()]+)\/([^()]+)\)$/);
    const actor = match
      ? { name: match[1].trim(), login: match[2], org: match[3] }
      : { name: 'Usuário não identificado', login: '', org: '' };
    const root = document.createElement('section');
    root.id = 'sei-organizador';
    root.setAttribute('aria-label', 'Organização por assunto');
    const anchor =
      document.querySelector('#divInfraAreaPaginacaoSuperior') ||
      document.querySelector('#divInfraAreaTabela') ||
      table;
    anchor.before(root);
    let state = { version: 0, tabs: [], assignments: {} },
      active = null,
      statusFilter = 'all',
      ready = false,
      busy = false;
    const toolbar = document.createElement('div'),
      tabs = document.createElement('div'),
      status = document.createElement('p'),
      history = document.createElement('div');
    tabs.setAttribute('role', 'tablist');
    status.setAttribute('role', 'status');
    root.append(tabs, toolbar, status, history);
    // Errors stay until the next user action; only sync failures are cleared by a successful sync.
    let statusTimer = null;
    function setStatus(text, kind = 'error') {
      clearTimeout(statusTimer);
      statusTimer = null;
      status.textContent = text;
      if (text) status.dataset.kind = kind;
      else delete status.dataset.kind;
      if (text && kind === 'success')
        statusTimer = setTimeout(() => {
          if (!disposed && status.dataset.kind === 'success') setStatus('');
        }, 4000);
    }
    cleanups.push(() => clearTimeout(statusTimer));
    const button = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'infraButton';
      b.textContent = label;
      b.onclick = fn;
      return b;
    };
    let historyOpen = false,
      historyGeneration = 0,
      historyRequest = null;
    history.id = 'so-history-panel';
    history.hidden = true;
    history.setAttribute('role', 'region');
    history.setAttribute('aria-label', 'Histórico de alterações');
    function updateHistoryToggle() {
      const b = toolbar.querySelector('[aria-controls="so-history-panel"]');
      if (b) {
        b.setAttribute('aria-expanded', String(historyOpen));
        b.textContent = historyOpen ? 'Fechar histórico' : 'Histórico';
      }
      history.hidden = !historyOpen;
    }
    function closeHistory() {
      historyOpen = false;
      historyGeneration++;
      history.replaceChildren();
      updateHistoryToggle();
    }
    const unassigned = '__unassigned__';
    const summary = document.createElement('p');
    summary.className = 'so-summary';
    root.insertBefore(summary, toolbar);
    const topbar = document.createElement('div');
    topbar.className = 'so-topbar';
    topbar.append(tabs);
    root.prepend(topbar);
    const viewing = document.createElement('span');
    viewing.className = 'so-viewing';
    viewing.setAttribute('role', 'status');
    topbar.append(viewing);
    summary.id = 'so-count-description';
    tabs.setAttribute('aria-describedby', summary.id);
    tabs.title = 'Contagens apenas dos processos carregados na página e pesquisa atuais';
    toolbar.className = 'so-toolbar';
    topbar.append(toolbar);
    cleanups.push(seiApplyTheme(root));
    form.classList.add('so-block-page');
    const description = form.querySelector('#txtDescricao'),
      descriptionLabel = form.querySelector('#lblDescricao'),
      searchPanel = form.querySelector('#divInfraAreaDados'),
      search = form.querySelector('#txtPalavrasPesquisaRelBlocoProtocolo'),
      searchLabel = form.querySelector('#lblPalavrasPesquisa');
    if (
      description?.parentElement === form &&
      descriptionLabel?.parentElement === form &&
      searchPanel?.parentElement === form &&
      search?.parentElement === searchPanel &&
      searchLabel?.parentElement === searchPanel &&
      searchPanel.children.length === 2
    ) {
      const lineBreak =
        descriptionLabel.nextElementSibling?.tagName === 'BR' ? descriptionLabel.nextElementSibling : null;
      const nodes = [descriptionLabel, ...(lineBreak ? [lineBreak] : []), description, searchPanel];
      const positions = nodes.map((node) => {
        const marker = document.createComment('so-native-field');
        node.before(marker);
        return { node, marker };
      });
      const fields = document.createElement('div');
      fields.className = 'so-block-fields';
      positions[0].marker.before(fields);
      const group = document.createElement('div');
      group.className = 'so-block-field';
      group.append(descriptionLabel, ...(lineBreak ? [lineBreak] : []), description);
      searchPanel.classList.add('so-block-field');
      fields.append(group, searchPanel);
      cleanups.push(() => {
        for (const { node, marker } of positions) marker.replaceWith(node);
        searchPanel.classList.remove('so-block-field');
        fields.remove();
      });
    }
    const pagination = document.getElementById('divInfraAreaPaginacaoSuperior');
    if (pagination) {
      const compactPagination = () =>
        pagination.classList.toggle(
          'so-empty-pagination',
          pagination.children.length === 0 && !pagination.textContent.trim(),
        );
      compactPagination();
      observe(new MutationObserver(compactPagination), pagination, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    root.after(history);
    // The rows get their columns once the service answered for the first time (or failed, or after 400 ms).
    // Drawing 1,000 rows as "not synchronised" and again with the real data laid the table out twice.
    let settled = false;
    const settleTimer = setTimeout(() => settle(), 400);
    cleanups.push(() => clearTimeout(settleTimer));
    function settle(draw = true) {
      if (settled) return;
      settled = true;
      clearTimeout(settleTimer);
      if (draw) filter();
    }
    let tableHeaderFrame = null;
    function scheduleTableHeader() {
      if (disposed || tableHeaderFrame !== null) return;
      tableHeaderFrame = (window.requestAnimationFrame || window.setTimeout)(() => {
        tableHeaderFrame = null;
        if (!disposed) updateTableHeader();
      });
    }
    function updateTableHeader() {
      // Before the columns exist the header stays as the SEI drew it: floating it early laid the table out again.
      if (!settled) return;
      const header = Array.from(table.rows).find((r) => r.querySelector('th'));
      if (!header) return;
      // Move the original cells within their table, so native controls and horizontal scrolling stay intact.
      const rect = table.getBoundingClientRect(),
        height = header.getBoundingClientRect().height;
      const naturalTop = rect.top + header.offsetTop;
      const offset = Math.max(
        0,
        Math.min(root.getBoundingClientRect().bottom - naturalTop, rect.bottom - height - naturalTop),
      );
      const shift = offset + 'px';
      // On the header row only: on the table it would restyle every cell of every row each frame.
      if (header.style.getPropertyValue('--so-table-header-shift') !== shift)
        header.style.setProperty('--so-table-header-shift', shift);
      for (const cell of header.cells)
        if (!cell.classList.contains('so-floating-header')) cell.classList.add('so-floating-header');
    }
    function stickyOffset() {
      let scrollContainer = null;
      for (let e = root.parentElement; e && e !== document.body; e = e.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(e).overflowY)) {
          scrollContainer = e;
          break;
        }
      }
      const edge = scrollContainer ? scrollContainer.getBoundingClientRect().top + scrollContainer.clientTop : 0;
      let offset = 0;
      for (const id of ['divInfraBarraSistema', 'navInfraBarraNavegacao']) {
        const header = document.getElementById(id);
        if (!header) continue;
        const style = getComputedStyle(header),
          rect = header.getBoundingClientRect();
        if (scrollContainer || ['fixed', 'sticky'].includes(style.position))
          offset = Math.max(offset, rect.bottom - edge);
      }
      const top = Math.max(0, offset) + 'px';
      if (root.style.getPropertyValue('--so-sticky-top') !== top) root.style.setProperty('--so-sticky-top', top);
    }
    stickyOffset();
    scheduleTableHeader();
    // Scroll fires per pixel (captured from every scroller): measure and move the header once per frame,
    // in the same frame, so the floating header never lags a frame behind.
    let stickyFrame = null;
    const scheduleSticky = () => {
      if (stickyFrame !== null || disposed) return;
      stickyFrame = (window.requestAnimationFrame || window.setTimeout)(() => {
        stickyFrame = null;
        if (disposed) return;
        stickyOffset();
        updateTableHeader();
      });
    };
    listen(window, 'resize', scheduleSticky);
    listen(window, 'scroll', scheduleSticky, true);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scheduleSticky);
      cleanups.push(() => observer.disconnect());
      observer.observe(root);
      observer.observe(table);
      for (const id of ['divInfraBarraSistema', 'navInfraBarraNavegacao', 'divInfraAreaTelaD']) {
        const e = document.getElementById(id);
        if (e) observer.observe(e);
      }
    }
    let contextMenu = null,
      contextReturn = null;
    function closeMenu(restore = false) {
      contextMenu?.remove();
      contextMenu = null;
      if (restore) contextReturn?.focus();
      contextReturn = null;
    }
    function openMenu(event, control = null) {
      closeMenu();
      if (
        !ready ||
        busy ||
        !state.tabs.length ||
        (!control && event.target.closest('a,button,input,select,textarea,[contenteditable=true]'))
      )
        return;
      const target = rows().find((r) => r.row === event.target.closest('tr'));
      if (!target || target.row.hidden) return;
      event.preventDefault();
      contextReturn = control || target.row;
      const menu = document.createElement('div');
      contextMenu = menu;
      menu.className = 'so-context-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', `Classificar processo ${target.number || target.id}`);
      const title = document.createElement('p');
      title.textContent = `Classificar ${target.number || 'Identificador interno ' + target.id}`;
      menu.append(title);
      for (const folder of state.tabs) {
        const assigned = (state.assignments[target.id] || []).includes(folder.id);
        const type = assigned ? 'unassign' : 'assign';
        const b = button(`${assigned ? '✓ Retirar de' : 'Atribuir a'} ${folder.name}`, async () => {
          closeMenu(true);
          await change({
            type,
            tabId: folder.id,
            processIds: [target.id],
            processNumbers: { [target.id]: target.number },
          });
        });
        b.setAttribute('role', 'menuitemcheckbox');
        b.setAttribute('aria-checked', String(assigned));
        b.dataset.action = type;
        menu.append(b);
      }
      root.append(menu);
      const rect = menu.getBoundingClientRect();
      const x = event.clientX || contextReturn.getBoundingClientRect().left,
        y = event.clientY || contextReturn.getBoundingClientRect().bottom;
      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
      menu.querySelector('button')?.focus();
      menu.addEventListener('keydown', (e) => {
        const items = Array.from(menu.querySelectorAll('button'));
        const index = items.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next].focus();
        }
        if (e.key === 'Tab') closeMenu();
      });
    }
    listen(table, 'contextmenu', openMenu);
    listen(table, 'keydown', (e) => {
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) openMenu(e);
    });
    listen(document, 'pointerdown', (e) => {
      if (contextMenu && !contextMenu.contains(e.target)) closeMenu();
    });
    listen(document, 'keydown', (e) => {
      if (e.key === 'Escape' && contextMenu) {
        e.preventDefault();
        closeMenu(true);
      }
    });
    listen(
      window,
      'scroll',
      (event) => !(event.target?.nodeType && contextMenu?.contains(event.target)) && closeMenu(),
      true,
    );
    listen(window, 'resize', () => closeMenu());
    const processNumber = (a) => a.textContent.replace(/\s+/g, ' ').trim();
    const copyControls = new WeakMap();
    // Parsed once per table change (the table observer clears it), not on every click or menu.
    let rowCache = null;
    function rows() {
      if (rowCache) return rowCache;
      return (rowCache = Array.from(table.querySelectorAll('tr')).flatMap((row) => {
        const a = row.querySelector('a[href*="id_procedimento="]');
        if (!a) return [];
        // Read from the address text: building a URL object per row is slow in blocks with 1,000 processes.
        const id = /[?&]id_procedimento=(\d+)(?:[&#]|$)/.exec(a.getAttribute('href'))?.[1];
        return id
          ? [{ row, id, link: a, number: processNumber(a), check: row.querySelector('input[type="checkbox"]') }]
          : [];
      }));
    }
    // Cells and controls of each row, found once and reused while they stay in the row. Looking them up
    // again on every pass was most of the script time of opening a block with 1,000 processes.
    const rowParts = new WeakMap();
    function partsOf(item, names, layout) {
      const { row } = item;
      let parts = rowParts.get(row);
      if (parts && parts.layout === layout && parts.type?.parentElement === row) return parts;
      const own = [],
        labelled = new Map();
      let simple = true;
      for (const cell of row.cells) {
        if (cell.colSpan !== 1) simple = false;
        if (cell.dataset.soColumn) continue;
        own.push(cell);
        const label = cell.tagName === 'TD' && cell.dataset.label;
        if (label && !labelled.has(label)) labelled.set(label, cell);
      }
      const cellFor = (name) => labelled.get(name) || own[names.indexOf(name)];
      if (!names[0]) item.check?.closest('td')?.classList.add('so-col-selection');
      for (const [name, kind] of nativeColumns) cellFor(name)?.classList.add('so-col-' + kind);
      parts = {
        layout,
        simple,
        type: cellFor('Tipo'),
        subject: row.querySelector('[data-so-column="subject"]'),
        status: row.querySelector('[data-so-column="status"]'),
        marker: row.querySelector('.so-status-marker'),
      };
      rowParts.set(row, parts);
      return parts;
    }
    const nativeColumns = [
      ['Seq.', 'sequence'],
      ['Processo', 'process'],
      ['Tipo', 'type'],
      ['Anotações', 'notes'],
      ['Ações', 'actions'],
    ];
    function injectCopyButtons(loaded) {
      for (const { link } of loaded) {
        const container = link.closest('td') || link.parentElement;
        const existing = copyControls.get(link);
        const reusable = existing?.button.parentElement === container && existing?.feedback.parentElement === container;
        for (const control of container.querySelectorAll('.so-copy-number,.so-copy-feedback')) {
          if (!reusable || (control !== existing.button && control !== existing.feedback)) control.remove();
        }
        if (reusable) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'so-copy-number';
        b.textContent = '⧉';
        b.setAttribute('aria-label', 'Copiar número do processo');
        b.title = 'Copiar número do processo';
        const feedback = document.createElement('span');
        feedback.className = 'so-copy-feedback';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        let timer;
        b.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (b.disabled) return;
          b.disabled = true;
          clearTimeout(timer);
          feedback.textContent = '';
          try {
            const number = processNumber(link);
            if (!number || !navigator.clipboard?.writeText) throw new Error('Clipboard indisponível');
            await navigator.clipboard.writeText(number);
            feedback.textContent = 'Copiado';
          } catch {
            feedback.textContent = 'Não foi possível copiar. Selecione o número manualmente.';
          } finally {
            b.disabled = false;
            timer = setTimeout(
              () => {
                feedback.textContent = '';
              },
              feedback.textContent === 'Copiado' ? 1000 : 4000,
            );
          }
        });
        b.addEventListener('contextmenu', (e) => e.stopPropagation());
        link.after(b, feedback);
        copyControls.set(link, { button: b, feedback });
      }
    }
    const statusIcons = { none: '○', attention: '⚠', follow: '👁', urgent: '🔴', sign: '✍', archive: '📁' };
    function statusKnown() {
      return ready && state.statuses && typeof state.statuses === 'object';
    }
    function injectColumns(loaded) {
      const header = Array.from(table.rows).find((r) => r.querySelector('th'));
      if (!header) return;
      const native = Array.from(header.cells).filter((c) => !c.dataset.soColumn);
      const names = native.map((c) => c.textContent.trim());
      const typeIndex = names.indexOf('Tipo');
      if (typeIndex < 0 || native.some((c) => c.colSpan !== 1)) return;
      const groups = table.querySelectorAll('colgroup');
      if (
        groups.length > 1 ||
        (groups.length && Array.from(groups[0].children).filter((c) => !c.dataset.soColumn).length !== native.length) ||
        (groups.length && Array.from(groups[0].children).some((c) => c.span !== 1))
      )
        return;
      if (!names[0]) native[0].classList.add('so-col-selection');
      for (const [name, kind] of nativeColumns) native[names.indexOf(name)]?.classList.add('so-col-' + kind);
      const layout = names.join('\n');
      const columns =
        active === null
          ? [
              ['subject', 'Assunto'],
              ['status', 'Status'],
            ]
          : [['status', 'Status']];
      if (active !== null) for (const cell of table.querySelectorAll('[data-so-column="subject"]')) cell.remove();
      let after = native[typeIndex];
      for (const [key, label] of columns) {
        let h = header.querySelector(`[data-so-column="${key}"]`);
        if (!h) {
          h = document.createElement('th');
          h.className = native[typeIndex].className;
          h.classList.remove('so-col-type');
          h.classList.add('so-col-' + key);
          h.dataset.soColumn = key;
          h.scope = 'col';
          h.textContent = label;
          after.after(h);
        }
        after = h;
      }
      const group = table.querySelector('colgroup');
      if (group) {
        let previous = Array.from(group.children).filter((c) => !c.dataset.soColumn)[typeIndex];
        for (const [key] of columns) {
          let col = group.querySelector(`[data-so-column="${key}"]`);
          if (!col) {
            col = document.createElement('col');
            col.dataset.soColumn = key;
            previous.after(col);
          }
          previous = col;
        }
      }
      const locked = !ready || busy || !state.tabs.length;
      for (const item of loaded) {
        const { row, id } = item,
          parts = partsOf(item, names, layout);
        if (!parts.type || !parts.simple) continue;
        let previous = parts.type;
        for (const [key, label] of columns) {
          let cell = parts[key];
          if (!cell) {
            cell = parts[key] = document.createElement('td');
            cell.dataset.soColumn = key;
            cell.dataset.label = label;
            cell.className = 'so-col-' + key;
          }
          // Also puts back the subject cell taken out while a subject tab was open.
          if (cell.parentElement !== row) previous.after(cell);
          previous = cell;
        }
        const cell = active === null ? parts.subject : null;
        if (!cell) continue;
        const assigned = ready ? state.assignments[id] : null;
        const folders = ready ? (assigned?.length ? state.tabs.filter((t) => assigned.includes(t.id)) : []) : null;
        const signature = JSON.stringify(folders?.map((t) => t.name) ?? null);
        const drawn = signature + (locked ? '|locked' : '') + (state.tabs.length ? '' : '|empty');
        if (parts.drawn === drawn && parts.label?.parentElement === cell) continue;
        parts.drawn = drawn;
        if (cell.dataset.soSubjects !== signature || parts.label?.parentElement !== cell) {
          cell.dataset.soSubjects = signature;
          cell.replaceChildren();
          const names = folders?.map((t) => t.name);
          const label = document.createElement('button');
          label.type = 'button';
          label.className = 'so-subject-label';
          label.textContent = names?.length ? names[0] : ready ? 'Sem assunto' : 'Não sincronizado';
          label.setAttribute('aria-haspopup', 'menu');
          label.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenu(e, label);
          });
          label.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            openMenu(e, label);
          });
          label.addEventListener('keydown', (e) => {
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.stopPropagation();
              openMenu(e, label);
            }
          });
          cell.append(label);
          parts.label = label;
          if (names?.length > 1) {
            const more = document.createElement('span');
            more.className = 'so-subject-more';
            more.textContent = `mais ${names.length - 1}`;
            cell.append(more);
          }
          cell.title = names?.length ? names.join('\n') : label.textContent;
          cell.setAttribute('aria-label', names?.length ? `Assuntos: ${names.join(', ')}` : label.textContent);
        }
        const control = parts.label;
        control.disabled = locked;
        control.setAttribute(
          'aria-label',
          `Alterar assuntos do processo ${item.number}: ${cell.getAttribute('aria-label')}`,
        );
        control.title = !state.tabs.length
          ? 'Crie um assunto para classificar'
          : cell.title + ' · Clique para atribuir ou retirar assuntos';
      }
      const loadedRows = new Set(loaded.map((item) => item.row));
      for (const row of table.rows) {
        if (row === header || loadedRows.has(row)) continue;
        for (const c of row.cells) {
          if (!c.dataset.soOriginalSpan && c.colSpan === native.length) c.dataset.soOriginalSpan = String(c.colSpan);
          if (c.dataset.soOriginalSpan) c.colSpan = Number(c.dataset.soOriginalSpan) + columns.length;
        }
      }
      table.classList.add('so-organized-table');
      let container = table.parentElement;
      if (container === form) {
        container = document.createElement('div');
        table.before(container);
        container.append(table);
      }
      container.classList.add('so-table-scroll');
    }
    function injectStatusMarkers(loaded) {
      const known = statusKnown();
      for (const target of loaded) {
        const parts = rowParts.get(target.row),
          cell = parts?.status;
        if (!cell || cell.parentElement !== target.row) continue;
        let marker = parts.marker;
        if (marker && marker.parentElement !== cell) cell.append(marker);
        const value = known ? state.statuses[target.id] || 'none' : null;
        const shown = `${value}|${busy}`;
        if (marker && parts.shown === shown) continue;
        parts.shown = shown;
        if (!marker) {
          marker = parts.marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'so-status-marker';
          marker.setAttribute('aria-haspopup', 'menu');
          marker.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openStatus(target, marker);
          });
          marker.addEventListener('contextmenu', (e) => e.stopPropagation());
          cell.prepend(marker);
        }
        const text = value
          ? `${statusIcons[value] || '○'} ${seiStatusLabels[value] || 'Status desconhecido'}`
          : '○ Status indisponível';
        if (marker.textContent !== text) marker.textContent = text;
        marker.dataset.status = value || 'unknown';
        marker.disabled = !known || busy;
        marker.title = value
          ? `Status manual: ${seiStatusLabels[value]}. Clique para alterar.`
          : 'Status não sincronizado. Reinicie o serviço atualizado ou verifique a conexão.';
        marker.setAttribute('aria-label', `${text} · ${target.number}`);
      }
    }
    function openStatus(target, marker) {
      closeMenu();
      if (!statusKnown() || busy) return;
      contextReturn = marker;
      const menu = document.createElement('div');
      contextMenu = menu;
      menu.className = 'so-context-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', `Status manual de ${target.number}`);
      const title = document.createElement('p');
      title.textContent = `Status manual · ${target.number}`;
      menu.append(title);
      for (const [value, label] of Object.entries(seiStatusLabels)) {
        const item = button(`${statusIcons[value]} ${label}`, async () => {
          closeMenu(true);
          await change({
            type: 'status',
            status: value,
            processIds: [target.id],
            processNumbers: { [target.id]: target.number },
          });
        });
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String((state.statuses[target.id] || 'none') === value));
        menu.append(item);
      }
      root.append(menu);
      const pos = marker.getBoundingClientRect(),
        rect = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(pos.left, innerWidth - rect.width - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(pos.bottom, innerHeight - rect.height - 8)) + 'px';
      menu.querySelector('button').focus();
      menu.addEventListener('keydown', (e) => {
        const items = Array.from(menu.querySelectorAll('button')),
          i = items.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          items[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          ].focus();
        }
        if (e.key === 'Tab') closeMenu();
      });
    }
    function filter() {
      if (disposed) return;
      tableObserver.disconnect();
      try {
        rowCache = null;
        const loaded = rows(),
          valid = new Set(state.tabs.map((t) => t.id));
        if (settled) {
          injectColumns(loaded);
          injectCopyButtons(loaded);
          injectStatusMarkers(loaded);
        }
        const ids = new Set(loaded.map((r) => r.id));
        // Each id's valid tabs are computed once; counts below reuse them instead of re-filtering.
        const linkCache = new Map();
        const links = (id) => {
          let value = linkCache.get(id);
          if (!value) {
            value = (state.assignments[id] || []).filter((t) => valid.has(t));
            linkCache.set(id, value);
          }
          return value;
        };
        const empty = [...ids].filter((id) => !links(id).length).length;
        const matchesStatus = (id) =>
          statusFilter === 'all' || !statusKnown() || (state.statuses[id] || 'none') === statusFilter;
        for (const { row, id, check } of loaded) {
          if (!originalRows.has(row))
            originalRows.set(row, {
              hidden: row.hidden,
              tabindex: row.getAttribute('tabindex'),
              popup: row.getAttribute('aria-haspopup'),
            });
          if (!row.hasAttribute('tabindex')) row.tabIndex = 0;
          if (row.getAttribute('aria-haspopup') !== 'menu') row.setAttribute('aria-haspopup', 'menu');
          const hide =
            (ready && !!active && (active === unassigned ? links(id).length > 0 : !links(id).includes(active))) ||
            !matchesStatus(id);
          if (row.hidden !== hide) row.hidden = hide;
          // Through a click, so the SEI's own handler drops it from hdnInfraItensSelecionados too.
          if (hide && check?.checked) unselect(check);
        }
        for (const b of tabs.querySelectorAll('[role=tab]')) {
          const key = b.dataset.tab;
          if (key === 'general') {
            delete b.dataset.count;
            b.setAttribute('aria-label', 'Geral — mostrar todos os processos');
            b.title = active
              ? 'Mostrar todos os processos carregados nesta página'
              : 'Todos os processos carregados nesta página';
            continue;
          }
          const count = !ready
            ? '—'
            : [...ids].filter(
                (id) => matchesStatus(id) && (key === unassigned ? !links(id).length : links(id).includes(key)),
              ).length;
          b.dataset.count = String(count);
          b.setAttribute('aria-label', `${b.textContent}: ${count} processos carregados nesta página`);
        }
        summary.textContent = ready
          ? `${ids.size} processos carregados nesta página · ${ids.size - empty} com assunto · ${empty} sem assunto. Contagens limitadas à página e pesquisa atuais.`
          : `${ids.size} processos carregados nesta página · classificações desconhecidas sem sincronização.`;
        viewing.textContent = `Visualizando: ${!active ? 'todos os processos' : active === unassigned ? 'Sem assunto' : state.tabs.find((t) => t.id === active)?.name || 'todos os processos'}${statusFilter === 'all' ? '' : ' · ' + seiStatusLabels[statusFilter]} · ${loaded.filter((r) => !r.row.hidden).length}/${ids.size} carregados${statusKnown() ? '' : ' · Status indisponível'}`;
        viewing.title = viewing.textContent;
        const eligible = [...ids].filter(
          (id) => !active || (active === unassigned ? !links(id).length : links(id).includes(active)),
        );
        const byStatus = new Map();
        if (statusKnown())
          for (const id of eligible) {
            const value = state.statuses[id] || 'none';
            byStatus.set(value, (byStatus.get(value) || 0) + 1);
          }
        for (const option of toolbar.querySelectorAll('.so-status-filter option')) {
          const base = option.value === 'all' ? 'Todos os status' : seiStatusLabels[option.value];
          const count = statusKnown()
            ? option.value === 'all'
              ? eligible.length
              : byStatus.get(option.value) || 0
            : '—';
          const text = base + ' (' + count + ')';
          if (option.textContent !== text) option.textContent = text;
        }
        scheduleTableHeader();
      } finally {
        if (!disposed) tableObserver.observe(table, { childList: true, subtree: true });
      }
    }
    function unselect(check) {
      const disabled = check.disabled;
      check.disabled = false;
      check.click();
      check.disabled = disabled;
    }
    const selectedRows = () => rows().filter((item) => item.check?.checked && !item.row.hidden);
    function updateBatch() {
      const select = toolbar.querySelector('.so-batch-status'),
        apply = toolbar.querySelector('.so-batch-apply');
      if (!select || !apply) return;
      const count = selectedRows().length;
      select.disabled = !statusKnown() || busy || !count;
      apply.disabled = !statusKnown() || busy || !count || !select.value;
      const text = count ? `Aplicar em ${count}` : 'Aplicar status';
      if (apply.textContent !== text) apply.textContent = text;
    }
    listen(form, 'change', updateBatch);
    listen(form, 'click', (event) => {
      if (event.target.closest?.('a[href*="id_procedimento="]')) return;
      // The native select-all also marks hidden rows; unmark them the same way as the filter does.
      if (event.target.closest?.('#lnkInfraCheck,[onclick*="infraSelecaoMultipla"]'))
        setTimeout(() => {
          if (disposed) return;
          for (const { row, check } of rows()) if (row.hidden && check?.checked) unselect(check);
          updateBatch();
        });
      queueMicrotask(updateBatch);
    });
    const focusKey = (e) =>
      `${e.tagName}|${e.className}|${e.dataset?.tab || ''}|${e.tagName === 'SELECT' ? '' : e.textContent}`;
    function render() {
      if (disposed) return;
      const kept = toolbar.querySelector('.so-batch-status')?.value || '',
        focused =
          document.activeElement && (toolbar.contains(document.activeElement) || tabs.contains(document.activeElement))
            ? focusKey(document.activeElement)
            : null;
      closeMenu();
      if (active && active !== unassigned && !state.tabs.some((t) => t.id === active)) active = null;
      tabs.replaceChildren();
      for (const t of [{ id: null, name: 'Geral' }, { id: unassigned, name: 'Sem assunto' }, ...state.tabs]) {
        const b = button(t.name, () => {
          active = t.id;
          render();
        });
        b.dataset.tab = t.id || 'general';
        b.disabled = t.id !== null && !ready;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t.id === active));
        tabs.append(b);
      }
      toolbar.replaceChildren();
      const add = button('+ Criar assunto', async () => {
        const name = prompt('Nome do assunto');
        if (name) await change({ type: 'create', name });
      });
      toolbar.append(add);
      if (active && active !== unassigned) {
        toolbar.append(
          button('Renomear', async () => {
            const name = prompt('Novo nome', state.tabs.find((t) => t.id === active).name);
            if (name) await change({ type: 'rename', tabId: active, name });
          }),
          button('Excluir aba', async () => {
            if (confirm('Excluir esta aba e suas classificações? Os processos permanecem no Geral.'))
              await change({ type: 'delete', tabId: active });
          }),
        );
      }
      const select = document.createElement('select');
      select.className = 'so-status-filter';
      select.setAttribute('aria-label', 'Filtrar por status manual');
      for (const [value, label] of [['all', 'Todos os status'], ...Object.entries(seiStatusLabels)]) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        select.append(o);
      }
      select.value = statusFilter;
      select.onchange = () => {
        statusFilter = select.value;
        render();
      };
      toolbar.append(select);
      const batch = document.createElement('select');
      batch.className = 'so-batch-status';
      batch.setAttribute('aria-label', 'Status dos processos selecionados');
      for (const [value, label] of [['', 'Status dos selecionados…'], ...Object.entries(seiStatusLabels)]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        batch.append(option);
      }
      batch.addEventListener('change', updateBatch);
      const apply = button('Aplicar status', async () => {
        const selected = selectedRows(),
          value = batch.value;
        if (!selected.length || !value || busy || !statusKnown()) return;
        const preview = selected
          .slice(0, 10)
          .map((row) => row.number || row.id)
          .join('\n');
        if (
          !confirm(
            `Alterar o status de ${selected.length} processo(s) selecionado(s) para ${seiStatusLabels[value]}?\n\n${preview}${selected.length > 10 ? '\n…' : ''}\n\nA alteração poderá ser desfeita pelo histórico.`,
          )
        )
          return;
        await change({
          type: 'status',
          status: value,
          processIds: selected.map((row) => row.id),
          processNumbers: Object.fromEntries(selected.map((row) => [row.id, row.number])),
        });
        const chosen = toolbar.querySelector('.so-batch-status');
        if (chosen) chosen.value = '';
        updateBatch();
      });
      apply.classList.add('so-batch-apply');
      toolbar.append(batch, apply);
      const historyButton = button('Histórico', () => (historyOpen ? closeHistory() : showHistory()));
      historyButton.setAttribute('aria-controls', history.id);
      toolbar.append(historyButton);
      for (const b of toolbar.querySelectorAll('button,select')) b.disabled = !ready || busy;
      select.disabled = !statusKnown() || busy;
      historyButton.disabled = !historyOpen && (!ready || busy);
      updateHistoryToggle();
      for (const b of history.querySelectorAll('.so-undo-record'))
        b.disabled = busy || !ready || b.dataset.undoable !== 'true';
      if (kept && seiStatusLabels[kept]) batch.value = kept;
      if (focused)
        [...tabs.querySelectorAll('button'), ...toolbar.querySelectorAll('button,select')]
          .find((e) => focusKey(e) === focused && !e.disabled)
          ?.focus({ preventScroll: true });
      filter();
      updateBatch();
    }
    const ownRecord = (h) =>
      !!actor.login.trim() &&
      actor.login.trim().toLowerCase() === (h.actor?.login || '').trim().toLowerCase() &&
      actor.org.trim().toLowerCase() === (h.actor?.org || '').trim().toLowerCase();
    async function undoSelected(selected) {
      if (!ready || busy) return;
      busy = true;
      setStatus('');
      render();
      try {
        const latestState = await api(),
          items = await api({ history: true });
        if (disposed) return;
        const latest = items.find((h) => h.id === selected.id);
        if (!latest) throw new Error('A alteração não está mais disponível no histórico.');
        if (!ownRecord(latest)) throw new Error('Você só pode desfazer suas próprias alterações.');
        if (latest.undoable !== true) throw new Error(latest.undoReason || 'Este registro não pode ser desfeito.');
        if (!Number.isInteger(latest.id))
          throw new Error('Histórico sem identificador seguro. Atualize o serviço antes de desfazer.');
        if (items[0]?.version !== latestState.version)
          throw new Error('O histórico mudou durante a consulta. Abra o histórico e confira novamente.');
        state = latestState;
        const description = seiHistoryText(
          seiResolveHistory([latest], state)[0],
          Object.fromEntries(rows().map((r) => [r.id, r.number])),
        );
        if (
          !confirm(
            `Desfazer esta alteração compartilhada do bloco?\n\n${description}\nAutor: ${latest.actor?.name || latest.actor?.login || 'Usuário não identificado'}\n\nIsso afeta todos os colegas. Confirmar?`,
          )
        )
          return;
        const next = await api({
          body: { version: latestState.version, actor, action: { type: 'undo', historyId: latest.id } },
        });
        if (disposed) return;
        state = next;
        setStatus('Alteração desfeita.', 'success');
      } catch (e) {
        if (!disposed) setStatus('Não foi possível desfazer: ' + e.message);
      } finally {
        busy = false;
        if (!disposed) {
          render();
          if (historyOpen) await showHistory();
        }
      }
    }
    async function api(extra = {}) {
      if (disposed) throw new Error('Página substituída');
      let result;
      try {
        result = await chrome.runtime.sendMessage({
          type: 'api',
          identity: globalThis.seiWorkScope?.identity,
          unit,
          block,
          ...extra,
        });
      } catch (e) {
        // After the extension is updated or reloaded, the scripts of pages already open lose contact with it.
        throw new Error(
          /context invalidated/i.test(e?.message)
            ? 'A extensão foi atualizada ou recarregada. Recarregue esta página (F5).'
            : e?.message || 'A extensão não respondeu.',
        );
      }
      if (!result) throw new Error('A extensão não respondeu. Recarregue esta página (F5).');
      if (result.error) throw new Error(result.error);
      return result.data;
    }
    let refreshing = false,
      resumeView = null;
    async function refresh() {
      if (busy || refreshing || disposed) return;
      refreshing = true;
      try {
        const next = await api();
        if (disposed || busy) return;
        if (ready && next.version === state.version) return;
        // An open menu would be closed by a redraw: apply the colleague's change on the next poll.
        if (ready && contextMenu) return;
        const changed = next.version !== state.version;
        if (next.version >= state.version) state = next;
        ready = true;
        settle(false);
        if (resumeView) {
          // Back online: return to the tab and filter the user had before the failure.
          if (
            resumeView.active === null ||
            resumeView.active === unassigned ||
            state.tabs.some((t) => t.id === resumeView.active)
          )
            active = resumeView.active;
          statusFilter = resumeView.statusFilter;
          resumeView = null;
        }
        if (!statusKnown()) statusFilter = 'all';
        render();
        if (changed && historyOpen) showHistory();
        if (status.dataset.kind === 'sync') setStatus('');
      } catch (e) {
        if (disposed) return;
        const message = 'Sem sincronização: ' + e.message + ' · Geral preservado.';
        if (!ready) {
          // Already offline: no redraw every 10 s.
          if (status.textContent !== message) setStatus(message, 'sync');
          settle();
          return;
        }
        closeMenu();
        resumeView = { active, statusFilter };
        ready = false;
        active = null;
        statusFilter = 'all';
        render();
        setStatus(message, 'sync');
      } finally {
        refreshing = false;
      }
    }
    async function change(action) {
      if (!ready || busy) return;
      busy = true;
      setStatus('');
      render();
      let saved = false;
      try {
        let next;
        try {
          next = await api({ body: { version: state.version, actor, action } });
        } catch (e) {
          // A colleague saved first. Assigning, removing and setting a status mean the same on the
          // newer state, so they are retried once on it instead of being lost.
          if (disposed || !conflict(e) || !['assign', 'unassign', 'status'].includes(action.type)) throw e;
          state = await api();
          if (disposed) return;
          next = await api({ body: { version: state.version, actor, action } });
        }
        if (disposed) return;
        state = next;
        saved = true;
        setStatus('Alteração salva.', 'success');
      } catch (e) {
        if (!disposed)
          setStatus(
            conflict(e) ? 'Outro colega alterou este bloco ao mesmo tempo; confira e tente novamente.' : e.message,
          );
      } finally {
        busy = false;
        render();
      }
      if (saved) {
        if (historyOpen) showHistory();
      } else await refresh();
    }
    const conflict = (e) => /outro colega/i.test(e?.message || '');
    async function showHistory() {
      historyOpen = true;
      const generation = ++historyGeneration;
      updateHistoryToggle();
      history.replaceChildren();
      const loading = document.createElement('p');
      loading.textContent = 'Carregando histórico…';
      history.append(loading);
      if (!historyRequest)
        historyRequest = api({ history: true }).finally(() => {
          historyRequest = null;
        });
      try {
        const items = await historyRequest;
        if (!historyOpen || generation !== historyGeneration) return;
        loading.remove();
        // Indexed once per render: rows() parses every table link and items can hold 100 entries.
        const numbers = Object.fromEntries(rows().map((r) => [r.id, r.number]));
        const undoneIds = new Set(
          items.filter((item) => item.action.type === 'undo').map((item) => item.action.historyId),
        );
        for (const h of seiResolveHistory(items, state)) {
          const p = document.createElement('p');
          p.className =
            'so-history-entry so-history-' +
            (['create', 'delete', 'assign', 'unassign', 'rename', 'undo', 'status', 'departed'].includes(h.action.type)
              ? h.action.type
              : 'unknown');
          const parts = seiHistoryText(h, numbers).split(' · ');
          p.append(parts[0] + ' · ');
          const user = document.createElement('span');
          user.className = 'so-history-user';
          user.textContent = h.actor?.login || 'Usuário não identificado';
          user.title =
            h.actor?.name && h.actor.name !== 'Usuário não identificado'
              ? `${h.actor.name} (${h.actor.login || ''}${h.actor.org ? '/' + h.actor.org : ''})`
              : 'Nome completo não disponível neste registro';
          p.append(user, ' · ' + parts.slice(2).join(' · '));
          if (h.undoReason) p.title = h.undoReason;
          if (undoneIds.has(h.id)) {
            const undone = document.createElement('span');
            undone.className = 'so-history-reverted';
            undone.textContent = ' · Desfeita';
            p.append(undone);
          }
          if (ownRecord(h) && h.action.type !== 'undo' && h.undoable === true) {
            const undo = button('Desfazer', () => undoSelected(h));
            undo.classList.add('so-undo-record');
            undo.dataset.undoable = String(h.undoable === true);
            undo.disabled = busy || !ready || h.undoable !== true;
            undo.title =
              h.undoable === true
                ? 'Desfazer somente esta alteração'
                : h.undoReason || 'Este registro não pode ser desfeito';
            p.append(undo);
          }
          history.append(p);
        }
      } catch (e) {
        if (historyOpen && generation === historyGeneration)
          loading.textContent = 'Não foi possível carregar: ' + e.message;
      }
    }
    // Our own DOM writes must not trigger another full table pass.
    // Text changes inside our controls, and labels other scripts put beside links (presence, "Novo"),
    // never change what this pass produces. Anything else (rows, our controls removed) re-runs it.
    const widgets = '[data-so-column],.so-copy-feedback,.so-status-marker,.so-editing-presence,.so-new-process-label',
      labels = '.so-editing-presence,.so-new-process-label';
    const extensionMutation = (record) => {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (element?.closest?.(widgets)) return true;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      return (
        !!nodes.length && nodes.every((node) => (node.nodeType === 1 ? node.matches(labels) : !node.textContent.trim()))
      );
    };
    const tableObserver = new MutationObserver((records) => {
      if (records.every(extensionMutation)) return;
      rowCache = null;
      filter();
    });
    observe(tableObserver, table, { childList: true, subtree: true });
    render();
    refresh();
    const timer = setInterval(() => {
      reconcile();
      if (!disposed && !document.hidden) refresh();
    }, 10000);
    cleanups.push(() => clearInterval(timer));
    listen(document, 'visibilitychange', () => !document.hidden && refresh());
    function restore() {
      const destination =
        document.querySelector('#divInfraAreaPaginacaoSuperior') ||
        document.querySelector('#divInfraAreaTabela') ||
        table;
      destination.before(root);
      root.after(history);
      stickyOffset();
      scheduleTableHeader();
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      closeMenu();
      historyGeneration++;
      for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
      root.remove();
      history.remove();
      form.classList.remove('so-block-page');
      table
        .querySelectorAll('[data-so-column],.so-copy-number,.so-copy-feedback,.so-status-marker')
        .forEach((e) => e.remove());
      table.querySelectorAll('.so-floating-header').forEach((e) => e.classList.remove('so-floating-header'));
      for (const row of table.rows) row.style.removeProperty('--so-table-header-shift');
      table.classList.remove('so-organized-table');
      table.parentElement?.classList.remove('so-table-scroll');
      table.querySelectorAll('[class]').forEach((e) => {
        for (const name of Array.from(e.classList)) if (name.startsWith('so-col-')) e.classList.remove(name);
      });
      for (const [row, original] of originalRows) {
        row.hidden = original.hidden;
        for (const [attr, value] of [
          ['tabindex', original.tabindex],
          ['aria-haspopup', original.popup],
        ])
          if (value === null) row.removeAttribute(attr);
          else row.setAttribute(attr, value);
      }
      table.querySelectorAll('[data-so-original-span]').forEach((e) => {
        e.colSpan = Number(e.dataset.soOriginalSpan);
        delete e.dataset.soOriginalSpan;
      });
    }
    return { table, form, key: initial.key, root, restore, dispose };
  }
})();
