(() => {
  const profile = document.querySelector('#profile'),
    block = document.querySelector('#block'),
    status = document.querySelector('#status'),
    save = document.querySelector('#save'),
    refresh = document.querySelector('#refresh');
  let profiles = [];
  async function call(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...extra });
    if (response?.error) throw Error(response.error);
    if (!response) throw Error('A extensão não respondeu. Recarregue esta página.');
    return response.data;
  }
  function render() {
    const selected = profiles.find((p) => p.id === profile.value);
    block.replaceChildren();
    for (const item of selected?.catalog || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.id} · ${item.name && item.name !== `Bloco ${item.id}` ? item.name : 'Descrição não identificada'}`;
      block.append(option);
    }
    if (selected?.block) block.value = selected.block;
    // A saved block missing from the catalog leaves no selection: start from the first listed block.
    if (!block.value && block.options.length) block.selectedIndex = 0;
    block.disabled = !block.options.length;
    save.disabled = block.disabled || !block.value;
    profile.disabled = !profiles.length;
  }
  async function load() {
    const previous = profile.value;
    const data = await call('scope:options');
    profiles = data.profiles.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    profile.replaceChildren();
    for (const item of profiles) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.identity.name || item.identity.login} (${item.identity.login}) · unidade ${item.identity.unit}`;
      profile.append(option);
    }
    if (profiles.some((p) => p.id === previous)) profile.value = previous;
    render();
    status.textContent = profiles.length
      ? 'Escolha um bloco e salve para aplicar nas páginas abertas.'
      : 'Abra um bloco interno no SEI para identificar seu usuário e iniciar.';
  }
  // `manual`: the user clicked the button and must learn when no SEI tab could read the list.
  async function update(manual = false) {
    refresh.disabled = true;
    status.classList.remove('error');
    try {
      // One SEI tab reads the block list (all tabs share the SEI session, which answers one request at
      // a time): the active one first, the next only if it could not.
      const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
      tabs.sort((a, b) => b.active - a.active || (b.lastAccessed || 0) - (a.lastAccessed || 0));
      let read = false,
        problem = '';
      for (const tab of tabs) {
        const answer = await chrome.tabs
          .sendMessage(tab.id, { type: 'scope:catalog-request' }, { frameId: 0 })
          .catch(() => null);
        if (answer?.ok) {
          read = true;
          break;
        }
        if (answer?.error) problem = answer.error;
      }
      await load();
      if (manual && read) status.textContent = 'Lista de blocos atualizada.';
      else if (manual) {
        status.textContent =
          'A lista não foi atualizada: ' +
          (problem || 'abra o SEI na unidade atendida (ou recarregue a tela do SEI) e tente de novo.');
        status.classList.add('error');
      }
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    } finally {
      refresh.disabled = false;
    }
  }
  profile.addEventListener('change', render);
  refresh.addEventListener('click', () => update(true));
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.classList.remove('error');
    try {
      await call('scope:set', { profile: profile.value, block: block.value });
      status.textContent = `Bloco ${block.value} salvo. A escolha foi aplicada às páginas do SEI abertas.`;
      const current = profiles.find((p) => p.id === profile.value);
      if (current) current.block = block.value;
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    } finally {
      save.disabled = false;
    }
  });
  update();
})();
