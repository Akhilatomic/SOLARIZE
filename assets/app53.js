/* Sign-in screen rules and drawings (design: docs/design/login, "Measured Light"). Pure: no DOM; Node-tested in tests/login.test.js.
   The view that uses them is assets/app54.js; the loading screen's mark (markSvg) is also written into index.html so it shows before
   any script runs (the test checks the two stay the same). */
var LG = (function () {
  var K = {};
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var MONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  /* Good morning from 05:00, Good afternoon from 12:00, Good evening from 17:00 (and through the night) */
  K.greet = function (h) { h = +h || 0; return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening'; };
  /* rays lit = the hour on a 12-hour clock (0 and 12 both light all twelve) */
  K.rays = function (h) { h = (+h || 0) % 12; return h || 12; };
  K.initials = function (name) {
    var w = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
    return w.length ? (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase() : '?';
  };
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  K.pill = function (d) { return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' · ' + DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONS[d.getMonth()]; };

  /* the sunrise behind the glass: pale sky, a cool haze top right, a red sun on the horizon with its glow, 12 rays (n lit), and a
     field of panels in perspective converging on the sun. 1600 x 1000, sliced to fill any screen. */
  K.sceneSvg = function (lit) {
    var W = 1600, H = 1000, hy = 620, sx = 656, R = 58, i, s = '';
    s += '<svg class="lgx-scene" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    s += '<defs><linearGradient id="lgx-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9C6D6"/><stop offset=".55" stop-color="#E7EBF0"/><stop offset="1" stop-color="#F8E4DC"/></linearGradient>'
      + '<linearGradient id="lgx-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCE2E9"/><stop offset="1" stop-color="#C3CCD7"/></linearGradient>'
      + '<radialGradient id="lgx-glow"><stop offset="0" stop-color="#E4574F" stop-opacity=".85"/><stop offset=".35" stop-color="#EE8A78" stop-opacity=".45"/><stop offset="1" stop-color="#F6C9BC" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="lgx-cool"><stop offset="0" stop-color="#7F97B5" stop-opacity=".75"/><stop offset="1" stop-color="#7F97B5" stop-opacity="0"/></radialGradient></defs>';
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#lgx-sky)"/>';
    s += '<ellipse cx="1380" cy="120" rx="520" ry="380" fill="url(#lgx-cool)"/>';
    s += '<ellipse cx="' + sx + '" cy="' + hy + '" rx="680" ry="460" fill="url(#lgx-glow)"/>';
    for (i = 0; i < 12; i++) {
      var a = (180 - (7.5 + 15 * i)) * Math.PI / 180, r0 = R * 1.5, r1 = 2000;
      s += '<line class="lgx-ray' + (i < lit ? ' on' : '') + '" x1="' + r2(sx + r0 * Math.cos(a)) + '" y1="' + r2(hy - r0 * Math.sin(a)) + '" x2="' + r2(sx + r1 * Math.cos(a)) + '" y2="' + r2(hy - r1 * Math.sin(a)) + '"/>';
    }
    s += '<path d="M' + (sx - R) + ' ' + hy + ' A' + R + ' ' + R + ' 0 0 1 ' + (sx + R) + ' ' + hy + ' Z" fill="#D73B3E"/>';
    s += '<rect y="' + hy + '" width="' + W + '" height="' + (H - hy) + '" fill="url(#lgx-ground)"/>';
    var n = 6, bases = [], rows = [], j, k;
    for (j = 0; j <= 16; j++) bases.push(-1920 + j * (5440 / 16));
    for (k = 1; k <= n; k++) rows.push(hy + (H - hy) * Math.pow(k / n, 1.6));
    var xAt = function (jj, yy) { return sx + (bases[jj] - sx) * (yy - hy) / (H - hy); };
    /* a few sunlit panels in the nearest rows */
    for (k = 3; k < n - 1; k++) for (j = 6; j < 10; j++) if ((k + j) % 3 === 0) {
      var y0 = rows[k], y1 = rows[k + 1];
      s += '<polygon fill="#FFFFFF" fill-opacity=".42" points="' + [[xAt(j, y0), y0], [xAt(j + 1, y0), y0], [xAt(j + 1, y1), y1], [xAt(j, y1), y1]].map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join(' ') + '"/>';
    }
    s += '<g stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1">';
    for (j = 0; j <= 16; j++) s += '<line x1="' + r2(xAt(j, rows[0])) + '" y1="' + r2(rows[0]) + '" x2="' + r2(bases[j]) + '" y2="' + H + '"/>';
    rows.forEach(function (yy) { s += '<line x1="0" y1="' + r2(yy) + '" x2="' + W + '" y2="' + r2(yy) + '"/>'; });
    s += '</g><line x1="0" y1="' + hy + '" x2="' + W + '" y2="' + hy + '" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="1.2"/></svg>';
    return s;
  };

  /* the loading screen's mark: a stadium holding a half-sun on a horizon, 12 rays (lit in turn by CSS, .bootl-r), a lattice of
     panels below. 120 x 192. */
  K.markSvg = function () {
    var w = 120, h = 192, cx = 60, hy = 90.24, R = 22.8, i, j, k, s = '';
    s += '<svg class="bootl-mark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" focusable="false"><defs><clipPath id="bootl-clip"><rect width="' + w + '" height="' + h + '" rx="60"/></clipPath></defs><g clip-path="url(#bootl-clip)">';
    var n = 5, bases = [], rows = [];
    for (j = 0; j <= 8; j++) bases.push(-108 + j * 42);
    for (k = 0; k <= n; k++) rows.push(hy + (h - hy) * Math.pow(k / n, 1.3));
    var xAt = function (jj, yy) { return cx + (bases[jj] - cx) * (yy - hy) / (h - hy); };
    s += '<g class="bootl-grid">';
    for (j = 0; j <= 8; j++) s += '<line x1="' + r2(xAt(j, rows[1])) + '" y1="' + r2(rows[1]) + '" x2="' + bases[j] + '" y2="' + h + '"/>';
    for (k = 1; k <= n; k++) s += '<line x1="0" y1="' + r2(rows[k]) + '" x2="' + w + '" y2="' + r2(rows[k]) + '"/>';
    s += '</g>';
    for (i = 0; i < 12; i++) {
      var a = (180 - (7.5 + 15 * i)) * Math.PI / 180, r0 = R * 1.32, r1 = 144;
      s += '<line class="bootl-r" x1="' + r2(cx + r0 * Math.cos(a)) + '" y1="' + r2(hy - r0 * Math.sin(a)) + '" x2="' + r2(cx + r1 * Math.cos(a)) + '" y2="' + r2(hy - r1 * Math.sin(a)) + '"/>';
    }
    s += '</g><line class="bootl-hz" x1="0" y1="' + hy + '" x2="' + w + '" y2="' + hy + '"/>';
    s += '<path class="bootl-sun" d="M' + r2(cx - R) + ' ' + hy + ' A' + R + ' ' + R + ' 0 0 1 ' + r2(cx + R) + ' ' + hy + ' Z"/>';
    s += '<rect class="bootl-edge" x=".6" y=".6" width="' + (w - 1.2) + '" height="' + (h - 1.2) + '" rx="59.4"/></svg>';
    return s;
  };
  return K;
})();
if (typeof module !== 'undefined') module.exports = LG;
