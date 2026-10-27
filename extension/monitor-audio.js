const audio = new Audio(chrome.runtime.getURL('sound/novosei.mp3'));
audio.volume = 0.85;
audio.preload = 'auto';
let playback = Promise.resolve();
function playTone(choice) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      audio.removeEventListener('ended', ended);
      audio.removeEventListener('error', failed);
      if (error) audio.pause();
      resolve(error ? { error } : { ok: true });
    };
    const ended = () => finish();
    const failed = () => finish('Falha ao carregar ou reproduzir o aviso sonoro.');
    const timeout = setTimeout(() => finish('O aviso sonoro não terminou. Confira o áudio do navegador.'), 8000);
    audio.addEventListener('ended', ended);
    audio.addEventListener('error', failed);
    try {
      const source = chrome.runtime.getURL(choice.file);
      if (audio.src !== source) audio.src = source;
      audio.currentTime = 0;
      Promise.resolve(audio.play()).catch(() => finish('Reprodução de áudio indisponível ou bloqueada.'));
    } catch {
      failed();
    }
  });
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === 'monitor:audio-ready') {
    reply({ ready: true });
    return;
  }
  if (msg?.type !== 'monitor:audio') return;
  const choice = seiAlertSounds.find((item) => item.id === (msg.soundId || 'novosei'));
  if (!choice) {
    reply({ error: 'Áudio inválido.' });
    return;
  }
  // Several blocks may receive processes together: finish each tone instead of cutting it off.
  playback = playback.then(() => playTone(choice));
  playback.then(reply);
  return true;
});
