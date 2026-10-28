// One card below "Consultar Andamento": process summary on entry, document details when selected.
(async function showCard(options = {}) {
  const config = globalThis.SEI_ORGANIZADOR_CONFIG,
    D = globalThis.seiDocumentData;
  const url = new URL(location.href);
  const action = url.searchParams.get('acao');
  const processView =
    action === 'procedimento_visualizar' || (action === 'arvore_visualizar' && !url.searchParams.get('id_documento'));
  const documentId = processView ? null : url.searchParams.get('id_documento');
  if (!processView && (action !== 'documento_visualizar' || !/^\d+$/.test(documentId || ''))) return;
  if (processView && !/^\d+$/.test(url.searchParams.get('id_procedimento') || '')) return;
  const context = D.seiContext(window, url, config);
  if (!context) return;
  const { top, unit, actor } = context;
  if (globalThis.seiWorkScope) {
    await seiWorkScope.ready;
  }
  const loaded = await D.loadTree(top);
  if (!loaded) return;
  const { treeDocument, tree, historyLink } = loaded;
  if (processView && tree.process.id !== url.searchParams.get('id_procedimento')) return;
  if (action === 'procedimento_visualizar' && document !== treeDocument) return;
  // The tree owns the fallback. Closing a document restores the process summary.
  if (document === treeDocument && !globalThis.seiProcessCardLifecycle) {
    const restore = () => showCard().catch((e) => console.error('SEI Organizador: resumo indisponível', e));
    treeDocument.addEventListener('sei-organizador:restore-process', restore);
    window.addEventListener('pageshow', restore);
    globalThis.seiProcessCardLifecycle = { restore };
  }
  const previous = treeDocument.querySelector('#sei-organizador-documento');
  // A delayed process load must never replace a document already selected by the user.
  if (options.expectedHost && previous !== options.expectedHost) return;
  if (processView && previous && !options.force) return;
  if (previous) {
    const event = treeDocument.createEvent('Event');
    event.initEvent('sei-organizador:dispose-card', false, false);
    previous.dispatchEvent(event);
    previous.remove();
  }
  const info = tree.document(documentId) || {
    id: documentId,
    protocol: document.title.match(/ - (\d+) - /)?.[1],
    title: document.title.replace(/^SEI\/\w+ - /, ''),
    unit: null,
    signers: [],
  };
  // Unsigned documents of the unit are a process-level warning, shown whatever document is open.
  // The open document is left out: its own signature line already says it is unsigned.
  const pending = tree.pending(unit).filter((d) => d.id !== documentId);
  let own = !processView && !!info.protocol && !(info.unit && D.sigla(info.unit) !== D.sigla(unit));
  // Signature footer is read before the badge exists, so our own text never matches.
  const signatures = own ? D.parseSignatures(document.body.textContent) : [];

  let requestedHistory = false;
  const pageController = new AbortController();
  async function fetchPage(link, base, init = {}) {
    const target = new URL(link, base);
    if (target.origin !== location.origin || target.pathname !== '/sei/controlador.php')
      throw new Error('Endereço do SEI inválido');
    const response = await fetch(target, {
      credentials: 'same-origin',
      signal: AbortSignal.any([pageController.signal, AbortSignal.timeout(15000)]),
      ...init,
    });
    if (!response.ok) throw new Error(`SEI respondeu HTTP ${response.status}`);
    const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || 'iso-8859-1';
    const text = new TextDecoder(charset).decode(await response.arrayBuffer());
    return { doc: new DOMParser().parseFromString(text, 'text/html'), url: target };
  }
  const cache = {
    get(key, ttl) {
      try {
        const item = JSON.parse(sessionStorage.getItem('seiOrganizador:' + key));
        return item && Date.now() - item.time < ttl ? item.value : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem('seiOrganizador:' + key, JSON.stringify({ time: Date.now(), value }));
      } catch {}
    },
  };
  async function loadHistory() {
    if (options.history) return options.history;
    const cached = seiFullHistory.read(tree.process.id, actor);
    if (cached) return cached;
    let source = await fetchPage(historyLink, treeDocument.location.href);
    let page = D.parseHistory(source.doc);
    const form = source.doc.querySelector('#frmProcedimentoHistorico');
    if (!page.complete && page.completeValue && form) {
      const body = new URLSearchParams();
      for (const input of form.querySelectorAll('input[name]')) body.set(input.name, input.value);
      body.set('hdnTipoHistorico', page.completeValue);
      source = await fetchPage(form.getAttribute('action'), source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      page = D.parseHistory(source.doc);
    }
    try {
      page = await seiFullHistory.finish(source.doc, source.url, pageController.signal);
    } catch (e) {
      page = { ...page, partial: true, readError: e.message };
    }
    seiFullHistory.write(tree.process.id, actor, page);
    return page;
  }
  async function loadBlocks(kind) {
    const cached = cache.get('blocos:' + kind, 120000);
    if (cached) return { blocks: new Map(cached.blocks), partial: cached.partial };
    if (!requestedHistory) return null;
    const link = top.querySelector(`a[href*="acao=bloco_${kind}_listar"]`)?.getAttribute('href');
    if (!link) return null;
    const list = D.parseBlockList((await fetchPage(link, top.location.href)).doc);
    if (list) cache.set('blocos:' + kind, { blocks: [...list.blocks], partial: list.partial });
    return list;
  }
  async function api(block, body) {
    const result = await chrome.runtime.sendMessage({
      type: 'api',
      identity: globalThis.seiWorkScope?.identity,
      unit: config.unitId,
      block,
      body,
    });
    if (result?.error) throw new Error(result.error);
    return result.data;
  }

  const ui = treeDocument,
    place = ui.querySelector('#divConsultarAndamento');
  if (!place) return;
  const host = ui.createElement('div');
  host.id = 'sei-organizador-documento';
  host.dataset.process = tree.process.id;
  host.dataset.mode = own ? 'document' : 'process';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = ui.createElement('style');
  // Narrow tree column: labels above values, so long unit lists wrap instead of widening the pane.
  style.textContent = `
    :host { all: initial; display: block; margin: 8px 0 10px; }
    @media print { :host { display: none !important; } }
    /* Pastel blue sets the card apart from the white tree; yellow and red stay reserved for the idle alert. */
    section { font: 12px/1.5 Arial, Helvetica, sans-serif; color: #1f2933; background: #f3f7fc;
      border: 1px solid #a9c3e3; border-left: 4px solid #2f6fbf; border-radius: 6px; padding: 0 8px 8px;
      overflow-wrap: anywhere; box-shadow: 0 1px 2px #1d4f8f14; }
    header { display: flex; align-items: flex-start; gap: 6px; margin: 0 -8px; padding: 5px 8px;
      background: #d6e7fa; border-radius: 0 3px 0 0; }
    h2 { font: 700 12px Arial, Helvetica, sans-serif; margin: 0; flex: 1; color: #1d4f8f; }
    h2 small { display: block; font-weight: 400; color: #46566a; margin-top: 1px; }
    button, select { font: 11px Arial, Helvetica, sans-serif; }
    .toggle { flex: 0 0 auto; border: 1px solid #9dbbe0; background: #fff; color: #1d4f8f; border-radius: 3px; padding: 1px 6px; cursor: pointer; }
    .toggle:hover { background: #f3f8fe; }
    ul { list-style: none; margin: 2px 0 0; padding: 0; }
    li { padding: 8px; margin: 7px 0 0; border: 1px solid #dae5f2; border-radius: 5px; background: #fff; min-width: 0; }
    li > b { display: block; font-size: 11px; font-weight: 700; color: #46566a; margin-bottom: 3px; }
    .pending-section { background: #fff8e8; border-color: #efd49a; }
    .block-section { border-color: #adc9eb; }
    .block-section > b { color: #1d4f8f; }
    .block-meta { font-size: 11px; color: #46566a; }
    .timeline { border-left: 2px solid #c8dcf3; margin: 6px 0 2px 4px; padding: 0 0 1px 12px; position: relative; }
    .timeline::before { content: ''; position: absolute; width: 6px; height: 6px; border: 2px solid #fff;
      border-radius: 50%; background: #5288bd; left: -6px; top: 4px; }
    .timeline > .item:first-child { font-weight: 700; }
    .explanation { display: block; font-size: 11px; color: #526376; margin-top: 3px; }
    .type-section { background: transparent; border: 0; padding: 2px 4px; }
    .type-section summary { font-size: 11px; }
    button:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible { outline: 2px solid #2464aa; outline-offset: 2px; }
    .item { display: block; }
    .muted { color: #46566a; }
    .ok { color: #1c6b37; } .pending { color: #9a3a00; } .error { color: #b00020; }
    .age { display: inline-block; border-radius: 9px; padding: 0 6px; background: #d6e7fa; color: #1d4f8f; white-space: nowrap; }
    .age[data-level='warn'] { background: #fff1c2; color: #6b4b00; }
    .age[data-level='alert'] { background: #ffd9d9; color: #8a0010; font-weight: 700; }
    .unit { display: flex; justify-content: space-between; gap: 6px; }
    section[data-idle='warn'] { border-left: 4px solid #d19b00; }
    section[data-idle='alert'] { border-left: 4px solid #c8102e; }
    .idle { margin: 6px 0 0; padding: 3px 6px; border-radius: 3px; font-weight: 700; }
    .idle[data-level='warn'] { background: #fff1c2; color: #6b4b00; }
    .idle[data-level='alert'] { background: #ffd9d9; color: #8a0010; }
    .idle small { display: block; font-weight: 400; }
    .organizer { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 8px; margin-top: 7px; padding-top: 6px; border-top: 1px solid #e0e9f4; }
    .organizer > span:first-child { flex-basis: 100%; }
    select { max-width: 100%; min-height: 24px; padding: 2px 4px; border: 1px solid #9dbbe0; border-radius: 3px; background: #fff; }
    details { flex-basis: 100%; }
    summary { cursor: pointer; color: #1d4f8f; }
    .open-units > summary { font-weight: 700; }
    .open-units-list { margin-top: 4px; }
    .activity-heading { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .activity-heading > b { font-size:11px; color:#46566a; }
    label { display: block; margin: 2px 0 0 4px; }
    .progress { position: relative; height: 3px; margin: 0 -8px; overflow: hidden; background: #c3daf5; }
    .progress::after { content: ''; position: absolute; top: 0; bottom: 0; left: -40%; width: 40%;
      background: #2f6fbf; border-radius: 2px; animation: so-progress 1.1s ease-in-out infinite; }
    @keyframes so-progress { to { left: 100%; } }
    .skeleton { display: block; height: 9px; margin: 5px 0 0; border-radius: 5px;
      background: linear-gradient(90deg, #bcd4f1 0%, #e1ecfa 50%, #bcd4f1 100%); background-size: 200% 100%;
      animation: so-shimmer 1.3s linear infinite; }
    @keyframes so-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
    @media (prefers-reduced-motion: reduce) {
      .progress::after { animation: none; left: 0; width: 100%; opacity: .5; }
      .skeleton { animation: none; }
    }
    [hidden] { display: none !important; }
  `;
  const root = ui.createElement('section');
  root.setAttribute(
    'aria-label',
    own ? 'Situação do documento no SEI Organizador' : 'Resumo do processo no SEI Organizador',
  );
  const header = ui.createElement('header'),
    heading = ui.createElement('h2'),
    toggle = ui.createElement('button'),
    list = ui.createElement('ul');
  const subtitle = ui.createElement('small');
  subtitle.textContent = own ? info.title : `Processo ${tree.process.number}`;
  heading.append('SEI Organizador', subtitle);
  toggle.type = 'button';
  toggle.className = 'toggle';
  list.id = 'so-document-details';
  toggle.setAttribute('aria-controls', list.id);
  header.append(heading, toggle);
  root.append(header, list);
  shadow.append(style, root);
  place.after(host);
  let disposed = false,
    timer;
  let historySignature = '';
  const receiveHistory = (event) => {
    const incoming = event.detail;
    if (
      !active() ||
      incoming?.process !== tree.process.id ||
      incoming.unit !== config.unitId ||
      incoming.actor?.org !== actor.org ||
      incoming.actor?.login?.toLowerCase() !== actor.login.toLowerCase() ||
      !incoming.page?.complete ||
      incoming.page.partial ||
      JSON.stringify(incoming.page) === historySignature
    )
      return;
    showCard({ force: true, expectedHost: host, history: incoming.page }).catch((e) =>
      console.error('SEI Organizador: resumo indisponível', e),
    );
  };
  const refreshers = [];
  const dispose = () => {
    disposed = true;
    pageController.abort();
    clearInterval(timer);
    top.removeEventListener('sei-organizador:history-ready', receiveHistory);
    host.remove();
  };
  const active = () => !disposed && host.isConnected;
  top.addEventListener('sei-organizador:history-ready', receiveHistory);
  host.addEventListener('sei-organizador:dispose-card', dispose, { once: true });
  window.addEventListener(
    'pagehide',
    () => {
      dispose();
      if (!processView) {
        const event = ui.createEvent('Event');
        event.initEvent('sei-organizador:restore-process', false, false);
        ui.dispatchEvent(event);
      }
    },
    { once: true },
  );
  let collapsed = false;
  try {
    collapsed = localStorage.getItem('seiOrganizador:badgeCollapsed') === '1';
  } catch {}
  const applyCollapsed = () => {
    list.hidden = collapsed;
    toggle.textContent = collapsed ? 'Mostrar' : 'Ocultar';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  };
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    try {
      localStorage.setItem('seiOrganizador:badgeCollapsed', collapsed ? '1' : '0');
    } catch {}
    applyCollapsed();
  });
  applyCollapsed();
  const span = (text, className, title) => {
    const s = ui.createElement('span');
    s.textContent = text;
    if (className) s.className = className;
    if (title) s.title = title;
    return s;
  };
  const line = (label, ...content) => {
    const li = ui.createElement('li'),
      b = ui.createElement('b');
    b.textContent = label;
    const classes = {
      'Pendências antes de enviar': 'pending-section',
      Assinatura: 'signature-section',
      'Última movimentação': 'activity-section',
      'Chegada à unidade': 'arrival-section',
      'Bloco interno': 'block-section',
      'Tipo do processo': 'type-section',
    };
    li.className = classes[label] || '';
    if (label === 'Tipo do processo') {
      const details = ui.createElement('details'),
        summary = ui.createElement('summary');
      summary.textContent = label;
      details.append(summary, ...content);
      li.append(details);
      list.append(li);
    } else {
      li.append(b, ...content);
      list.insertBefore(li, list.querySelector('.type-section'));
    }
    return li;
  };
  const ageBadge = (since) => {
    const a = D.age(since);
    const s = span(`há ${a.text}`, 'age', `Desde ${D.formatTime(since)}`);
    s.dataset.level = a.level;
    return s;
  };
  const person = (name, login) => (name && login ? `${name} (${login})` : name || login || 'usuário não identificado');
  if (pending.length)
    line(
      'Pendências antes de enviar',
      ...pending.map((d) => {
        const text = '⚠ ' + d.title + ' sem assinatura';
        const native = [...ui.querySelectorAll('a[href]')].find((link) => {
          try {
            return new URL(link.getAttribute('href'), ui.location.href).searchParams.get('id_documento') === d.id;
          } catch {
            return false;
          }
        });
        const node = tree.document(d.id);
        try {
          const href = new URL(native?.getAttribute('href') || node?.url, ui.location.href),
            target = native?.target || node?.target;
          if (
            href.origin !== location.origin ||
            href.pathname !== '/sei/controlador.php' ||
            href.searchParams.get('id_documento') !== d.id ||
            !['ifrVisualizacao', 'ifrConteudoVisualizacao'].includes(target)
          )
            return span(text, 'item pending');
          const link = ui.createElement('a');
          link.href = href.href;
          link.target = target;
          link.className = 'item pending';
          link.textContent = text;
          link.title = 'Abrir este documento na árvore do SEI';
          if (native)
            link.addEventListener('click', (event) => {
              event.preventDefault();
              native.click();
            });
          return link;
        } catch {
          return span(text, 'item pending');
        }
      }),
    );
  if (!own && tree.process.type) line('Tipo do processo', span(tree.process.type, 'item'));
  const signatureLine = own ? line('Assinatura') : null;
  if (own && signatures.length)
    for (const s of signatures)
      signatureLine.append(
        span(`✔ ${s.name} (${s.role}) · ${s.time ? D.formatTime(s.time) : 'data não lida'}`, 'item ok'),
      );
  else if (own && info.signers.length) for (const s of info.signers) signatureLine.append(span('✔ ' + s, 'item ok'));
  else if (own) signatureLine.append(span('✎ Não assinado', 'item pending'));
  const signed = () => !signatureLine?.querySelector('.pending');
  // Until andamento, block lists and organizer state arrive: animated bar under the header and skeleton lines.
  const progress = ui.createElement('div');
  progress.className = 'progress';
  header.after(progress);
  root.setAttribute('aria-busy', 'true');
  const loading = line(
    'Andamento',
    span('Carregando…', 'muted'),
    ...['86%', '64%', '74%'].map((width) => {
      const bar = span('', 'skeleton');
      bar.style.width = width;
      return bar;
    }),
  );
  async function populate() {
    try {
      await fill();
    } finally {
      progress.remove();
      root.removeAttribute('aria-busy');
    }
    if (active() && refreshers.length)
      timer = setInterval(() => {
        if (!active()) return dispose();
        if (!document.hidden) for (const refresh of refreshers) refresh();
      }, 10000);
  }
  // Never fetch authenticated SEI pages just because a document was selected.
  if (options.history || seiFullHistory.read(tree.process.id, actor)) await populate();
  else {
    progress.remove();
    root.removeAttribute('aria-busy');
    const load = ui.createElement('button');
    load.type = 'button';
    load.className = 'load-history';
    load.textContent = 'Consultar andamento';
    const loadingContent = [...loading.childNodes];
    loading.replaceChildren(load, span('Consulte quando precisar dos dados de andamento e blocos.', 'muted'));
    load.onclick = async () => {
      if (!active() || load.disabled) return;
      load.disabled = true;
      requestedHistory = true;
      loading.replaceChildren(...loadingContent);
      root.setAttribute('aria-busy', 'true');
      header.after(progress);
      await populate();
    };
  }

  async function fill() {
    let history;
    try {
      history = await loadHistory();
    } catch (e) {
      loading.replaceChildren(
        Object.assign(ui.createElement('b'), { textContent: 'Andamento' }),
        span(`Não foi possível consultar: ${e.message}`, 'error'),
      );
      return;
    }
    if (!active()) return;
    historySignature = JSON.stringify(history);
    loading.remove();
    let summary = D.summarize(history.rows, own ? info.protocol : null, unit);
    if (own && !info.unit && summary.generatedUnit && D.sigla(summary.generatedUnit) !== D.sigla(unit)) {
      own = false;
      signatureLine.remove();
      subtitle.textContent = `Processo ${tree.process.number}`;
      host.dataset.mode = 'process';
      root.setAttribute('aria-label', 'Resumo do processo no SEI Organizador');
      if (tree.process.type) line('Tipo do processo', span(tree.process.type, 'item'));
      summary = D.summarize(history.rows, null, unit);
    }
    if (own && !signatures.length && !info.signers.length && summary.signed.length) {
      const s = summary.signed[0];
      signatureLine.replaceChildren(
        signatureLine.firstChild,
        span(`✔ ${person(s.name, s.user)} · ${D.formatTime(s.time)}`, 'item ok'),
      );
    }
    if (!own) {
      const activity = line('Última movimentação'),
        heading = ui.createElement('div'),
        scope = ui.createElement('select'),
        content = ui.createElement('div');
      heading.className = 'activity-heading';
      scope.setAttribute('aria-label', 'Escopo da última movimentação');
      for (const [value, label] of [
        ['unit', 'Minha unidade'],
        ['process', 'Todo o processo'],
      ]) {
        const option = ui.createElement('option');
        option.value = value;
        option.textContent = label;
        scope.append(option);
      }
      const preference = `seiOrganizador:activityScope:${config.unitId}:${actor.org}:${actor.login.toLowerCase()}`;
      scope.value = 'unit';
      try {
        if (localStorage.getItem(preference) === 'process') scope.value = 'process';
      } catch {}
      heading.append(activity.firstChild, scope);
      content.setAttribute('aria-live', 'polite');
      activity.append(heading, content);
      const renderActivity = () => {
        const chronological = D.byTime(history.rows);
        const last =
          scope.value === 'unit' ? chronological.find((row) => D.sigla(row.unit) === D.sigla(unit)) : chronological[0];
        content.replaceChildren();
        if (last)
          content.append(
            span(`${D.formatTime(last.time)} · ${last.unit}`, 'item'),
            span(last.text, 'item'),
            span('por ' + person(last.userName, last.user), 'item muted'),
          );
        else
          content.append(
            span(
              scope.value === 'unit'
                ? `Nenhuma movimentação de ${unit} encontrada nos registros carregados.`
                : 'Nenhuma movimentação encontrada nos registros carregados.',
              'muted',
            ),
          );
      };
      scope.addEventListener('change', () => {
        try {
          localStorage.setItem(preference, scope.value);
        } catch {}
        renderActivity();
      });
      renderActivity();
    }

    const arrival = summary.lastArrival;
    if (arrival) {
      const items = [];
      if (arrival.sentAt) {
        const sent = ui.createElement('div');
        sent.className = 'timeline';
        sent.append(
          span('Envio à unidade em ' + D.formatTime(arrival.sentAt), 'item'),
          span('De ' + arrival.origin, 'item'),
          span('Enviado por ' + person(arrival.name, arrival.user), 'item muted'),
        );
        items.push(sent);
        if (!arrival.receivedAt) items.push(span('Recebimento não encontrado nos registros carregados.', 'muted'));
      } else items.push(span('Remetente não encontrado nos registros carregados.', 'muted'));
      if (arrival.receivedAt) {
        const received = ui.createElement('div');
        received.className = 'timeline';
        received.append(
          span('Recebido em ' + D.formatTime(arrival.receivedAt), 'item'),
          span('Acesso que registrou o recebimento na unidade.', 'explanation'),
        );
        items.push(received);
      }
      if (!history.complete || history.partial)
        items.push(span('Histórico incompleto; pode haver outra entrada não carregada.', 'muted'));
      line('Chegada à unidade', ...items);
    } else line('Chegada à unidade', span('Nenhuma entrada encontrada nos registros carregados.', 'muted'));

    const send = summary.lastSend;
    if (send) {
      const item = ui.createElement('li'),
        details = ui.createElement('details'),
        heading = ui.createElement('summary');
      details.className = 'last-send';
      heading.textContent =
        'Último envio: ' +
        D.formatTime(send.time) +
        ' · ' +
        send.destinations.length +
        ' ' +
        (send.destinations.length === 1 ? 'destino' : 'destinos');
      details.append(
        heading,
        ...send.destinations.map((d) => span('→ ' + d.unit, 'item', d.name)),
        span('por ' + person(send.name, send.user), 'item muted'),
      );
      item.append(details);
      if (own && !send.afterDocument) item.append(span('Anterior a este documento', 'item pending'));
      list.append(item);
    } else
      line(
        'Último envio',
        span(
          history.complete && !history.partial && history.rows.length
            ? `Processo ainda não enviado por ${unit}`
            : 'Nenhum envio encontrado nos registros carregados.',
          'muted',
        ),
      );

    const here = summary.open.find((o) => o.own);
    const unitRow = (text, title, since) => {
      const row = span('', 'unit');
      row.append(span(text, '', title), ageBadge(since));
      return row;
    };
    if (here)
      line(
        'Nesta unidade',
        unitRow('Processo aberto', '', here.since),
        span('Tempo desde a última movimentação nesta unidade, não desde a chegada.', 'explanation'),
      );
    const elsewhere = summary.open.filter((o) => !o.own);
    if (elsewhere.length) {
      const li = ui.createElement('li'),
        details = ui.createElement('details'),
        heading = ui.createElement('summary'),
        units = ui.createElement('div');
      const oldest = elsewhere.reduce((a, b) => (a.since <= b.since ? a : b));
      details.className = 'open-units';
      heading.textContent = `Aberto em ${elsewhere.length} ${elsewhere.length === 1 ? 'unidade' : 'unidades'} · maior tempo parado: ${D.age(oldest.since).text}`;
      units.className = 'open-units-list';
      for (const o of elsewhere) units.append(unitRow(o.unit, o.name, o.since));
      details.append(heading, units);
      li.append(details);
      list.append(li);
    }
    if (!summary.open.length)
      line(
        'Situação',
        span(
          history.complete && !history.partial && history.rows.length
            ? 'Processo sem unidade aberta (concluído)'
            : 'Não foi possível confirmar as unidades abertas com os registros carregados.',
          'muted',
        ),
      );
    // Idle alert sits between header and details, so it stays visible when the card is collapsed.
    const stalled = summary.open
      .map((o) => ({ ...o, age: D.age(o.since) }))
      .filter((o) => o.age.level !== 'ok')
      .sort((a, b) => a.since - b.since);
    if (stalled.length) {
      const worst = stalled[0],
        alert = ui.createElement('div');
      alert.className = 'idle';
      alert.dataset.level = worst.age.level;
      alert.setAttribute('role', 'status');
      alert.title = stalled.map((o) => `${o.unit}: desde ${D.formatTime(o.since)}`).join('\n');
      alert.append(`⏱ Parado há ${worst.age.text} ${worst.own ? 'nesta unidade' : `em ${worst.unit}`}`);
      if (stalled.length > 1) {
        const more = ui.createElement('small');
        more.textContent = `e mais ${stalled.length - 1} ${stalled.length === 2 ? 'unidade parada' : 'unidades paradas'} há 3 dias ou mais`;
        alert.append(more);
      }
      alert.append(
        span(
          worst.own
            ? 'Tempo desde a última movimentação na sua unidade.'
            : 'Alerta de outra unidade; não indica atraso na sua unidade.',
          'explanation',
        ),
      );
      root.insertBefore(alert, list);
      root.dataset.idle = worst.age.level;
    }
    if (history.partial)
      line('Aviso', span('Andamento com várias páginas; considerados só os registros carregados.', 'muted'));

    async function describeBlocks(kind, found, label) {
      if (!found.length) return [];
      let listed = null;
      try {
        listed = await loadBlocks(kind);
      } catch {}
      return found
        .filter((b) => !listed || listed.partial || listed.blocks.has(b.id))
        .map((b) => {
          const extra = listed?.blocks.get(b.id);
          const parts = [`${label} nº ${b.id}`];
          if (extra?.description) parts.push(`“${extra.description}”`);
          if (extra?.state) parts.push(extra.state);
          if (extra?.available) parts.push(`disponibilizado para ${extra.available}`);
          if (!listed) parts.push('conforme andamento');
          const short = `bloco nº ${b.id}${extra?.description ? ` (${extra.description})` : ''}`;
          return { ...b, text: parts.join(' · '), short };
        });
    }
    const [signatureBlocks, internalBlocks] = await Promise.all([
      describeBlocks('assinatura', summary.documentBlocks, 'Bloco de assinatura'),
      describeBlocks(
        'interno',
        summary.processBlocks.filter((block) => !globalThis.seiWorkScope || seiWorkScope.allows(block.id)),
        'Bloco interno',
      ),
    ]);
    // Signature blocks belong with the signature status instead of a separate section.
    if (own && signatureBlocks.length && !signed())
      signatureLine.replaceChildren(
        signatureLine.firstChild,
        ...signatureBlocks.map((b) => span(`✎ Aguardando assinatura · ${b.short}`, 'item pending', b.text)),
      );
    else if (own) for (const b of signatureBlocks) signatureLine.append(span(`No ${b.short}`, 'item muted', b.text));
    if (globalThis.seiWorkScope && !internalBlocks.length)
      line(
        'Bloco de trabalho',
        span(
          !seiWorkScope.block
            ? 'Escolha um bloco de trabalho nas opções para ver suas classificações.'
            : history.partial || !history.complete
              ? `Não foi possível confirmar a inclusão no bloco ${seiWorkScope.block}: histórico incompleto.`
              : `Nenhuma inclusão no bloco ${seiWorkScope.block} encontrada nos registros consultados.`,
          'muted',
        ),
      );
    else if (!signatureBlocks.length && !internalBlocks.length)
      line(
        'Blocos',
        span(
          history.partial || !history.complete
            ? 'Blocos não confirmados: histórico incompleto.'
            : `Fora de blocos de ${unit}`,
          'muted',
        ),
      );

    const icons = { none: '○', attention: '⚠', follow: '👁', urgent: '🔴', sign: '✍', archive: '📁' };
    const typeSection = list.querySelector('.type-section');
    if (typeSection) list.append(typeSection);
    for (const block of internalBlocks) {
      if (!active()) return;
      const li = line('Bloco interno', span(block.text.replace(/^Bloco interno /, ''), 'item'));
      const blockAnchor = list.querySelector('.activity-section,.arrival-section,.type-section');
      if (blockAnchor) list.insertBefore(li, blockAnchor);
      li.append(
        span('Incluído no bloco em ' + D.formatTime(block.since), 'item block-meta'),
        span('Incluído por ' + person(block.name, block.user), 'item block-meta'),
      );
      if (history.partial || !history.complete)
        li.append(span('Última inclusão encontrada; histórico incompleto.', 'muted'));
      const box = ui.createElement('div');
      box.className = 'organizer';
      li.append(box);
      const process = tree.process.id;
      let current = null,
        busy = false,
        ready = false;
      const disableControls = () => {
        for (const control of box.querySelectorAll('select,input')) control.disabled = !ready || busy;
      };
      const renderOrganizer = (state, message = '') => {
        if (!active()) return;
        box.replaceChildren();
        const subjects = state.tabs.filter((t) => (state.assignments[process] || []).includes(t.id)).map((t) => t.name);
        box.append(span(`Assunto: ${subjects.length ? subjects.join(', ') : 'Sem assunto'}`));
        const select = ui.createElement('select');
        select.setAttribute('aria-label', `Status manual no bloco ${block.id}`);
        for (const [value, label] of Object.entries(seiStatusLabels)) {
          const option = ui.createElement('option');
          option.value = value;
          option.textContent = `${icons[value]} ${label}`;
          select.append(option);
        }
        select.value = state.statuses?.[process] || 'none';
        const statusLabel = ui.createElement('label');
        statusLabel.textContent = 'Status manual';
        statusLabel.style.margin = '0';
        statusLabel.append(select);
        select.addEventListener('change', () =>
          change(state, { type: 'status', status: select.value, processIds: [process] }),
        );
        box.append(statusLabel);
        if (state.tabs.length) {
          const details = ui.createElement('details'),
            title = ui.createElement('summary');
          title.textContent = 'Alterar assuntos';
          details.append(title);
          for (const tab of state.tabs) {
            const label = ui.createElement('label'),
              check = ui.createElement('input');
            check.type = 'checkbox';
            check.checked = (state.assignments[process] || []).includes(tab.id);
            check.addEventListener('change', () =>
              change(state, { type: check.checked ? 'assign' : 'unassign', tabId: tab.id, processIds: [process] }),
            );
            label.append(check, ' ' + tab.name);
            details.append(label);
          }
          box.append(details);
        }
        if (message) box.append(span(message, message === 'Alteração salva.' ? 'ok' : 'error'));
        disableControls();
      };
      const unavailable = (message) => {
        ready = false;
        if (current) renderOrganizer(current, `Sem sincronização: ${message} · Dados da última consulta.`);
        else if (active()) box.replaceChildren(span(`Organizador indisponível: ${message}`, 'error'));
      };
      const refresh = async () => {
        if (busy || !active()) return;
        busy = true;
        disableControls();
        try {
          const next = await api(block.id);
          const changed = !ready || !current || next.version !== current.version;
          current = next;
          ready = true;
          if (changed) renderOrganizer(current);
        } catch (e) {
          unavailable(e.message);
        } finally {
          busy = false;
          disableControls();
        }
      };
      const change = async (state, action) => {
        if (busy || !ready || !active()) return;
        busy = true;
        disableControls();
        try {
          const next = await api(block.id, {
            version: state.version,
            actor,
            action: { ...action, processNumbers: { [process]: tree.process.number } },
          });
          current = next;
          renderOrganizer(current, 'Alteração salva.');
        } catch (e) {
          try {
            current = await api(block.id);
            renderOrganizer(current, e.message);
          } catch (recoveryError) {
            unavailable(`${e.message} · ${recoveryError.message}`);
          }
        } finally {
          busy = false;
          disableControls();
        }
      };
      refreshers.push(refresh);
      await refresh();
    }
  }
})();
