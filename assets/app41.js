/* Accounts › Export (assets/app41.js): the books of the chosen period as one Excel workbook for the accountant.
   Reads the existing actions (ac_pl, ac_books, ac_book per account, ac_gst, ac_received, ac_expenses, ac_salary, ac_dues); the sheets
   are built by ACC.exportSheets (app32.js) and written with the Excel library already in the CRM (loadXlsx, app18.js). Nothing is stored. */
async function acExport(btn) {
  const key = acPerKey(), P = Object.assign({ key }, ACC.period(key)), per = acPer(P);
  if (!confirm(`Download the books for ${P.label} as an Excel file?\n\nIt has ${typeof acIsCa === 'function' && acIsCa() ? 'the' : 'the profit and loss,'} cash and bank book, GST registers, payments received, expenses, salaries and supplier dues. Change the month or year on the period bar first if you want another period.`)) return;
  if (btn) btn.disabled = true;
  try {
    toast('Preparing the Excel file…');
    const ca = typeof acIsCa === 'function' && acIsCa(); /* the accountant's file has no profit and loss */
    const [X, pl, sum, gst, rec, exp, sal, dues] = await Promise.all([loadXlsx(), ca ? null : api('acc', 'ac_pl', undefined, per), api('acc', 'ac_books'), api('acc', 'ac_gst', undefined, per),
      api('acc', 'ac_received', undefined, per), api('acc', 'ac_expenses', undefined, per), api('acc', 'ac_salary', undefined, per), api('acc', 'ac_dues')]);
    const books = [];
    for (const b of (sum.books || []).filter(x => !x.hidden || Math.abs(x.balance) > 0.004)) books.push({ name: b.name, book: await api('acc', 'ac_book', undefined, per + '&book=' + b.id) });
    const co = ((typeof S === 'object' && S && S.company) || {}).name || 'Company';
    const sheets = ACC.exportSheets({ company: co, label: P.label, from: P.from, to: P.to, made: today(), pl, hideProfit: ca, books, gst, received: rec.rows || [], expenses: exp.rows || [], salary: sal, dues, sum });
    const wb = X.utils.book_new();
    sheets.forEach(s => { const ws = X.utils.aoa_to_sheet(s.rows); ws['!cols'] = (s.widths || []).map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)); });
    X.writeFile(wb, `Books ${co} ${P.label}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.xlsx');
    toast('Excel file downloaded');
  } catch (e) { toast((e && e.message) || 'The export could not be made', true); }
  if (btn) btn.disabled = false;
}
