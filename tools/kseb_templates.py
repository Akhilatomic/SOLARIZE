"""Build the KSEB document templates (letterhead + Annexure 1) used by the KSEB documentation page.

Usage: python -I tools/kseb_templates.py <letterhead.pdf> <form1.pdf> <outdir>
Needs PyMuPDF.  Writes:
  outdir/letterhead.pdf    the letterhead, copied unchanged
  outdir/annexure-1.pdf    Form 1 with the "ROOF-TOP" and "30 DAYS" FreeText annotations removed
  outdir/annexure-1-v3.pdf the same with a taller row 1 and row 3 sub-rows (എ) panel / (ബി) inverter capacity (an1_v3)
  outdir/letterhead.png, outdir/annexure-1.png   page 1 of each at 150 dpi
Checks that nothing but those two annotations was removed.
A changed form always gets a new file name: CRM tabs opened before an update still fetch the old one.

Blank forms with nothing typed on them (Annexure 2, 3):
  python -I tools/kseb_templates.py --copy <form.pdf> annexure-2 <outdir>
copies the PDF unchanged and renders its PNG.

  python -I tools/kseb_templates.py --blank <outdir>
writes blank.pdf / blank.png, a plain A4 page for the checklist sheet.
"""
import sys, os, shutil
import pymupdf

sys.stdout.reconfigure(encoding='utf-8')

REMOVE = {'ROOF-TOP', '30 DAYS'}


def spans(page):
    out = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                text = ''.join(c['c'] for c in s['chars'])
                out.append((text, s['font'], tuple(round(v, 1) for v in s['bbox'])))
    return out


def main(letterhead, form1, outdir):
    os.makedirs(outdir, exist_ok=True)
    shutil.copyfile(letterhead, os.path.join(outdir, 'letterhead.pdf'))

    doc = pymupdf.open(form1)
    for page in doc:
        for a in list(page.annots()):
            text = (a.info.get('content') or '').strip()
            if a.type[1] == 'FreeText' and text in REMOVE:
                page.delete_annot(a)
            else:
                print('refusing: unexpected annotation', a.type, repr(text), 'on page', page.number)
                sys.exit(1)
    doc.save(os.path.join(outdir, 'annexure-1.pdf'), garbage=3, deflate=True)
    doc.close()

    for name in ('letterhead', 'annexure-1'):
        d = pymupdf.open(os.path.join(outdir, name + '.pdf'))
        d[0].get_pixmap(dpi=150).save(os.path.join(outdir, name + '.png'))
        d.close()

    orig = pymupdf.open(form1)[0]
    new = pymupdf.open(os.path.join(outdir, 'annexure-1.pdf'))[0]
    # get_text also reports FreeText appearance text, so drop those two spans from the original
    want = [s for s in spans(orig) if s[0].strip() not in REMOVE]
    checks = [('annots', len(list(new.annots())) == 0), ('spans equal', spans(new) == want),
              ('drawings equal', len(new.get_drawings()) == len(orig.get_drawings()))]
    for label, ok in checks:
        print(label, ok)
    if not all(ok for _, ok in checks):
        sys.exit(1)
    an1_v3(os.path.join(outdir, 'annexure-1.pdf'), os.path.join(outdir, 'annexure-1-v3.pdf'))


# Annexure 1 v3 (2026-11-21), built from the ORIGINAL Form 1. Every form change gets a new file name (CRM tabs opened
# before an update keep fetching the old one): annexure-1.pdf = original, -v2 = first (a)/(b) version (Meera labels,
# built by an earlier an1_rows, see git history), -v3 = this.
AN1_RULE = 0.48
AN1_COLS = [43.44, 85.94, 369.55, 553.78]   # left edges of the vertical rules
AN1_CUT1, AN1_D1 = 231.0, 18.0   # row 1 grows by D1: cut in its blank band (label text ends 228.2, rule under it 233.66)
AN1_CUT3, AN1_ROW_H = 285.4, 22.4   # row 3 sub-rows go in just above the rule under row 3 (285.46); one-line rows
AN1_BASE = 11.6    # Malayalam baseline below a row's top rule, as on rows 2 and 6
# Row 3 sub-items in the form's own FML-TTIndulekha 14 pt, written in its legacy encoding (glyph codes read off the
# font embedded in the form: m = ാ, s = െ, t = േ, { = ്ര, \xc0 = ർ, \xac = ൺ, \xb3 = ൻ, \xab = ട്ട, ss = ൈ ...).
# That font is a subset: it has no Latin letters (hence (എ)/(ബി)), no visible hyphen, and no ഹ, which comes from
# Meera 13 pt (same letter height). ('F', text) = form font run, ('M', text) = Meera run.
AN1_SUBS = [
    [('F', '(F) tkmfm\xc0 ]m\x5cepIfpsS tijn')],                                          # (എ) സോളാർ പാനലുകളുടെ ശേഷി
    [('F', '(_n) Hm\xac {KnUv / ss'), ('M', 'ഹ'), ('F', '{_nUv C\xb3sh\xc0\xab\xc0 tijn')],   # (ബി) ഓൺ ഗ്രിഡ് / ഹൈബ്രിഡ് ഇൻവെർട്ടർ ശേഷി
]
AN1_ML_S = 13
AN1_FONT = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts', 'Meera.ttf')


def an1_v3(path, dst, font=AN1_FONT):
    """Annexure 1 v3 from the original Form 1 at path: row 1 (consumer details) 18 pt taller so they print bigger;
    row 3 (capacity of the plant) gets sub-rows (എ) panel capacity and (ബി) on-grid / hybrid inverter capacity, the
    S.No cell "3" spanning all three. Everything below moves down; the form's own rules and text stay the original
    vectors. Writes dst + its PNG and checks the original text is all there, moved by the right amount.
      python -I tools/kseb_templates.py --an1-v3 assets/kseb/annexure-1.pdf assets/kseb/annexure-1-v3.pdf [Meera.ttf]"""
    src = pymupdf.open(path)
    page = src[0]
    if any('Meera' in f[3] for f in page.get_fonts()):
        print('refusing: not the original form (it has our sub-rows already)')
        sys.exit(1)
    W, H = page.rect.width, page.rect.height
    D3 = AN1_ROW_H * len(AN1_SUBS)
    D = AN1_D1 + D3
    low = [s for s in spans(page) if s[0].strip() and s[2][3] > H - D - 40]
    if low:
        print('refusing: text too near the page foot to move down', low)
        sys.exit(1)
    fml = [src.extract_font(f[0])[3] for f in page.get_fonts() if f[3].endswith('+FML-TTIndulekha')]
    if not fml:
        print('refusing: the form font FML-TTIndulekha is not embedded')
        sys.exit(1)
    fml = fml[0]

    def piece(y0, y1):
        # a copy with the text outside y0..y1 removed, so nothing hides under the clips (rules are only clipped:
        # every cut runs through blank space or just above a rule, never through one)
        d = pymupdf.open(path)
        if y0 > 0:
            d[0].add_redact_annot(pymupdf.Rect(0, 0, W, y0 - 0.05), fill=False)
        if y1 < H:
            d[0].add_redact_annot(pymupdf.Rect(0, y1 + 0.05, W, H), fill=False)
        d[0].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        return d
    bands = [(0, AN1_CUT1, 0), (AN1_CUT1, AN1_CUT3, AN1_D1), (AN1_CUT3, H - D, D)]
    out = pymupdf.open()
    new = out.new_page(width=W, height=H)
    parts = []
    for y0, y1, dy in bands:
        parts.append(piece(y0, y1))
        new.show_pdf_page(pymupdf.Rect(0, y0 + dy, W, y1 + dy), parts[-1], 0, clip=pymupdf.Rect(0, y0, W, y1))

    black = (0, 0, 0)

    def vrules(a, b):   # the four column rules through a new band, overlapping the cut a little (no hairline gaps)
        for x in AN1_COLS:
            new.draw_rect(pymupdf.Rect(x, a - 0.3, x + AN1_RULE, b + 0.3), color=None, fill=black, width=0)
    vrules(AN1_CUT1, AN1_CUT1 + AN1_D1)
    vrules(AN1_CUT3 + AN1_D1, AN1_CUT3 + D)
    new.insert_font(fontname='fml', fontbuffer=fml)
    new.insert_font(fontname='mee', fontfile=font)
    ffml, fmee = pymupdf.Font(fontbuffer=fml), pymupdf.Font(fontfile=font)
    top3 = AN1_CUT3 + AN1_D1 + 0.06   # where the rule under row 3 sat (285.46), moved down with row 1
    for i, runs in enumerate(AN1_SUBS):
        y0 = top3 + i * AN1_ROW_H
        # rules above (എ) and (ബി) across the label and value columns only: the S.No cell "3" spans all three
        new.draw_rect(pymupdf.Rect(AN1_COLS[1], y0, AN1_COLS[-1] + AN1_RULE, y0 + AN1_RULE), color=None, fill=black, width=0)
        x = 91.58
        for kind, t in runs:
            if kind == 'F':
                miss = [hex(ord(c)) for c in t if c != ' ' and not ffml.has_glyph(ord(c))]
                if miss:
                    print('refusing: the form font has no glyph for', miss)
                    sys.exit(1)
                new.insert_text((x, y0 + AN1_BASE), t, fontname='fml', fontsize=14, color=black)
                x += ffml.text_length(t, 14)
            else:
                new.insert_text((x, y0 + AN1_BASE), t, fontname='mee', fontsize=AN1_ML_S, color=black)
                x += fmee.text_length(t, AN1_ML_S)
        if x > AN1_COLS[2] - 3:
            print('refusing: label wider than its cell', i)
            sys.exit(1)
    out.subset_fonts()
    out.save(dst, garbage=3, deflate=True)
    out.close()

    # every original span is there once, moved by its band's offset; the only new text is in the two sub-rows
    def shifted(s):
        t, f, b = s
        dy = next(dy for y0, y1, dy in bands if y0 <= (b[1] + b[3]) / 2 < y1)
        return (t, f, (b[0], round(b[1] + dy, 1), b[2], round(b[3] + dy, 1)))
    want = [shifted(s) for s in spans(page)]
    got = spans(pymupdf.open(dst)[0])
    extra = [g for g in got if g not in want]
    missing = [w for w in want if w not in got]
    ok = not missing and all(g[2][1] > top3 - 1 and g[2][3] < top3 + D3 + 1 for g in extra)
    print('original text kept and moved:', not missing, '| new text only in the sub-rows:', ok)
    if not ok:
        print('missing', missing[:5], 'extra', extra[:5])
        sys.exit(1)
    d = pymupdf.open(dst)
    d[0].get_pixmap(dpi=150).save(os.path.splitext(dst)[0] + '.png')
    print('an1 v3 written: row 1 +%g pt, row 3 sub-rows at %.2f / %.2f, rows below moved %g pt' % (AN1_D1, top3, top3 + AN1_ROW_H, D))


def copy_blank(form, name, outdir):
    """A blank KSEB form (Annexure 2, 3, ...): copied byte for byte, refused if anything is typed on it."""
    page = pymupdf.open(form)[0]
    extra = list(page.annots()) + list(page.widgets())
    if extra:
        print('refusing: the form has annotations or form fields', [a.type for a in extra])
        sys.exit(1)
    os.makedirs(outdir, exist_ok=True)
    shutil.copyfile(form, os.path.join(outdir, name + '.pdf'))
    d = pymupdf.open(os.path.join(outdir, name + '.pdf'))
    d[0].get_pixmap(dpi=150).save(os.path.join(outdir, name + '.png'))
    print(name, 'pages', len(d), 'size', tuple(round(v, 2) for v in d[0].rect[2:]))
    d.close()


def blank(outdir):
    """A plain white A4 page (595.28 x 841.89 pt) for documents with no letterhead, e.g. the checklist sheet."""
    os.makedirs(outdir, exist_ok=True)
    d = pymupdf.open()
    d.new_page(width=595.28, height=841.89)
    d.save(os.path.join(outdir, 'blank.pdf'), garbage=3, deflate=True)
    d[0].get_pixmap(dpi=36).save(os.path.join(outdir, 'blank.png'))
    print('blank', tuple(round(v, 2) for v in d[0].rect[2:]))


if __name__ == '__main__':
    if len(sys.argv) in (4, 5) and sys.argv[1] == '--an1-v3':
        an1_v3(*sys.argv[2:])  # python -I tools/kseb_templates.py --an1-v3 assets/kseb/annexure-1.pdf assets/kseb/annexure-1-v3.pdf [Meera.ttf]
    elif len(sys.argv) == 3 and sys.argv[1] == '--blank':
        blank(sys.argv[2])  # python -I tools/kseb_templates.py --blank assets/kseb
    elif len(sys.argv) == 5 and sys.argv[1] == '--copy':
        copy_blank(*sys.argv[2:])  # python -I tools/kseb_templates.py --copy <form.pdf> annexure-2 assets/kseb
    elif len(sys.argv) == 4:
        main(*sys.argv[1:])
    else:
        sys.exit(__doc__)
