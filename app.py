"""FindBack - Lost & Found system. Flask + SQLite, form/board based (not chat)."""
import base64, json, os, re, secrets, sqlite3
from datetime import datetime, timedelta, timezone
from flask import Flask, Response, g, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import ai

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("FINDBACK_DB") or os.path.join(BASE, "findback.db")
CATEGORIES = ["Phone & Electronics", "Wallet & Cards", "Keys", "Bags", "Clothing",
              "Documents & IDs", "Jewelry", "Pets", "Other"]
ADMIN_EMAIL = os.environ.get("FINDBACK_ADMIN_EMAIL", "admin@findback.com").strip().lower()
ADMIN_PASSWORD = os.environ.get("FINDBACK_ADMIN_PASSWORD")  # optional; default below
DEFAULT_ADMIN_PASSWORD = "admin12345"

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True   # edited templates show up without restarting
key_path = os.path.join(BASE, ".secret_key")
if os.environ.get("FINDBACK_SECRET"):
    app.secret_key = os.environ["FINDBACK_SECRET"]
else:
    if not os.path.exists(key_path):
        open(key_path, "w").write(secrets.token_hex(32))
    app.secret_key = open(key_path).read().strip()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  PERMANENT_SESSION_LIFETIME=timedelta(days=30), MAX_CONTENT_LENGTH=4 * 1024 * 1024)


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d:
        d.close()


def init_db():
    c = sqlite3.connect(DB_PATH)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('lost','found')),
      title TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL, event_date TEXT NOT NULL, contact TEXT NOT NULL,
      secret_detail TEXT NOT NULL DEFAULT '', photo TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL,
      event_time TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS responses(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proof TEXT NOT NULL, where_when TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
    CREATE TABLE IF NOT EXISTS notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, text TEXT NOT NULL,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL, read_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_items_board ON items(status, kind, created_at);
    CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(sender_id, recipient_id);
    CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(recipient_id, read_at);
    CREATE TABLE IF NOT EXISTS matches(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lost_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      found_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      score INTEGER NOT NULL, pub_score INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','confirmed','rejected')),
      created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by INTEGER,
      UNIQUE(lost_id, found_id));
    CREATE INDEX IF NOT EXISTS idx_match_status ON matches(status, score);
    CREATE TABLE IF NOT EXISTS ai_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, user_id INTEGER,
      detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_ai_kind ON ai_events(kind, created_at);
    CREATE TABLE IF NOT EXISTS admin_seen(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      view TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY(user_id, view));
    """)
    if "sig" not in [r[1] for r in c.execute("PRAGMA table_info(items)")]:
        c.execute("ALTER TABLE items ADD COLUMN sig TEXT NOT NULL DEFAULT ''")
    if "event_time" not in [r[1] for r in c.execute("PRAGMA table_info(items)")]:
        c.execute("ALTER TABLE items ADD COLUMN event_time TEXT NOT NULL DEFAULT ''")
    # older databases were created without the role column
    if "role" not in [r[1] for r in c.execute("PRAGMA table_info(users)")]:
        c.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    row = c.execute("SELECT id FROM users WHERE email=?", (ADMIN_EMAIL,)).fetchone()
    if row is None:
        c.execute("INSERT INTO users(name,email,password_hash,created_at,role) VALUES(?,?,?,?,'admin')",
                  ("Administrator", ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD), now()))
    else:
        c.execute("UPDATE users SET role='admin' WHERE id=?", (row[0],))
        if ADMIN_PASSWORD:
            c.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(ADMIN_PASSWORD), row[0]))
    c.commit(); c.close()


def notify(user_id, kind, text, item_id=None):
    db().execute("INSERT INTO notifications(user_id,kind,text,item_id,created_at) VALUES(?,?,?,?,?)",
                 (user_id, kind, text, item_id, now()))


def notify_admins(kind, text, item_id=None):
    for a in db().execute("SELECT id FROM users WHERE role='admin'").fetchall():
        notify(a["id"], kind, text, item_id)


def now():
    return datetime.now(timezone.utc).isoformat()


def err(msg, code=400, field=None):
    return jsonify({"error": msg, "field": field}), code


@app.before_request
def auth_guard():
    g.user = None
    uid = session.get("uid")
    if uid:
        g.user = db().execute("SELECT id,name,email,role,created_at FROM users WHERE id=?", (uid,)).fetchone()
    p = request.path
    if p.startswith("/api/") and not p.startswith("/api/auth/") and not g.user:
        return err("Please log in.", 401)
    if p.startswith("/api/admin/") and g.user["role"] != "admin":
        return err("Administrators only.", 403)


def is_admin():
    return bool(g.user) and g.user["role"] == "admin"


@app.route("/")
def index():
    if not g.user: return redirect("/login")
    return redirect("/admin") if is_admin() else render_template("index.html")


@app.route("/admin")
def admin_page():
    return render_template("admin.html") if is_admin() else redirect("/login")


@app.route("/login")
def login_page():
    if g.user: return redirect("/admin" if is_admin() else "/")
    resp = app.make_response(render_template("login.html"))
    resp.headers["Cache-Control"] = "no-store"   # never show an old copy of the form (or its saved values)
    return resp


# ---------------- auth ----------------
def me():
    return {"id": g.user["id"], "name": g.user["name"], "email": g.user["email"], "role": g.user["role"],
            "created_at": g.user["created_at"]}


@app.post("/api/auth/signup")
def signup():
    d = request.get_json(silent=True) or {}
    name, email, pw = (d.get("name") or "").strip(), (d.get("email") or "").strip().lower(), d.get("password") or ""
    if len(name) < 2: return err("Enter your full name.", field="name")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email): return err("Enter a valid email.", field="email")
    if len(pw) < 8: return err("Use at least 8 characters.", field="password")
    try:
        cur = db().execute("INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)",
                           (name, email, generate_password_hash(pw), now()))
        db().commit()
    except sqlite3.IntegrityError:
        return err("That email already has an account.", 409, "email")
    session.clear(); session["uid"] = cur.lastrowid; session.permanent = True
    return jsonify({"user": {"id": cur.lastrowid, "name": name, "email": email}}), 201


@app.post("/api/auth/login")
def login():
    d = request.get_json(silent=True) or {}
    want_admin = bool(d.get("admin"))
    row = db().execute("SELECT * FROM users WHERE email=?", ((d.get("email") or "").strip().lower(),)).fetchone()
    if not row or not check_password_hash(row["password_hash"], d.get("password") or ""):
        return err("Wrong administrator email or password." if want_admin else "Wrong email or password.", 401)
    admin = row["role"] == "admin"
    if want_admin and not admin:
        return err("Wrong administrator email or password.", 401)
    if admin and not want_admin:
        return err('This is an administrator account. Use "Log in as administrator".', 403)
    session.clear(); session["uid"] = row["id"]; session.permanent = True
    return jsonify({"user": {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]},
                    "redirect": "/admin" if admin else "/"})


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/auth/me")
def auth_me():
    return jsonify({"user": me()}) if g.user else err("Not logged in.", 401)


# ---------------- items ----------------
def item_json(r, full=False):
    mine = r["user_id"] == g.user["id"]
    d = {k: r[k] for k in ("id", "kind", "title", "category", "description", "location",
                           "event_date", "event_time", "status", "created_at")}
    d["poster_id"] = r["user_id"]
    d["photo"] = r["photo"] if full or True else ""
    d["mine"] = mine
    d["poster"] = r["poster"] if "poster" in r.keys() else ""
    if mine:
        d["contact"], d["secret_detail"] = r["contact"], r["secret_detail"]
    return d


def get_item(item_id):
    return db().execute("SELECT i.*, u.name AS poster FROM items i JOIN users u ON u.id=i.user_id WHERE i.id=?",
                        (item_id,)).fetchone()


@app.get("/api/meta")
def meta():
    return jsonify({"categories": CATEGORIES})


@app.get("/api/items")
def list_items():
    a = request.args
    sql, p = ["SELECT i.*, u.name AS poster FROM items i JOIN users u ON u.id=i.user_id WHERE 1=1"], []
    if a.get("mine") == "1": sql.append("AND i.user_id=?"); p.append(g.user["id"])
    if a.get("kind") in ("lost", "found"): sql.append("AND i.kind=?"); p.append(a["kind"])
    if a.get("category") in CATEGORIES: sql.append("AND i.category=?"); p.append(a["category"])
    if a.get("status") in ("open", "returned"): sql.append("AND i.status=?"); p.append(a["status"])
    q = (a.get("q") or "").strip()
    if q:
        sql.append("AND (i.title LIKE ? OR i.description LIKE ? OR i.location LIKE ?)"); p += [f"%{q}%"] * 3
    sql.append("ORDER BY i.created_at DESC LIMIT 200")
    return jsonify({"items": [item_json(r) for r in db().execute(" ".join(sql), p)]})


@app.get("/api/stats")
def stats():
    r = db().execute("""SELECT SUM(kind='lost' AND status='open') lost, SUM(kind='found' AND status='open') found,
                        SUM(status='returned') returned FROM items""").fetchone()
    inc = db().execute("""SELECT COUNT(*) FROM responses r JOIN items i ON i.id=r.item_id
                          WHERE i.user_id=? AND r.status='pending'""", (g.user["id"],)).fetchone()[0]
    unread = db().execute("SELECT COUNT(*) FROM messages WHERE recipient_id=? AND read_at IS NULL", (g.user["id"],)).fetchone()[0]
    return jsonify({"lost": r["lost"] or 0, "found": r["found"] or 0, "returned": r["returned"] or 0, "pending": inc,
                    "unread": unread})


@app.post("/api/items")
def create_item():
    d = request.get_json(silent=True) or {}
    t = lambda k, n: (d.get(k) or "").strip()[:n]
    kind, title, loc, contact = d.get("kind"), t("title", 80), t("location", 120), t("contact", 120)
    if kind not in ("lost", "found"): return err("Choose Lost or Found.", field="kind")
    if len(title) < 3: return err("Give the item a short title.", field="title")
    if d.get("category") not in CATEGORIES: return err("Choose a category.", field="category")
    if not loc: return err("Where was it?", field="location")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", d.get("event_date") or ""): return err("Pick a date.", field="event_date")
    ev_time = (d.get("event_time") or "").strip()
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", ev_time): return err("Pick a time.", field="event_time")
    if not contact: return err("Add a phone or email for when it's matched.", field="contact")
    photo = d.get("photo") or ""
    if photo and (not re.match(r"^data:image/(jpeg|png|webp|gif);base64,", photo) or len(photo) > 1_500_000):
        return err("Photo is invalid or too large.", field="photo")
    cur = db().execute("""INSERT INTO items(user_id,kind,title,category,description,location,event_date,contact,
                          secret_detail,photo,created_at,event_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                       (g.user["id"], kind, title, d["category"], t("description", 800), loc, d["event_date"],
                        contact, t("secret_detail", 200) if kind == "found" else "", photo, now(), ev_time))
    notify_admins("new_" + kind, "New %s report: %s (by %s)" % (kind, title, g.user["name"]), cur.lastrowid)
    db().commit()
    found_matches = 0
    try:  # AI matching must never stop a report from being saved
        found_matches = run_match_for(cur.lastrowid)
        db().commit()
    except Exception:
        app.logger.exception("AI matching failed")
    return jsonify({"item": item_json(get_item(cur.lastrowid))}), 201


@app.get("/api/items/<int:item_id>")
def item_detail(item_id):
    r = get_item(item_id)
    if not r: return err("Item not found.", 404)
    out = item_json(r, True)
    mine_resp = db().execute("SELECT status FROM responses WHERE item_id=? AND user_id=? ORDER BY id DESC LIMIT 1",
                             (item_id, g.user["id"])).fetchone()
    out["my_response"] = mine_resp["status"] if mine_resp else None
    return jsonify({"item": out})


@app.patch("/api/items/<int:item_id>")
def update_item(item_id):
    r = get_item(item_id)
    if not r or r["user_id"] != g.user["id"]: return err("Item not found.", 404)
    return err("Only an administrator can change a report's status.", 403)


@app.delete("/api/items/<int:item_id>")
def delete_item(item_id):
    r = get_item(item_id)
    if not r or r["user_id"] != g.user["id"]: return err("Item not found.", 404)
    db().execute("DELETE FROM items WHERE id=?", (item_id,)); db().commit()
    return jsonify({"ok": True})


# ---------------- administrator ----------------
@app.get("/api/admin/overview")
def admin_overview():
    r = db().execute("""SELECT
        (SELECT COUNT(*) FROM users WHERE role!='admin') AS users,
        (SELECT COUNT(*) FROM items WHERE kind='lost' AND status='open') AS lost,
        (SELECT COUNT(*) FROM items WHERE kind='found' AND status='open') AS found,
        (SELECT COUNT(*) FROM items WHERE status='returned') AS returned,
        (SELECT COUNT(*) FROM responses WHERE status='pending') AS pending,
        (SELECT COUNT(*) FROM matches m JOIN items l ON l.id=m.lost_id JOIN items f ON f.id=m.found_id
           WHERE m.status='suggested' AND l.status='open' AND f.status='open') AS review""").fetchone()
    out = dict(r)
    for kind in ("lost", "found"):
        row = db().execute("SELECT seen_at FROM admin_seen WHERE user_id=? AND view=?", (g.user["id"], kind)).fetchone()
        if row is None:  # first visit: nothing counts as new yet
            db().execute("INSERT OR IGNORE INTO admin_seen(user_id,view,seen_at) VALUES(?,?,?)", (g.user["id"], kind, now()))
            db().commit()
            out["new_" + kind] = 0
        else:
            out["new_" + kind] = db().execute("SELECT COUNT(*) FROM items WHERE kind=? AND created_at>?", (kind, row["seen_at"])).fetchone()[0]
    return jsonify(out)


@app.post("/api/admin/seen")
def admin_seen():
    view = (request.get_json(silent=True) or {}).get("view")
    if view not in ("lost", "found"): return err("Unknown view.")
    db().execute("INSERT OR REPLACE INTO admin_seen(user_id,view,seen_at) VALUES(?,?,?)", (g.user["id"], view, now()))
    db().commit()
    return jsonify({"ok": True})


@app.delete("/api/admin/messages/<int:mid>")
def admin_delete_message(mid):
    cur = db().execute("DELETE FROM messages WHERE id=? AND (sender_id=? OR recipient_id=?)", (mid, g.user["id"], g.user["id"]))
    db().commit()
    if not cur.rowcount: return err("Message not found.", 404)
    return jsonify({"ok": True})


@app.delete("/api/admin/conversations/<int:uid>")
def admin_delete_conversation(uid):
    me_id = g.user["id"]
    db().execute("DELETE FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)", (me_id, uid, uid, me_id))
    db().commit()
    return jsonify({"ok": True})


@app.get("/api/admin/items")
def admin_items():
    return jsonify({"items": [d for _, d in admin_item_rows(500)]})


@app.patch("/api/admin/items/<int:item_id>")
def admin_update_item(item_id):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in ("open", "returned"): return err("Invalid status.")
    old = get_item(item_id)
    cur = db().execute("UPDATE items SET status=? WHERE id=?", (status, item_id))
    if old and old["status"] != "returned" and status == "returned":
        notify(old["user_id"], "returned", "Your %s report \u201c%s\u201d was marked as returned." % (old["kind"], old["title"]), item_id)
    db().commit()
    return jsonify({"ok": True}) if cur.rowcount else err("Item not found.", 404)


@app.delete("/api/admin/items/<int:item_id>")
def admin_delete_item(item_id):
    cur = db().execute("DELETE FROM items WHERE id=?", (item_id,)); db().commit()
    return jsonify({"ok": True}) if cur.rowcount else err("Item not found.", 404)


@app.get("/api/admin/users")
def admin_users():
    rows = db().execute("""SELECT u.id, u.name, u.email, u.created_at,
                           (SELECT COUNT(*) FROM items WHERE user_id=u.id) AS reports
                           FROM users u WHERE u.role!='admin' ORDER BY u.created_at DESC LIMIT 500""")
    return jsonify({"users": [dict(r) for r in rows]})


@app.delete("/api/admin/users/<int:uid>")
def admin_delete_user(uid):
    cur = db().execute("DELETE FROM users WHERE id=? AND role!='admin'", (uid,)); db().commit()
    return jsonify({"ok": True}) if cur.rowcount else err("User not found.", 404)


@app.get("/api/admin/responses")
def admin_responses():
    rows = db().execute("""SELECT r.id, r.status, r.created_at, i.title, i.kind, ru.name AS responder, ou.name AS owner
                           FROM responses r JOIN items i ON i.id=r.item_id
                           JOIN users ru ON ru.id=r.user_id JOIN users ou ON ou.id=i.user_id
                           ORDER BY r.created_at DESC LIMIT 500""")
    return jsonify({"responses": [dict(r) for r in rows]})


# ---------------- account settings ----------------
@app.patch("/api/account")
def account_update():
    d = request.get_json(silent=True) or {}
    name, email = (d.get("name") or "").strip(), (d.get("email") or "").strip().lower()
    if len(name) < 2: return err("Enter your full name.", field="name")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email): return err("Enter a valid email.", field="email")
    try:
        db().execute("UPDATE users SET name=?, email=? WHERE id=?", (name, email, g.user["id"])); db().commit()
    except sqlite3.IntegrityError:
        return err("That email already has an account.", 409, "email")
    return jsonify({"user": {"id": g.user["id"], "name": name, "email": email}})


@app.post("/api/account/password")
def account_password():
    d = request.get_json(silent=True) or {}
    row = db().execute("SELECT password_hash FROM users WHERE id=?", (g.user["id"],)).fetchone()
    if not check_password_hash(row["password_hash"], d.get("current") or ""):
        return err("Current password is wrong.", field="current")
    new = d.get("new") or ""
    if len(new) < 8: return err("Use at least 8 characters.", field="new")
    db().execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), g.user["id"])); db().commit()
    return jsonify({"ok": True})


@app.delete("/api/account")
def account_delete():
    if is_admin(): return err("Administrator accounts can't be deleted here.", 403)
    d = request.get_json(silent=True) or {}
    row = db().execute("SELECT password_hash FROM users WHERE id=?", (g.user["id"],)).fetchone()
    if not check_password_hash(row["password_hash"], d.get("password") or ""):
        return err("Password is wrong.", field="password")
    db().execute("DELETE FROM users WHERE id=?", (g.user["id"],)); db().commit()
    session.clear()
    return jsonify({"ok": True})


# ---------------- messages (real one-to-one chat) ----------------
def msg_user(uid):
    """Chat is only allowed between an administrator and a regular user."""
    r = db().execute("SELECT id,name,role FROM users WHERE id=?", (uid,)).fetchone()
    if r and (r["role"] == "admin") != is_admin():
        return r
    return None


@app.get("/api/support")
def support():
    a = db().execute("SELECT id,name FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
    return jsonify({"admin": {"id": a["id"], "name": a["name"]}})


@app.get("/api/conversations")
def conversations():
    me_id = g.user["id"]
    rows = db().execute("""SELECT id, sender_id, recipient_id, body, created_at FROM messages
                           WHERE sender_id=? OR recipient_id=? ORDER BY id DESC""", (me_id, me_id)).fetchall()
    last = {}
    for r in rows:
        other = r["recipient_id"] if r["sender_id"] == me_id else r["sender_id"]
        last.setdefault(other, r)
    unread = {r["sender_id"]: r["n"] for r in db().execute(
        "SELECT sender_id, COUNT(*) n FROM messages WHERE recipient_id=? AND read_at IS NULL GROUP BY sender_id", (me_id,))}
    out = []
    for other, r in last.items():
        u = db().execute("SELECT id,name FROM users WHERE id=?", (other,)).fetchone()
        if not u: continue
        out.append({"user": {"id": u["id"], "name": u["name"]},
                    "last": {"body": r["body"], "created_at": r["created_at"], "mine": r["sender_id"] == me_id},
                    "unread": unread.get(other, 0)})
    return jsonify({"conversations": out})


@app.get("/api/messages/<int:uid>")
def thread(uid):
    u = msg_user(uid)
    if not u or uid == g.user["id"]: return err("User not found.", 404)
    me_id = g.user["id"]
    db().execute("UPDATE messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at IS NULL", (now(), uid, me_id))
    db().commit()
    rows = db().execute("""SELECT m.id, m.sender_id, m.body, m.created_at, m.item_id, i.title AS item_title
                           FROM messages m LEFT JOIN items i ON i.id=m.item_id
                           WHERE (m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?)
                           ORDER BY m.id ASC LIMIT 500""", (me_id, uid, uid, me_id)).fetchall()
    return jsonify({"user": {"id": u["id"], "name": u["name"]},
                    "messages": [{"id": r["id"], "mine": r["sender_id"] == me_id, "body": r["body"],
                                  "created_at": r["created_at"], "item_id": r["item_id"],
                                  "item_title": r["item_title"]} for r in rows]})


@app.post("/api/messages")
def send_message():
    d = request.get_json(silent=True) or {}
    try: to = int(d.get("to"))
    except (TypeError, ValueError): return err("Choose who to message.")
    body = (d.get("body") or "").strip()[:1000]
    if not body: return err("Type a message first.", field="body")
    if to == g.user["id"] or not msg_user(to): return err("User not found.", 404)
    item_id = d.get("item_id")
    if item_id is not None:
        try: item_id = int(item_id)
        except (TypeError, ValueError): item_id = None
        if item_id is not None and not get_item(item_id): item_id = None
    cur = db().execute("INSERT INTO messages(sender_id,recipient_id,item_id,body,created_at) VALUES(?,?,?,?,?)",
                       (g.user["id"], to, item_id, body, now())); db().commit()
    return jsonify({"id": cur.lastrowid}), 201


# ---------------- verification responses (structured, not messages) ----------------
@app.post("/api/items/<int:item_id>/responses")
def create_response(item_id):
    r = get_item(item_id)
    if not r: return err("Item not found.", 404)
    if r["user_id"] == g.user["id"]: return err("You can't respond to your own report.")
    if r["status"] != "open": return err("This item has already been returned.")
    d = request.get_json(silent=True) or {}
    proof, ww, contact = (d.get("proof") or "").strip()[:500], (d.get("where_when") or "").strip()[:200], (d.get("contact") or "").strip()[:120]
    if len(proof) < 10: return err("Describe something only the real owner/finder would know (10+ characters).", field="proof")
    if not contact: return err("Add a phone or email.", field="contact")
    if db().execute("SELECT 1 FROM responses WHERE item_id=? AND user_id=? AND status='pending'",
                    (item_id, g.user["id"])).fetchone():
        return err("You already have a pending response on this item.", 409)
    db().execute("INSERT INTO responses(item_id,user_id,proof,where_when,contact,created_at) VALUES(?,?,?,?,?,?)",
                 (item_id, g.user["id"], proof, ww, contact, now()))
    notify(r["user_id"], "new_claim", "Someone responded to your %s report \u201c%s\u201d. Review it in Account > My reports." % (r["kind"], r["title"]), item_id)
    db().commit()
    return jsonify({"ok": True}), 201


@app.get("/api/responses")
def list_responses():
    box = request.args.get("box", "incoming")
    base = """SELECT r.*, i.title, i.kind, i.photo, i.contact AS owner_contact, i.secret_detail, i.user_id AS owner_id,
              u.name AS responder FROM responses r JOIN items i ON i.id=r.item_id JOIN users u ON u.id=r.user_id """
    rows = db().execute(base + ("WHERE i.user_id=? " if box == "incoming" else "WHERE r.user_id=? ") +
                        "ORDER BY r.created_at DESC", (g.user["id"],)).fetchall()
    out = []
    for r in rows:
        d = {k: r[k] for k in ("id", "item_id", "title", "kind", "photo", "proof", "where_when", "status", "created_at", "responder")}
        if box == "incoming":
            d["contact"], d["secret_detail"] = r["contact"], r["secret_detail"]
        elif r["status"] == "approved":
            d["owner_contact"] = r["owner_contact"]
        out.append(d)
    return jsonify({"responses": out})


def apply_decision(r, dec, by_admin=False):
    """Approve or decline a claim. r needs id, item_id, user_id (claimant)."""
    it = get_item(r["item_id"])
    if dec == "approve":
        db().execute("UPDATE responses SET status='approved' WHERE id=?", (r["id"],))
        db().execute("UPDATE responses SET status='declined' WHERE item_id=? AND id!=? AND status='pending'", (r["item_id"], r["id"]))
        db().execute("UPDATE items SET status='returned' WHERE id=?", (r["item_id"],))
        if it:
            notify(r["user_id"], "returned", "Your response on \u201c%s\u201d was approved. The item is marked as returned." % it["title"], r["item_id"])
            if by_admin:
                notify(it["user_id"], "returned", "An administrator verified a claim on \u201c%s\u201d. The item is marked as returned; contact details are in Account > My reports." % it["title"], r["item_id"])
    else:
        db().execute("UPDATE responses SET status='declined' WHERE id=?", (r["id"],))
        if it and by_admin:
            notify(r["user_id"], "declined", "Your response on \u201c%s\u201d was declined after verification." % it["title"], r["item_id"])
    db().commit()


@app.post("/api/responses/<int:rid>/decision")
def decide(rid):
    r = db().execute("SELECT r.*, i.user_id AS owner_id FROM responses r JOIN items i ON i.id=r.item_id WHERE r.id=?", (rid,)).fetchone()
    if not r or r["owner_id"] != g.user["id"]: return err("Response not found.", 404)
    if r["status"] != "pending": return err("Already decided.")
    dec = (request.get_json(silent=True) or {}).get("decision")
    if dec not in ("approve", "decline"): return err("Invalid decision.")
    apply_decision(r, dec)
    return jsonify({"ok": True})


@app.get("/api/notifications")
def notifications():
    rows = db().execute("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30", (g.user["id"],)).fetchall()
    unread = db().execute("SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL", (g.user["id"],)).fetchone()[0]
    return jsonify({"unread": unread, "notifications": [
        {"id": r["id"], "kind": r["kind"], "text": r["text"], "item_id": r["item_id"],
         "created_at": r["created_at"], "read": r["read_at"] is not None} for r in rows]})


@app.post("/api/notifications/read")
def notifications_read():
    db().execute("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", (now(), g.user["id"]))
    db().commit()
    return jsonify({"ok": True})


# =====================================================================================
# AI: photos, matching, search, assistant, claim verification
# =====================================================================================
LIGHT_SQL = ("SELECT i.id, i.user_id, i.kind, i.title, i.category, i.description, i.location, i.event_date, i.event_time, "
             "i.status, i.created_at, i.contact, i.secret_detail, i.sig, (i.photo<>'') AS has_photo, "
             "u.name AS poster, u.email AS poster_email")
LIGHT_FROM = " FROM items i JOIN users u ON u.id=i.user_id"
ADMIN_EXTRA = """, (SELECT COUNT(*) FROM responses r WHERE r.item_id=i.id AND r.status='pending') AS pending_claims,
    (SELECT MAX(m.score) FROM matches m WHERE (m.lost_id=i.id OR m.found_id=i.id) AND m.status!='rejected') AS best_match,
    (SELECT ru.name FROM responses r JOIN users ru ON ru.id=r.user_id WHERE r.item_id=i.id AND r.status='approved'
       ORDER BY r.id DESC LIMIT 1) AS returned_to"""


def get_light(item_id):
    return db().execute(LIGHT_SQL + LIGHT_FROM + " WHERE i.id=?", (item_id,)).fetchone()


def open_items(kind=None, exclude_user=None):
    sql, p = LIGHT_SQL + LIGHT_FROM + " WHERE i.status='open'", []
    if kind: sql += " AND i.kind=?"; p.append(kind)
    if exclude_user is not None: sql += " AND i.user_id!=?"; p.append(exclude_user)
    return db().execute(sql + " ORDER BY i.created_at DESC LIMIT 500", p).fetchall()


def card(r, admin=False):
    """A report as the interface needs it. Contact and hidden detail only for administrators."""
    d = {k: r[k] for k in ("id", "kind", "title", "category", "description", "location", "event_date", "event_time",
                           "status", "created_at")}
    d["poster_id"], d["poster"] = r["user_id"], r["poster"]
    d["photo_url"] = "/photo/%d" % r["id"] if r["has_photo"] else ""
    if admin:
        d["contact"], d["secret_detail"], d["poster_email"] = r["contact"], r["secret_detail"], r["poster_email"]
    return d


def admin_item_rows(limit=500):
    rows = db().execute(LIGHT_SQL + ADMIN_EXTRA + LIGHT_FROM + " ORDER BY i.created_at DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = card(r, admin=True)
        d.update(pending_claims=r["pending_claims"], best_match=r["best_match"], returned_to=r["returned_to"])
        out.append((r, d))
    return out


def log_ai(kind, detail="", user_id=None):
    db().execute("INSERT INTO ai_events(kind,user_id,detail,created_at) VALUES(?,?,?,?)", (kind, user_id, detail[:200], now()))


@app.get("/photo/<int:item_id>")
def photo(item_id):
    """Report photos are served as real images (cacheable) instead of being embedded in every JSON list."""
    if not g.user: return ("", 401)
    r = db().execute("SELECT photo FROM items WHERE id=?", (item_id,)).fetchone()
    m = re.match(r"^data:(image/(?:jpeg|png|webp|gif));base64,(.+)$", (r["photo"] if r else "") or "", re.S)
    if not m: return ("", 404)
    try: raw = base64.b64decode(m.group(2))
    except Exception: return ("", 404)
    resp = Response(raw, mimetype=m.group(1))
    resp.headers["Cache-Control"] = "private, max-age=86400"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return resp


def item_sig(row):
    """Photo signature of a report (computed once, then cached in the items table)."""
    cache = g.setdefault("sigs", {})
    if row["id"] in cache: return cache[row["id"]]
    s = row["sig"]
    if s == "":
        if not ai.HAVE_PHOTO: return None          # nothing cached, so installing Pillow later still works
        ph = db().execute("SELECT photo FROM items WHERE id=?", (row["id"],)).fetchone()
        sig = ai.photo_sig(ph["photo"]) if ph and ph["photo"] else None
        s = json.dumps(sig) if sig else "none"
        db().execute("UPDATE items SET sig=? WHERE id=?", (s, row["id"]))
    cache[row["id"]] = None if s == "none" else json.loads(s)
    return cache[row["id"]]


def save_match(lost, found, res):
    """Insert or refresh a suggestion. True when new. Matches an administrator already reviewed are left alone."""
    det = json.dumps({k: res[k] for k in ("parts", "reasons", "private", "detail", "concerns")})
    row = db().execute("SELECT id,status FROM matches WHERE lost_id=? AND found_id=?", (lost["id"], found["id"])).fetchone()
    if row is None:
        db().execute("INSERT INTO matches(lost_id,found_id,score,pub_score,detail,created_at) VALUES(?,?,?,?,?,?)",
                     (lost["id"], found["id"], res["score"], res["public"], det, now()))
        return True
    if row["status"] == "suggested":
        db().execute("UPDATE matches SET score=?, pub_score=?, detail=? WHERE id=?", (res["score"], res["public"], det, row["id"]))
    return False


def announce(lost, found, res):
    """New strong match: tell the administrators, and the owner of the lost item."""
    notify_admins("ai_match", "AI match %d%%: lost \u201c%s\u201d may be the found \u201c%s\u201d." % (res["score"], lost["title"], found["title"]), found["id"])
    log_ai("match", "%d%% \u00b7 lost \u201c%s\u201d \u2194 found \u201c%s\u201d" % (res["score"], lost["title"], found["title"]))


def run_match_for(item_id, notify_users=True):
    """Compare one report with every open report of the opposite kind. Returns how many new suggestions."""
    it = get_light(item_id)
    if not it or it["status"] != "open": return 0
    created = 0
    for other in open_items("found" if it["kind"] == "lost" else "lost", exclude_user=it["user_id"]):
        lost, found = (it, other) if it["kind"] == "lost" else (other, it)
        res = ai.score_pair(lost, found, item_sig(lost), item_sig(found))
        if res["score"] < ai.MIN_STORE: continue
        if save_match(lost, found, res):
            created += 1
            if notify_users and res["score"] >= ai.ALERT: announce(lost, found, res)
    return created


def scan_all(notify_users=True):
    lost, found = open_items("lost"), open_items("found")
    compared = created = 0
    for l in lost:
        for f in found:
            if l["user_id"] == f["user_id"]: continue
            compared += 1
            res = ai.score_pair(l, f, item_sig(l), item_sig(f))
            if res["score"] < ai.MIN_STORE: continue
            if save_match(l, f, res):
                created += 1
                if notify_users and res["score"] >= ai.ALERT: announce(l, f, res)
    log_ai("scan", "Compared %d pairs, %d new suggestions" % (compared, created))
    db().commit()
    return compared, created


def bootstrap_ai():
    """Existing reports are matched once on start-up (silently) so the screens aren't empty after an upgrade."""
    with app.app_context():
        c = db()
        if c.execute("SELECT 1 FROM ai_events WHERE kind='scan' LIMIT 1").fetchone() is None and c.execute("SELECT 1 FROM items LIMIT 1").fetchone():
            try: scan_all(notify_users=False)
            except Exception: app.logger.exception("initial AI scan failed")


def match_json(m, lost, found, admin):
    det = json.loads(m["detail"] or "{}")
    parts, reasons = list(det.get("parts", [])), list(det.get("reasons", []))
    if admin:
        if det.get("detail") is not None: parts.append({"key": "detail", "label": ai.LABELS["detail"], "score": det["detail"]})
        reasons += det.get("private", [])
    score = m["score"] if admin else m["pub_score"]
    return {"id": m["id"], "score": score, "level": ai.level(score), "status": m["status"], "created_at": m["created_at"],
            "parts": parts, "reasons": reasons, "concerns": det.get("concerns", []), "lost": lost, "found": found}


# ---------------- administrator: matching, flags, summaries, analytics ----------------
def compute_flags():
    rows = db().execute(LIGHT_SQL + LIGHT_FROM + " ORDER BY i.created_at DESC LIMIT 500").fetchall()
    flags = []
    iso = datetime.fromisoformat
    ref = lambda r: {"id": r["id"], "title": r["title"], "kind": r["kind"]}

    def add(kind, sev, title, detail, uid, uname, items=()):
        flags.append({"id": "%s-%s-%s" % (kind, uid, "-".join(str(i["id"]) for i in items)), "type": kind, "severity": sev,
                      "title": title, "detail": detail, "user": {"id": uid, "name": uname}, "items": list(items)})

    by_user = {}
    for r in rows: by_user.setdefault(r["user_id"], []).append(r)
    for uid, items in by_user.items():
        for a in range(len(items)):
            for b in range(a + 1, len(items)):
                x, y = items[a], items[b]
                if x["kind"] != y["kind"] or abs(iso(x["created_at"]) - iso(y["created_at"])) > timedelta(days=14): continue
                if ai.similar_reports(x, y) >= 0.8:
                    add("duplicate", "medium", "Possible duplicate report", "%s posted two very similar %s reports: \u201c%s\u201d and \u201c%s\u201d." % (x["poster"], x["kind"], x["title"], y["title"]),
                        uid, x["poster"], [ref(x), ref(y)])
        times = sorted(iso(r["created_at"]) for r in items)
        for i in range(len(times) - 4):
            if times[i + 4] - times[i] <= timedelta(hours=24):
                add("burst", "high", "Many reports in one day", "%s posted 5 or more reports within 24 hours." % items[0]["poster"], uid, items[0]["poster"])
                break
    for r in rows:
        if r["status"] == "open" and not r["has_photo"] and len(r["description"].strip()) < 10:
            add("thin", "low", "Very little detail", "\u201c%s\u201d has no photo and almost no description, so it is hard to match." % r["title"], r["user_id"], r["poster"], [ref(r)])
    pics = [(r, item_sig(r)) for r in rows if r["has_photo"]]
    pics = [(r, s) for r, s in pics if s]
    for i in range(len(pics)):
        for j in range(i + 1, len(pics)):
            (x, sx), (y, sy) = pics[i], pics[j]
            if x["user_id"] != y["user_id"] and ai.hamming(sx["h"], sy["h"]) <= 3 and ai.photo_sim(sx, sy)[1] >= 0.9:
                add("photo", "medium", "Same photo on two reports", "\u201c%s\u201d (%s) and \u201c%s\u201d (%s) use what looks like the same photo." % (x["title"], x["poster"], y["title"], y["poster"]),
                    y["user_id"], y["poster"], [ref(x), ref(y)])
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    for r in db().execute("""SELECT r.user_id, u.name, COUNT(*) n FROM responses r JOIN users u ON u.id=r.user_id
                             WHERE r.status='pending' AND r.created_at>=? GROUP BY r.user_id HAVING n>=3""", (since,)):
        add("claims", "high", "Many claims in one day", "%s sent %d claims in the last 24 hours." % (r["name"], r["n"]), r["user_id"], r["name"])
    for r in db().execute("""SELECT r.user_id, u.name, COUNT(*) n FROM responses r JOIN users u ON u.id=r.user_id
                             WHERE r.status='declined' GROUP BY r.user_id HAVING n>=3"""):
        add("claims", "medium", "Repeatedly declined claims", "%s has %d declined claims." % (r["name"], r["n"]), r["user_id"], r["name"])
    flags.sort(key=lambda f: {"high": 0, "medium": 1, "low": 2}[f["severity"]])
    return flags


def analytics():
    one = lambda sql, p=(): db().execute(sql, p).fetchone()
    a = {"items_open": one("SELECT COUNT(*) FROM items WHERE status='open'")[0],
         "with_photo": one("SELECT COUNT(*) FROM items WHERE photo<>''")[0],
         "photo_ready": one("SELECT COUNT(*) FROM items WHERE sig NOT IN ('','none')")[0],
         "scans": one("SELECT COUNT(*) FROM ai_events WHERE kind='scan'")[0],
         "last_scan": one("SELECT MAX(created_at) FROM ai_events WHERE kind='scan'")[0]}
    m = one("""SELECT COUNT(*), COALESCE(SUM(status='suggested'),0), COALESCE(SUM(status='confirmed'),0), COALESCE(SUM(status='rejected'),0),
               COALESCE(AVG(score),0), COALESCE(SUM(score>=?),0), COALESCE(SUM(score BETWEEN 40 AND 59),0),
               COALESCE(SUM(score BETWEEN 60 AND 74),0), COALESCE(SUM(score BETWEEN 75 AND 89),0), COALESCE(SUM(score>=90),0) FROM matches""", (ai.STRONG,))
    a.update(total=m[0], suggested=m[1], verified=m[2], rejected=m[3], avg=round(m[4]), strong=m[5], buckets=[m[6], m[7], m[8], m[9]])
    a["review"] = one("""SELECT COUNT(*) FROM matches m JOIN items l ON l.id=m.lost_id JOIN items f ON f.id=m.found_id
                         WHERE m.status='suggested' AND l.status='open' AND f.status='open'""")[0]
    a["verify_rate"] = round(100 * m[2] / (m[2] + m[3])) if (m[2] + m[3]) else None
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    cnt = {r[0]: r[1] for r in db().execute("SELECT substr(created_at,1,10), COUNT(*) FROM matches WHERE created_at>=? GROUP BY 1", (days[0],))}
    a["daily"] = [{"day": d, "n": cnt.get(d, 0)} for d in days]
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    use = {r[0]: r[1] for r in db().execute("SELECT kind, COUNT(*) FROM ai_events WHERE kind IN ('search','chat','describe') AND created_at>=? GROUP BY kind", (since,))}
    a["usage"] = {k: use.get(k, 0) for k in ("search", "chat", "describe")}
    a["recent"] = [dict(r) for r in db().execute("SELECT kind, detail, created_at FROM ai_events WHERE kind IN ('scan','match','review') ORDER BY id DESC LIMIT 10")]
    return a


def admin_matches():
    cache, out = {}, []
    light = lambda i: cache.get(i) or cache.setdefault(i, get_light(i))
    for m in db().execute("SELECT * FROM matches ORDER BY score DESC, id DESC LIMIT 300").fetchall():
        l, f = light(m["lost_id"]), light(m["found_id"])
        if not l or not f: continue
        j = match_json(m, card(l, True), card(f, True), admin=True)
        j["active"] = l["status"] == "open" and f["status"] == "open"
        out.append(j)
    return out


@app.get("/api/admin/ai")
def admin_ai():
    if db().execute("SELECT 1 FROM ai_events WHERE kind='scan' LIMIT 1").fetchone() is None:
        scan_all(notify_users=False)
    summaries = []
    for r, d in admin_item_rows(12):
        cols = ai.main_colors(item_sig(r)) if r["has_photo"] else []
        summaries.append({"item": d, "summary": ai.summarize(r, cols, r["best_match"], r["pending_claims"])})
    out = {"matches": admin_matches(), "summaries": summaries, "flags": compute_flags(), "analytics": analytics(), "photo_analysis": ai.HAVE_PHOTO}
    db().commit()
    return jsonify(out)


@app.post("/api/admin/ai/scan")
def admin_scan():
    compared, created = scan_all()
    return jsonify({"compared": compared, "created": created})


@app.post("/api/admin/matches/<int:mid>/review")
def admin_review_match(mid):
    dec = (request.get_json(silent=True) or {}).get("decision")
    m = db().execute("SELECT * FROM matches WHERE id=?", (mid,)).fetchone()
    if not m: return err("Match not found.", 404)
    if dec not in ("confirm", "reject", "reset"): return err("Invalid decision.")
    status = {"confirm": "confirmed", "reject": "rejected", "reset": "suggested"}[dec]
    db().execute("UPDATE matches SET status=?, reviewed_at=?, reviewed_by=? WHERE id=?",
                 (status, None if dec == "reset" else now(), None if dec == "reset" else g.user["id"], mid))
    l, f = get_light(m["lost_id"]), get_light(m["found_id"])
    if l and f:
        log_ai("review", "%s \u00b7 lost \u201c%s\u201d \u2194 found \u201c%s\u201d" % ({"confirm": "Verified", "reject": "Rejected", "reset": "Reopened"}[dec], l["title"], f["title"]))
    db().commit()
    return jsonify({"ok": True})


@app.get("/api/admin/claims")
def admin_claims():
    rows = db().execute("""SELECT r.id, r.item_id, r.user_id, r.proof, r.where_when, r.contact, r.status, r.created_at,
                           cu.name AS cname, cu.email AS cemail FROM responses r JOIN users cu ON cu.id=r.user_id
                           ORDER BY r.created_at DESC LIMIT 300""").fetchall()
    cache, out = {}, []
    for r in rows:
        it = cache.get(r["item_id"]) or cache.setdefault(r["item_id"], get_light(r["item_id"]))
        if not it: continue
        if it["kind"] == "found":
            ms = db().execute("""SELECT MAX(m.score) FROM matches m JOIN items l ON l.id=m.lost_id
                                 WHERE m.found_id=? AND l.user_id=? AND m.status!='rejected'""", (it["id"], r["user_id"])).fetchone()[0]
        else:
            ms = db().execute("""SELECT MAX(m.score) FROM matches m JOIN items f ON f.id=m.found_id
                                 WHERE m.lost_id=? AND f.user_id=? AND m.status!='rejected'""", (it["id"], r["user_id"])).fetchone()[0]
        other = db().execute("SELECT COUNT(*) FROM responses WHERE user_id=? AND status='pending' AND id!=?", (r["user_id"], r["id"])).fetchone()[0]
        out.append({"id": r["id"], "status": r["status"], "created_at": r["created_at"], "proof": r["proof"], "where_when": r["where_when"],
                    "contact": r["contact"], "claimant": {"id": r["user_id"], "name": r["cname"], "email": r["cemail"]},
                    "item": card(it, True), "ai": ai.assess_claim(it, r, ms, other)})
    return jsonify({"claims": out})


@app.post("/api/admin/claims/<int:rid>/decision")
def admin_claim_decision(rid):
    r = db().execute("SELECT * FROM responses WHERE id=?", (rid,)).fetchone()
    if not r: return err("Claim not found.", 404)
    if r["status"] != "pending": return err("Already decided.")
    dec = (request.get_json(silent=True) or {}).get("decision")
    if dec not in ("approve", "decline"): return err("Invalid decision.")
    apply_decision(r, dec, by_admin=True)
    return jsonify({"ok": True})


init_db()
bootstrap_ai()
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FINDBACK_DEBUG") == "1")
