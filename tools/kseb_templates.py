"""Build the KSEB document templates (letterhead + Annexure 1) used by the KSEB documentation page.

Usage: python -I tools/kseb_templates.py <letterhead.pdf> <form1.pdf> <outdir>
Needs PyMuPDF.  Writes:
  outdir/letterhead.pdf    the letterhead, copied unchanged
  outdir/annexure-1.pdf    Form 1 with the "ROOF-TOP" and "30 DAYS" FreeText annotations removed
  outdir/letterhead.png, outdir/annexure-1.png   page 1 of each at 150 dpi
Then checks that nothing but those two annotations was removed.

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
    if len(sys.argv) == 3 and sys.argv[1] == '--blank':
        blank(sys.argv[2])  # python -I tools/kseb_templates.py --blank assets/kseb
    elif len(sys.argv) == 5 and sys.argv[1] == '--copy':
        copy_blank(*sys.argv[2:])  # python -I tools/kseb_templates.py --copy <form.pdf> annexure-2 assets/kseb
    elif len(sys.argv) == 4:
        main(*sys.argv[1:])
    else:
        sys.exit(__doc__)
