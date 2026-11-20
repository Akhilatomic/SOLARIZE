// Solarize CRM - motion (owner's choice 2026-11-20): short, never in the way of a click, off when the device asks for less motion.
/* Page fade-in, placeholder ("skeleton") while a page loads, list rows easing in on first draw, windows / menus / notices easing in,
   dashboard numbers counting up, bars filling, a green tick on the button that saved. The CSS is in app2.css (.mo-*, @keyframes mo*). */
const MO = { still: () => matchMedia('(prefers-reduced-motion: reduce)').matches, lastBtn: null, lastAt: 0 };

/* the grey placeholder shown while a page loads: a toolbar line and a few cards, roughly the shape most pages have */
function moSkeleton() {
  return `<div class="mo-sk" aria-busy="true" aria-label="Loading"><div class="mo-skb mo-sk-bar"></div>
    <div class="mo-sk-row"><div class="mo-skb mo-sk-card"></div><div class="mo-skb mo-sk-card"></div><div class="mo-skb mo-sk-card"></div><div class="mo-skb mo-sk-card"></div></div>
    <div class="mo-skb mo-sk-big"></div></div>`;
}

/* called by route() once a page is drawn */
function moPage() {
  const main = document.getElementById('main'); if (!main) return;
  main.classList.remove('mo-in'); void main.offsetWidth; main.classList.add('mo-in'); /* restart the fade-in */
  clearTimeout(MO.t); MO.t = setTimeout(() => main.classList.remove('mo-in'), 900); /* rows drawn later (filters, scrolling) do not animate */
  if (MO.still()) return;
  if (main.classList.contains('pg-dashboard')) setTimeout(() => $$('.dg .sc>b, .dg .stat>b', main).forEach(moCount), 60);
}

/* a dashboard number counts up to its value ("18", "₹31,50,000"); anything else is left as it is */
function moCount(el) {
  const txt = el.textContent.trim(), m = txt.match(/^(₹?)([\d,]+)$/); if (!m) return;
  const end = +m[2].replace(/,/g, ''); if (!end || end < 2) return;
  const t0 = performance.now(), dur = 700, fmt = n => m[1] + Math.round(n).toLocaleString('en-IN');
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(end * e); if (k < 1) requestAnimationFrame(step); else el.textContent = txt; };
  requestAnimationFrame(step);
}

/* the button someone just clicked; when a save that follows within a few seconds succeeds, it shows a short green tick */
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button.btn, .btn[role=button]'); if (b) { MO.lastBtn = b; MO.lastAt = Date.now(); } }, true);
function moSaved(action) {
  if (!/^(save|add|set|status|page_save|upload|approve|remove|dismiss|feas_dismiss|claim)$/.test(action || '')) return;
  const b = MO.lastBtn; if (!b || Date.now() - MO.lastAt > 6000 || !document.body.contains(b)) return;
  MO.lastBtn = null; b.classList.remove('mo-ok'); void b.offsetWidth; b.classList.add('mo-ok'); setTimeout(() => b.classList.remove('mo-ok'), 1100);
}
