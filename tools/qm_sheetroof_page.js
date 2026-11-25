/* Sheet-roof page for the quotation (assets/quote/page-sheetroof.jpg): printed as the LAST page when a quotation has an Additional
   structure item (QM.SCOPE; the products' "page" field). Owner, 2026-11-25: Kerala house with a sheet roof, panels on an elevated GI
   structure ~1 m above the sheets, walkway, sliding roof door, SolarEdge inverter on the ground-floor wall, conduit, workers in Jasper red;
   no promises; "representation only"; GI not as recommended by MNRE (OM No. 318/61/2025-GCRT-Part(2), 19.05.2026); customer scope.
   Rebuild:  node tools/qm_sheetroof_page.js   (writes tools/out/sheetroof.html), then render at A4 200 dpi with headless Chrome:
     chrome --headless=new --hide-scrollbars --force-device-scale-factor=2.0831 --window-size=794,1123 --screenshot=tools/out/sheetroof.png tools/out/sheetroof.html
   and save the PNG as a JPEG (quality ~88, 1654 x 2339) over assets/quote/page-sheetroof.jpg. */
const fs = require('fs');
const C = { navy: '#1E2638', panel: '#24305A', cell: '#3E4F88', red: '#D8363D', redDk: '#B52A30', sheet: '#B9C4D1', ridge: '#9DAABA', hi: '#D3DBE4',
  steel: '#7E8A9B', wall: '#F6F1E8', wallSh: '#E7E0D3', slab: '#CBD0D7', glass: '#3B4A6B', skin: '#A86B47', skinDk: '#8E5838', pant: '#39425A',
  shoe: '#1C2434', grass: '#BFDC9F', grassDk: '#9CC77A', leaf: '#3E8E5A', leafDk: '#2C6F45', trunk: '#8A6A4A', grey: '#6B7280', amber: '#F2A93B' };
const f = n => Math.round(n * 100) / 100;
const pts = a => a.map(p => f(p[0]) + ',' + f(p[1])).join(' ');

/* ---------- roof geometry: u = across (0 left .. 1 right), v = up the slope (0 eave .. 1 ridge) ---------- */
const R = { yE: 452, yR: 300, xlE: 126, xrE: 668, xlR: 190, xrR: 604 };
const P = (u, v) => { const y = R.yE + (R.yR - R.yE) * v, xl = R.xlE + (R.xlR - R.xlE) * v, xr = R.xrE + (R.xrR - R.xrE) * v; return [xl + (xr - xl) * u, y]; };
const quad = (u0, u1, v0, v1) => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
const poly = (q, fill, extra = '') => `<polygon points="${pts(q)}" fill="${fill}" ${extra}/>`;
const lineUV = (u0, v0, u1, v1, stroke, w, extra = '') => { const a = P(u0, v0), b = P(u1, v1); return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`; };

function roof() {
  let s = poly(quad(0, 1, 0, 1), 'url(#sheetG)');
  for (let i = 1; i < 44; i++) { const u = i / 44; s += lineUV(u, 0, u, 1, C.ridge, 2.4) + lineUV(u + 0.006, 0, u + 0.006, 1, C.hi, 1); }
  s += lineUV(-0.01, 1, 1.01, 1, C.steel, 7, 'stroke-linecap="round"'); /* ridge cap */
  s += poly(quad(0, 1, 0, 0.16), '#1E2638', 'opacity=".07"'); /* a little shade near the eave */
  s += `<rect x="${R.xlE - 6}" y="${R.yE - 2}" width="${R.xrE - R.xlE + 12}" height="10" rx="3" fill="${C.steel}"/>`; /* gutter */
  return s;
}
/* one panel row on rails: shadow (lifted off the sheet), rails sticking out at the ends, panels with cells and frame; skip = panel index left open */
function panelRow(v0, v1, n, skip) {
  const u0 = 0.06, u1 = 0.74, gap = 0.008, w = (u1 - u0 - gap * (n - 1)) / n;
  let s = '';
  s += `<g transform="translate(0,5)">${poly(quad(u0, u1, v0, v1), '#6F7C8E', 'opacity=".55"')}</g>`;
  for (const rv of [v0 + (v1 - v0) * 0.22, v0 + (v1 - v0) * 0.78]) s += lineUV(u0 - 0.025, rv, u1 + 0.025, rv, '#4B5563', 3.2, 'stroke-linecap="round"');
  for (let k = 0; k <= n; k++) { const uu = u0 + (u1 - u0) * k / n, a = P(uu, v0); s += `<rect x="${f(a[0] - 3)}" y="${f(a[1] - 1)}" width="6" height="7" rx="1" fill="#3B4556"/>`; } /* the legs that hold the rails up off the sheets */
  for (let i = 0; i < n; i++) {
    const a = u0 + i * (w + gap), b = a + w;
    if (i === skip) { /* open slot: rails and clamps showing */
      s += lineUV(a + w * 0.1, v0 + (v1 - v0) * 0.22, b - w * 0.1, v0 + (v1 - v0) * 0.22, '#2D3748', 3.6);
      continue;
    }
    s += poly(quad(a, b, v0, v1), 'url(#panelG)', `stroke="#DDE3EA" stroke-width="1.6"`);
    for (let k = 1; k < 4; k++) s += lineUV(a + w * k / 4, v0 + 0.01, a + w * k / 4, v1 - 0.01, C.cell, 1.1);
    for (let k = 1; k < 6; k++) { const vv = v0 + (v1 - v0) * k / 6; s += lineUV(a + 0.004, vv, b - 0.004, vv, C.cell, 1.1); }
    const g = quad(a + w * 0.05, a + w * 0.45, v1 - (v1 - v0) * 0.5, v1 - (v1 - v0) * 0.08); s += poly(g, '#FFFFFF', 'opacity=".10"');
  }
  return s;
}
/* walkway: GI grating along the slope between the two panel rows, up to the roof door */
function walkway(v0, v1) {
  const u0 = 0.035, u1 = 0.955;
  let s = `<g transform="translate(0,3)">${poly(quad(u0, u1, v0, v1), '#6F7C8E', 'opacity=".5"')}</g>`;
  s += poly(quad(u0, u1, v0, v1), '#E9EDF2', `stroke="#8C96A6" stroke-width="2"`);
  for (let u = u0 + 0.012; u < u1; u += 0.012) s += lineUV(u, v0, u, v1, '#9AA4B2', 1.4);
  s += lineUV(u0, (v0 + v1) / 2, u1, (v0 + v1) / 2, '#9AA4B2', 1);
  return s;
}
/* sliding roof door: an opening in the sheets with the sheet leaf slid up the slope on two track rails, ladder poking out */
function roofDoor() {
  const u0 = 0.815, u1 = 0.95, v0 = 0.2, v1 = 0.58;
  let s = '';
  s += lineUV(u0 - 0.006, v0 - 0.05, u0 - 0.006, 0.97, '#2D3748', 3) + lineUV(u1 + 0.006, v0 - 0.05, u1 + 0.006, 0.97, '#2D3748', 3); /* tracks */
  s += poly(quad(u0, u1, v0, v1), '#141A28'); /* the opening */
  const L = P(u0 + 0.03, v0 + 0.02), Rr = P(u1 - 0.03, v0 + 0.02);
  for (const p of [L, Rr]) s += `<line x1="${f(p[0])}" y1="${f(p[1] + 6)}" x2="${f(p[0])}" y2="${f(p[1] - 52)}" stroke="#C9D1DB" stroke-width="3.2" stroke-linecap="round"/>`;
  for (let k = 0; k < 4; k++) { const y = L[1] - 6 - k * 13; s += `<line x1="${f(L[0])}" y1="${f(y)}" x2="${f(Rr[0])}" y2="${f(y)}" stroke="#C9D1DB" stroke-width="2.6"/>`; }
  /* the slid leaf (sheet panel with its own ridges), above the opening */
  s += poly(quad(u0 - 0.004, u1 + 0.004, 0.6, 0.96), '#C7D0DB', `stroke="#5D6778" stroke-width="2"`);
  for (let u = u0 + 0.012; u < u1; u += 0.016) s += lineUV(u, 0.61, u, 0.95, C.ridge, 2);
  const h = P((u0 + u1) / 2, 0.64); s += `<rect x="${f(h[0] - 9)}" y="${f(h[1] - 3)}" width="18" height="5" rx="2.5" fill="${C.red}"/>`; /* handle */
  return s;
}

/* ---------- people (local units: feet at 0,0, about 100 tall, facing the viewer) ---------- */
function person(o) {
  const { x, y, s = 1, flip = false, pose = 'stand', back = false, text = true, half = false, harness = false } = o;
  let g = '';
  const arm = (x1, y1, x2, y2, x3, y3) => `<path d="M${x1} ${y1} L${x2} ${y2}${x3 != null ? ` L${x3} ${y3}` : ''}" fill="none" stroke="${C.skin}" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const sleeve = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${C.red}" stroke-width="9" stroke-linecap="round"/>`;
  if (!half) {
    let legs;
    if (pose === 'climb') legs = `<polygon points="-10,-47 -2,-47 -4,-4 -12,-4" fill="${C.pant}"/><polygon points="2,-47 10,-47 13,-30 9,-18 3,-20 5,-30" fill="${C.pant}"/>`
      + `<ellipse cx="-8" cy="-2" rx="6" ry="3" fill="${C.shoe}"/><ellipse cx="7" cy="-18" rx="6" ry="3" fill="${C.shoe}"/>`;
    else if (pose === 'walk') legs = `<polygon points="-10,-47 -2,-47 -9,-3 -17,-3" fill="${C.pant}"/><polygon points="2,-47 10,-47 15,-3 7,-3" fill="${C.pant}"/>`
      + `<ellipse cx="-14" cy="-1.5" rx="6.5" ry="3" fill="${C.shoe}"/><ellipse cx="12" cy="-1.5" rx="6.5" ry="3" fill="${C.shoe}"/>`;
    else legs = `<polygon points="-10,-47 -2,-47 -3,-3 -11,-3" fill="${C.pant}"/><polygon points="2,-47 10,-47 11,-3 3,-3" fill="${C.pant}"/>`
      + `<ellipse cx="-7.5" cy="-1.5" rx="6" ry="3" fill="${C.shoe}"/><ellipse cx="7.5" cy="-1.5" rx="6" ry="3" fill="${C.shoe}"/>`;
    g += legs + `<rect x="-12" y="-51" width="24" height="5" rx="2" fill="${C.shoe}"/>`;
  }
  /* arms behind the torso first for poses where they go up */
  let armsBack = '', armsFront = '', prop = '';
  if (pose === 'carryUp') { /* panel held over the head */
    armsBack = sleeve(-11, -78, -15, -86) + arm(-15, -86, -20, -104) + sleeve(11, -78, 15, -86) + arm(15, -86, 20, -104);
    prop = `<polygon points="-38,-114 38,-114 44,-104 -32,-104" fill="${C.panel}" stroke="#DDE3EA" stroke-width="1.6"/>`
      + [-19, 0, 19].map(xx => `<line x1="${xx}" y1="-113.5" x2="${xx + 3}" y2="-104.5" stroke="${C.cell}" stroke-width="1.2"/>`).join('');
  } else if (pose === 'reach') { /* fixing a clamp with a spanner */
    armsBack = sleeve(-11, -78, -15, -72) + arm(-15, -72, -16, -54);
    armsFront = sleeve(11, -78, 18, -82) + arm(18, -82, 32, -92) + `<path d="M31 -92 l9 -6" stroke="#9AA4B2" stroke-width="3.4" stroke-linecap="round"/><circle cx="41.5" cy="-99" r="3.2" fill="none" stroke="#9AA4B2" stroke-width="2.4"/>`;
  } else if (pose === 'climb') {
    armsBack = sleeve(-11, -78, -15, -88) + arm(-15, -88, -15, -106) + sleeve(11, -78, 15, -86) + arm(15, -86, 15, -98);
  } else if (pose === 'carrySide') { /* panel standing at his side, hand on its top edge */
    prop = `<g transform="rotate(-6 34 -60)"><rect x="18" y="-104" width="34" height="80" rx="2" fill="${C.panel}" stroke="#DDE3EA" stroke-width="1.6"/>`
      + [1, 2].map(k => `<line x1="${18 + 34 * k / 3}" y1="-103" x2="${18 + 34 * k / 3}" y2="-25" stroke="${C.cell}" stroke-width="1.1"/>`).join('')
      + [1, 2, 3, 4, 5].map(k => `<line x1="19" y1="${-104 + 80 * k / 6}" x2="51" y2="${-104 + 80 * k / 6}" stroke="${C.cell}" stroke-width="1.1"/>`).join('')
      + `<polygon points="20,-102 32,-102 22,-70" fill="#fff" opacity=".1"/></g>`;
    armsFront = sleeve(11, -78, 15, -70) + arm(15, -70, 22, -60, 26, -64);
    armsBack = sleeve(-11, -78, -15, -70) + arm(-15, -70, -17, -52);
  } else if (pose === 'lean') { /* arms resting on the door edge */
    armsFront = sleeve(-11, -78, -17, -68) + arm(-17, -68, -6, -58) + sleeve(11, -78, 17, -68) + arm(17, -68, 6, -58);
  } else {
    armsBack = sleeve(-11, -78, -14, -70) + arm(-14, -70, -16, -53) + sleeve(11, -78, 14, -70) + arm(14, -70, 16, -53);
  }
  if (pose === 'carrySide') g += prop; /* the panel stands beside him */
  g += armsBack;
  g += `<rect x="-13" y="-83" width="26" height="35" rx="7" fill="${C.red}"/>`; /* the Jasper red T-shirt */
  g += `<path d="M-13 -70 q13 4 26 0" stroke="${C.redDk}" stroke-width="1" fill="none" opacity=".5"/>`;
  if (text) g += `<text x="0" y="${back ? -66 : -63}"${flip ? ' transform="scale(-1 1)"' : ''} text-anchor="middle" font-family="Poppins" font-weight="700" font-size="${back ? 6.6 : 5.6}" fill="#fff" letter-spacing=".3">JASPER</text>`;
  if (!back) g += `<path d="M-5 -83 L0 -78 L5 -83" fill="none" stroke="${C.redDk}" stroke-width="1.4"/>`; /* collar */
  if (harness) g += `<path d="M-8 -82 L-7 -50 M8 -82 L7 -50 M-9 -77 H9" stroke="#2D3748" stroke-width="2.4" fill="none"/><circle cx="0" cy="-77" r="2" fill="${C.amber}"/>`; /* safety harness */
  g += `<rect x="-3.2" y="-88" width="6.4" height="6" fill="${C.skinDk}"/>`;
  g += `<circle cx="0" cy="-93" r="8.4" fill="${C.skin}"/>`;
  if (!back && s >= 1) g += `<circle cx="-3" cy="-93" r=".9" fill="#2B1B12"/><circle cx="3" cy="-93" r=".9" fill="#2B1B12"/><path d="M-2.6 -89.3 q2.6 1.8 5.2 0" stroke="#5B3420" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
  if (back) g += `<path d="M-8.4 -93 a8.4 8.4 0 0 0 16.8 0 v-1 h-16.8 z" fill="#2B1B12" opacity=".85"/>`; /* hair seen from the back */
  g += `<path d="M-9.4 -95 a9.4 9.4 0 0 1 18.8 0 z" fill="#F7F8FA"/><rect x="-11.5" y="-96" width="23" height="3" rx="1.5" fill="#F7F8FA"/><rect x="-1.4" y="-104" width="2.8" height="9" rx="1" fill="${C.red}"/>`; /* white helmet, red stripe */
  g += armsFront;
  if (pose === 'carryUp') g += prop;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${flip ? -s : s} ${s})">${g}</g>`;
}

/* ---------- house, ground, palms ---------- */
function palm(x, y, h, lean) {
  const top = [x + lean, y - h];
  let s = `<path d="M${x} ${y} Q${x + lean * 0.2} ${y - h * 0.55} ${top[0]} ${top[1]}" stroke="${C.trunk}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  for (let i = 1; i < 8; i++) { const t = i / 8; s += `<path d="M${x + lean * 0.2 * t * 2} ${y - h * t} l-4 0 l8 0" stroke="#6F543A" stroke-width="1.4"/>`; }
  const fr = [[-70, 26], [-40, 40], [-10, 46], [25, 44], [55, 34], [80, 18], [-95, 8], [100, 2]];
  for (const [dx, dy] of fr) {
    const ex = top[0] + dx, ey = top[1] + dy, mx = top[0] + dx * 0.5, my = top[1] - 18 + dy * 0.2;
    s += `<path d="M${top[0]} ${top[1]} Q${mx} ${my} ${ex} ${ey}" stroke="${dx % 20 ? C.leaf : C.leafDk}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  }
  s += `<circle cx="${top[0] - 4}" cy="${top[1] + 6}" r="5" fill="#7A5A2E"/><circle cx="${top[0] + 5}" cy="${top[1] + 7}" r="5" fill="#8A6A3A"/>`;
  return s;
}
/* Kerala red clay-tile porch roof over the front door */
function tilePorch(x0, x1, yT, yB) {
  const d = 16, poly4 = [[x0, yB], [x1, yB], [x1 - d, yT], [x0 + d, yT]];
  let s = `<polygon points="${pts(poly4)}" fill="#C4573A"/>`;
  for (let k = 1; k < 4; k++) { const y = yT + (yB - yT) * k / 4, t = k / 4; s += `<line x1="${f(x0 + d * (1 - t))}" y1="${f(y)}" x2="${f(x1 - d * (1 - t))}" y2="${f(y)}" stroke="#A3442C" stroke-width="1.6"/>`; }
  for (let xx = x0 + 10; xx < x1 - 4; xx += 9) s += `<line x1="${xx}" y1="${yB}" x2="${f(xx + (x0 + x1) / 2 - xx) * 0 + xx + ((x0 + x1) / 2 - xx) * 0.14}" y2="${yT}" stroke="#D86A4C" stroke-width="1.2" opacity=".7"/>`;
  s += `<rect x="${x0 + d - 3}" y="${yT - 3}" width="${x1 - x0 - 2 * d + 6}" height="4" rx="2" fill="#93391F"/>`;
  s += `<rect x="${x0 - 2}" y="${yB}" width="${x1 - x0 + 4}" height="3.5" rx="1.5" fill="#7A2F1A"/>`;
  s += `<polygon points="${x0 + 8},${yB + 3} ${x0 + 14},${yB + 3} ${x0 + 8},${yB + 16}" fill="#6E4A2E"/><polygon points="${x1 - 8},${yB + 3} ${x1 - 14},${yB + 3} ${x1 - 8},${yB + 16}" fill="#6E4A2E"/>`;
  return s;
}
function downpipe() {
  let s = `<path d="M652 458 V540 Q652 552 641 556 V866" fill="none" stroke="#9AA3B0" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="M650 460 V538" stroke="#C3CAD4" stroke-width="1.6"/>`;
  for (const y of [600, 680, 760, 840]) s += `<rect x="636" y="${y}" width="10" height="4" rx="1" fill="#6B7585"/>`;
  s += `<rect x="630" y="864" width="24" height="7" rx="2" fill="#8C97A7"/>`;
  return s;
}
/* hills of the Western Ghats with coconut groves, and monsoon rain falling on the far hills */
function tinyPalm(x, y, h) {
  let s = `<path d="M${x} ${y} q${h * 0.08} ${-h * 0.5} ${h * 0.03} ${-h}" stroke="#4E8A61" stroke-width="2" fill="none"/>`;
  for (const [dx, dy] of [[-12, 6], [-6, 9], [6, 9], [12, 6], [0, 10]]) s += `<path d="M${x + h * 0.03} ${y - h} q${dx * 0.5} -5 ${dx} ${dy}" stroke="#4E8A61" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  return s;
}
function backdrop() {
  let s = '';
  s += `<path d="M0 600 Q90 520 200 566 T420 540 T640 560 T794 530 V880 H0 Z" fill="#C3DCCF"/>`; /* far hills, misty */
  s += `<path d="M0 640 Q120 600 230 628 T470 616 T794 610 V880 H0 Z" fill="#A8CDB0"/>`;
  s += `<path d="M0 690 Q160 650 330 676 T640 660 T794 664 V880 H0 Z" fill="#8BBE93"/>`; /* near hills */
  for (const [x, y, h] of [[210, 676, 34], [236, 680, 28], [470, 670, 32], [500, 666, 38], [530, 672, 30], [690, 664, 34], [716, 668, 28]]) s += tinyPalm(x, y, h);
  s += `<g opacity=".85"><ellipse cx="50" cy="540" rx="52" ry="16" fill="#A7B4C2"/><ellipse cx="24" cy="530" rx="32" ry="16" fill="#B5C1CD"/><ellipse cx="80" cy="528" rx="28" ry="14" fill="#B5C1CD"/></g>`;
  for (let k = 0; k < 11; k++) { const x = 8 + k * 9; s += `<line x1="${x}" y1="${554 + (k % 3) * 4}" x2="${x - 20}" y2="${652 + (k % 4) * 8}" stroke="#8FA3B8" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>`; }
  return s;
}
function banana(x, y, h, flip) {
  const m = flip ? -1 : 1;
  let s = `<path d="M${x} ${y} L${x + m * 3} ${y - h}" stroke="#7C9A4A" stroke-width="9" stroke-linecap="round"/>`;
  const L = [[-60, -22, -30], [-44, -50, -20], [-8, -64, -5], [34, -52, 18], [58, -24, 32], [70, 2, 42]];
  for (const [dx, dy, rot] of L) {
    const ex = x + m * (3 + dx), ey = y - h + dy, cx = x + m * 3, cy = y - h;
    s += `<path d="M${cx} ${cy} Q${f(cx + m * dx * 0.4)} ${f(cy + dy * 1.2 - 14)} ${f(ex)} ${f(ey)} Q${f(cx + m * dx * 0.7)} ${f(cy + dy * 0.2 + 8)} ${cx} ${cy} Z" fill="${Math.abs(rot) > 25 ? '#5FA351' : '#6DB25C'}"/>`;
    s += `<path d="M${cx} ${cy} Q${f(cx + m * dx * 0.55)} ${f(cy + dy * 0.7 - 4)} ${f(ex)} ${f(ey)}" stroke="#4C8A42" stroke-width="1.2" fill="none"/>`;
  }
  return s;
}
/* laterite compound wall with plastered coping and gate pillars */
function compoundWall() {
  const yT = 878, yB = 908;
  let s = '';
  for (const [x0, x1] of [[0, 330], [456, 794]]) {
    s += `<rect x="${x0}" y="${yT}" width="${x1 - x0}" height="${yB - yT}" fill="#B8633F"/>`;
    for (const yy of [888, 898]) s += `<line x1="${x0}" y1="${yy}" x2="${x1}" y2="${yy}" stroke="#9A4E30" stroke-width="1.2"/>`;
    for (let r = 0; r < 3; r++) for (let xx = x0 + (r % 2) * 13; xx < x1; xx += 26) s += `<line x1="${xx}" y1="${yT + r * 10}" x2="${xx}" y2="${yT + r * 10 + 10}" stroke="#9A4E30" stroke-width="1.2"/>`;
    for (let k = 0; k < (x1 - x0) / 9; k++) s += `<circle cx="${x0 + 4 + k * 9}" cy="${yT + 4 + (k * 7) % 22}" r=".9" fill="#8C4428" opacity=".7"/>`;
    s += `<rect x="${x0 - 2}" y="${yT - 6}" width="${x1 - x0 + 4}" height="7" rx="2" fill="#EFE8DC"/>`;
  }
  for (const x of [322, 450]) s += `<rect x="${x}" y="${yT - 20}" width="16" height="${yB - yT + 20}" fill="#EFE8DC"/><rect x="${x - 3}" y="${yT - 25}" width="22" height="6" rx="2" fill="#E2DACB"/>`;
  return s;
}
function windowAt(x, y, w, h) {
  return `<rect x="${x - 5}" y="${y - 9}" width="${w + 10}" height="6" rx="1.5" fill="${C.slab}"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${C.glass}" stroke="#FFFFFF" stroke-width="4"/>`
    + `<line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="#fff" stroke-width="3"/>`
    + `<polygon points="${x + 6},${y + h - 4} ${x + 16},${y + 4} ${x + 24},${y + 4} ${x + 14},${y + h - 4}" fill="#fff" opacity=".12"/>`;
}
function house() {
  let s = '';
  /* ground floor */
  s += `<rect x="170" y="706" width="460" height="164" fill="${C.wall}"/><rect x="560" y="706" width="70" height="164" fill="${C.wallSh}"/>`;
  s += windowAt(218, 746, 76, 62) + windowAt(466, 746, 76, 62);
  s += `<rect x="360" y="752" width="66" height="118" rx="3" fill="#8A5A3C"/><rect x="366" y="758" width="25" height="106" rx="2" fill="#9D6A48"/><rect x="395" y="758" width="25" height="106" rx="2" fill="#9D6A48"/><circle cx="391" cy="812" r="2.6" fill="${C.amber}"/>`;
  s += tilePorch(338, 448, 724, 752);
  s += `<rect x="150" y="866" width="500" height="10" rx="2" fill="#D9D3C6"/>`; /* plinth */
  /* floor slab + first floor */
  s += `<rect x="160" y="694" width="480" height="14" rx="2" fill="${C.slab}"/>`;
  s += `<rect x="170" y="566" width="460" height="128" fill="${C.wall}"/><rect x="560" y="566" width="70" height="128" fill="${C.wallSh}"/>`;
  s += windowAt(214, 600, 70, 58) + windowAt(366, 600, 70, 58) + windowAt(510, 600, 70, 58);
  /* terrace slab + parapet */
  s += `<rect x="158" y="548" width="484" height="18" rx="2" fill="${C.slab}"/>`;
  s += `<rect x="164" y="516" width="472" height="32" fill="#EFE9DD"/><rect x="164" y="516" width="472" height="5" fill="#E2DACB"/>`;
  /* the open space under the sheet roof (terrace), GI columns */
  s += `<polygon points="${pts([[168, 516], [632, 516], [628, 462], [172, 462]])}" fill="#DCE6F0" opacity=".6"/>`;
  for (const cx of [180, 330, 470, 620]) s += `<rect x="${cx - 4.5}" y="458" width="9" height="60" fill="${C.steel}"/><rect x="${cx - 8}" y="512" width="16" height="5" fill="#5D6778"/>`;
  s += `<rect x="168" y="464" width="464" height="16" fill="#1E2638" opacity=".08"/><rect x="164" y="521" width="472" height="8" fill="#1E2638" opacity=".06"/>`; /* shade under the roof */
  s += `<rect x="170" y="566" width="460" height="8" fill="#1E2638" opacity=".07"/><rect x="170" y="708" width="460" height="8" fill="#1E2638" opacity=".07"/>`;
  /* truss bottom chord under the eave */
  s += `<rect x="168" y="458" width="464" height="6" fill="#8C97A7"/>`;
  for (let xx = 190; xx < 620; xx += 26) s += `<line x1="${xx}" y1="458" x2="${xx + 13}" y2="452" stroke="#8C97A7" stroke-width="2.2"/>`;
  return s;
}

/* ---------- elevated GI structure: the panel table about 1 m (H px) above the sheets, on legs with cross-bracing ---------- */
const H = 36, PR = (u, v) => { const p = P(u, v); return [p[0], p[1] - H]; };
const quadR = (u0, u1, v0, v1) => [PR(u0, v0), PR(u1, v0), PR(u1, v1), PR(u0, v1)];
const TU0 = 0.06, TU1 = 0.74, TV0 = 0.26, TV1 = 0.76, LEGU = [0.07, 0.235, 0.40, 0.565, 0.73], LEGV = TV0 + 0.02;
const seg = (a, b, stroke, w, extra = '') => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
const lineR = (u0, v0, u1, v1, stroke = '#4B5563', w = 3) => seg(PR(u0, v0), PR(u1, v1), stroke, w);
function elevTable(skip) {
  let s = `<g transform="translate(-10,6)">${poly(quad(TU0, TU1, TV0, TV1), '#1E2638', 'opacity=".18"')}</g>`; /* shadow on the sheets */
  for (const u of LEGU) s += seg(P(u, TV1 - 0.03), PR(u, TV1 - 0.03), '#7E8A9B', 4); /* back legs */
  for (const u of LEGU) { const a = P(u, LEGV); s += `<rect x="${f(a[0] - 5)}" y="${f(a[1] - 2)}" width="10" height="5" rx="1" fill="#3B4556"/>`; } /* base plates on the purlins */
  for (let i = 0; i < LEGU.length - 1; i++) { /* cross-bracing between the front legs */
    const a = P(LEGU[i], LEGV), b = PR(LEGU[i + 1], LEGV), c = PR(LEGU[i], LEGV), d = P(LEGU[i + 1], LEGV);
    s += seg([a[0], a[1] - 5], [b[0], b[1] + 6], '#A3ADBB', 2) + seg([c[0], c[1] + 6], [d[0], d[1] - 5], '#A3ADBB', 2);
  }
  for (const u of LEGU) s += seg(P(u, LEGV), PR(u, LEGV), '#8C97A7', 4.6, 'stroke-linecap="round"'); /* front legs */
  const fr = quadR(TU0 - 0.01, TU1 + 0.01, TV0 - 0.012, TV1 + 0.01);
  s += `<g transform="translate(0,4)">${poly(fr, '#5D6778')}</g>` + poly(fr, '#8C97A7'); /* the GI table frame */
  const rows = [[TV0, (TV0 + TV1) / 2 - 0.008], [(TV0 + TV1) / 2 + 0.008, TV1]], n = 5, gap = 0.008, w = (TU1 - TU0 - gap * (n - 1)) / n;
  rows.forEach(([v0, v1], r) => {
    for (let i = 0; i < n; i++) {
      const a = TU0 + i * (w + gap), b = a + w;
      if (r === 0 && i === skip) { /* the slot being filled: frame rails showing */
        s += poly(quadR(a, b, v0, v1), '#6F7C8E', 'opacity=".6"') + lineR(a, v0 + (v1 - v0) * 0.3, b, v0 + (v1 - v0) * 0.3) + lineR(a, v0 + (v1 - v0) * 0.75, b, v0 + (v1 - v0) * 0.75);
        continue;
      }
      s += poly(quadR(a, b, v0, v1), 'url(#panelG)', 'stroke="#DDE3EA" stroke-width="1.6"');
      for (let k = 1; k < 4; k++) s += lineR(a + w * k / 4, v0 + 0.01, a + w * k / 4, v1 - 0.01, C.cell, 1.1);
      for (let k = 1; k < 6; k++) { const vv = v0 + (v1 - v0) * k / 6; s += lineR(a + 0.004, vv, b - 0.004, vv, C.cell, 1.1); }
      s += poly(quadR(a + w * 0.05, a + w * 0.45, v1 - (v1 - v0) * 0.5, v1 - (v1 - v0) * 0.08), '#FFFFFF', 'opacity=".10"');
    }
  });
  return s;
}
/* "1 m" height mark at the left end of the table */
function heightMark() {
  const a = P(TU0 - 0.045, LEGV), b = PR(TU0 - 0.045, LEGV), my = (a[1] + b[1]) / 2;
  return seg(a, b, C.navy, 1.4) + seg([a[0] - 4, a[1]], [a[0] + 4, a[1]], C.navy, 1.4) + seg([b[0] - 4, b[1]], [b[0] + 4, b[1]], C.navy, 1.4)
    + `<rect x="${f(a[0] - 36)}" y="${f(my - 8)}" width="30" height="16" rx="8" fill="#fff" stroke="${C.navy}" stroke-width="1"/>`
    + `<text x="${f(a[0] - 21)}" y="${f(my + 3.6)}" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="10" fill="${C.navy}">1 m</text>`;
}
/* cable conduit: from the panels, down the sheets to the eave, down the GI column and the house corner into the inverter */
function conduit() {
  const a = PR(0.752, 0.40), b = P(0.752, 0.40), b2 = P(0.752, 0.03), c = P(0.905, 0.03);
  const d = `M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L${f(b2[0])} ${f(b2[1])} L${f(c[0])} ${f(c[1])} L627 460 L627 520 Q627 530 622 534 L622 722 Q622 734 610 738 L604 741 Q600 743 600 748`;
  let s = `<path d="${d}" fill="none" stroke="#8E99A8" stroke-width="6.6" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#EEF0F3" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (const y of [490, 560, 610, 660, 706]) s += `<rect x="${y < 520 ? 621 : 616}" y="${y}" width="12" height="4" rx="1" fill="#5D6778"/>`; /* saddle clamps */
  return s;
}
/* SolarEdge inverter on the ground-floor wall, safety switch under it, AC conduit into the house */
function inverter() {
  const x = 572, y = 748, w = 40, h = 56;
  let s = `<rect x="${x + 3}" y="${y + 3}" width="${w}" height="${h}" rx="5" fill="#1E2638" opacity=".12"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#F3F4F6" stroke="#BFC7D1" stroke-width="1.4"/>`;
  s += `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="3" fill="#FAFAFB"/>`;
  s += `<image href="../../assets/quote/logo-solaredge.png" x="${x + 5}" y="${y + 9}" width="30" height="6.1"/>`;
  s += [['#22A45D', 0], ['#F2A93B', 1], ['#D8363D', 2]].map(([c, i]) => `<circle cx="${x + 14 + i * 6}" cy="${y + 27}" r="1.7" fill="${c}"/>`).join('');
  s += `<rect x="${x + 4}" y="${y + h + 2}" width="${w - 8}" height="16" rx="3" fill="#D9DEE4" stroke="#AEB7C2" stroke-width="1"/>`;
  s += `<circle cx="${x + w / 2}" cy="${y + h + 10}" r="4.6" fill="${C.red}"/><rect x="${x + w / 2 - 4}" y="${y + h + 9}" width="8" height="2" rx="1" fill="#fff"/>`;
  const ac = `M${x + w / 2} ${y + h + 18} V866`;
  s += `<path d="${ac}" stroke="#8E99A8" stroke-width="6.6" fill="none"/><path d="${ac}" stroke="#EEF0F3" stroke-width="4" fill="none"/>`;
  return s;
}
/* A-frame step ladder */
function stepLadder(x, y, h) {
  const t = [x + 18, y - h];
  let s = seg([x, y], t, '#C9D1DB', 4, 'stroke-linecap="round"') + seg([x + 40, y], [t[0] + 4, t[1]], '#AEB8C6', 4, 'stroke-linecap="round"');
  for (let k = 1; k < 4; k++) { const q = k / 4; s += seg([x + 18 * q, y - h * q], [x + 18 * q + 12, y - h * q], '#C9D1DB', 3.2); }
  s += `<rect x="${t[0] - 6}" y="${t[1] - 4}" width="16" height="5" rx="1.5" fill="#AEB8C6"/>`;
  return s;
}
function scene() {
  let s = '';
  /* ground */
  s += `<path d="M0 860 Q200 846 400 852 T794 846 V1123 H0 Z" fill="${C.grass}"/>`;
  s += `<path d="M0 886 Q220 874 400 880 T794 876 V1123 H0 Z" fill="${C.grassDk}" opacity=".55"/>`;
  s += `<polygon points="360,876 426,876 470,912 316,912" fill="#E8E1D2"/>`; /* path to the door */
  s += banana(28, 880, 120, false) + banana(774, 884, 110, true);
  s += palm(64, 880, 330, -16) + palm(736, 884, 300, 18);
  /* shrubs */
  s += house() + downpipe();
  for (const [cx, cy, r] of [[196, 870, 20], [226, 876, 15], [292, 872, 18], [496, 872, 18], [530, 876, 14], [672, 868, 20]]) {
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.leaf}"/><circle cx="${cx - r * 0.35}" cy="${cy - r * 0.3}" r="${r * 0.45}" fill="#58A86F" opacity=".7"/>`;
    for (const [dx, dy] of [[-0.5, -0.4], [0.3, -0.6], [0.5, 0.1]]) s += `<circle cx="${f(cx + dx * r)}" cy="${f(cy + dy * r)}" r="3.4" fill="#E23B3B"/><circle cx="${f(cx + dx * r)}" cy="${f(cy + dy * r)}" r="1.1" fill="#F6C15A"/>`; /* hibiscus */
  }
  /* the sheet roof with the solar system on its elevated GI structure */
  s += roof() + conduit() + walkway(0.06, 0.155) + elevTable(3) + heightMark() + roofDoor();
  /* workers on the walkway: one fitting the last panel into the table, one bringing it along; one coming up through the roof door */
  const slot = P(0.535, 0.105), carrier = P(0.25, 0.105), door = P(0.882, 0.27);
  { const a = PR(LEGU[0], LEGV), b = PR(LEGU[4], LEGV); s += `<path d="M${f(a[0])} ${f(a[1] + 14)} Q${f((a[0] + b[0]) / 2)} ${f(a[1] + 20)} ${f(b[0])} ${f(b[1] + 14)}" stroke="${C.amber}" stroke-width="2.2" fill="none"/>`; } /* safety line on the structure */
  for (const w of [slot, carrier]) s += `<path d="M${f(w[0])} ${f(w[1] - 46)} L${f(w[0] + 8)} ${f(PR(0.4, LEGV)[1] + 17)}" stroke="${C.amber}" stroke-width="1.5"/>`; /* lanyards */
  s += person({ x: slot[0], y: slot[1], s: 0.6, pose: 'reach', harness: true });
  s += person({ x: carrier[0], y: carrier[1], s: 0.6, pose: 'carryUp', harness: true });
  s += `<clipPath id="dc"><rect x="${f(door[0] - 40)}" y="${f(door[1] - 80)}" width="80" height="${f(80 - 2)}"/></clipPath>`;
  s += `<g clip-path="url(#dc)">${person({ x: door[0], y: door[1] + 26, s: 0.6, pose: 'lean', half: true })}</g>`;
  /* ladder against the parapet with a worker climbing (seen from the back) */
  s += compoundWall();
  s += `<g><line x1="108" y1="878" x2="150" y2="506" stroke="#C9D1DB" stroke-width="5" stroke-linecap="round"/><line x1="140" y1="882" x2="180" y2="508" stroke="#C9D1DB" stroke-width="5" stroke-linecap="round"/>`;
  for (let k = 1; k < 14; k++) { const t = k / 14; s += `<line x1="${f(108 + 42 * t)}" y1="${f(878 - 372 * t)}" x2="${f(140 + 40 * t)}" y2="${f(882 - 374 * t)}" stroke="#C9D1DB" stroke-width="3.4"/>`; }
  s += `</g>`;
  s += person({ x: 132, y: 742, s: 0.74, pose: 'climb', back: true });
  /* ground floor: the SolarEdge inverter going up on the wall, and the conduit being clamped from a step ladder */
  s += inverter() + person({ x: 546, y: 868, s: 0.8, pose: 'reach' });
  s += stepLadder(632, 868, 70) + person({ x: 652, y: 800, s: 0.8, pose: 'reach', flip: true });
  /* foreground: a worker bringing a panel to the house */
  s += person({ x: 262, y: 906, s: 1.42, pose: 'carrySide' });
  return s;
}

/* numbered markers with leader lines to what they point at */
function marker(n, mx, my, tx, ty) {
  return `<line x1="${mx}" y1="${my}" x2="${f(tx)}" y2="${f(ty)}" stroke="${C.navy}" stroke-width="1.6" stroke-dasharray="3 3"/><circle cx="${f(tx)}" cy="${f(ty)}" r="3.6" fill="${C.navy}"/>`
    + `<circle cx="${mx}" cy="${my}" r="14" fill="${C.red}" stroke="#fff" stroke-width="3"/><text x="${mx}" y="${my + 5}" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="14" fill="#fff">${n}</text>`;
}

const LEGEND = [
  ['Elevated structure', 'GI, about 1&nbsp;m above the sheets'],
  ['Walkway', 'on the roof sheets'],
  ['Sliding roof door', 'in the roof sheets'],
  ['SolarEdge inverter', 'on the ground-floor wall'],
  ['Cable conduit', 'from the panels to the inverter'],
];
const ICON = {
  rain: '<path d="M6 12.5h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 6.2 6.6 3 3 0 0 0 6 12.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 15.5l-1 2.5M11 15.5l-1 2.5M14.5 15.5l-1 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sun: '<circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  drop: '<path d="M10 2.6c3 3.8 5 6.4 5 9a5 5 0 0 1-10 0c0-2.6 2-5.2 5-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.6 12.4a2.4 2.4 0 0 0 2.4 2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};
const TAGS = [['rain', 'Heavy monsoon'], ['sun', 'Strong sun'], ['drop', 'Humid sea air']];

function page() {
  const m1 = PR(0.12, 0.62), m2 = P(0.04, 0.105), m3 = P(0.95, 0.45), m4 = [592, 778], m5 = [622, 640];
  const markers = marker(1, 92, 318, m1[0], m1[1]) + marker(2, 70, 446, m2[0], m2[1]) + marker(3, 716, 330, m3[0], m3[1]) + marker(4, 704, 806, m4[0] + 20, m4[1] + 6) + marker(5, 712, 598, m5[0], m5[1]);
  const legend = LEGEND.map((c, i) => `<div><span class="no">${i + 1}</span><span><b>${c[0]}</b><small>${c[1]}</small></span></div>`).join('');
  const info = '<svg viewBox="0 0 20 20" width="15" height="15"><circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9v5M10 6.2v.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Poppins;font-weight:400;src:url(../../assets/fonts/Poppins-Regular.ttf)}
@font-face{font-family:Poppins;font-weight:500;src:url(../../assets/fonts/Poppins-Medium.ttf)}
@font-face{font-family:Poppins;font-weight:600;src:url(../../assets/fonts/Poppins-SemiBold.ttf)}
@font-face{font-family:Poppins;font-weight:700;src:url(../../assets/fonts/Poppins-Bold.ttf)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:794px;height:1123px;overflow:hidden;background:#fff}
.pg{position:relative;width:794px;height:1123px;overflow:hidden;font-family:Poppins,sans-serif;color:${C.navy};background:linear-gradient(180deg,#CFE3F4 0%,#E6F0F9 46%,#F4F8FC 70%)}
.pg>svg{position:absolute;left:0;top:0}
.hd{position:absolute;left:48px;top:44px;width:600px}
.k{font-size:12.5px;font-weight:700;letter-spacing:.24em;color:${C.red}}
.k:after{content:"";display:block;width:54px;height:3px;border-radius:2px;background:${C.red};margin-top:8px}
h1{font-size:41px;line-height:48px;font-weight:700;margin-top:12px;letter-spacing:-.01em;white-space:nowrap}
h1 span{color:${C.red}}
.sub{font-size:14px;line-height:21px;color:#3F4A5E;margin-top:10px;width:560px}
.tgs{display:flex;gap:8px;margin-top:14px}
.tg{display:inline-flex;align-items:center;gap:6px;height:27px;padding:0 12px 0 9px;border-radius:14px;background:rgba(255,255,255,.85);border:1px solid #D9E2EC;font-size:11.6px;font-weight:600;color:${C.navy}}
.tg svg{color:${C.red}}
.logo{position:absolute;right:44px;top:40px;width:86px;height:86px}
.lg{position:absolute;left:36px;right:36px;top:910px;height:56px;display:grid;grid-template-columns:repeat(5,1fr);background:#fff;border:1px solid #E4E7EC;border-radius:12px;box-shadow:0 2px 6px rgba(30,38,56,.06)}
.lg>div{display:flex;align-items:center;gap:6px;padding:0 7px;border-left:1px solid #EEF0F4}
.lg>div:first-child{border-left:0}
.lg .no{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:${C.red};color:#fff;font-size:10.5px;font-weight:700}
.lg b{display:block;font-size:10.6px;line-height:13.5px;font-weight:600;white-space:nowrap}
.lg small{display:block;font-size:9px;line-height:11.5px;color:#6B7280;margin-top:1px}
.nt{position:absolute;left:36px;right:36px;top:972px;background:#fff;border:1px solid #F1C9CB;border-left:4px solid ${C.red};border-radius:10px;padding:8px 12px 8px 12px}
.nt p{font-size:9.4px;line-height:13.2px;color:#374151}
.nt p+p{margin-top:4px}
.nt b{color:${C.navy};font-weight:600}
.rep{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 12px 0 9px;margin-top:14px;border-radius:13px;background:rgba(255,255,255,.85);border:1px solid #D9E2EC;font-size:11.4px;font-weight:600;color:#4B5565}
.rep svg{color:#6B7280}
.ft{position:absolute;left:0;right:0;bottom:0;height:52px;background:${C.navy};border-top:3px solid ${C.red};display:flex;align-items:center;justify-content:center;gap:14px;font-size:11.4px;color:#fff;letter-spacing:.01em}
.ft i{width:5px;height:5px;border-radius:50%;background:${C.red};display:inline-block}
.ft b{color:#F6B9BB;font-weight:600}
</style></head><body><div class="pg">
<svg width="794" height="1123" viewBox="0 0 794 1123" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="sheetG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#A9B5C4"/><stop offset="1" stop-color="#CCD5DF"/></linearGradient><linearGradient id="panelG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34457E"/><stop offset=".55" stop-color="#24305A"/><stop offset="1" stop-color="#1C254A"/></linearGradient></defs>
<circle cx="690" cy="236" r="70" fill="#FFF4D6" opacity=".7"/><circle cx="690" cy="236" r="34" fill="#F6C15A"/>
<g fill="#fff" opacity=".9"><ellipse cx="560" cy="282" rx="46" ry="13"/><ellipse cx="590" cy="272" rx="28" ry="13"/></g>
${backdrop()}${scene()}${markers}
</svg>
<div class="hd"><div class="k">ADDITIONAL STRUCTURE · SHEET ROOF</div><h1>Solar on a <span>sheet roof</span></h1>
<p class="sub">How a solar plant on a sheet roof is laid out: the panels on a GI structure about 1&nbsp;m above the roof sheets, a walkway on the sheets, a sliding roof door, and the inverter on the ground-floor wall.</p>
<span class="rep">${info}Picture for representation only</span></div>
<img class="logo" src="../../assets/quote/jasper-logo.png" alt="">
<div class="lg">${legend}</div>
<div class="nt"><p><b>Picture for representation only.</b> The actual structure, layout and fittings depend on the roof and the site.</p><p><b>Not as recommended by MNRE.</b> This elevated structure on the sheet roof is made of GI (galvanised iron, not hot-dip galvanised). For module mounting structures under PM Surya Ghar, MNRE allows hot-dip galvanised iron, aluminium, hot-dip galvanised mild steel or ZAM alloy (OM No.&nbsp;318/61/2025-GCRT-Part(2), 19.05.2026).</p><p><b>Customer scope.</b> The elevated structure, walkway, ladder and sliding roof door are in the customer’s scope and are charged extra.</p></div>
<div class="ft"><span>www.jasper.solar</span><i></i><span>info@jasper.solar</span><i></i><span>Nedumangad, Thiruvananthapuram</span><i></i><b>96055 25552</b></div>
</div></body></html>`;
}
fs.mkdirSync(__dirname + '/out', { recursive: true });
fs.writeFileSync(__dirname + '/out/sheetroof.html', page());
console.log('ok');
