const test = require('node:test'), assert = require('node:assert');
const A2H = require('../assets/app37.js');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'; /* iPad says it is a Mac */
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const NOW = 1794600000000, DAY = 86400000;

test('iPhone and iPad get the Share steps', () => {
  assert.equal(A2H.kind(IPHONE, 5, false, 0, NOW, false), 'ios');
  assert.equal(A2H.kind(IPAD, 5, false, 0, NOW, false), 'ios');
  assert.equal(A2H.kind(IPHONE.replace('Version/18.0', 'CriOS/130.0'), 5, false, 0, NOW, false), 'ios-other');
});
test('a real Mac (no touch) and a Windows PC get nothing', () => {
  assert.equal(A2H.kind(IPAD, 0, false, 0, NOW, false), '');
  assert.equal(A2H.kind(WIN, 0, false, 0, NOW, true), '');
});
test('Android: Install button when the browser offers it, menu hint otherwise', () => {
  assert.equal(A2H.kind(ANDROID, 5, false, 0, NOW, true), 'prompt');
  assert.equal(A2H.kind(ANDROID, 5, false, 0, NOW, false), 'android');
});
test('nothing once installed (opened from the home screen)', () => {
  assert.equal(A2H.kind(IPHONE, 5, true, 0, NOW, false), '');
  assert.equal(A2H.kind(ANDROID, 5, true, 0, NOW, true), '');
});
test('"Not now" hides it for 3 days, then it comes back', () => {
  assert.equal(A2H.kind(ANDROID, 5, false, NOW - 2 * DAY, NOW, true), '');
  assert.equal(A2H.kind(ANDROID, 5, false, NOW - 4 * DAY, NOW, true), 'prompt');
});
