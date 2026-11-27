/* Signed quotations in the browser: the real functions of app51.js, app52.js and app22.js run in a vm context; the DOM, api(), fetch and the drawing
   helpers are stubs.
   - The quotation maker's Save (app22.js qmkSave) on a quotation that may have been signed since the maker loaded it: an unchanged Save must never
     become a full save (that takes the signature off) when the server says the quotation is signed now.
   - qsSign needs the version the admin looked at; qsDownload saves the signed PDF only when the server sent one. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function maker() {
  const calls = [], toasts = [], answers = {}, saved = [];
  const ctx = {
    console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, setTimeout, clearTimeout, File, Blob, Response,
    fetch: async url => { calls.push('fetch ' + url); const r = answers.fetch; if (r instanceof Error) throw r; return r; }, acDownload: f => saved.push(f),
    addEventListener() { }, removeEventListener() { }, debounce: f => f, matchMedia: () => ({ matches: true }),
    location: { hash: '#/quotes/5' }, history: { replaceState() { } }, sessionStorage: { removeItem() { } },
    $: sel => (sel === '#qmk' ? {} : null), $$: () => [], esc: s => String(s), toast: (t, bad) => toasts.push([t, !!bad]),
    S: { subsidy_rates: {} }, ME: { id: 1, role: 'admin', name: 'Boss' },
    QM: { effectiveSettings: () => ({ subsidy_rates: {} }), snapSettings: () => ({ snap: 1 }) },
    api: async (m, a, body, qs) => { calls.push(m + '/' + a); const r = answers[m + '/' + a]; if (r instanceof Error) throw { error: r.message }; return typeof r === 'function' ? r(body, qs) : r || {}; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['app51.js', 'app52.js', 'app22.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'), ctx, { filename: f });
  /* the drawing and the Documents copy are not part of this check */
  const done = { keep: 0, sign: 0 };
  Object.assign(ctx, { qmkHead() { }, qmkTab() { }, qmkRender() { }, qmkCalc: () => ({ lines: [], calc: { subsidy: 0 } }), qmKeepNote() { done.keep++; }, qsMakerSign() { done.sign++; return Promise.resolve(null); } });
  const QMK = vm.runInContext('QMK', ctx);
  Object.assign(QMK, { boot: { admin: true }, id: 5, doc: { price: 150000, number: 'QT-5', date: '2026-11-26', customer: { name: 'Test Customer' }, items: {}, seal: false },
    cust: { customer_id: 3, lead_id: null }, status: 'Draft', sign: null, signP: null, busy: false, rev: 0, tab: 'customer' });
  QMK.base = vm.runInContext('qmkBase()', ctx); QMK.baseStatus = 'Draft';
  const save = () => vm.runInContext('qmkSave()', ctx);
  return { ctx, QMK, calls, toasts, answers, done, save, saved };
}
const SIGNED = { state: 'signed', signed_at: '2026-11-27 10:00:00', ver: 'v1', sealed: true };

test('a maker that missed the signing: a status-only Save checks first and keeps the signature', async () => {
  const m = maker();
  m.answers['qm/sign_info'] = { sign: SIGNED, shares: [] };
  m.QMK.status = 'Sent';
  assert.equal(await m.save(), true);
  assert.deepEqual(m.calls, ['qm/sign_info', 'qm/status']);
  assert.equal(m.QMK.sign.state, 'signed');
  assert.equal(m.QMK.doc.seal, true); /* the box follows, so the next Save keeps it too */
  assert.equal(m.QMK.base, vm.runInContext('qmkBase()', m.ctx));
  assert.equal(m.QMK.busy, false);
  assert.equal(m.done.keep + m.done.sign, 0);
});

test('a maker that missed the signing: Save with nothing changed sends nothing', async () => {
  const m = maker();
  m.answers['qm/sign_info'] = { sign: SIGNED, shares: [] };
  assert.equal(await m.save(), true);
  assert.deepEqual(m.calls, ['qm/sign_info']);
  assert.deepEqual(m.toasts.at(-1), ['No changes to save', false]);
});

test('unchanged content, not signed on the server either: the normal save goes ahead', async () => {
  const m = maker();
  m.ctx.ME = { id: 7, role: 'sales' }; m.QMK.boot.admin = false;
  m.answers['qm/sign_info'] = { sign: { state: '' }, shares: [] };
  m.answers['qm/save'] = { id: 5, number: 'QT-5', sign: { state: '' }, ver: 'v1' };
  m.QMK.status = 'Sent';
  assert.equal(await m.save(), true);
  assert.deepEqual(m.calls, ['qm/sign_info', 'qm/save']);
  assert.equal(m.done.keep, 1); /* a customer quotation: its Documents copy is made again */
});

test('changed content: no check, the full save (the server decides what the change does)', async () => {
  const m = maker();
  m.QMK.doc.price = 160000;
  m.answers['qm/save'] = { id: 5, number: 'QT-5', sign: { state: '' }, ver: 'v2' };
  assert.equal(await m.save(), true);
  assert.deepEqual(m.calls, ['qm/save']);
});

test('a maker that knows it is signed: status-only, no check', async () => {
  const m = maker();
  m.QMK.sign = SIGNED; m.QMK.doc.seal = true; m.QMK.base = vm.runInContext('qmkBase()', m.ctx); m.QMK.status = 'Accepted';
  assert.equal(await m.save(), true);
  assert.deepEqual(m.calls, ['qm/status']);
});

test('the check fails: nothing is saved', async () => {
  const m = maker();
  m.answers['qm/sign_info'] = new Error('No connection');
  m.QMK.status = 'Sent';
  assert.equal(await m.save(), false);
  assert.deepEqual(m.calls, ['qm/sign_info']);
  assert.equal(m.QMK.busy, false);
});

test('a new quotation (no id yet): no check', async () => {
  const m = maker();
  m.QMK.id = null;
  m.answers['qm/save'] = { id: 9, number: 'QT-9', sign: null, ver: 'v1' };
  assert.equal(await m.save(), true);
  assert.deepEqual(m.calls, ['qm/save']);
});

test('qsSign: without the version the admin looked at nothing is drawn or sent', async () => {
  const m = maker();
  await assert.rejects(vm.runInContext('qsSign(5, "")', m.ctx), e => e.shown === 1 && e.error === 'Open the quotation again, then sign it');
  await assert.rejects(vm.runInContext('qsSign(5)', m.ctx), e => e.shown === 1);
  assert.deepEqual(m.calls, []);
  assert.deepEqual(m.toasts.at(-1), ['Open the quotation again, then sign it', true]);
});

test('qsDownload: the signed PDF is saved under its name; a refusal is told, not saved as a ".pdf"', async () => {
  const m = maker(), q = { id: 5, number: 'QT-5', sign: { state: 'signed', file_name: 'Signed Quote.pdf' } };
  m.answers.fetch = new Response(new Blob(['%PDF-1.4 signed']), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  m.ctx.QS_Q = q;
  assert.equal(await vm.runInContext('qsDownload(QS_Q)', m.ctx), true);
  assert.deepEqual(m.calls, ['fetch api.php?m=qm&a=signed&id=5&dl=1']);
  assert.equal(m.saved.length, 1);
  assert.equal(m.saved[0].name, 'Signed Quote.pdf');
  assert.equal(m.saved[0].type, 'application/pdf');
  assert.equal(await m.saved[0].text(), '%PDF-1.4 signed');

  m.answers.fetch = new Response(JSON.stringify({ error: 'This quotation is not signed' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  assert.equal(await vm.runInContext('qsDownload(QS_Q)', m.ctx), false);
  assert.equal(m.saved.length, 1);
  assert.deepEqual(m.toasts.at(-1), ['This quotation is not signed', true]);

  m.answers.fetch = new Error('offline');
  assert.equal(await vm.runInContext('qsDownload(QS_Q)', m.ctx), false);
  assert.equal(m.saved.length, 1);
  assert.equal(m.toasts.at(-1)[1], true);
});
