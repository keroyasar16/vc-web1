(() => {
  const ua = navigator.userAgent;
  if (!/Electron\//i.test(ua)) return;
  const current = (ua.match(/VCDesktop\/(\d+\.\d+\.\d+)/) || [])[1] || '1.0.0';
  function newer(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
    return false;
  }
  let dismissed = false;
  async function check() {
    if (dismissed) return;
    try {
      const response = await fetch('/api/desktop-release', { cache: 'no-store' });
      if (!response.ok) return;
      const release = await response.json();
      if (!/^\d+\.\d+\.\d+$/.test(release.version || '') || !newer(release.version, current)) return;
      if (document.getElementById('vc-desktop-update')) return;
      const box = document.createElement('aside');
      box.id = 'vc-desktop-update';
      box.setAttribute('role', 'status');
      Object.assign(box.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: '99999', maxWidth: '360px', padding: '18px', borderRadius: '14px', background: '#232438', color: '#fff', border: '1px solid #8e98ff', boxShadow: '0 8px 32px #0006', fontFamily: 'sans-serif' });
      const text = document.createElement('p');
      text.textContent = "Uygulamamızın en güncel sürümü yayında! vcchats.com adresimizden client'i indirip kullanmaya devam edebilirsiniz.";
      const link = document.createElement('a');
      link.href = '/download-client'; link.download = 'VC-Setup.exe'; link.textContent = 'Yeni sürümü indir';
      Object.assign(link.style, { color: '#c4c9ff', fontWeight: 'bold' });
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Daha sonra'; close.style.marginLeft = '16px';
      close.addEventListener('click', () => { dismissed = true; box.remove(); });
      box.append(text, link, close); document.body.append(box);
    } catch (_) { /* Retry on next check without disrupting calls. */ }
  }
  check(); setInterval(check, 10 * 60 * 1000);
})();
