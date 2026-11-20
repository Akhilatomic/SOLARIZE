// Solarize CRM - Ctrl+K quick search (owner's choice 2026-11-20). One box, from anywhere: pages of the menu, leads, customers,
// projects and quotations (api/find.php), each only as far as the person may open them. ↑ ↓ to move, Enter to open, Esc to close.
// Also the Search button in the top bar (and "/" when not typing in a field).
const QS = { m: null, t: 0, seq: 0, items: [], sel: 0 };
document.addEventListener('keydown', e => {
  if (!ME) return;
  const k = e.key.toLowerCase(), typing = /^(input|textarea|select)$/i.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); qsOpen(); }
  else if (k === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('.modal')) { e.preventDefault(); qsOpen(); }
});
/* the Search button in the top bar (drawn once the shell is there) */
function qsButton() {
  const top = document.querySelector('.top'); if (!top || top.querySelector('#qsb')) return;
  const b = document.createElement('button'); b.id = 'qsb'; b.type = 'button'; b.className = 'qsb';
  b.innerHTML = `<i class="i i-search"></i><span>Search</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>`; b.title = 'Search leads, customers, projects, quotations and pages';
  b.onclick = qsOpen;
  const title = top.querySelector('#title'); title && title.nextSibling ? top.insertBefore(b, title.nextSibling) : top.appendChild(b);
}
new MutationObserver(() => { if (ME && document.querySelector('.top') && !document.querySelector('#qsb')) qsButton(); }).observe(document.documentElement, { childList: true, subtree: true });

function qsOpen() {
  if (QS.m && document.body.contains(QS.m)) { $('#qsi', QS.m).focus(); return; }
  const m = QS.m = modal(`<div class="qs"><div class="qs-in"><i class="i i-search"></i><input id="qsi" placeholder="Search name, phone, consumer no., quotation no. or a page…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="qs-r" id="qsr" role="listbox"></div><div class="qs-f mut"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`);
  m.classList.add('qsm');
  const inp = $('#qsi', m);
  inp.oninput = () => { clearTimeout(QS.t); QS.t = setTimeout(() => qsRun(inp.value), 140); qsDraw(inp.value, null); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!QS.items.length) return; QS.sel = (QS.sel + (e.key === 'ArrowDown' ? 1 : -1) + QS.items.length) % QS.items.length; qsMark(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = QS.items[QS.sel]; if (it) qsGo(it); }
    else if (e.key === 'Escape') { e.preventDefault(); m.remove(); }
  };
  qsDraw('', null); setTimeout(() => inp.focus());
}
/* the menu pages that match (and the person may open) */
function qsPages(q) {
  const t = q.trim().toLowerCase(); if (typeof MODS === 'undefined') return [];
  return MODS.filter(x => (x[0] === 'admin' ? ME.role === 'admin' : canR(x[3])) && (!t || x[1].toLowerCase().includes(t) || x[0].includes(t)))
    .slice(0, t ? 5 : 8).map(x => ({ k: 'page', icon: (x[2].match(/i-([\w-]+)/) || [])[1] || 'file', title: x[1], sub: 'Page', go: '#/' + x[0] }));
}
async function qsRun(q) {
  const my = ++QS.seq; if (q.trim().length < 2) return qsDraw(q, null);
  let d = null; try { d = await api('find', 'go', undefined, '&q=' + encodeURIComponent(q.trim())); } catch (e) { d = null; }
  if (my === QS.seq) qsDraw(q, d);
}
function qsDraw(q, d) {
  const m = QS.m; if (!m || !document.body.contains(m)) return;
  const groups = [['Pages', qsPages(q)]];
  if (d) {
    groups.push(['Leads', (d.leads || []).map(l => ({ k: 'lead', id: l.id, icon: 'target', title: l.name || 'Lead', sub: [l.phone, l.city, l.status, l.customer_id ? 'now a customer' : ''].filter(Boolean).join(' · ') }))]);
    groups.push(['Customers', (d.customers || []).map(c => ({ k: 'cust', icon: 'users', title: c.name, sub: [c.phone, c.consumer_no, c.district].filter(Boolean).join(' · '), go: '#/customers/' + c.id }))]);
    groups.push(['Projects', (d.projects || []).map(p => ({ k: 'proj', icon: 'project', title: p.title || p.customer || 'Project', sub: [p.customer, p.kw ? p.kw + ' kW' : '', p.stage].filter(Boolean).join(' · '), go: '#/projects/' + p.id }))]);
    groups.push(['Quotations', (d.quotes || []).map(x => ({ k: 'quote', icon: 'receipt', title: x.number || 'Quotation', sub: [x.who, x.date ? dmy(x.date) : '', x.total ? inr(x.total) : '', x.status].filter(Boolean).join(' · '), go: '#/quotes/' + x.id }))]);
  }
  QS.items = []; QS.sel = 0;
  const hl = s => { const t = q.trim(); if (t.length < 2) return esc(s); const i = String(s).toLowerCase().indexOf(t.toLowerCase()); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + t.length)) + '</mark>' + esc(s.slice(i + t.length)); };
  const html = groups.filter(([, it]) => it.length).map(([g, it]) => `<div class="qs-g">${g}</div>` + it.map(x => { const n = QS.items.push(x) - 1;
    return `<button type="button" class="qs-i" role="option" data-n="${n}"><span class="qs-ic"><i class="i i-${x.icon}"></i></span><span class="qs-t"><b>${hl(x.title)}</b>${x.sub ? `<small>${hl(x.sub)}</small>` : ''}</span><i class="i i-chev qs-go"></i></button>`; }).join('')).join('');
  const box = $('#qsr', m);
  box.innerHTML = html || (q.trim().length >= 2 ? (d ? `<p class="qs-e">Nothing found for “${esc(q.trim())}”.</p>` : '<p class="qs-e">Searching…</p>') : '');
  $$('.qs-i', box).forEach(b => { b.onclick = () => qsGo(QS.items[+b.dataset.n]); b.onmousemove = () => { if (QS.sel !== +b.dataset.n) { QS.sel = +b.dataset.n; qsMark(); } }; });
  qsMark();
}
function qsMark() { const m = QS.m; if (!m) return; $$('.qs-i', m).forEach(b => b.classList.toggle('on', +b.dataset.n === QS.sel)); const on = $('.qs-i.on', m); if (on) on.scrollIntoView({ block: 'nearest' }); }
function qsGo(it) {
  if (QS.m) QS.m.remove();
  if (it.k === 'lead') { if (typeof leadModal === 'function') leadModal(it.id); return; }
  location.hash = it.go;
}
