// Tells the service worker the user is navigating the SEI, so background SEI reads give way.
// SEI answers one request per session at a time: a scan running during a click delays the page.
(() => {
  let last = -Infinity;
  const signal = () => {
    const now = Date.now();
    if (now - last < 500) return;
    last = now;
    try {
      chrome.runtime.sendMessage({ type: 'sei:activity' }).catch(() => {});
    } catch {}
  };
  signal();
  // beforeunload/pointerdown come before the navigation request; load ends the frame's own requests.
  window.addEventListener('beforeunload', signal);
  window.addEventListener('pointerdown', signal, { capture: true, passive: true });
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter') signal();
    },
    { capture: true, passive: true },
  );
  window.addEventListener('load', signal, { once: true });
})();
