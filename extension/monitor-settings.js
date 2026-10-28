globalThis.seiOrganizerSettings = ({ getIdentity, getView, call, onView }) => {
  let button,
    host,
    dialog,
    body,
    status,
    draft = null,
    blockDraft = null,
    generation = 0;
  const node = (tag, text, parent) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    parent?.append(element);
    return element;
  };
  function close() {
    generation++;
    if (dialog?.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    button?.focus();
  }
  function dispose() {
    generation++;
    host?.remove();
    document.querySelector('#sei-organizador-settings-header')?.remove();
  }
  function mount() {
    if (document.querySelector('#sei-organizador-settings-button')) return;
    document.querySelector('#sei-organizador-settings-header')?.remove();
    const user = document.querySelector('#lnkUsuarioSistema');
    if (!user) return;
    const wrapper = node('div');
    wrapper.id = 'sei-organizador-settings-header';
    wrapper.className = 'nav-item d-flex align-self-center infraAcaoBarraSistema';
    const style = node('style', null, wrapper);
    style.textContent = `
      #sei-organizador-settings-header{display:inline-flex;align-items:center;margin-inline:3px}
      #sei-organizador-settings-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:transparent;color:#ffd166;border:0;border-radius:4px;padding:4px;cursor:pointer;flex-shrink:0}
      #sei-organizador-settings-button svg{display:block;width:24px;height:24px;fill:currentColor;pointer-events:none}
      #sei-organizador-settings-button:hover{background:#ffffff24;color:#ffe4a1}
      #sei-organizador-settings-button:active{background:#00000018}
      #sei-organizador-settings-button:focus-visible{outline:2px solid #ffd166;outline-offset:2px}
      @media print{#sei-organizador-settings-header{display:none!important}}
    `;
    button = node('button', null, wrapper);
    button.id = 'sei-organizador-settings-button';
    button.type = 'button';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    const gear = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    gear.setAttribute('fill-rule', 'evenodd');
    gear.setAttribute(
      'd',
      'M19.39 8.94 L22.30 9.95 L22.50 12.00 L19.85 13.56 L19.39 15.06 L20.73 17.83 L19.42 19.42 L16.44 18.65 L15.06 19.39 L14.05 22.30 L12.00 22.50 L10.44 19.85 L8.94 19.39 L6.17 20.73 L4.58 19.42 L5.35 16.44 L4.61 15.06 L1.70 14.05 L1.50 12.00 L4.15 10.44 L4.61 8.94 L3.27 6.17 L4.58 4.58 L7.56 5.35 L8.94 4.61 L9.95 1.70 L12.00 1.50 L13.56 4.15 L15.06 4.61 L17.83 3.27 L19.42 4.58 L18.65 7.56 Z M15.5 12 a3.5 3.5 0 1 0 -7 0 a3.5 3.5 0 1 0 7 0 Z',
    );
    icon.append(gear);
    button.append(icon);
    button.title = 'Configurações do SEI Organizador';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', open);
    (user.closest('.infraAcaoBarraSistema') || user).before(wrapper);
  }
  function open() {
    if (!getView()) return;
    if (!host?.isConnected) {
      host = node('div');
      host.id = 'sei-organizador-configuracoes';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = node('style');
      style.textContent = `
        :host{all:initial}dialog{box-sizing:border-box;width:min(480px,calc(100vw - 28px));max-height:85vh;overflow:auto;padding:0;border:1px solid #7294bb;border-radius:8px;background:#f7faff;color:#243b53;font:13px/1.5 Arial,sans-serif;box-shadow:0 8px 35px #0004}
        dialog::backdrop{background:#10243c80}header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#dceafa}h2{font-size:16px;margin:0}
        .body{padding:4px 16px 12px}p{margin:8px 0}h3{font-size:14px;margin:16px 0 6px}button{font:inherit;padding:5px 9px;margin:3px 6px 3px 0;cursor:pointer}button:disabled{cursor:wait;opacity:.6}
        .chief-search input{box-sizing:border-box;width:100%;font:inherit;padding:7px;margin:5px 0}.chief-search [role=listbox]{border:1px solid #b4c7dd;background:white;max-height:230px;overflow:auto}.chief-search [role=option]{display:block;width:100%;text-align:left;margin:0;border:0;border-bottom:1px solid #e0e8f0;padding:8px;white-space:normal;overflow-wrap:anywhere}.chief-search [aria-selected=true]{background:#dceafa}.chief-search [hidden]{display:none!important}
        label{display:block}select{box-sizing:border-box;width:100%;font:inherit;padding:7px;margin:5px 0}textarea{box-sizing:border-box;width:100%;min-height:80px;font:inherit;padding:6px}.status{margin:0 16px 12px;min-height:1.5em}.error{color:#a02020}@media print{:host{display:none!important}}
      `;
      dialog = node('dialog');
      dialog.setAttribute('aria-labelledby', 'sei-organizador-settings-title');
      const header = node('header', null, dialog);
      node('h2', 'Configurações do SEI Organizador', header).id = 'sei-organizador-settings-title';
      const dismiss = node('button', 'Fechar', header);
      dismiss.type = 'button';
      dismiss.addEventListener('click', close);
      body = node('div', null, dialog);
      body.className = 'body';
      status = node('p', null, dialog);
      status.className = 'status';
      status.setAttribute('role', 'status');
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
      });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      });
      shadow.append(style, dialog);
      document.body.append(host);
    }
    render(getView());
    status.textContent = '';
    status.classList.remove('error');
    if (!dialog.open) {
      generation++;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    dialog.querySelector('button').focus();
  }
  async function action(type, extra) {
    const current = generation;
    const identity = JSON.stringify(getIdentity());
    const locked = [...body.querySelectorAll('button,textarea,select,input')].map((control) => [
      control,
      control.disabled,
    ]);
    for (const [control] of locked) control.disabled = true;
    status.classList.remove('error');
    status.textContent = extra?.test ? 'Reproduzindo teste de som…' : 'Salvando configurações…';
    try {
      const view = await call(type, extra);
      if (JSON.stringify(getIdentity()) !== identity) return;
      onView(view);
      if (current !== generation) return;
      if (type === 'monitor:chiefs') draft = null;
      render(view);
      status.textContent = view.soundError || (extra?.test ? 'Reprodução concluída.' : 'Configurações salvas.');
      status.classList.toggle('error', !!view.soundError);
    } catch (error) {
      if (current === generation) {
        status.textContent = error.message;
        status.classList.add('error');
      }
    } finally {
      if (current === generation)
        for (const [control, disabled] of locked) if (control.isConnected) control.disabled = disabled;
    }
  }
  async function scopeAction(update) {
    const current = generation,
      identity = JSON.stringify(getIdentity());
    const selected = body.querySelector('#so-settings-block')?.value;
    const locked = [...body.querySelectorAll('button,textarea,select,input')].map((control) => [
      control,
      control.disabled,
    ]);
    for (const [control] of locked) control.disabled = true;
    status.classList.remove('error');
    status.textContent = update ? 'Atualizando lista de blocos do SEI…' : 'Salvando bloco de trabalho…';
    try {
      const pref = update ? await seiWorkScope.refreshCatalog() : await call('scope:set', { block: selected });
      if (current !== generation || JSON.stringify(getIdentity()) !== identity) return;
      if (!update) blockDraft = null;
      render(getView(), pref);
      body.querySelector('#so-settings-block')?.focus();
      status.textContent = update
        ? 'Lista de blocos atualizada.'
        : 'Bloco de trabalho salvo e aplicado às páginas abertas.';
    } catch (error) {
      if (current === generation && JSON.stringify(getIdentity()) === identity) {
        status.textContent = error.message;
        status.classList.add('error');
      }
    } finally {
      if (current === generation)
        for (const [control, disabled] of locked) if (control.isConnected) control.disabled = disabled;
    }
  }
  function chiefAutocomplete(input, identity) {
    if (!globalThis.seiUnitUsers) return;
    const box = node('div');
    box.className = 'chief-search';
    input.closest('label').before(box);
    const label = node('label', 'Buscar usuário pelo nome ou login', box);
    label.htmlFor = 'so-chief-search';
    const search = node('input', null, box);
    search.id = 'so-chief-search';
    search.type = 'search';
    search.autocomplete = 'off';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-controls', 'so-chief-suggestions');
    search.setAttribute('aria-expanded', 'false');
    const suggestions = node('div', null, box);
    suggestions.id = 'so-chief-suggestions';
    suggestions.setAttribute('role', 'listbox');
    suggestions.hidden = true;
    const note = node('p', 'Carregando sugestões de usuários…', box);
    note.setAttribute('role', 'status');
    let users = [],
      found = [],
      active = -1;
    const fold = (value) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    function hide() {
      suggestions.hidden = true;
      search.setAttribute('aria-expanded', 'false');
      search.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function add(user) {
      const tokens = input.value
        .split(/[,;\n]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (!tokens.some((value) => value.toLowerCase() === user.login)) tokens.push(user.login);
      input.value = tokens.join('\n');
      draft = input.value;
      search.value = '';
      hide();
      note.textContent = user.name + ' (' + user.login + ') adicionado. Clique em Salvar chefes para aplicar.';
      search.focus();
    }
    function highlight() {
      [...suggestions.children].forEach((option, index) =>
        option.setAttribute('aria-selected', String(index === active)),
      );
      if (active >= 0) {
        search.setAttribute('aria-activedescendant', suggestions.children[active].id);
        suggestions.children[active].scrollIntoView?.({ block: 'nearest' });
      }
    }
    function update() {
      const query = fold(search.value.trim());
      suggestions.replaceChildren();
      active = -1;
      if (!query) return hide();
      found = users.filter((user) => fold(user.login + ' ' + user.name).includes(query)).slice(0, 8);
      for (const [index, user] of found.entries()) {
        const option = node('button', user.name + ' — ' + user.login, suggestions);
        option.type = 'button';
        option.tabIndex = -1;
        option.id = 'so-chief-option-' + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.addEventListener('mousedown', (event) => event.preventDefault());
        option.addEventListener('click', () => add(user));
      }
      suggestions.hidden = !found.length;
      search.setAttribute('aria-expanded', String(!!found.length));
      if (found.length) suggestions.scrollIntoView?.({ block: 'nearest' });
      search.removeAttribute('aria-activedescendant');
      note.textContent = found.length
        ? 'Selecione um usuário para adicionar o login.'
        : 'Nenhum usuário encontrado. Você pode digitar o login abaixo.';
    }
    search.addEventListener('input', update);
    search.addEventListener('keydown', (event) => {
      if (suggestions.hidden) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        active =
          event.key === 'ArrowDown'
            ? (active + 1) % found.length
            : active < 0
              ? found.length - 1
              : (active - 1 + found.length) % found.length;
        highlight();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (active >= 0) add(found[active]);
        else if (found.length === 1) add(found[0]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hide();
      }
    });
    search.addEventListener('blur', (event) => {
      if (!suggestions.contains(event.relatedTarget)) hide();
    });
    seiUnitUsers
      .list(identity)
      .then((result) => {
        if (!search.isConnected || JSON.stringify(getIdentity()) !== JSON.stringify(identity)) return;
        users = result;
        note.textContent = users.length
          ? 'Digite o nome ou login e selecione uma sugestão.'
          : 'Sugestões indisponíveis. Você pode digitar o login abaixo.';
        if (search.value.trim()) update();
      })
      .catch(() => {
        if (search.isConnected) note.textContent = 'Sugestões indisponíveis. Você pode digitar o login abaixo.';
      });
  }
  function render(view, preference = globalThis.seiWorkScope) {
    body.replaceChildren();
    if (preference) {
      node('h3', 'Bloco de trabalho', body);
      node('p', 'Usuário do SEI: ' + getIdentity().login + '. A escolha vale neste navegador.', body);
      const label = node('label', 'Bloco interno', body);
      label.htmlFor = 'so-settings-block';
      const select = node('select', null, body);
      select.id = 'so-settings-block';
      for (const item of preference.catalog || []) {
        const option = node(
          'option',
          item.id + ' · ' + (item.name && item.name !== 'Bloco ' + item.id ? item.name : 'Descrição não identificada'),
          select,
        );
        option.value = item.id;
      }
      select.value = blockDraft ?? preference.block ?? select.options[0]?.value ?? '';
      if (!select.value && select.options.length) select.selectedIndex = 0;
      select.disabled = !select.options.length;
      select.addEventListener('change', () => {
        blockDraft = select.value;
      });
      const saveBlock = node('button', 'Salvar bloco de trabalho', body);
      saveBlock.type = 'button';
      saveBlock.disabled = select.disabled;
      saveBlock.addEventListener('click', () => scopeAction(false));
      const refresh = node('button', 'Atualizar lista do SEI', body);
      refresh.type = 'button';
      refresh.disabled = typeof globalThis.seiWorkScope?.refreshCatalog !== 'function';
      refresh.addEventListener('click', () => scopeAction(true));
      node(
        'p',
        select.options.length
          ? 'Alertas, status, assuntos e avisos de edição ficam restritos ao bloco salvo.'
          : 'Abra um bloco interno ou atualize a lista para escolher seu bloco de trabalho.',
        body,
      );
    }
    node('h3', 'Sons dos alertas', body);
    node('p', view.sound ? 'Som ativado' : 'Som silenciado', body);
    node(
      'p',
      'Novo SEI: entrada no bloco e processo aguardando recebimento para a Secretaria (bloco 1396). Assinar: status manual para os chefes e assinatura confirmada no SEI para todos que escolheram o mesmo bloco interno.',
      body,
    );
    const sound = node('button', view.sound ? 'Silenciar som' : 'Ativar som', body);
    sound.type = 'button';
    sound.addEventListener('click', () => action('monitor:sound', { enabled: !view.sound }));
    for (const choice of seiAlertSounds) {
      const test = node('button', choice.id === 'novosei' ? 'Testar som' : 'Testar Assinar', body);
      test.type = 'button';
      test.addEventListener('click', () =>
        action('monitor:sound', { enabled: view.sound, test: true, soundId: choice.id }),
      );
    }
    if (view.soundError) node('p', view.soundError, body).className = 'error';
    else if (view.soundPlayedAt)
      node(
        'p',
        `Última reprodução concluída às ${new Date(view.soundPlayedAt).toLocaleTimeString('pt-BR')}. Se não ouviu, confira o volume e a saída de áudio do navegador.`,
        body,
      );
    node('h3', 'Chefes de seção', body);
    const identity = getIdentity();
    node(
      'p',
      `Usuário do SEI: ${identity.login}. ${view.chiefEligible ? 'Recebe avisos de Assinar.' : 'Não está configurado para receber avisos de Assinar.'}`,
      body,
    );
    node(
      'p',
      'Configuração por unidade neste navegador. Busque um usuário ou informe os logins abaixo, separados por vírgula ou por linha.',
      body,
    );
    const label = node('label', 'Logins dos chefes: ', body);
    const input = node('textarea', null, label);
    input.rows = 3;
    input.setAttribute('aria-label', 'Logins dos chefes de seção');
    input.value = draft ?? (view.chiefLogins || []).join('\n');
    input.addEventListener('input', () => {
      draft = input.value;
    });
    chiefAutocomplete(input, identity);
    const add = node('button', 'Adicionar meu login', body);
    add.type = 'button';
    add.addEventListener('click', () => {
      input.value = [input.value, identity.login].filter(Boolean).join('\n');
      draft = input.value;
    });
    const save = node('button', 'Salvar chefes', body);
    save.type = 'button';
    save.addEventListener('click', () =>
      action('monitor:chiefs', {
        logins: input.value
          .split(/[,;\n]+/)
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => text.match(/\(([^/()]+)\/[^()]+\)$/)?.[1] || text),
      }),
    );
    node(
      'p',
      `${view.records.length} bloco(s) acompanhado(s). Consultas a cada minuto, com uma tela do SEI aberta nesta unidade.`,
      body,
    );
  }
  return {
    mount,
    dispose,
    reset: () => {
      dispose();
      draft = null;
      blockDraft = null;
    },
  };
};
