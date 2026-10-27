globalThis.seiOrganizerSettings = ({ getIdentity, getView, call, onView }) => {
  let button,
    host,
    dialog,
    body,
    status,
    draft = null,
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
      #sei-organizador-settings-button{display:inline-flex;align-items:center;gap:4px;background:transparent;color:#fff;border:1px solid transparent;border-radius:4px;padding:4px 6px;font:12px Arial,sans-serif;cursor:pointer;white-space:nowrap}
      #sei-organizador-settings-button:hover{background:#ffffff24}
      #sei-organizador-settings-button:focus-visible{outline:2px solid #fff;outline-offset:1px}
      @media(max-width:760px){#sei-organizador-settings-button span{display:none}}
      @media print{#sei-organizador-settings-header{display:none!important}}
    `;
    button = node('button', '⚙', wrapper);
    button.id = 'sei-organizador-settings-button';
    button.type = 'button';
    node('span', 'Organizador', button);
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
        label{display:block}textarea{box-sizing:border-box;width:100%;min-height:80px;font:inherit;padding:6px}.status{margin:0 16px 12px;min-height:1.5em}.error{color:#a02020}@media print{:host{display:none!important}}
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
    for (const control of body.querySelectorAll('button,textarea')) control.disabled = true;
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
        for (const control of body.querySelectorAll('button,textarea')) control.disabled = false;
    }
  }
  function render(view) {
    body.replaceChildren();
    if (globalThis.seiWorkScope) {
      node('h3', 'Bloco de trabalho', body);
      node(
        'p',
        seiWorkScope.block
          ? `Organizador restrito ao bloco ${seiWorkScope.block}.`
          : 'Abra um bloco interno para iniciar.',
        body,
      );
      const choose = node('button', 'Escolher bloco nas opções da extensão', body);
      choose.type = 'button';
      choose.addEventListener('click', () =>
        chrome.runtime.sendMessage({ type: 'scope:open-options', identity: seiWorkScope.identity }),
      );
    }
    node('h3', 'Sons dos alertas', body);
    node('p', view.sound ? 'Som ativado' : 'Som silenciado', body);
    node(
      'p',
      'Novo SEI: entrada no bloco. Assinar: mudança do status para Assinar, para os chefes configurados.',
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
      'Configuração por unidade neste navegador. Informe o login, sem o nome completo. Separe os usuários por vírgula ou por linha.',
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
    },
  };
};
