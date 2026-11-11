// "Go to the bottom" button in the bottom left corner, opposite the SEI's own "back to top" button
// (#btnInfraTopo, bottom right), top page only.
// It appears and disappears together with the native one, which the SEI shows once the page is scrolled.
(() => {
  if (window !== window.top || globalThis.seiScrollBottomInstalled) return;
  const top = document.querySelector('#btnInfraTopo');
  if (!top) return;
  globalThis.seiScrollBottomInstalled = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'sei-organizador-base';
  // Same classes as the native button: shape comes from content.css, colour from the SEI theme.
  button.className = top.className;
  button.hidden = true;
  const icon = top.querySelector('img')?.cloneNode(false) || document.createElement('span');
  if (icon.tagName === 'IMG') {
    icon.title = icon.alt = 'Ir para o fim da página';
    icon.removeAttribute('tabindex');
  } else {
    icon.textContent = '⌃';
    button.title = 'Ir para o fim da página';
    button.setAttribute('aria-label', button.title);
  }
  button.append(icon);
  button.addEventListener('click', () => {
    // The SEI scrolls this area when it exists (infraMoverParaTopo), otherwise the page itself.
    const area = document.querySelector('#divInfraAreaTelaD');
    const scroller = area && area.scrollHeight > area.clientHeight ? area : document.scrollingElement;
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  });
  top.after(button);
  // Both buttons fade out 2 s after the page stops scrolling, so they do not cover the content, and
  // come back on the next scroll. They stay while the pointer is on one of them, and reaching one with
  // the keyboard brings them back for another 2 s (a clicked button keeps the focus, so focus alone
  // must not hold them).
  const idleAfter = 2000,
    root = document.documentElement;
  let idleTimer;
  const inUse = (item) => item.matches(':hover');
  const rest = () => {
    if (inUse(top) || inUse(button)) return wake();
    root.setAttribute('data-so-scroll-idle', '');
  };
  function wake() {
    root.removeAttribute('data-so-scroll-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(rest, idleAfter);
  }
  // Captured: the SEI scrolls an inner area, whose scroll events do not bubble.
  document.addEventListener('scroll', wake, { capture: true, passive: true });
  for (const item of [top, button]) item.addEventListener('focusin', wake);
  // The SEI shows/hides its button through the inline style (jQuery show/hide).
  const sync = () => {
    const hidden = getComputedStyle(top).display === 'none';
    if (button.hidden && !hidden) wake();
    button.hidden = hidden;
  };
  new MutationObserver(sync).observe(top, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  sync();
})();
