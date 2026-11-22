FindBack - Lost & Found System (Flask + SQLite)

Run
  1. pip install -r requirements.txt
  2. python app.py   ->  http://127.0.0.1:5000

How it works
  - Sign up / log in.
  - Report a LOST or FOUND item (category, place, date, time, photo).
  - Found items can have a "hidden detail" only you see (e.g. wallpaper, scratch, serial)
    so you can verify the real owner.
  - On an item press "This is mine" (found item) or "I found this" (lost item) and fill
    in a short verification form.
  - The poster sees it in Account > Responses and presses Approve or Decline.
    Approve = item marked Returned and both sides see each other's contact details.
  - Messages are only between a user and the administrator (support chat). Users cannot message each other.

Administrator
  - On the login page press "Log in as administrator".
  - Default account: admin@findback.com / admin12345 (created automatically on first run).
    Change it before sharing the app:  set FINDBACK_ADMIN_EMAIL and FINDBACK_ADMIN_PASSWORD
    environment variables, then start the app (the password is reset to that value on every start).
  - Admin page (/admin): see v7 below. Admins now see every report in full (contact and hidden detail included)
    so they can verify claims. Admin > Messages is the support inbox.

Interface (v4)
  - Top navigation: Home, Message, Account (the admin page keeps its sidebar).
  - Home: tabs (Overview / Lost / Found / Returned) showing only your own reports; Overview shows your latest report plus the latest found and lost photo with category only; no search bar. Old line:
    "Latest lost items" (photo + name only), and the report form on the right
    (with date and time).
  - Message: conversation list, chat bubbles, unread badge, Enter to send.
  - Account: profile info, change password, log out, delete account.
    My reports and Responses (approve / decline) are tabs there.
  - Suggested matches were removed from the user interface.

v6: Account tabs are Account / My reports (with Responses) / Settings. Overview shows the 5 latest found and 5 latest lost items (everyone's, picture + category only). Delete/approve use styled dialogs instead of browser pop-ups.


v7: AI item matching, claim verification, new dashboards
  Needs Pillow for photo analysis:  pip install -r requirements.txt   (without it everything works except photo comparison)

  User GUI
  - Log out button sits next to the notification bell (top right).
  - Dashboard > Overview: a 300px statistics square (donut of open lost / open found / returned, plus your report count
    and claims waiting for you).
  - Item matching (top navigation, badge = strong matches waiting):
      AI-powered search            natural-language search (colors, places, "yesterday", typos, photo colors)
      Possible matching alerts     strong matches (60%+) for your lost reports; the bell also notifies you
      Recommended found items      weaker matches, or the latest found items if there are none
      Match details + claim        side-by-side comparison, reasons, confidence breakdown, then "This is mine"
      Suggested descriptions       built from your title, category, place and photo colors; "Use in report" fills the form
      Assistant chatbot            rule-based (no external model): matches, claims, reports, or searches the reports
  - Account > My reports shows Responses again (approve / decline).

  Admin GUI
  - Dashboard: statistics square + overview, then "All reports" tabs: All items / Lost / Found / Pending / Returned,
    each card with photo and everything from the user's form.
  - Sidebar: Dashboard, Item matching, Claim verification, Lost reports, Found reports, Returned items, Users, Messages, Settings.
  - Item matching tabs: AI match suggestions (confidence scores, per-factor breakdown, Verify / Reject),
    Report summaries, Flags (duplicates, many posts or claims in a day, same photo from two people, very thin reports),
    AI activity (analytics). "Run AI scan" re-compares all open reports.
  - Claim verification: every claim next to the report's hidden detail with an AI check (likely genuine / needs review /
    weak evidence). Approve marks the item returned; the poster can still approve or decline too.
  - Returned items: cards with who it was returned to.

  How matching works (ai.py): category, name/description (synonyms, plurals, typos), colors and brands, location,
  date/time order (found must be after lost), and photo (colour profile + perceptual hash). The score is capped at 99%.
  New reports are matched immediately; existing reports are matched once on start-up. Users see a score that never uses
  the finder's hidden detail (so it can't be guessed by posting test reports); admins see the full score.
  The matching is heuristic, not a neural model: photos of the same object from different angles can still score low.
