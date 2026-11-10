"""Build the KSEB document templates (letterhead + Annexure 1) used by the KSEB documentation page.

Usage: python -I tools/kseb_templates.py <letterhead.pdf> <form1.pdf> <outdir>
Needs PyMuPDF.  Writes:
  outdir/letterhead.pdf    the letterhead, copied unchanged
  outdir/annexure-1.pdf    Form 1 with the "ROOF-TOP" and "30 DAYS" FreeText annotations removed
  outdir/letterhead.png, outdir/annexure-1.png   page 1 of each at 150 dpi
Then checks that nothing but those two annotations was removed.
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
    print('annots', len(list(new.annots())))
    print('spans equal', spans(new) == want)
    print('drawings equal', len(new.get_drawings()) == len(orig.get_drawings()))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
