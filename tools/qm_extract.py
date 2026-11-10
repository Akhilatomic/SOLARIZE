"""Extract pictures, logos, feature page and wording from the example quotation PDFs.

Usage: python -I tools/qm_extract.py <pdf folder> <out folder>
Needs PyMuPDF.  Writes:
  out/img/<md5>_<w>x<h>.png   every distinct embedded image
  out/pic/<pdf>-p<page>-<item>.png   item picture tiles (vector drawings rendered at 300 dpi)
  out/page-stormshield.jpg    page 5 of the 2 kW TSUN premier PDF (200 dpi, q85)
  out/text.txt                reading-order text of every page of every PDF
"""
import sys, os, re, glob, hashlib
import pymupdf

sys.stdout.reconfigure(encoding='utf-8')

# The item picture sits on a light grey (about #F4F6F9) rounded tile, 42-46 pt square, in the ITEM column.


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def list_pdfs(folder):
    pdfs = sorted(glob.glob(os.path.join(folder, '*.pdf')))
    pdfs += sorted(glob.glob(os.path.join(folder, 'LOAN', 'LOAN', '5kw*.pdf')))
    return pdfs


def extract_images(doc, out_img, seen):
    n_new = 0
    for page in doc:
        for im in page.get_images(full=True):
            xref, smask = im[0], im[1]
            try:
                pix = pymupdf.Pixmap(doc, xref)
                if pix.colorspace is not None and pix.colorspace.n > 3:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                if smask:
                    pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
                data = pix.tobytes('png')
            except Exception as e:
                print('  skip image xref', xref, e)
                continue
            h = hashlib.md5(data).hexdigest()
            if h in seen:
                continue
            seen[h] = True
            n_new += 1
            with open(os.path.join(out_img, '%s_%dx%d.png' % (h, pix.width, pix.height)), 'wb') as f:
                f.write(data)
    return n_new


def find_tiles(page):
    tiles = []
    for dr in page.get_drawings():
        f = dr.get('fill')
        r = dr['rect']
        if f and all(0.94 < c < 0.98 for c in f) and 38 < r.width < 60 and 38 < r.height < 60 and r.x0 < 150:
            tiles.append(r)
    tiles.sort(key=lambda r: r.y0)
    return tiles


def item_name(page, tile):
    """Bold item name lines sit directly above the tile, centred on it."""
    cx = (tile.x0 + tile.x1) / 2
    lines = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            x0, y0, x1, y1 = l['bbox']
            if y1 <= tile.y0 + 2 and y0 >= tile.y0 - 42 and abs((x0 + x1) / 2 - cx) < 30 and x1 < 156:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t and t != 'ITEM':
                    lines.append((y0, t))
    lines.sort()
    return ' '.join(t for _, t in lines)


def extract_pics(doc, stem, out_pic):
    n = 0
    for pno in (1, 2):
        if pno >= len(doc):
            continue
        page = doc[pno]
        for tile in find_tiles(page):
            name = item_name(page, tile) or 'unnamed'
            clip = pymupdf.Rect(tile.x0 - 0.5, tile.y0 - 0.5, tile.x1 + 0.5, tile.y1 + 0.5)
            pix = page.get_pixmap(clip=clip, dpi=300, alpha=True)
            fn = '%s-p%d-%s.png' % (slug(stem), pno + 1, slug(name))
            pix.save(os.path.join(out_pic, fn))
            n += 1
    return n


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    out_img = os.path.join(out, 'img')
    out_pic = os.path.join(out, 'pic')
    os.makedirs(out_img, exist_ok=True)
    os.makedirs(out_pic, exist_ok=True)
    seen = {}
    npics = 0
    texts = []
    pdfs = list_pdfs(src)
    for path in pdfs:
        stem = os.path.splitext(os.path.basename(path))[0]
        doc = pymupdf.open(path)
        a = extract_images(doc, out_img, seen)
        b = extract_pics(doc, stem, out_pic)
        npics += b
        print('%-90s pages=%d new_images=%d pics=%d' % (stem[:90], len(doc), a, b))
        for i, page in enumerate(doc):
            texts.append('===== %s | page %d =====\n%s\n' % (os.path.basename(path), i + 1, page.get_text('text', sort=True)))
        if os.path.basename(path) == '2kw-t sun micro inv premier hdg structure 1.7.pdf' and len(doc) >= 5:
            doc[4].get_pixmap(dpi=200).save(os.path.join(out, 'page-stormshield.jpg'), jpg_quality=85)
    with open(os.path.join(out, 'text.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(texts))
    print('PDFs: %d  distinct images: %d  item pictures: %d' % (len(pdfs), len(seen), npics))


if __name__ == '__main__':
    main()
