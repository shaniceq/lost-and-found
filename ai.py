"""FindBack matching engine.

Pure functions (no Flask, no database). A lost report is compared with a found report using
name/description, colour, brand, location, date/time and the photo.

Photo analysis needs Pillow (optional): each photo gets a colour profile and a perceptual hash.
Without Pillow everything still works, the photo part is simply skipped.
"""
import base64
import io
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from functools import lru_cache

try:
    from PIL import Image
except Exception:  # Pillow not installed
    Image = None
HAVE_PHOTO = Image is not None

MIN_STORE = 40   # weaker pairs are not kept
ALERT = 60       # from here users and administrators are notified
STRONG = 75

STOP = frozenset("""a an the and or of in on at to for with from by is was were it its this that my me i we you our your
near around inside outside there here very some any has have had been be as into onto while when where which who please
one two last left lost found item thing today yesterday week weeks month ago this past""".split())

# first word of every group is the canonical form
_SYN = [
    ("phone", "smartphone", "cellphone", "cellular", "mobile", "handset", "iphone", "android"),
    ("laptop", "notebook", "macbook", "computer", "chromebook"),
    ("tablet", "ipad"),
    ("wallet", "purse", "billfold", "cardholder"),
    ("key", "keys", "keychain", "keyring", "fob"),
    ("bag", "backpack", "handbag", "tote", "satchel", "rucksack", "luggage", "pouch", "sling"),
    ("jacket", "coat", "hoodie", "sweater", "jumper", "cardigan", "windbreaker"),
    ("shirt", "tshirt", "blouse", "polo", "top"),
    ("pants", "trousers", "jeans", "shorts"),
    ("id", "identification", "passport", "license", "licence", "permit", "document", "documents"),
    ("necklace", "pendant", "chain"),
    ("earphone", "earphones", "headphone", "headphones", "earbud", "earbuds", "airpods", "headset"),
    ("watch", "wristwatch", "smartwatch"),
    ("glasses", "eyeglasses", "spectacles", "sunglasses", "shades"),
    ("umbrella", "brolly"),
    ("bottle", "tumbler", "flask", "thermos"),
    ("charger", "adapter", "adaptor", "cable", "cord"),
    ("dog", "puppy", "canine"),
    ("cat", "kitten", "feline"),
    ("shoe", "sneaker", "sandal", "slipper", "boot", "footwear", "flipflop"),
]
CANON = {}
for _g in _SYN:
    for _w in _g:
        CANON[_w] = _g[0]

COLOR_ALIAS = {}
for _base, _names in {
    "black": "black charcoal jet ebony", "white": "white cream ivory", "gray": "gray grey silver ash",
    "red": "red maroon burgundy crimson wine scarlet", "orange": "orange peach coral",
    "yellow": "yellow gold golden mustard", "green": "green lime olive mint emerald",
    "blue": "blue navy teal cyan turquoise sky aqua", "purple": "purple violet lavender magenta lilac",
    "pink": "pink rose fuchsia", "brown": "brown beige tan khaki chocolate camel coffee",
}.items():
    for _n in _names.split():
        COLOR_ALIAS[_n] = _base

BRAND_ALIAS = {
    "iphone": "apple", "ipad": "apple", "macbook": "apple", "airpods": "apple", "apple": "apple", "galaxy": "samsung",
    "samsung": "samsung", "huawei": "huawei", "oppo": "oppo", "vivo": "vivo", "xiaomi": "xiaomi", "redmi": "xiaomi",
    "realme": "realme", "nokia": "nokia", "sony": "sony", "lenovo": "lenovo", "dell": "dell", "hp": "hp", "asus": "asus",
    "acer": "acer", "nike": "nike", "adidas": "adidas", "puma": "puma", "gucci": "gucci", "prada": "prada",
    "casio": "casio", "rolex": "rolex", "seiko": "seiko", "jansport": "jansport", "samsonite": "samsonite",
    "herschel": "herschel", "jbl": "jbl", "bose": "bose", "anker": "anker", "hydroflask": "hydroflask",
    "converse": "converse", "vans": "vans", "crocs": "crocs", "fila": "fila", "uniqlo": "uniqlo", "levis": "levis",
}


def _stem(w):
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


@lru_cache(maxsize=8192)
def parse(text):
    """-> (tokens, colours, brands) as frozensets; tokens are canonical (synonyms merged, plurals stripped)."""
    toks, colors, brands = set(), set(), set()
    for w in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if w in COLOR_ALIAS:
            colors.add(COLOR_ALIAS[w])
            continue
        if w in BRAND_ALIAS:
            brands.add(BRAND_ALIAS[w])
        if w in STOP or len(w) < 2:
            continue
        toks.add(CANON.get(w) or CANON.get(_stem(w)) or _stem(w))
    return frozenset(toks), frozenset(colors), frozenset(brands)


def gv(it, key):
    try:
        v = it[key]
    except (KeyError, IndexError, TypeError):
        return ""
    return "" if v is None else str(v)


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def overlap(a, b):
    return len(a & b) / min(len(a), len(b)) if a and b else 0.0


def _norm(s):
    return " ".join(re.findall(r"[a-z0-9]+", (s or "").lower()))


def _ratio(a, b):
    a, b = _norm(a), _norm(b)
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def level(score):
    return "Strong match" if score >= STRONG else "Likely match" if score >= ALERT else "Possible match"


# ------------------------------------------------------------------ photo analysis
COLOR_NAMES = ["black", "white", "gray", "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown"]


def _color_index(h, s, v):
    h, s, v = h * 360.0 / 255, s / 255.0, v / 255.0
    if v < 0.18:
        return 0
    if s < 0.12:
        return 1 if v > 0.85 else 2
    if s < 0.2 and v > 0.88:
        return 1
    if h < 15 or h >= 345:
        return 9 if (s < 0.5 and v > 0.75) else 3
    if h < 40:
        return 10 if (v < 0.62 or s < 0.38) else 4
    if h < 68:
        return 10 if v < 0.5 else 5
    if h < 165:
        return 6
    if h < 260:
        return 7
    if h < 330:
        return 8
    return 9


def photo_sig(data_url):
    """Colour profile (11 colour families, centre of the photo) + 64-bit difference hash. None if unreadable."""
    if Image is None or not data_url or not data_url.startswith("data:image/"):
        return None
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        im = Image.open(io.BytesIO(raw))
        im.load()
        im = im.convert("RGB")
        w, h = im.size
        centre = im.crop((int(w * .15), int(h * .15), max(int(w * .85), int(w * .15) + 1), max(int(h * .85), int(h * .15) + 1)))
        hsv = centre.resize((48, 48)).convert("HSV").tobytes()
        counts = [0] * len(COLOR_NAMES)
        for i in range(0, len(hsv), 3):
            counts[_color_index(hsv[i], hsv[i + 1], hsv[i + 2])] += 1
        n = float(sum(counts)) or 1.0
        px = im.convert("L").resize((9, 8)).tobytes()
        bits = 0
        for r in range(8):
            for c in range(8):
                bits = (bits << 1) | (1 if px[r * 9 + c] > px[r * 9 + c + 1] else 0)
        return {"c": [round(x / n, 3) for x in counts], "h": "%016x" % bits}
    except Exception:
        return None


def sig_names(sig, min_frac=0.2, limit=3):
    """Main colour names of a photo signature, strongest first."""
    if not sig:
        return []
    pairs = sorted(zip(sig["c"], COLOR_NAMES), reverse=True)
    out = [n for f, n in pairs if f >= min_frac][:limit]
    return out or [pairs[0][1]]


def main_colors(sig, min_frac=0.2, limit=3):
    """Like sig_names but prefers real colours over the white/grey table or wall behind the item."""
    names = sig_names(sig, min_frac, limit)
    return [n for n in names if n not in ("white", "gray")] or names[:1]


def photo_sim(a, b):
    hist = sum(min(x, y) for x, y in zip(a["c"], b["c"]))
    hs = 1 - bin(int(a["h"], 16) ^ int(b["h"], 16)).count("1") / 64.0
    return 0.75 * hist + 0.25 * max(0.0, (hs - 0.6) / 0.4), hist, hs


def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


# ------------------------------------------------------------------ pair scoring
def _dt(d, t):
    try:
        return datetime.strptime(d + " " + (t or "12:00"), "%Y-%m-%d %H:%M")
    except Exception:
        return None


def _decay(hours):
    for limit, val in ((24, 1.0), (72, .85), (168, .65), (336, .4), (720, .2)):
        if hours <= limit:
            return val
    return .05


def _time_part(lost, found):
    ld, fd = gv(lost, "event_date"), gv(found, "event_date")
    lt, ft = gv(lost, "event_time"), gv(found, "event_time")
    a, b = _dt(ld, lt if (lt and ft) else ""), _dt(fd, ft if (lt and ft) else "")
    if not a or not b:
        return None, "", False
    hrs = (b - a).total_seconds() / 3600.0
    precise = bool(lt and ft)
    if precise and hrs < -2 or (not precise and hrs < 0):
        return 0.1, "Found before it was reported lost", True
    if hrs < 0:
        hrs = 0
    if hrs < 24:
        note = "Found %d h after it was lost" % round(hrs) if precise and hrs >= 1 else "Found the same day"
    else:
        note = "Found %d day%s after it was lost" % (round(hrs / 24), "" if round(hrs / 24) == 1 else "s")
    return _decay(hrs), note, False


def _loc_part(a, b):
    ta, tb = parse(a)[0], parse(b)[0]
    na, nb = _norm(a), _norm(b)
    r = _ratio(a, b)
    r = r if r > 0.6 else r * 0.5
    contain = 0.9 if na and nb and min(len(na), len(nb)) >= 4 and (na in nb or nb in na) else 0.0
    return max(0.5 * jaccard(ta, tb) + 0.5 * overlap(ta, tb), r, contain), sorted(ta & tb)


def _text_part(lost, found):
    lt, ft = parse(gv(lost, "title"))[0], parse(gv(found, "title"))[0]
    la = lt | parse(gv(lost, "description"))[0]
    fa = ft | parse(gv(found, "description"))[0]
    title = max(jaccard(lt, ft), 0.85 * _ratio(gv(lost, "title"), gv(found, "title")))
    body = 0.5 * jaccard(la, fa) + 0.5 * overlap(la, fa)
    return (0.5 * title + 0.5 * body if (la and fa) else title), sorted(la & fa)


def _attr_part(lost, found, lsig, fsig):
    lc, lb = parse(gv(lost, "title") + " " + gv(lost, "description"))[1:]
    fc, fb = parse(gv(found, "title") + " " + gv(found, "description"))[1:]
    color, note, conflict = None, "", False
    if lc and fc:
        if lc & fc:
            color, note = 1.0, "Both are " + "/".join(sorted(lc & fc))
        else:
            color, note, conflict = 0.0, "Colours differ (%s vs %s)" % ("/".join(sorted(lc)), "/".join(sorted(fc))), True
    elif (lc and fsig) or (fc and lsig):
        stated = lc or fc
        seen = set(main_colors(fsig if lc else lsig, 0.15, 3))
        if stated & seen:
            color, note = 0.8, "Photo colours agree with the description (%s)" % "/".join(sorted(stated & seen))
        else:
            color = 0.3
    brand, bconflict = None, False
    if lb and fb:
        if lb & fb:
            brand, note = 1.0, (note + "; " if note else "") + "Same brand (%s)" % "/".join(sorted(lb & fb))
        else:
            brand, bconflict = 0.0, True
            note = (note + "; " if note else "") + "Different brands"
    parts = [(w, s) for w, s in ((0.7, color), (0.3, brand)) if s is not None]
    if not parts:
        return None, "", False, False
    return sum(w * s for w, s in parts) / sum(w for w, _ in parts), note, conflict, bconflict


WEIGHTS = {"category": .15, "text": .25, "attrs": .15, "location": .15, "time": .10, "photo": .20}
LABELS = {"category": "Category", "text": "Name & description", "attrs": "Color & brand", "location": "Location",
          "time": "Date & time", "photo": "Photo", "detail": "Private detail"}


def score_pair(lost, found, lsig=None, fsig=None):
    """Confidence (0-99) that a found report is the lost item. Returns score, parts, reasons, concerns."""
    reasons, concerns, parts, comp, private = [], [], [], {}, []

    lcat, fcat = gv(lost, "category"), gv(found, "category")
    if lcat == fcat:
        comp["category"] = 1.0
        reasons.append("Same category: " + lcat)
        gate = 1.0
    elif "Other" in (lcat, fcat):
        comp["category"], gate = 0.6, 0.9
    else:
        comp["category"], gate = 0.0, 0.5
        concerns.append("Different categories (%s vs %s)" % (lcat, fcat))

    ts, shared = _text_part(lost, found)
    comp["text"] = ts
    if shared and ts >= 0.3:
        reasons.append("Similar wording: " + ", ".join(shared[:4]))

    attrs, anote, cconf, bconf = _attr_part(lost, found, lsig, fsig)
    if attrs is not None:
        comp["attrs"] = attrs
        (concerns if (cconf or bconf) else reasons).append(anote)

    ls, lshared = _loc_part(gv(lost, "location"), gv(found, "location"))
    comp["location"] = ls
    if ls >= 0.5:
        reasons.append("Close locations" + (" (%s)" % ", ".join(lshared[:3]) if lshared else ""))
    elif ls < 0.25:
        concerns.append("Different locations")

    tsc, tnote, impossible = _time_part(lost, found)
    if tsc is not None:
        comp["time"] = tsc
        (concerns if impossible else reasons).append(tnote)

    photo_note = None
    if lsig and fsig:
        ps, hist, hs = photo_sim(lsig, fsig)
        comp["photo"] = ps
        if hs >= 0.9 and hist >= 0.6:
            reasons.append("Photos look almost identical")
        elif hist >= 0.6:
            reasons.append("Photos share a similar colour profile (%d%%)" % round(hist * 100))
        elif hist < 0.25:
            concerns.append("Photos look different")

    avail = sum(WEIGHTS[k] for k in comp)
    raw = sum(WEIGHTS[k] * comp[k] for k in comp) / avail
    evidence = 0.85 + 0.15 * (avail / sum(WEIGHTS.values()))
    mult = gate * (0.8 if cconf else 1.0) * (0.85 if bconf else 1.0) * (0.7 if impossible else 1.0)

    bonus = 0.0
    detail = None
    secret = gv(found, "secret_detail")
    if secret:
        st, sc, _ = parse(secret)
        lt, lc, _ = parse(gv(lost, "title") + " " + gv(lost, "description"))
        target, have = st | sc, lt | lc
        if target and have:
            detail = len(target & have) / len(target)
            if detail >= 0.5:
                bonus = 12
                private.append("The finder's private detail matches the lost description")
            elif detail >= 0.25:
                bonus = 6
                private.append("Part of the finder's private detail matches the description")

    # "public" never uses the finder's hidden detail, so users can't probe it by posting guesses.
    base = raw * 100 * evidence * mult
    public = int(max(0, min(99, round(base))))
    score = int(max(0, min(99, round(base + bonus))))
    for k in ("category", "text", "attrs", "location", "time", "photo"):
        parts.append({"key": k, "label": LABELS[k], "score": round(comp[k] * 100) if k in comp else None})
    return {"score": score, "public": public, "parts": parts, "reasons": [r for r in reasons if r],
            "private": private, "detail": None if detail is None else round(detail * 100),
            "concerns": [c for c in concerns if c]}


# ------------------------------------------------------------------ search
def rank_search(q, items, sigs=None, today=None):
    """Natural-language search. items: dict-likes; sigs: {item_id: signature}. -> [(item, score 0-100, why[])]."""
    sigs = sigs or {}
    qt, qc, _ = parse(q)
    ql = (q or "").lower()
    today = today or datetime.now().date()
    window = None
    if "yesterday" in ql:
        window = (today - timedelta(days=1), today)
    elif "today" in ql:
        window = (today, today)
    elif re.search(r"\b(last|past|this)\s+week\b", ql):
        window = (today - timedelta(days=7), today)
    elif re.search(r"\b(last|past|this)\s+month\b", ql):
        window = (today - timedelta(days=31), today)
    out = []
    for it in items:
        title_t = parse(gv(it, "title"))[0]
        rest_t = parse(gv(it, "description") + " " + gv(it, "category") + " " + gv(it, "location"))[0]
        pool = title_t | rest_t
        cov, hit = 0.0, []
        for t in qt:
            if t in title_t:
                cov += 1.0
                hit.append(t)
            elif t in rest_t:
                cov += 0.7
                hit.append(t)
            elif any(abs(len(x) - len(t)) <= 2 and SequenceMatcher(None, t, x).ratio() >= 0.84 for x in pool):
                cov += 0.6
                hit.append(t)
        cov = cov / len(qt) if qt else 0.0
        icolors = set(parse(gv(it, "title") + " " + gv(it, "description"))[1])
        try:
            iid = it["id"]
        except (KeyError, IndexError, TypeError):
            iid = None
        seen = set(main_colors(sigs.get(iid)))
        why = []
        boost, penalty = 0.0, 1.0
        if qc:
            if qc & icolors:
                boost = 0.25
                why.append("Color: " + "/".join(sorted(qc & icolors)))
            elif qc & seen:
                boost = 0.2
                why.append("Color in photo: " + "/".join(sorted(qc & seen)))
            elif icolors and not (qc & icolors):
                penalty = 0.6
        if hit:
            why.insert(0, "Matches: " + ", ".join(sorted(hit)[:4]))
        if cov == 0 and boost == 0:
            continue
        score = min(1.0, cov * 0.85 + boost) * penalty
        if window:
            try:
                d = datetime.strptime(gv(it, "event_date"), "%Y-%m-%d").date()
                if window[0] <= d <= window[1]:
                    why.append("Date fits your search")
                else:
                    score *= 0.6
            except Exception:
                pass
        if score >= 0.3:
            out.append((it, int(round(score * 100)), why))
    out.sort(key=lambda x: -x[1])
    return out


# ------------------------------------------------------------------ claims
def assess_claim(item, claim, match_score=None, other_pending=0):
    """Administrator aid: how well does a claim fit the report it is about?"""
    proof, ww = gv(claim, "proof"), gv(claim, "where_when")
    evt, evc, _ = parse(proof + " " + ww)
    ev = evt | evc
    secret = gv(item, "secret_detail")
    pt, pc, _ = parse(gv(item, "title") + " " + gv(item, "description"))
    pub = pt | pc
    loc, _ = _loc_part(ww, gv(item, "location")) if ww else (0.0, [])
    reasons, concerns = [], []
    plen = min(1.0, len(proof) / 140.0)
    cov_pub = len(ev & pub) / len(pub) if pub else 0.0
    extra = len(evt - pt - parse(gv(item, "location"))[0])

    if secret:
        st, sc, _ = parse(secret)
        sv = st | sc
        cov = len(ev & sv) / len(sv) if sv else 0.0
        base = 0.65 * cov + 0.15 * loc + 0.10 * min(1.0, cov_pub * 1.5) + 0.10 * plen
        if sv and cov > 0:
            shown = []   # original words (not their canonical forms) so "golden" doesn't read as "yellow"
            for w in re.findall(r"[a-z0-9]+", secret.lower()):
                c = COLOR_ALIAS.get(w) or (None if w in STOP or len(w) < 2 else CANON.get(w) or CANON.get(_stem(w)) or _stem(w))
                if c in ev and w not in shown:
                    shown.append(w)
            reasons.append("Claim mentions %d of %d words from the private verification detail (%s)" % (len(ev & sv), len(sv), ", ".join(shown[:4])))
        elif sv:
            concerns.append("None of the private verification detail appears in the claim")
        if cov == 0 and cov_pub >= 0.6:
            concerns.append("Claim only repeats the public description")
    else:
        base = min(0.7, 0.35 * min(1.0, cov_pub * 1.4) + 0.2 * loc + 0.2 * plen + 0.15 * min(1.0, extra / 6.0))
        concerns.append("The report has no private detail, so ownership can't be checked automatically")
        if cov_pub > 0:
            reasons.append("Claim agrees with the public description")
    if ww and loc >= 0.5:
        reasons.append("Place given in the claim matches the report")
    elif ww and loc < 0.25:
        concerns.append("Place given in the claim differs from the report")
    if extra >= 4:
        reasons.append("Claim adds %d specific details not in the public report" % extra)
    if len(proof) < 25:
        concerns.append("Very short explanation")
    if match_score:
        base += 0.15 * match_score / 100.0
        reasons.append("The claimant's own report was matched to this item (%d%%)" % match_score)
    if other_pending >= 3:
        concerns.append("Claimant has %d other claims waiting" % other_pending)
        base *= 0.85
    score = int(max(0, min(99, round(base * 100))))
    lvl = "Likely genuine" if score >= 70 else "Needs review" if score >= 40 else "Weak evidence"
    return {"score": score, "level": lvl, "reasons": reasons, "concerns": concerns}


# ------------------------------------------------------------------ summaries, duplicates, writing help
def _nice_date(d):
    try:
        return datetime.strptime(d, "%Y-%m-%d").strftime("%b %d, %Y").replace(" 0", " ")
    except Exception:
        return d


def _nice_time(t):
    try:
        return datetime.strptime(t, "%H:%M").strftime("%I:%M %p").lstrip("0")
    except Exception:
        return t


def summarize(it, colors=None, best=None, pending=0):
    verb = "lost" if gv(it, "kind") == "lost" else "found"
    when = _nice_date(gv(it, "event_date")) + (" at " + _nice_time(gv(it, "event_time")) if gv(it, "event_time") else "")
    text = "%s was %s at %s on %s, reported by %s." % (gv(it, "title"), verb, gv(it, "location"), when, gv(it, "poster") or "a user")
    desc = gv(it, "description").strip()
    if desc:
        text += " Description: \u201c%s\u201d." % (desc[:140] + ("\u2026" if len(desc) > 140 else ""))
    text += " Photo attached%s." % (" (main colors: %s)" % ", ".join(colors) if colors else "") if gv(it, "has_photo") in ("1", "True", "true") else " No photo."
    if gv(it, "kind") == "found":
        text += " A private verification detail is on file." if gv(it, "secret_detail") else " No private verification detail was added."
    if gv(it, "status") == "returned":
        text += " Marked as returned."
    else:
        if best:
            text += " Best AI match: %d%%." % best
        if pending:
            text += " %d claim%s waiting for verification." % (pending, "" if pending == 1 else "s")
    tags = [gv(it, "category"), verb.capitalize()]
    if gv(it, "status") == "returned":
        tags.append("Returned")
    if best and best >= ALERT and gv(it, "status") != "returned":
        tags.append("Matched")
    if pending:
        tags.append("Claim pending")
    return {"headline": "%s \u00b7 %s" % (verb.capitalize(), gv(it, "category")), "text": text, "tags": tags}


def similar_reports(a, b):
    """0-1 similarity between two reports of the same kind (duplicate detection)."""
    return (0.5 * _ratio(gv(a, "title"), gv(b, "title")) + 0.3 * _loc_part(gv(a, "location"), gv(b, "location"))[0]
            + 0.2 * (1.0 if gv(a, "category") == gv(b, "category") else 0.0))


HINTS = {
    "Phone & Electronics": ["brand and model", "case or cover color", "lock-screen wallpaper", "scratches, cracks or stickers"],
    "Wallet & Cards": ["brand or material", "what is inside (cards, cash)", "size and shape", "worn spots or stitching"],
    "Keys": ["number of keys", "keychain or charm", "type of keys", "tags or labels"],
    "Bags": ["brand and size", "zippers and pockets", "what is inside", "patches or tags"],
    "Clothing": ["type and size", "brand or label", "pattern or print", "stains or tears"],
    "Documents & IDs": ["type of document", "holder or sleeve color", "name on it (no full numbers)"],
    "Jewelry": ["metal and stones", "engraving", "size and style", "clasp or fastening"],
    "Pets": ["species and breed", "color and markings", "collar or tag", "size and age"],
    "Other": ["brand", "size", "color", "unique marks"],
}


def describe(title, category, kind, where, colors):
    """Description suggestions built only from what the person already told us (+ photo colours)."""
    title = re.sub(r"\s+", " ", (title or "").strip())
    known = parse(title)[1]
    shown = [c for c in (colors or []) if c not in known][:2]
    base = (" and ".join(shown) + " " if shown and title else "") + title
    base = (base[:1].upper() + base[1:]) if base else ""
    verb = "Lost" if kind == "lost" else "Found"
    out = []
    if base:
        out.append(base + ".")
        if where:
            out.append("%s. %s near %s." % (base, verb, where.strip()))
    return {"suggestions": out[:3], "checklist": HINTS.get(category, HINTS["Other"]), "colors": list(colors or [])}
