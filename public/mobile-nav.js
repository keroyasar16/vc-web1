(() => {
  const layout = document.querySelector('.discord-app-layout');
  const toggle = document.getElementById('mobile-nav-toggle');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  const panel = document.getElementById('mobile-nav-panel');
  if (!layout || !toggle || !backdrop || !panel) return;
  const mobile = () => matchMedia('(max-width: 700px)').matches;
  function close() {
    layout.classList.remove('mobile-nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Sunucu ve kanal menüsünü aç');
    backdrop.hidden = true;
  }
  function open() {
    if (!mobile()) return;
    layout.classList.add('mobile-nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Sunucu ve kanal menüsünü kapat');
    backdrop.hidden = false;
  }
  toggle.addEventListener('click', () => layout.classList.contains('mobile-nav-open') ? close() : open());
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.querySelectorAll('#guild-server-list, #guild-home, #server-list, #friends-sidebar, #direct-messages-list').forEach(el => {
    el.addEventListener('click', event => {
      if (mobile() && event.target.closest('button, a, .channel-entry')) close();
    });
  });
  matchMedia('(min-width: 701px)').addEventListener('change', event => { if (event.matches) close(); });
})();
