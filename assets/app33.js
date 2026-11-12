/* Accounts page (assets/app33.js): the sidebar's Accounts entry.
   #/accounts/<tab>          tab bar + period bar + the tab's content; tab = overview | pending | received | profit | expenses | materials
   #/accounts/cost/<project> the project's cost sheet (acCostSheet, app34.js)
   route() turns the word after #/accounts/ into NaN, so pgAccounts reads location.hash itself.
   ACCT_TABS: tab key -> async (box, period) => void, period = {key, from, to, label, kind} (ACC.period; key goes to the API as &period=).
   A tab not registered yet shows "Coming in the next step". Tabs listed in ACCT_NOPER have no period bar.
   The chosen period is kept per browser in localStorage.accPeriod ('YYYY-MM' or 'fy-26-27'). Uses ACC (app32.js). */
const ACCT_TAB_NAMES = [['overview', 'Overview'], ['pending', 'Pending payments'], ['received', 'Payments received'], ['profit', 'Project profit'], ['expenses', 'Expenses'], ['materials', 'Materials list']];
const ACCT_TABS = {};
const ACCT_NOPER = ['pending', 'materials'];

const acP2 = n => String(n).padStart(2, '0');
/* the financial year of a date, as used in document numbers: '2026-11-12' -> '26-27' */
const acFy = d => { const y = +String(d).slice(0, 4), s = +String(d).slice(5, 7) >= 4 ? y : y - 1; return `${acP2(s % 100)}-${acP2((s + 1) % 100)}`; };
const acPerOk = s => /^(\d{4}-(0[1-9]|1[0-2])|fy-\d\d-\d\d)$/.test(s || '');
const acPerKey = () => { let s = ''; try { s = localStorage.accPeriod || ''; } catch (e) { } return acPerOk(s) ? s : today().slice(0, 7); };
const acPerSet = s => { try { localStorage.accPeriod = s; } catch (e) { } };
/* one step back (-1) or forward (+1): a month in month view, a financial year in FY view */
function acPerStep(s, n) {
  const fy = /^fy-(\d\d)-(\d\d)$/.exec(s);
  if (fy) { const a = (+fy[1] + n + 100) % 100; return `fy-${acP2(a)}-${acP2((a + 1) % 100)}`; }
  const [y, m] = s.split('-').map(Number), t = y * 12 + m - 1 + n;
  return `${Math.floor(t / 12)}-${acP2(t % 12 + 1)}`;
}

async function pgAccounts() {
  const part = location.hash.replace(/^#\/?/, '').split('/');
  if (part[1] === 'cost') return acCostSheet(parseInt(part[2], 10) || 0);
  const tab = ACCT_TAB_NAMES.some(t => t[0] === part[1]) ? part[1] : 'overview', label = ACCT_TAB_NAMES.find(t => t[0] === tab)[1];
  $('#title').innerHTML = `<span class="ft t-accounts"><i class="i i-coin"></i></span><span class="ttl">Accounts</span><span class="mut ttls">› ${esc(label)}</span>`;
  const main = $('#main');
  main.innerHTML = `<div class="acx-pg"><div class="tabs acx-tabs" role="tablist">${ACCT_TAB_NAMES.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-acx-tab="${k}" class="${k === tab ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
    <div class="acx-per" id="acx_per"></div><div id="acx_box"><p class="mut">Loading…</p></div></div>`;
  $$('[data-acx-tab]', main).forEach(b => b.onclick = () => { location.hash = '#/accounts/' + b.dataset.acxTab; });
  const box = $('#acx_box', main), per = $('#acx_per', main);
  const run = async () => {
    const key = acPerKey(), P = Object.assign({ key }, ACC.period(key)), now = today(), month = now.slice(0, 7), fy = 'fy-' + acFy(now);
    per.hidden = ACCT_NOPER.includes(tab);
    if (!per.hidden) {
      per.innerHTML = `<button type="button" class="ib acx-step" data-acx-p="-1" title="${P.kind === 'fy' ? 'Previous financial year' : 'Previous month'}" aria-label="Previous">‹</button>
        <b class="acx-perl">${esc(P.label)}</b>
        <button type="button" class="ib acx-step" data-acx-p="1" title="${P.kind === 'fy' ? 'Next financial year' : 'Next month'}" aria-label="Next">›</button>
        <span class="sp"></span>
        <button type="button" class="btn sec sm ${key === month ? 'on' : ''}" data-acx-p="m">This month</button><button type="button" class="btn sec sm ${key === fy ? 'on' : ''}" data-acx-p="fy">This FY</button>`;
      $$('[data-acx-p]', per).forEach(b => b.onclick = () => {
        const v = b.dataset.acxP;
        acPerSet(v === 'm' ? month : v === 'fy' ? fy : acPerStep(key, +v));
        run();
      });
    }
    const fn = ACCT_TABS[tab];
    if (!fn) { box.innerHTML = `<div class="card acx-soon"><b>${esc(label)}</b><span class="mut">Coming in the next step.</span></div>`; return; }
    box.innerHTML = '<p class="mut">Loading…</p>';
    await fn(box, P);
  };
  await run();
}
