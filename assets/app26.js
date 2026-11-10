// Owners: the Me / All switch on Leads, Customers and the Project pipeline, and reassigning a lead or customer to another user.
// The rules in OWN are plain functions (Node-tested in tests/owner.test.js); the screen code below runs only in the browser.
const OWN = {
  // is this record mine? leads: I claimed it; customers: I own it; projects: I own its customer or I'm its site engineer
  mine: {
    leads: (l, me) => !!me && +l.assigned_to > 0 && +l.assigned_to === +me.id,
    customers: (c, me) => !!me && +c.owner_id > 0 && +c.owner_id === +me.id,
    projects: (p, me) => !!me && ((+p.owner_id > 0 && +p.owner_id === +me.id) || OWN.isEngineer(p.engineer, me.name)),
  },
  // the site engineer is typed by hand: "Anu", "anu ", "Anu, Ravi", "Anu & Ravi" and "Anu and Ravi" all count for Anu
  isEngineer: (eng, name) => {
    const n = String(name || '').trim().toLowerCase(); if (!n) return false;
    return String(eng || '').toLowerCase().split(/\s*(?:,|&|\/|\+|\band\b)\s*/).some(x => x.trim() === n);
  },
  // same rule as can_reassign() in api/claims.php: the current owner, the admin or the assistant manager
  canReassign: (ownerId, me) => !!me && (me.role === 'admin' || me.role === 'assistant_manager' || (+ownerId > 0 && +ownerId === +me.id)),
  filter: (list, rows, view, me) => view === 'me' ? rows.filter(r => OWN.mine[list](r, me)) : rows,
};
if (typeof module !== 'undefined' && module.exports) module.exports = OWN;

// ---- browser only below ----
// Me / All is remembered per list for each person signed in on this browser
const ownKey = list => 'ownView_' + (ME ? ME.id : 0) + '_' + list;
function ownView(list) { try { return localStorage.getItem(ownKey(list)) === 'me' ? 'me' : 'all'; } catch (e) { return 'all'; } }
function ownSave(list, v) { try { localStorage.setItem(ownKey(list), v === 'me' ? 'me' : 'all'); } catch (e) { } }
const OWN_WHAT = { leads: 'leads I claimed', customers: 'customers I own', projects: 'projects of my customers, or where I am the site engineer' };
function ownSwitch(list, cur) {
  return `<div class="tabs owsw" role="group" aria-label="Show"><button type="button" data-own="me" class="${cur === 'me' ? 'on' : ''}" aria-pressed="${cur === 'me'}" title="Only ${OWN_WHAT[list]}"><i class="i i-user"></i>Me</button><button type="button" data-own="all" class="${cur === 'me' ? '' : 'on'}" aria-pressed="${cur !== 'me'}" title="Everything you can see">All</button></div>`;
}
function ownMark(root, v) { $$('[data-own]', root).forEach(b => { const on = b.dataset.own === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
// onChange(v) redraws the list ('me' or 'all'); the choice is saved first
function ownBind(root, list, onChange) {
  $$('[data-own]', root).forEach(b => b.onclick = () => { const v = b.dataset.own; ownSave(list, v); ownMark(root, v); onChange(v); });
}
// "You" for my own records, otherwise the owner's name (leads and customers carry owner_name from the list API)
const ownLabel = (id, name) => +id > 0 ? (+id === +ME.id ? 'You' : name || 'Another user') : '';

// Reassign: pick the new owner. kind 'leads' | 'customers'; rec = the lead / customer from the list or page.
// Resolves to the API answer ({owner_id, owner_name}) or null when cancelled.
async function reassignBox(kind, rec) {
  const lead = kind === 'leads', cur = +(lead ? rec.assigned_to : rec.owner_id) || 0;
  const us = (await api(kind, 'owners')).filter(u => u.id !== cur);
  if (!us.length) { toast('Nobody else can take this ' + (lead ? 'lead' : 'customer') + ' — give someone access first', true); return null; }
  const now = cur ? esc(ownLabel(cur, rec.owner_name)) : 'nobody';
  return new Promise(res => {
    const m = modal(`<h3 style="margin-top:0">Reassign ${lead ? 'lead' : 'customer'}</h3>
     <p class="mut" style="margin:-6px 0 12px;font-size:13px"><b>${esc(rec.name || '')}</b> · owner now: <b>${now}</b></p>
     <label for="rau">New owner</label><select id="rau">${us.map(u => `<option value="${u.id}">${esc(u.name)}${u.id === +ME.id ? ' (you)' : ''} — ${esc(u.role_name)}</option>`).join('')}</select>
     <p class="mut" style="font-size:13px;margin:8px 0 0">${lead ? 'The lead stays locked, now to the new owner' + (ME.role === 'admin' ? '.' : ' — if that is someone else, you will no longer see it.') :'Everyone can still see the customer; the new owner finds it under <b>Me</b>.'} They get a notification.</p>
     <div class="bar" style="margin-top:14px"><button class="btn" id="raok">Reassign</button><button class="btn sec" id="racx">Cancel</button></div>`);
    $('#rau', m).focus();
    $('#racx', m).onclick = () => { m.remove(); res(null); };
    $('#raok', m).onclick = async () => { const b = $('#raok', m); b.disabled = true;
      try { const r = await api(kind, lead ? 'assign' : 'reassign', { id: rec.id, user_id: +$('#rau', m).value }); m.remove(); toast((lead ? 'Lead' : 'Customer') + ' now with ' + r.owner_name); res(r); }
      catch (e) { b.disabled = false; } };
  });
}
