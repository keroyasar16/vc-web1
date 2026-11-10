(() => {
  const layout = document.querySelector('.discord-app-layout');
  const toggle = document.getElementById('mobile-nav-toggle');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  const panel = document.getElementById('mobile-nav-panel');
  if (!layout || !toggle || !backdrop || !panel) return;
  const mobile = window.matchMedia('(max-width: 700px)');
  const members = document.getElementById('server-members');
  const membersButtons = [document.getElementById('toggle-members'), document.getElementById('toggle-members-topbar')].filter(Boolean);
  const syncBackdrop = () => { backdrop.hidden = !(layout.classList.contains('mobile-nav-open') || (mobile.matches && layout.classList.contains('members-open'))); };
  function closeNav() {
    layout.classList.remove('mobile-nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Sunucu ve kanal menüsünü aç');
    syncBackdrop();
  }
  function closeMembers() {
    layout.classList.remove('members-open');
    membersButtons.forEach(b => b.setAttribute('aria-expanded', 'false'));
    syncBackdrop();
  }
  toggle.addEventListener('click', () => {
    if (!mobile.matches) return;
    if (layout.classList.contains('mobile-nav-open')) closeNav();
    else {
      closeMembers();
      layout.classList.add('mobile-nav-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Sunucu ve kanal menüsünü kapat');
      syncBackdrop();
    }
  });
  backdrop.addEventListener('click', () => { closeNav(); closeMembers(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeNav(); closeMembers(); } });
  membersButtons.forEach(button => button.addEventListener('click', () => {
    if (!mobile.matches) return;
    closeNav();
    // Main app's own click handler changes members-open. Read it after the click event.
    queueMicrotask(syncBackdrop);
  }));
  document.querySelectorAll('#guild-server-list, #guild-home, #server-list, #friends-sidebar, #direct-messages-list').forEach(el => {
    el.addEventListener('click', event => {
      if (mobile.matches && event.target.closest('button, a, .channel-entry')) closeNav();
    });
  });
  const observer = new MutationObserver(() => { if (mobile.matches) syncBackdrop(); });
  observer.observe(layout, { attributes: true, attributeFilter: ['class'] });
  mobile.addEventListener('change', event => { if (!event.matches) { closeNav(); closeMembers(); } });
})();
