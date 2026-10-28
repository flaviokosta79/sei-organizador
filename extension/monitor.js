// Runs only in the top SEI page. The browser alarm keeps polling while navigating or in a background tab.
(() => {
  if (window !== window.top || globalThis.seiMonitorInstalled) return;
  globalThis.seiMonitorInstalled = true;
  const D = globalThis.seiBlockMonitor;
  let spacer,
    footerCleanup = () => {};
  let latestView,
    openedProcess,
    scopePending = false;
  let signatures = { events: [] },
    signatureOwner = '';
  let receipts = { pending: [] },
    receiptOwner = '',
    receiptLimit = 50;
  const settings = seiOrganizerSettings({
    getIdentity: () => identity,
    getView: () => latestView,
    call,
    onView: (view) => render(view),
  });
  let host,
    panel,
    body,
    summary,
    identity,
    busy = false,
    controller,
    registered = '',
    stopped = false;
  const key = (value) => JSON.stringify(value);
  async function call(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, identity, ...extra });
    if (response?.error) throw new Error(response.error);
    if (!response?.data) throw new Error('Monitor indisponível. Recarregue a extensão e o SEI.');
    return response.data;
  }
  function registration() {
    const form = document.querySelector('#frmRelBlocoProtocoloLista'),
      table = document.querySelector('#tblProtocolosBlocos');
    if (
      !form ||
      !table ||
      !/Processos do Bloco Interno/i.test(`${document.title} ${document.querySelector('h1')?.textContent}`)
    )
      return null;
    const block = new URL(location.href).searchParams.get('id_bloco');
    if (!/^\d{1,30}$/.test(block || '')) return null;
    if (globalThis.seiWorkScope && !seiWorkScope.allows(block)) return null;
    try {
      return {
        block,
        url: D.address(form.getAttribute('action') || location.href, block).href,
        name: document.querySelector('#txtDescricao')?.value || `Bloco interno ${block}`,
      };
    } catch {
      return null;
    }
  }
  const node = (tag, text, parent) => {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (parent) parent.append(item);
    return item;
  };
  function reserveFooter() {
    const global = document.querySelector('#divInfraAreaGlobal');
    const layout = global && getComputedStyle(global);
    const parent = layout?.display === 'flex' && layout.flexDirection === 'column' ? global : document.body;
    if (!spacer?.isConnected) {
      spacer = node('div');
      spacer.id = 'sei-organizador-alertas-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.style.cssText = 'flex:0 0 auto;pointer-events:none;';
      node('style', null, spacer);
    }
    if (spacer.parentElement !== parent) parent.append(spacer);
    const height = Math.ceil(summary.getBoundingClientRect().height || 34);
    spacer.style.height = `${height}px`;
    // The SEI's fixed "back to top" button otherwise overlaps the strip (native bottom: 1rem).
    const rules = `@media screen { #btnInfraTopo { bottom:calc(${height}px + 1rem)!important; } } @media print { #sei-organizador-alertas-spacer { display:none!important; } }`;
    const style = spacer.querySelector('style');
    if (style.textContent !== rules) style.textContent = rules;
  }
  function removeFooter() {
    footerCleanup();
    host?.remove();
    spacer?.remove();
  }
  function mount() {
    if (host?.isConnected) {
      reserveFooter();
      return;
    }
    removeFooter();
    host = node('footer');
    host.id = 'sei-organizador-alertas';
    host.setAttribute('aria-label', 'Alertas do SEI Organizador');
    const shadow = host.attachShadow({ mode: 'open' }),
      style = node('style');
    style.textContent = `
      :host { all: initial; position: fixed; left: 0; right: 0; bottom: 0; z-index: 10000; }
      section { position:relative; font: 12px/1.45 Arial,sans-serif; color:var(--so-header-fg,#ffffff); background:var(--so-header-bg,#0494c7); box-shadow:0 -1px 4px #0002; }
      summary { box-sizing:border-box; min-height:34px; display:flex; align-items:center; gap:8px; padding:7px 14px; cursor:pointer; font-weight:bold; list-style:none; }
      summary::-webkit-details-marker { display:none; }
      summary::after { content:'▴'; margin-left:auto; }
      details[open] > summary::after { content:'▾'; }
      summary:focus-visible { outline:2px solid currentColor; outline-offset:-3px; }
      section[data-new='true'] > details > summary::before,
      section[data-error='true'] > details > summary::before { content:''; width:8px; height:8px; flex:0 0 8px; border-radius:50%; background:#ffd34e; box-shadow:0 0 0 1px #604400; }
      .body { box-sizing:border-box; position:absolute; bottom:100%; right:0; width:min(480px,100%); max-height:min(52vh,420px); padding:10px 14px; overflow:auto; overscroll-behavior:contain; color:#243b53; background:#f4f8ff; border:1px solid #6586b5; border-radius:6px 6px 0 0; box-shadow:0 -3px 12px #0002; }
      p { margin: 4px 0; } ul { margin: 4px 0; padding-left: 18px; }
      a { color: #174c91; } button { font: inherit; cursor: pointer; margin: 3px 6px 3px 0; padding: 3px 6px; }
      .error { color: #a02020; } .muted { color: #526578; } h3 { font-size: 12px; margin: 8px 0 2px; }
      @media print { :host { display: none !important; } }
    `;
    panel = node('section');
    panel.setAttribute('aria-label', 'Alertas dos blocos internos');
    const details = node('details', null, panel);
    summary = node('summary', '🔔 Alertas dos blocos', details);
    body = node('div', null, details);
    body.className = 'body';
    shadow.append(style, panel);
    document.body.append(host);
    shadow.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && details.open) {
        details.open = false;
        summary.focus();
        event.preventDefault();
      }
    });
    const themeCleanup = globalThis.seiApplyTheme?.(host);
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(reserveFooter) : null;
    resize?.observe(summary);
    window.addEventListener('resize', reserveFooter);
    footerCleanup = () => {
      themeCleanup?.();
      resize?.disconnect();
      window.removeEventListener('resize', reserveFooter);
    };
    reserveFooter();
  }
  function error(message) {
    mount();
    summary.textContent = '🔔 Monitor sem atualização';
    panel.dataset.error = 'true';
    body.replaceChildren();
    const p = node('p', message, body);
    p.className = 'error';
  }
  async function action(type, extra) {
    try {
      render(await call(type, extra));
    } catch (e) {
      error(e.message);
    }
  }
  function render(view) {
    if (stopped) return;
    mount();
    latestView = view;
    settings.mount();
    body.replaceChildren();
    const count = view.records.reduce((sum, r) => sum + r.pending.length, 0);
    const signing = view.records.reduce((sum, r) => sum + (r.signPending?.length || 0), 0);
    const completed = signatures.events.length;
    const receiving = receipts.pending.length;
    const total = count + signing + completed + receiving;
    const hasError =
      !!receipts.error ||
      !!receipts.notificationError ||
      !!receipts.soundError ||
      !!signatures.error ||
      !!signatures.notificationError ||
      !!view.soundError ||
      view.records.some(
        (record) =>
          record.error ||
          record.sharedError ||
          record.signError ||
          record.notificationError ||
          record.signNotificationError,
      );
    const newLabel = `${count} ${count === 1 ? 'novo processo' : 'novos processos'}`;
    summary.textContent = signing
      ? `${count ? `🔔 ${newLabel} · ` : ''}✍ ${signing} para assinar`
      : count
        ? `🔔 ${count} ${count === 1 ? 'processo novo' : 'processos novos'}`
        : hasError
          ? '🔔 Alertas dos blocos · atenção'
          : '🔔 Nenhum alerta novo';
    if (completed)
      summary.textContent = `✓ ${completed} ${completed === 1 ? 'documento assinado' : 'documentos assinados'}${count || signing ? ` · ${summary.textContent}` : ''}`;
    if (receiving)
      summary.textContent = `📥 Secretaria · ${receiving} para receber${count || signing || completed ? ` · ${summary.textContent}` : ''}`;
    summary.setAttribute('aria-live', 'polite');
    panel.dataset.new = String(total > 0);
    panel.dataset.error = String(hasError);
    if (count + signing + completed) {
      const ack = node('button', receiving ? 'Marcar demais avisos como vistos' : 'Marcar todos como vistos', body);
      ack.type = 'button';
      ack.addEventListener('click', async () => {
        try {
          if (globalThis.seiSignatureScanner && globalThis.seiWorkScope?.block)
            signatures = await call('signature:ack', { block: seiWorkScope.block });
          await action('monitor:ack');
        } catch (e) {
          error(e.message);
        }
      });
    }
    if (globalThis.seiSecretariatData && globalThis.seiWorkScope?.block === '1396') {
      node('h3', 'Secretaria · aguardando recebimento na unidade', body);
      if (receipts.url) {
        const control = node('a', 'Abrir Controle de Processos', body);
        control.href = receipts.url;
        control.target = '_blank';
        control.rel = 'noopener';
      }
      if (receiving) {
        node(
          'p',
          'Abra o processo no SEI para registrar o recebimento. A pendência permanece até a atualização da listagem.',
          body,
        );
        const ul = node('ul', null, body);
        for (const item of receipts.pending.slice(0, receiptLimit)) {
          const li = node('li', null, ul);
          const a = node(item.url ? 'a' : 'span', item.number || item.id, li);
          if (item.url) {
            a.href = item.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.title =
              new URL(item.url).searchParams.get('id_procedimento') === item.id
                ? 'Abrir processo para receber no SEI'
                : 'Localizar o processo no Controle de Processos';
          }
        }
        if (receiving > receiptLimit) {
          const more = node('button', 'Mostrar mais processos para receber', body);
          more.type = 'button';
          more.addEventListener('click', () => {
            receiptLimit += 50;
            render(latestView);
          });
        }
      } else
        node(
          'p',
          receipts.initialized
            ? 'Nenhum processo aguardando recebimento na última leitura.'
            : 'Preparando a primeira leitura de recebidos, sem som para as pendências existentes.',
          body,
        ).className = 'muted';
      if (receipts.checked)
        node(
          'p',
          'Última leitura de recebidos: ' + new Date(receipts.checked).toLocaleTimeString('pt-BR'),
          body,
        ).className = 'muted';
      for (const message of [receipts.error, receipts.notificationError, receipts.soundError])
        if (message) node('p', message, body).className = 'error';
    }
    if (view.soundError) node('p', view.soundError, body).className = 'error';
    if (completed) {
      node('h3', 'Assinaturas confirmadas no SEI', body);
      const ul = node('ul', null, body);
      for (const item of signatures.events.slice(-50).reverse()) {
        const li = node('li', null, ul);
        node('strong', `Documento ${item.number || item.document}`, li);
        node(
          'span',
          ` · assinado por ${item.signer.name || item.signer.login} (${item.signer.login}) · ${new Date(item.signedAt).toLocaleString('pt-BR')} · bloco de assinatura ${item.signatureBlock}`,
          li,
        );
      }
      const seen = node('button', 'Marcar assinaturas como vistas', body);
      seen.type = 'button';
      seen.addEventListener('click', async () => {
        try {
          signatures = await call('signature:ack', { block: seiWorkScope.block });
          await sync(false);
        } catch (e) {
          error(e.message);
        }
      });
    }
    if (signatures.error) node('p', signatures.error, body).className = 'error';
    if (signatures.notificationError) node('p', signatures.notificationError, body).className = 'error';
    if (!view.records.length && !completed && !receiving && globalThis.seiWorkScope?.block !== '1396')
      node('p', 'Abra um bloco interno para começar a acompanhar as entradas.', body);
    else if (!total) node('p', 'Nenhum alerta novo.', body).className = 'muted';
    for (const record of view.records) {
      if (
        !record.pending.length &&
        !record.signPending?.length &&
        !record.sharedError &&
        !record.error &&
        !record.signError &&
        !record.notificationError &&
        !record.signNotificationError
      )
        continue;
      node('h3', `Bloco ${record.block} · ${record.name}`, body);
      const link = node('a', 'Abrir bloco', body);
      link.href = record.url;
      link.target = '_blank';
      link.rel = 'noopener';
      if (record.pending.length) {
        node('p', 'Novos no bloco:', body);
        const ul = node('ul', null, body);
        for (const item of record.pending.slice(0, 50)) {
          const li = node('li', null, ul),
            a = node('a', item.number || item.id, li);
          a.href = item.url;
          a.target = '_blank';
          a.rel = 'noopener';
          if (new URL(item.url).searchParams.get('id_procedimento') !== item.id)
            a.title = 'Abra o bloco para localizar este processo.';
        }
        if (record.pending.length > 50)
          node('p', `E mais ${record.pending.length - 50} processos; consulte o bloco.`, body);
        const ack = node('button', 'Marcar este bloco como visto', body);
        ack.type = 'button';
        ack.addEventListener('click', () => action('monitor:ack', { block: record.block }));
      }
      if (record.signPending?.length) {
        node('p', 'Para assinar:', body);
        const ul = node('ul', null, body);
        for (const item of record.signPending.slice(0, 50)) {
          const li = node('li', null, ul),
            a = node('a', item.number || item.id, li);
          a.href = item.url;
          a.target = '_blank';
          a.rel = 'noopener';
        }
        const ack = node('button', 'Marcar avisos deste bloco como vistos', body);
        ack.type = 'button';
        ack.addEventListener('click', () => action('monitor:ack', { block: record.block }));
      }
      if (record.signError) node('p', `Assinar sem atualização: ${record.signError}`, body).className = 'error';
      if (record.sharedError) node('p', `Vistos sem sincronização: ${record.sharedError}`, body).className = 'error';
      if (record.signNotificationError) node('p', record.signNotificationError, body).className = 'error';
      if (record.error) node('p', `Sem atualização: ${record.error}`, body).className = 'error';
      else
        node(
          'p',
          record.checked
            ? `Última leitura: ${new Date(record.checked).toLocaleTimeString('pt-BR')}`
            : 'Preparando a primeira leitura, sem alertar os processos existentes.',
          body,
        ).className = 'muted';
      if (record.notificationError) node('p', record.notificationError, body).className = 'error';
    }
    reserveFooter();
    highlight(view);
  }
  function highlight(view) {
    document.querySelectorAll('.so-new-process-label').forEach((label) => label.remove());
    const block = new URL(location.href).searchParams.get('id_bloco'),
      record = view.records.find((r) => r.block === block);
    const ids = new Set(record?.pending.map((p) => p.id) || []);
    for (const row of document.querySelectorAll('#tblProtocolosBlocos tr')) {
      row.classList.remove('so-new-process');
      const link = row.querySelector('a[href*="id_procedimento="]');
      if (!link) continue;
      if (ids.has(new URL(link.getAttribute('href'), location.href).searchParams.get('id_procedimento'))) {
        row.classList.add('so-new-process');
        const label = node('span', 'Novo');
        label.className = 'so-new-process-label';
        link.after(label);
      }
    }
  }
  async function syncReceipts(poll) {
    const selected = globalThis.seiWorkScope?.block;
    if (!globalThis.seiSecretariatData || selected !== '1396') {
      receipts = { pending: [] };
      receiptOwner = '';
      return;
    }
    const nextOwner = key([identity, selected]);
    if (nextOwner !== receiptOwner) {
      receipts = { pending: [] };
      receiptOwner = nextOwner;
      receiptLimit = 50;
    }
    let lease;
    try {
      receipts = await call('receipts:sync', { poll, url: seiSecretariatData.source() });
      const target = receipts.poll;
      if (target) {
        lease = target.id;
        controller = new AbortController();
        let result;
        try {
          result = await seiSecretariatData.snapshot(target.url, controller.signal);
        } catch (e) {
          result = { error: e.message };
        }
        if (!stopped && !scopePending && seiWorkScope.block === selected && key(D.context()) === key(identity))
          receipts = await call('receipts:result', { ...result, lease });
      }
    } catch (e) {
      if (!scopePending) receipts.error = 'Recebidos sem atualização: ' + e.message;
    } finally {
      if (lease) {
        controller = null;
        await call('receipts:done', { lease }).catch(() => {});
      }
    }
  }
  // Leave the initial page load to the native SEI navigation.
  let pollingReady = false,
    navigationTimer;
  function resumePolling() {
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(() => {
      pollingReady = true;
      sync();
    }, 1500);
  }
  if (document.readyState === 'complete') resumePolling();
  else window.addEventListener('load', resumePolling, { once: true });
  async function sync(poll = true) {
    // Process pages keep their native document frames responsive: do not start SEI scans here.
    const nativeProcess =
      !!document.querySelector('#ifrArvore') ||
      ['procedimento_trabalhar', 'procedimento_visualizar', 'arvore_visualizar', 'documento_visualizar'].includes(
        new URL(location.href).searchParams.get('acao'),
      );
    poll = poll && pollingReady && !nativeProcess;
    if (busy || stopped) return;
    const next = D.context();
    if (!next) {
      removeFooter();
      settings.reset();
      latestView = null;
      return;
    }
    const changed = key(next) !== key(identity);
    identity = next;
    if (changed) {
      registered = '';
      settings.reset();
      latestView = null;
    }
    busy = true;
    const reg = registration(),
      regKey = key(reg);
    try {
      await syncReceipts(poll);
      if (scopePending || stopped) return;
      if (globalThis.seiSignatureScanner) {
        const selected = globalThis.seiWorkScope?.block;
        const owner = key([identity, selected]);
        if (owner !== signatureOwner) {
          signatures = { events: [] };
          signatureOwner = owner;
        }
        if (selected) signatures = await call('signature:sync', { block: selected });
      }
      const page = new URL(location.href);
      const process = page.searchParams.get('id_procedimento');
      const openKey = `${key(identity)}:${process}`;
      if (
        page.searchParams.get('acao') === 'procedimento_trabalhar' &&
        /^\d{1,30}$/.test(process || '') &&
        openedProcess !== openKey
      ) {
        await call('monitor:opened', { process });
        openedProcess = openKey;
      }
      const view = await call('monitor:sync', { poll, registration: reg && regKey !== registered ? reg : undefined });
      if (reg) registered = regKey;
      render(view);
      if (view.poll) {
        controller = new AbortController();
        try {
          for (const target of view.poll.targets) {
            if (stopped || key(D.context()) !== key(identity)) break;
            let result;
            try {
              result = await D.snapshot(target, controller.signal);
            } catch (e) {
              result = { error: e.message };
            }
            if (!result.error) {
              try {
                const api = async (history) => {
                  const response = await chrome.runtime.sendMessage({
                    type: 'api',
                    identity: globalThis.seiWorkScope?.identity,
                    unit: identity.unit,
                    block: target.block,
                    history,
                  });
                  if (response?.error) throw new Error(response.error);
                  if (!response?.data) throw new Error('Organizador indisponível.');
                  return response.data;
                };
                const [state, history] = await Promise.all([api(false), api(true)]);
                result.organizer = { version: state.version, statuses: state.statuses || {}, history };
              } catch (e) {
                result.organizerError = e.message;
              }
            }
            if (stopped || key(D.context()) !== key(identity)) break;
            render(
              await call('monitor:result', {
                ...result,
                block: target.block,
                sharedVersion: target.sharedVersion,
                lease: view.poll.id,
              }),
            );
          }
        } finally {
          if (!stopped) await call('monitor:done', { lease: view.poll.id });
          controller = null;
        }
      }
      if (globalThis.seiSignatureScanner && poll && !stopped && !scopePending && globalThis.seiWorkScope?.block) {
        signatures = await call('signature:sync', { block: seiWorkScope.block, poll: true });
        render(latestView || view);
        if (signatures.scan) {
          controller = new AbortController();
          const selected = globalThis.seiWorkScope?.block;
          const scanIdentity = key(identity);
          try {
            const result = await seiSignatureScanner.scan(
              identity,
              selected,
              AbortSignal.any([controller.signal, AbortSignal.timeout(110000)]),
            );
            if (!stopped && selected === seiWorkScope.block && key(D.context()) === scanIdentity) {
              for (let index = 0; index < result.observations.length; index += 200)
                await call('signature:observe', {
                  block: selected,
                  observations: result.observations.slice(index, index + 200),
                });
              signatures = await call('signature:sync', { block: selected });
              if (result.error) signatures.error = result.error;
              render(await call('monitor:sync', { poll: false }));
            }
          } catch (e) {
            signatures.error = `Assinaturas sem atualização: ${e.message}`;
            if (!scopePending) render(latestView || view);
          } finally {
            controller = null;
            await call('signature:done', { block: selected }).catch(() => {});
          }
        }
      }
    } catch (e) {
      if (!stopped && !scopePending) error(e.message);
    } finally {
      busy = false;
      if (scopePending && !stopped) {
        scopePending = false;
        sync();
      }
    }
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'monitor:tick') sync();
    if (msg?.type === 'monitor:changed') sync(false);
    if (msg?.type === 'monitor:open') {
      if (panel) panel.querySelector('details').open = true;
      else sync();
    }
  });
  window.addEventListener('sei-organizador:scope', () => {
    registered = '';
    signatures = { events: [] };
    receipts = { pending: [] };
    controller?.abort();
    removeFooter();
    if (busy) scopePending = true;
    else sync();
  });
  // A late SEI header/list is detected without reacting to our own panel updates.
  let scheduled;
  const observer = new MutationObserver(() => {
    if (!D.context()) return;
    const reg = registration();
    if (
      !host?.isConnected ||
      !spacer?.isConnected ||
      !document.querySelector('#sei-organizador-settings-button') ||
      (reg && key(reg) !== registered)
    ) {
      clearTimeout(scheduled);
      scheduled = setTimeout(() => sync(), 250);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(navigationTimer);
    pollingReady = false;
    controller?.abort();
    observer.disconnect();
    clearTimeout(scheduled);
    removeFooter();
    settings.dispose();
  });
  window.addEventListener('pageshow', () => {
    stopped = false;
    resumePolling();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    sync();
  });
  sync();
})();
