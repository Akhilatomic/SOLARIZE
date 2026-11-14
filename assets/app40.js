// Solarize CRM - the "Live" feed at the foot of the side menu: what is waiting for this person, one line at a time.
// It reads what the CRM already polls (bell notifications, new leads, leave requests, who is online) — no request of its own.
// The line changes every few seconds with a short slide; a click opens what it is about. Pure part first (unit tested).
const SFEED = { i: 0, t: 0, list: [], on: false, hover: false, EVERY: 4500,
  ICON: { callback: 'phone', assign: 'users', feas: 'clock', mention: 'chat', reply: 'chat', leave: 'leave' },
  cut(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; },
  /* pure: the lines to show. d = { notifs: [{kind, text, created, customer_id, lead_id}], leads: n, leave: n, online: n, ago: fn } */
  items(d) {
    d = d || {}; const out = [], ago = d.ago || (() => '');
    (d.notifs || []).slice(0, 8).forEach(n => out.push({ icon: SFEED.ICON[n.kind] || 'bell', text: SFEED.cut(n.text, 96), sub: ago(n.created),
      go: n.lead_id ? '#/leads' : n.customer_id ? '#/customers/' + n.customer_id : '' }));
    if (+d.leads > 0) out.push({ icon: 'target', text: d.leads + ' new lead' + (+d.leads === 1 ? '' : 's') + ' waiting', sub: 'Leads', go: '#/leads' });
    if (+d.leave > 0) out.push({ icon: 'leave', text: d.leave + ' leave request' + (+d.leave === 1 ? '' : 's') + ' to review', sub: 'Leave', go: '#/leaves' });
    if (+d.online > 0) out.push({ icon: 'users', text: d.online + ' teammate' + (+d.online === 1 ? '' : 's') + ' online now', sub: 'Team', go: '' });
    return out.length ? out : [{ icon: 'check', text: 'All caught up', sub: 'Nothing is waiting for you', go: '', idle: true }];
  } };
if (typeof module !== 'undefined') module.exports = SFEED;

function sideFeedData() {
  const online = typeof PRES !== 'undefined' && PRES.map ? Object.values(PRES.map).filter(u => u && u.st === 'on' && +u.id !== +ME.id).length : 0;
  return { notifs: typeof DISC !== 'undefined' ? DISC.notifs || [] : [], leads: typeof FEED !== 'undefined' ? FEED.count : 0,
    leave: typeof HR !== 'undefined' && HR.pend ? HR.pend.length : 0, online, ago: typeof agoStr === 'function' ? agoStr : () => '' };
}
function sideFeedShow(first) {
  const box = document.getElementById('sbfeed'); if (!box) return;
  const list = SFEED.list = SFEED.items(sideFeedData()); if (SFEED.i >= list.length) SFEED.i = 0;
  const it = list[SFEED.i], b = box.querySelector('.sbf-b'), key = it.icon + '|' + it.text + '|' + it.sub;
  box.querySelector('.sbf-n').textContent = it.idle ? '' : list.length > 1 ? (SFEED.i + 1) + ' / ' + list.length : '';
  box.classList.toggle('idle', !!it.idle);
  if (b.dataset.k === key) return;
  const paint = () => { b.dataset.k = key; b.title = it.text;
    b.innerHTML = `<span class="sbf-ic"><i class="i i-${it.icon}"></i></span><span class="sbf-t"><b>${esc(it.text)}</b><small>${esc(it.sub || '')}</small></span>`;
    b.classList.remove('out'); b.classList.add('in'); setTimeout(() => b.classList.remove('in'), 420); };
  if (first || !b.dataset.k) return paint();
  b.classList.add('out'); setTimeout(paint, 170); /* the old line slides away, the new one slides in */
}
/* called from boot() after the side menu is drawn */
function startSideFeed() {
  const side = document.getElementById('side'); if (!side || document.getElementById('sbfeed')) return;
  const box = document.createElement('div'); box.className = 'sbfeed'; box.id = 'sbfeed';
  box.innerHTML = '<div class="sbf-h"><span class="sbf-dot" aria-hidden="true"></span><b>Live</b><small class="sbf-n"></small></div><button type="button" class="sbf-b" aria-live="polite"></button>';
  side.appendChild(box);
  box.onmouseenter = () => { SFEED.hover = true; }; box.onmouseleave = () => { SFEED.hover = false; };
  box.querySelector('.sbf-b').onclick = () => { const it = SFEED.list[SFEED.i] || {};
    if (it.go) location.hash = it.go; else { const bell = document.getElementById('bell'); if (bell && !it.idle) bell.click(); }
    document.body.classList.remove('drawer'); };
  sideFeedShow(true);
  if (SFEED.on) return; SFEED.on = true;
  setInterval(() => { if (document.hidden || SFEED.hover) return; if (SFEED.list.length > 1) SFEED.i = (SFEED.i + 1) % SFEED.list.length; sideFeedShow(); }, SFEED.EVERY);
}
