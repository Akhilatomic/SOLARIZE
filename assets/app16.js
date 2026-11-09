// Fast, macOS-style hover labels for icon-only buttons (and the icon-strip sidebar). Mouse only; touch keeps long-press.
(() => {
  if (matchMedia('(hover: none)').matches) return;
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip');
  let cur = null, tm = null;
  const iconOnly = el => el.matches('.ib,.xdb,.fchk,.dcth,[data-tip]') || (el.closest('aside') && ($('aside') || {}).offsetWidth < 120) || !el.textContent.trim();
  const hide = () => { clearTimeout(tm); tip.classList.remove('on'); if (cur && cur.dataset.tipT && !cur.hasAttribute('title')) cur.setAttribute('title', cur.dataset.tipT); cur = null; };
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[title],[data-tip-t]'); if (el === cur) return; hide();
    if (!el || !iconOnly(el)) return;
    const t = el.getAttribute('title') || el.dataset.tipT; if (!t) return;
    el.dataset.tipT = t; el.removeAttribute('title'); cur = el; // no native tooltip on top of ours
    tm = setTimeout(() => { if (cur !== el || !document.body.contains(el)) return;
      tip.textContent = t; if (!tip.isConnected) document.body.appendChild(tip);
      const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 7, below = false;
      if (el.closest('aside') && $('aside').offsetWidth < 120) { x = r.right + 8; y = r.top + r.height / 2 - th / 2; }
      else if (y < 6) { y = r.bottom + 7; below = true; }
      tip.style.left = Math.max(6, Math.min(innerWidth - tw - 6, x)) + 'px'; tip.style.top = Math.max(6, y) + 'px'; tip.classList.toggle('below', below); tip.classList.add('on'); }, 180);
  });
  document.addEventListener('mouseout', e => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  ['scroll', 'mousedown', 'keydown'].forEach(ev => document.addEventListener(ev, hide, true));
})();
