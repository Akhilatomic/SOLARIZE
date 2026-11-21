"""Build the KSEB document templates (letterhead + Annexure 1) used by the KSEB documentation page.

Usage: python -I tools/kseb_templates.py <letterhead.pdf> <form1.pdf> <outdir>
Needs PyMuPDF.  Writes:
  outdir/letterhead.pdf    the letterhead, copied unchanged
  outdir/annexure-1.pdf    Form 1 with the "ROOF-TOP" and "30 DAYS" FreeText annotations removed,
                           then row 3 sub-rows (a) panel / (b) on-grid-hybrid inverter capacity added (an1_rows)
  outdir/letterhead.png, outdir/annexure-1.png   page 1 of each at 150 dpi
Checks that nothing but those two annotations was removed before adding the sub-rows.

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
    an1_rows(os.path.join(outdir, 'annexure-1.pdf'))


AN1_LINE = 285.5   # top of the 0.48 pt rule under row 3 (plant capacity) of Form 1
AN1_ROW_H = 22.4   # one-line row, as rows 2 and 6
AN1_RULE = 0.48
AN1_COLS = [43.4, 85.9, 369.5, 553.8]   # left edges of the vertical rules
AN1_BASE = 11.6    # Malayalam baseline below a row's top rule (rows 2 and 6 of the form)
# row 3 sub-items, in Malayalam like the rest of the form: (a) capacity of the solar panels,
# (b) on-grid / hybrid inverter capacity
AN1_SUBS = ['(a) സോളാർ പാനലുകളുടെ ശേഷി', '(b) ഓൺ-ഗ്രിഡ് / ഹൈബ്രിഡ് ഇൻവെർട്ടർ ശേഷി']
# Meera (SIL OFL): the installed Unicode Malayalam font closest to the form's FML-TTIndulekha 14 pt;
# at 13 pt its letters are the same height (compared by eye against row 3)
AN1_ML_S = 13
AN1_FONT = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts', 'Meera.ttf')


def an1_rows(path, font=AN1_FONT):
    """Annexure 1: row 3 (capacity of the plant) gets two sub-rows, (a) panel capacity and (b) on-grid / hybrid
    inverter capacity, labelled in Malayalam; the S.No cell "3" spans all three. Rows 4-6, the Place/Date row and
    the acknowledgement slip move down by the sub-rows' height; the form's own rules and text stay the original
    vectors. In place; refused if the sub-rows are there already.
      python -I tools/kseb_templates.py --an1-rows assets/kseb/annexure-1.pdf [Meera.ttf]"""
    src = pymupdf.open(path)
    page = src[0]
    if any('Meera' in f[3] for f in page.get_fonts()):   # our labels are the only Meera text on the form
        print('refusing: the sub-rows are there already')
        sys.exit(1)
    W, H = page.rect.width, page.rect.height
    D = AN1_ROW_H * len(AN1_SUBS)
    low = [s for s in spans(page) if s[0].strip() and s[2][3] > H - D - 40]
    if low:
        print('refusing: text too near the page foot to move down', low)
        sys.exit(1)

    # two copies: the top keeps rows 1-3 (clipped just above the rule under row 3), the bottom keeps that rule and
    # everything below; redacting each leaves no hidden duplicate text or rules under the clips
    def part(rect):
        d = pymupdf.open(path)
        d[0].add_redact_annot(rect, fill=False)
        d[0].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        return d
    top = part(pymupdf.Rect(0, AN1_LINE + AN1_RULE + 0.1, W, H))
    bot = part(pymupdf.Rect(0, 0, W, AN1_LINE - 0.1))

    out = pymupdf.open()
    new = out.new_page(width=W, height=H)
    new.show_pdf_page(pymupdf.Rect(0, 0, W, AN1_LINE), top, 0, clip=pymupdf.Rect(0, 0, W, AN1_LINE))
    new.show_pdf_page(pymupdf.Rect(0, AN1_LINE + D, W, H), bot, 0, clip=pymupdf.Rect(0, AN1_LINE, W, H - D))

    black = (0, 0, 0)
    for x in AN1_COLS:   # the four column rules through the new band (the S.No cell stays open)
        new.draw_rect(pymupdf.Rect(x, AN1_LINE, x + AN1_RULE, AN1_LINE + D), color=None, fill=black, width=0)
    css = '@font-face {font-family: ml; src: url("%s");} body {font-family: ml; font-size: %gpt; margin: 0}' % (os.path.basename(font), AN1_ML_S)
    arch = pymupdf.Archive(os.path.dirname(font))
    # where the font puts the baseline below the top of an HTML box, measured once on a scratch page
    probe = pymupdf.open()
    pp = probe.new_page(width=W, height=100)
    pp.insert_htmlbox(pymupdf.Rect(0, 0, W, 100), AN1_SUBS[0], css=css, archive=arch, scale_low=1)
    first = pp.get_text('dict')['blocks'][0]['lines'][0]['spans'][0]
    off = first['origin'][1]
    probe.close()
    for i, label in enumerate(AN1_SUBS):
        y0 = AN1_LINE + i * AN1_ROW_H
        # rules above (a) and (b) across the label and value columns only: the S.No cell "3" spans all three
        new.draw_rect(pymupdf.Rect(AN1_COLS[1], y0, AN1_COLS[-1] + AN1_RULE, y0 + AN1_RULE), color=None, fill=black, width=0)
        top_y = y0 + AN1_BASE - off   # baseline AN1_BASE below the row's top rule, as on rows 2 and 6
        # a box one line high (13 pt x 1.2 = 15.6 pt), no shrinking: a label that would wrap is refused
        spare, _ = new.insert_htmlbox(pymupdf.Rect(91.58, top_y, AN1_COLS[2] - 2, top_y + 20), label, css=css, archive=arch, scale_low=1)
        if spare < 0:
            print('refusing: label does not fit on one line', label)
            sys.exit(1)
    out.subset_fonts()
    out.save(path + '.tmp', garbage=3, deflate=True)
    out.close(); src.close(); top.close(); bot.close()
    os.replace(path + '.tmp', path)
    d = pymupdf.open(path)
    d[0].get_pixmap(dpi=150).save(os.path.splitext(path)[0] + '.png')
    print('an1 row 3 sub-rows added; rows 4-6, place/date and slip moved down', round(D, 2), 'pt')


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
    if len(sys.argv) in (3, 4) and sys.argv[1] == '--an1-rows':
        an1_rows(*sys.argv[2:])  # python -I tools/kseb_templates.py --an1-rows assets/kseb/annexure-1.pdf [Meera.ttf]
    elif len(sys.argv) == 3 and sys.argv[1] == '--blank':
        blank(sys.argv[2])  # python -I tools/kseb_templates.py --blank assets/kseb
    elif len(sys.argv) == 5 and sys.argv[1] == '--copy':
        copy_blank(*sys.argv[2:])  # python -I tools/kseb_templates.py --copy <form.pdf> annexure-2 assets/kseb
    elif len(sys.argv) == 4:
        main(*sys.argv[1:])
    else:
        sys.exit(__doc__)
