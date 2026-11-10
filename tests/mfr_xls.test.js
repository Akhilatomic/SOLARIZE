// Warranty card tab → manufacturer form → Download Excel (renderMfr in assets/app18.js).
// The .xls once opened "empty": the column widths used an unknown key, so both columns were saved 0 wide and hidden.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const X = require('../assets/vendor/xlsx-0.18.5.min.js');

const src = fs.readFileSync(path.join(__dirname, '../assets/app18.js'), 'utf8');
/* the column widths the export uses, as written in app18.js */
const colsOf = () => {
  const m = /const MFR_COLS = (\[[^\n;]*\]);/.exec(src) || /ws\['!cols'\] = (\[[^\n;]*\]);/.exec(src);
  assert.ok(m, 'column widths found in app18.js');
  return Function('return ' + m[1])();
};

test('warranty Excel form: both columns are visible and wide enough', () => {
  const rows = [['Form for Warranty Certificate for RENEW'], ['Distributer ', 'Southern Power Source Pvt Ltd'], ['PDF of Final customer Invoice', 'Attached — 59.pdf']];
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  ws['!cols'] = colsOf();
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Sheet1');
  const back = X.read(X.write(wb, { type: 'buffer', bookType: 'biff8' }), { cellStyles: true }); /* the same options as the app's download */
  const sh = back.Sheets.Sheet1, cols = sh['!cols'] || [];
  assert.equal(cols.length, 2, 'two column widths saved');
  for (const [i, c] of cols.entries()) {
    assert.ok(!c.hidden, 'column ' + i + ' not hidden');
    assert.ok((c.wch || 0) > 0 || (c.width || 0) > 0, 'column ' + i + ' has a width');
  }
  assert.ok(cols[0].wch >= 'PDF of Final customer Invoice'.length, 'labels fit in column A (' + cols[0].wch + ')');
  assert.equal(sh.B2.v, 'Southern Power Source Pvt Ltd');
});
