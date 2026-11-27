// Sign-in screen rules (assets/app53.js, LG). Usage: node --test tests/login.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const LG = require('../assets/app53.js');

test('greeting follows the time of day', () => {
  assert.equal(LG.greet(6), 'Good morning');
  assert.equal(LG.greet(11), 'Good morning');
  assert.equal(LG.greet(12), 'Good afternoon');
  assert.equal(LG.greet(16), 'Good afternoon');
  assert.equal(LG.greet(17), 'Good evening');
  assert.equal(LG.greet(23), 'Good evening');
  assert.equal(LG.greet(0), 'Good evening', 'after midnight it is still evening');
  assert.equal(LG.greet(4), 'Good evening');
  assert.equal(LG.greet(5), 'Good morning');
});

test('rays lit = the hour on a 12-hour clock', () => {
  assert.equal(LG.rays(6), 6);
  assert.equal(LG.rays(12), 12);
  assert.equal(LG.rays(0), 12);
  assert.equal(LG.rays(15), 3);
  assert.equal(LG.rays(23), 11);
});

test('initials for the remembered-user chip', () => {
  assert.equal(LG.initials('Anish L'), 'AL');
  assert.equal(LG.initials('  anish  kumar  l '), 'AK');
  assert.equal(LG.initials('Boss'), 'B');
  assert.equal(LG.initials(''), '?');
  assert.equal(LG.initials(null), '?');
});

test('time pill text', () => {
  assert.equal(LG.pill(new Date(2026, 10, 27, 6, 42)), '06:42 · FRI 27 NOV');
  assert.equal(LG.pill(new Date(2026, 0, 4, 18, 5)), '18:05 · SUN 4 JAN');
});

test('the sunrise scene has 12 rays, the lit ones bright, and nothing from outside the page', () => {
  const s = LG.sceneSvg(6);
  assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'));
  assert.equal((s.match(/class="lgx-ray( on)?"/g) || []).length, 12, '12 rays');
  assert.equal((s.match(/class="lgx-ray on"/g) || []).length + (s.match(/class="lgx-ray"/g) || []).length, 12);
  assert.equal((LG.sceneSvg(6).match(/lgx-ray on/g) || []).length, 6, '6 lit at six o\'clock');
  assert.equal((LG.sceneSvg(12).match(/lgx-ray on/g) || []).length, 12);
  assert.ok(!/https?:|<script|on[a-z]+=/i.test(s), 'plain drawing: no links, scripts or handlers');
});

test('the loading mark: 12 rays that light in turn, a sun and a stadium', () => {
  const m = LG.markSvg();
  assert.equal((m.match(/class="bootl-r"/g) || []).length, 12);
  assert.ok(/class="bootl-sun"/.test(m) && /rx="/.test(m));
  /* index.html carries the same drawing, so the loading screen shows before any script has run */
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('<div class="bootl"'), 'loading screen inside #app');
  assert.ok(html.includes(m), 'index.html has the mark exactly as LG.markSvg() draws it');
});
