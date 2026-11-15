# Attendance: new top-bar button, weekly card, auto check-out (2026-11-15)

**Why:** the top-bar button was plain text with a browser "Check out now?" pop-up, staff could not see their week, and a forgotten check-out stayed open for ever.

**What the owner asked for:** improve the button · show weekly attendance in the check-out card · auto check-out at 6 pm unless the person chooses to continue.

**Approaches considered**
1. Browser-only timer that checks out at 6 pm — fails when the CRM is closed. Dropped.
2. Server closes open rows on the next hr request (chosen) — works with the CRM closed, no cron needed (every open CRM asks hr/me once a minute; any later request closes old days).
3. Hostinger cron job — more setup, nothing gained over 2.

**Design (approved "Yes, build it")**
- Button (`drawPunch`, app8.js): blue "Check in" → green pill with live dot + check-in time + running hours → grey "in – out" (+ AUTO tag). Amber in the last 10 minutes before office end time.
- Card `#pncard` under the button (no browser confirm): hours today, in/out, auto check-out note, Check out, this week (Mon–Sun, week-off days without a record hidden), total days · hours. The same week box is in the Attendance page card.
- Auto check-out (`hr_auto_out`, hr.php): at `cfg.end` (default 18:00) an open row with `cont=0` gets `check_out = end`, `auto_out=1`. Rows from before the first run (`settings.hr_auto_from`) are left alone.
- Continue working (`hr/continue`): sets `cont=1`; also takes back today's auto check-out. Offered from 30 minutes before end; the card opens by itself 10 minutes before. A check-in after end time counts as continuing.
- Forgotten after Continue: closed after midnight at `attendance.last_act` (last CRM use that day, written by the presence heartbeat), never earlier than end time.
- Managers: "auto" tag in Today, "(auto check-out)" in the weekly tooltip. A manager correction or a manual check-out clears the tag.
- Schema v66: attendance.cont, auto_out, last_act. Tests: tests/att_auto_test.php.
