"""Refresh api/kseb_offices.json: every KSEB section office (section code, section, sub division, division, circle).

Usage: python -I tools/kseb_offices.py <work dir> api/kseb_offices.json
Reads kseb.in's public office search (the Contact page): the sub division list from its search form, then one search per
sub division (about 440, 0.3 s apart), each answering with the office cards: section, section code, sub division,
division, circle, region. Run it again when KSEB opens, splits or renames sections; the app reads the JSON on every request.
The section code is the 4 digits after "11" in a 13-digit consumer number.
"""
import sys, re, html, json, time, os, urllib.request, urllib.parse, http.cookiejar

sys.stdout.reconfigure(encoding='utf-8')


def tidy(o):
    """KSEB writes some names run together: 'NorthParavur' -> 'North Paravur', 'Thiruvananthapuram(Urban)' -> 'Thiruvananthapuram (Urban)'"""
    for k in ('section', 'subdivision', 'division', 'circle'):
        v = re.sub(r'([a-z])([A-Z])', r'\1 \2', o[k])
        o[k] = re.sub(r'\s+', ' ', re.sub(r'(\w)\(', r'\1 (', v)).strip()
    return o


if sys.argv[1] == '--tidy':  # python -I tools/kseb_offices.py --tidy <in.json> <out.json>: tidy an existing list
    L = [tidy(o) for o in json.load(open(sys.argv[2], encoding='utf-8'))]
    json.dump(sorted(L, key=lambda o: o['section'].lower()), open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('tidied', len(L)); sys.exit(0)
dl, out = sys.argv[1], sys.argv[2]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders = [('User-Agent', UA)]


def get(url, data=None):
    for attempt in range(4):
        try:
            body = urllib.parse.urlencode(data).encode() if data is not None else None
            with op.open(url, body, timeout=40) as r:
                return r.status, r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 419: return 419, ''
            time.sleep(2 + attempt * 3)
        except Exception:
            time.sleep(2 + attempt * 3)
    return 0, ''


def token():
    st, s = get('https://kseb.in/contact')
    m = re.search(r'name="_token" value="([^"]+)"', s)
    return s, m.group(1) if m else ''


def cells(s):
    for t in re.findall(r'<table.*?</table>', s, re.S | re.I):
        row = {}
        for r in re.findall(r'<tr.*?</tr>', t, re.S | re.I):
            c = [html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x))).strip() for x in re.findall(r'<t[hd].*?</t[hd]>', r, re.S | re.I)]
            if len(c) >= 2: row[c[0].rstrip(':').strip()] = c[1]
        if 'Section Code' in row: yield row


def name(v):
    """'North Paravur eeparur@gmail.com 4842519797' -> 'North Paravur'"""
    out = []
    for w in (v or '').split():
        if '@' in w or re.fullmatch(r'[\d\-/]{6,}', w): break
        out.append(w)
    return ' '.join(out).strip()


page, tok = token()
f = re.search(r'name="selectsubdivision"[^>]*>(.*?)</select>', page, re.S)
subs = [html.unescape(v) for v, _ in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', f.group(1), re.S) if v]
subs = [x for x in subs if x.isascii()]  # the list has every sub division twice: in English and in Malayalam; the English cards are enough
f = re.search(r'name="selectsection"[^>]*>(.*?)</select>', page, re.S)
all_sections = [html.unescape(v) for v, _ in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', f.group(1), re.S) if v]
print('sub divisions', len(subs), 'sections in the list', len(all_sections), flush=True)

offices = {}
for i, sd in enumerate(subs):
    st, s = get('https://kseb.in/searchsection', {'_token': tok, 'selectcircle': '', 'selectdivision': '', 'selectsubdivision': sd, 'selectsection': ''})
    if st == 419:
        page, tok = token()
        st, s = get('https://kseb.in/searchsection', {'_token': tok, 'selectcircle': '', 'selectdivision': '', 'selectsubdivision': sd, 'selectsection': ''})
    n = 0
    for r in cells(s):
        code = re.sub(r'\D', '', r.get('Section Code', ''))
        if not code: continue
        offices[code] = tidy({'code': code, 'section': r.get('Section Office', '').strip(), 'subdivision': name(r.get('Sub Division')) or sd,
                         'division': name(r.get('Division')), 'circle': name(r.get('Circle')), 'region': r.get('Region', '').strip()})
        n += 1
    if i % 25 == 0 or not n: print(i, sd, n, 'total', len(offices), flush=True)
    time.sleep(0.3)

json.dump(sorted(offices.values(), key=lambda o: o['section'].lower()), open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('done', len(offices), 'offices ->', out, flush=True)
