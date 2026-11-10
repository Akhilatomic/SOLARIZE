"""Build the KSEB cover page template: the company letterhead with its footer kept and its header replaced.

Usage: python -I tools/kseb_cover_template.py <letterhead.pdf> <fonts dir with Outfit-Regular.ttf and Outfit-Bold.ttf> <outdir>
Needs PyMuPDF.  Writes outdir/cover.pdf and outdir/cover.png (150 dpi, like the other templates).

Removed (everything above y 200 pt): the solid red top bar and contact band, the solid logo block, the PM Surya Ghar
mark and divider, and the Ref No. / Date line (the app draws Ref No. and Date itself).
Kept: the watermark and the whole footer (offices, GSTIN, rules).
Added, in hairlines to save ink: the company logo (taken from the letterhead, 48 pt, the only solid colour), the company
name and tagline in the letterhead's own typeface (Outfit), the phone / email / website on the right, one 0.5 pt rule in the house red,
and the title line: PROJECT DETAILS with REF NO. / DATE labels over fine grey lines (the app writes the values).
"""
import sys, os
import pymupdf

sys.stdout.reconfigure(encoding='utf-8')

RED = (0.8431, 0.2314, 0.2431)      # #D73B3E, the letterhead's red
INK = (0.110, 0.110, 0.118)         # #1C1C1E, the letterhead's name colour
GREY = (0.373, 0.376, 0.392)        # #5F6064, the letterhead's small text
LEFT, RIGHT = 34.0, 561.5           # the letterhead's margins

LOGO_W = 1040  # the company logo inside the letterhead: the red block with the sun and JASPER, 1040 x 1042 px with a soft mask


def logo_pixmap(doc):
    """the company logo from the letterhead, with its transparency (rounded corners)"""
    for img in doc[0].get_images(full=True):
        xref, smask, w = img[0], img[1], img[2]
        if w == LOGO_W:
            pix = pymupdf.Pixmap(doc, xref)
            return pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask)) if smask else pix
    raise SystemExit('company logo not found in the letterhead')


def tracked(page, font, text, x, y, size, track, color):
    """letter-spaced capitals, one glyph at a time"""
    tw = pymupdf.TextWriter(page.rect)
    for ch in text:
        tw.append((x, y), ch, font=font, fontsize=size)
        x += font.text_length(ch, fontsize=size) + track
    tw.write_text(page, color=color)
    return x - track


def build(letterhead, fonts, outdir):
    doc = pymupdf.open(letterhead)
    page = doc[0]
    W = page.rect.width
    logo = logo_pixmap(doc)  # kept before the header (and the logo with it) is removed
    # 1) the header goes: text, the two logo images and every drawing that touches the top 200 pt
    page.add_redact_annot(pymupdf.Rect(0, 0, W, 200), fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                          text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    bold = pymupdf.Font(fontfile=os.path.join(fonts, 'Outfit-Bold.ttf'))
    reg = pymupdf.Font(fontfile=os.path.join(fonts, 'Outfit-Regular.ttf'))

    # 2) the new header: company logo (small, the only solid colour) | name over tagline | contacts on the right;
    #    one red hairline under it
    top, h = 38.0, 48.0
    m = pymupdf.Rect(LEFT, top, LEFT + h * logo.width / logo.height, top + h)
    page.insert_image(m, pixmap=logo)
    tx = m.x1 + 12.5
    tw = pymupdf.TextWriter(page.rect)
    tw.append((tx, top + 25.2), 'JASPER SOLAR SOLUTIONS', font=bold, fontsize=19.5)
    tw.write_text(page, color=INK)
    tracked(page, bold, 'MNRE EMPANELLED  ·  PM SURYA GHAR AUTHORIZED VENDOR', tx + 0.6, top + 39.2, 6.1, 1.62, RED)
    for i, t in enumerate(['+91 96055 25552', 'info@jasper.solar', 'www.jasper.solar']):
        size = 7.8
        w = reg.text_length(t, fontsize=size)
        tw = pymupdf.TextWriter(page.rect)
        tw.append((RIGHT - w, top + 14.0 + i * 11.6), t, font=reg, fontsize=size)
        tw.write_text(page, color=GREY)
    sh = page.new_shape()
    sh.draw_line((LEFT, top + h + 10), (RIGHT, top + h + 10))
    sh.finish(color=RED, width=0.5)
    sh.commit()

    # 3) the title line in the same typeface: PROJECT DETAILS, then Ref No. and Date with fine lines to write on.
    #    The app writes the Ref No. from x 338 and the date from x 496 on baseline 127 (COV in assets/app24.js).
    tracked(page, bold, 'PROJECT DETAILS', LEFT, 127.0, 14.5, 0.55, INK)
    tracked(page, reg, 'REF NO.', 302.0, 127.0, 6.6, 1.0, GREY)
    tracked(page, reg, 'DATE', 466.5, 127.0, 6.6, 1.0, GREY)
    sh = page.new_shape()
    for (xa, xb) in ((336.0, 452.0), (494.0, RIGHT)):
        sh.draw_line((xa, 129.6), (xb, 129.6))
    sh.finish(color=(0.80, 0.80, 0.82), width=0.3)
    sh.commit()

    doc.subset_fonts()
    out = os.path.join(outdir, 'cover.pdf')
    doc.save(out, garbage=4, deflate=True, clean=True)
    pix = pymupdf.open(out)[0].get_pixmap(dpi=150)
    pix.save(os.path.join(outdir, 'cover.png'))
    print('wrote', out, 'and cover.png', pix.width, 'x', pix.height, '· header rule at y', top + h + 10)

    # 3) checks: the footer text is all still there, nothing of the old header is left
    old = [s for s in pymupdf.open(letterhead)[0].get_text('words') if s[1] > 740]
    new = pymupdf.open(out)[0]
    left = [s for s in new.get_text('words') if s[1] > 740]
    assert [w[4] for w in old] == [w[4] for w in left], 'footer text changed'
    head = [w[4] for w in new.get_text('words') if w[1] < 200]
    assert 'Ref' not in head and 'Date' not in head and '+91' in head, head  # the letterhead's own Ref No. / Date line is gone
    assert len(new.get_images()) == 2, 'the watermark and the logo'
    print('checks ok: footer kept, header replaced')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3])
