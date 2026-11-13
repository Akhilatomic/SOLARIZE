/* Install as an app: on phones and tablets a small card offers to put Solarize on the home screen.
   Android (Chrome, Edge, Samsung): the browser's own install window opens from the Install button.
   iPhone / iPad: Apple gives websites no install button, so the card shows the two taps (Share, Add to Home Screen). */
const A2H = {
  LATER_DAYS: 3, /* "Not now" hides the card for this many days */
  ev: null, el: null,
  /* pure rules (unit tested): which card, if any, for this device */
  kind(ua, touch, standalone, laterAt, now, hasPrompt) {
    if (standalone) return '';
    if (laterAt && now - laterAt < A2H.LATER_DAYS * 86400000) return '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
    if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios';
    if (/Android/.test(ua)) return hasPrompt ? 'prompt' : 'android';
    return '';
  },
  standalone() { try { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } },
  later() { try { return +localStorage.getItem('a2hLater') || 0; } catch (e) { return 0; } },
  now() { return A2H.kind(navigator.userAgent, navigator.maxTouchPoints || 0, A2H.standalone(), A2H.later(), Date.now(), !!A2H.ev); },
  SHARE: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  text(k) {
    if (k === 'prompt') return 'Open it from your home screen, full screen, like any other app.';
    if (k === 'ios') return 'Tap <b class="a2h-k">' + A2H.SHARE + ' Share</b> in Safari, then <b>Add to Home Screen</b>.';
    if (k === 'ios-other') return 'Tap <b class="a2h-k">' + A2H.SHARE + ' Share</b> in the browser menu, then <b>Add to Home Screen</b>.';
    return 'Open the browser menu <b>⋮</b>, then tap <b>Install app</b> or <b>Add to Home screen</b>.';
  },
  hide() { if (A2H.el) { A2H.el.remove(); A2H.el = null; } },
  show() {
    const k = A2H.now(); if (!k) { A2H.hide(); return; }
    A2H.hide();
    const d = document.createElement('div'); d.className = 'a2h'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Install Solarize');
    d.innerHTML = '<img src="assets/icon-192.png" alt="" width="44" height="44">'
      + '<div class="a2h-t"><b>Install Solarize as an app</b><span>' + A2H.text(k) + '</span></div>'
      + '<div class="a2h-b">' + (k === 'prompt' ? '<button type="button" class="btn sm" data-a2h="go">Install</button>' : '')
      + '<button type="button" class="btn sm sec" data-a2h="no">' + (k === 'prompt' ? 'Not now' : 'OK') + '</button></div>';
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a2h]'); if (!b) return;
      if (b.dataset.a2h === 'go' && A2H.ev) {
        const ev = A2H.ev; A2H.ev = null; A2H.hide();
        try { ev.prompt(); const r = await ev.userChoice; if (r && r.outcome !== 'accepted') A2H.snooze(); } catch (x) { }
        return;
      }
      A2H.snooze(); A2H.hide();
    });
    document.body.appendChild(d); A2H.el = d;
  },
  snooze() { try { localStorage.setItem('a2hLater', String(Date.now())); } catch (e) { } },
  start() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || /(^|\.)localhost$/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => { });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A2H.ev = e; A2H.show(); });
    window.addEventListener('appinstalled', () => { A2H.ev = null; A2H.hide(); });
    /* iPhone / iPad at once; Android browsers that never offer a prompt get the menu hint after a short wait */
    setTimeout(() => { if (!A2H.el) A2H.show(); }, /Android/.test(navigator.userAgent) ? 4000 : 1200);
  }
};
if (typeof module !== 'undefined') module.exports = A2H;
else if (typeof window !== 'undefined') A2H.start();
