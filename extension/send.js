// "Enviar Processo" opened from the process tree: lists the unit's unsigned documents and asks for
// confirmation before sending. Never blocks: confirming follows the native SEI submission.
(async () => {
  const config = globalThis.SEI_ORGANIZADOR_CONFIG,
    D = globalThis.seiDocumentData;
  const url = new URL(location.href);
  const processId = url.searchParams.get('id_procedimento');
  if (url.searchParams.get('acao') !== 'procedimento_enviar' || !/^\d+$/.test(processId || '')) return;
  const form = document.querySelector('#frmAtividadeListar'),
    button = document.querySelector('#sbmEnviar');
  // Sending several processes (from Controle de Processos) has no tree to inspect.
  if (!form || !button || form.querySelector('#hdnIdProtocolos')?.value !== processId) return;
  const context = D.seiContext(window, url, config);
  if (!context) return;
  const loaded = await D.loadTree(context.top);
  if (!loaded || loaded.tree.process.id !== processId) return;
  const pending = loaded.tree.pending(context.unit);
  if (!pending.length || document.querySelector('#sei-organizador-envio')) return;

  const host = document.createElement('div');
  host.id = 'sei-organizador-envio';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; display: block; margin: 6px 0 10px; }
    section { font: 13px/1.45 Arial, Helvetica, sans-serif; color: #5c3b00; background: #fff6d6;
      border: 1px solid #e3c766; border-left: 4px solid #d19b00; border-radius: 4px; padding: 6px 10px; }
    strong { display: block; margin-bottom: 2px; }
    ul { margin: 2px 0; padding-left: 18px; }
    p { margin: 2px 0 0; color: #6b5a2e; }
  `;
  const root = document.createElement('section'),
    title = document.createElement('strong'),
    list = document.createElement('ul'),
    note = document.createElement('p');
  root.setAttribute('role', 'alert');
  title.textContent = `⚠ ${pending.length === 1 ? 'Documento' : `${pending.length} documentos`} de ${context.unit} sem assinatura neste processo:`;
  for (const d of pending) {
    const li = document.createElement('li');
    li.textContent = d.title;
    list.append(li);
  }
  note.textContent = 'O SEI permite enviar assim. Ao clicar em Enviar, será pedida confirmação.';
  root.append(title, list, note);
  shadow.append(style, root);
  (form.querySelector('#divProcedimentos') || button.closest('.infraBarraComandos') || form.firstElementChild)?.before(
    host,
  );

  // Capture on window runs before the native onsubmit, for mouse, Enter and the Alt+E access key.
  let confirmed = false;
  window.addEventListener(
    'click',
    (event) => {
      if (confirmed || !event.target.closest?.('#sbmEnviar')) return;
      const names = pending.map((d) => `• ${d.title}`).join('\n');
      if (confirm(`Há documento(s) de ${context.unit} sem assinatura:\n\n${names}\n\nEnviar o processo mesmo assim?`))
        confirmed = true;
      else {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
