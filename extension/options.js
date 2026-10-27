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
    return response.data;
  }
  function render() {
    const selected = profiles.find((p) => p.id === profile.value);
    block.replaceChildren();
    for (const item of selected?.catalog || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.id} · ${item.name}`;
      block.append(option);
    }
    if (selected?.block) block.value = selected.block;
    block.disabled = !block.options.length;
    save.disabled = block.disabled;
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
  async function update() {
    refresh.disabled = true;
    status.classList.remove('error');
    try {
      const tabs = await chrome.tabs.query({ url: 'https://sei.rj.gov.br/sei/controlador.php*' });
      await Promise.allSettled(
        tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'scope:catalog-request' }, { frameId: 0 })),
      );
      await load();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
    } finally {
      refresh.disabled = false;
    }
  }
  profile.addEventListener('change', render);
  refresh.addEventListener('click', update);
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
