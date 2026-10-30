"""PROJECT FUTURE — slides 07-13."""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import *          # noqa
from icons import icon, cycle_ring, CYCLE
from content_a import (chrome, footer, label, donut_arc, cycle_strip, bg_mesh,
                       PANEL_D, PANEL_D2, SUB_D, MUTED_D, TOTAL)


# ---------------------------------------------------------------------------
# 07 — development roadmap (dark)
# ---------------------------------------------------------------------------
def s07(deck):
    s = deck.slide(bg=NAVY_950, dark=True)
    s.circle(12.4, 7.2, 6.0, radial=[(0.0, "#10305F", 0.34), (0.5, "#0A1B36", 0.14), (1.0, NAVY_950, 0.0)])
    chrome(s, 7, "06 · THE ROADMAP", "Skills compound the same way savings do.",
           "Three phases. Progression is driven by readiness, not by dates.", dark=True)

    phases = [
        ("01", "Foundation", "Build the habit and the basics.",
         ["A consistent weekly learning routine",
          "Robotics and programming fundamentals",
          "Essential educational resources",
          "Small, frequent experiments"],
         "Components, sensors, learning material"),
        ("02", "Expansion", "Turn practice into design work.",
         ["Save towards a defined equipment target",
          "Research 3D printing options properly",
          "CAD and engineering design practice",
          "More advanced, multi-part prototypes"],
         "3D printing research, filament, CAD tools"),
        ("03", "Advanced Development", "Work at the edge of my current level.",
         ["Work towards a capable laptop",
          "Advanced AI and robotics projects",
          "Larger, longer-running builds",
          "Competitions and exhibitions"],
         "Laptop, advanced components, entry costs"),
    ]
    cols = [0.75, 4.81, 8.87]
    cw = 3.72
    # rail
    s.line(1.10, 2.66, 12.28, 2.66, LINE_DARK, lw=1.0)
    s.poly([(12.16, 2.61), (12.30, 2.66), (12.16, 2.71)], fill=None, line=CYAN_BRIGHT,
           lw=1.0, line_alpha=0.6, close=False)
    for i, (num, name, desc, bullets, fund) in enumerate(phases):
        x = cols[i]
        s.circle(x + 0.24, 2.66, 0.215, fill=NAVY_950, line=CYAN_BRIGHT, lw=1.2)
        s.text(x + 0.05, 2.575, 0.38, 0.2, num, size=8, weight=700, color=CYAN_BRIGHT, align="c")
        s.text(x, 2.99, cw - 0.2, 0.36, name, size=17.5, weight=700, color=WHITE, track=-0.5)
        s.text(x, 3.42, cw - 0.15, 0.3, desc, size=9.4, weight=400, color="#8FA2BC")
        s.line(x, 3.76, x + cw - 0.18, 3.76, LINE_DARK, lw=0.9)
        for j, b in enumerate(bullets):
            y = 3.92 + j * 0.44
            s.circle(x + 0.045, y + 0.085, 0.032, fill=CYAN_BRIGHT, alpha=0.85)
            s.text(x + 0.20, y, cw - 0.38, 0.4, b, size=9.3, weight=400, color="#C9D5E4", lh=1.4)

        s.text(x, 5.82, cw - 0.2, 0.2, "FUND USE", size=6.8, weight=700, color="#617A9C", track=1.8)
        s.text(x, 6.02, cw - 0.25, 0.4, fund, size=8.6, weight=400, color="#93A4BC", lh=1.4)

    s.line(0.75, 6.58, 12.58, 6.58, LINE_DARK, lw=0.9)
    s.text(0.75, 6.68, 11.8, 0.22,
           "Nothing on this roadmap is date-promised. Each phase begins when the previous one is "
           "genuinely in place.",
           size=8.2, weight=400, color="#6C7F9B")
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 08 — accountability
# ---------------------------------------------------------------------------
def s08(deck):
    s = deck.slide()
    chrome(s, 8, "07 · ACCOUNTABILITY", "What I'm committing to, in writing.",
           "Four areas, reviewed with you each month and assessed formally at the end of the pilot.")

    areas = [
        ("chart", "Academic\nperformance",
         ["Consistent results across subjects",
          "Assignments completed on time",
          "Visible improvement over the term",
          "A steady revision routine"]),
        ("people", "School\nresponsibilities",
         ["Fulfil Emerald Vice Captain duties",
          "Take an active part in school events",
          "Reliable, visible leadership",
          "Represent the house properly"]),
        ("wallet", "Household\nresponsibilities",
         ["Agreed weekly responsibilities",
          "Follow-through without reminders",
          "Cooperation with family plans",
          "Help when it is needed"]),
        ("clock", "Personal\ndiscipline",
         ["Time managed around deadlines",
          "Academics and projects balanced",
          "Technology used purposefully",
          "Consistency in personal goals"]),
    ]
    w, gap = 2.845, 0.15
    for i, (ic, name, items) in enumerate(areas):
        x = 0.75 + i * (w + gap)
        s.rect(x, 2.26, w, 3.34, fill=WHITE, line=LINE, lw=0.9, r=0.12,
               shadow=dict(blur=0.22, dist=0.06, alpha=0.07))
        s.rect(x + 0.26, 2.50, 0.46, 0.46, fill="#EDF3FE", r=0.10)
        icon(s, ic, x + 0.49, 2.73, 0.26, BLUE, lw=1.4)
        s.text(x + 2.10, 2.54, 0.52, 0.2, f"0{i + 1}", size=8, weight=700, color="#C3CEE0",
               align="r", track=1.2)
        s.text(x + 0.26, 3.12, w - 0.5, 0.6, name, size=11.6, weight=700, color=INK, lh=1.28)
        s.line(x + 0.26, 3.84, x + w - 0.26, 3.84, LINE, lw=0.9)
        for j, it in enumerate(items):
            y = 3.98 + j * 0.42
            s.rect(x + 0.27, y + 0.075, 0.09, 0.03, fill=CYAN)
            s.text(x + 0.46, y, w - 0.72, 0.4, it, size=8.7, weight=400, color=SLATE, lh=1.4)

    s.rect(0.75, 5.92, 11.83, 0.78, fill=NAVY_900, r=0.10)
    icon(s, "shield", 1.16, 6.31, 0.30, CYAN_BRIGHT, lw=1.4)
    s.text(1.50, 6.10, 10.9, 0.20, "HOW ACADEMIC PROGRESS WILL BE JUDGED", size=6.9, weight=700,
           color=CYAN_BRIGHT, track=2.1)
    s.text(1.50, 6.32, 10.9, 0.24,
           "On consistency, effort and progress over the term — not on a single examination mark.",
           size=9.6, weight=400, color="#D5DEEA")

    footer(s)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 09 — transparency dashboard (dark)
# ---------------------------------------------------------------------------
def s09(deck):
    s = deck.slide(bg=NAVY_950, dark=True)
    s.circle(1.0, 0.2, 6.4, radial=[(0.0, "#0E3A52", 0.26), (0.5, "#08243A", 0.10), (1.0, NAVY_950, 0.0)])
    chrome(s, 9, "08 · TRANSPARENCY", "You see every rupee, every month.",
           "One ledger, kept current, open to both of you at any time.", dark=True)

    kpis = [("CONTRIBUTIONS TO DATE", "₹6,000", "3 × ₹2,000"),
            ("DEVELOPMENT BALANCE", "₹4,450", "unspent"),
            ("PERSONAL BALANCE", "₹300", "of ₹300"),
            ("AVAILABLE TOTAL", "₹4,750", "both parts"),
            ("SPENT TO DATE", "₹1,250", "2 purchases")]
    w, gap = 2.26, 0.14
    for i, (lab, val, note) in enumerate(kpis):
        x = 0.75 + i * (w + gap)
        s.rect(x, 2.30, w, 0.96, fill=PANEL_D, line=LINE_DARK, lw=0.9, r=0.09)
        s.text(x + 0.20, 2.44, w - 0.36, 0.18, lab, size=6.4, weight=700, color="#6F86A8", track=1.5)
        s.text(x + 0.20, 2.62, w - 0.36, 0.34, val, size=16.5, weight=700, color=WHITE, track=-0.4)
        s.text(x + 0.20, 2.99, w - 0.36, 0.18, note, size=7, weight=400, color="#6C8099")

    # ledger
    top = 3.50
    s.text(0.75, top, 5.0, 0.2, "SAMPLE LEDGER  ·  ILLUSTRATIVE ONLY", size=6.9, weight=700,
           color=CYAN_BRIGHT, track=2.0)
    cols = [(0.75, 1.00, "DATE", "l"), (1.78, 2.30, "ITEM", "l"), (4.16, 2.60, "PURPOSE", "l"),
            (6.86, 0.95, "AMOUNT", "r"), (7.92, 1.00, "BALANCE", "r")]
    hy = top + 0.34
    for x, cw, t, al in cols:
        s.text(x, hy, cw, 0.18, t, size=6.6, weight=700, color="#5E7392", track=1.6, align=al)
    s.line(0.75, hy + 0.26, 8.90, hy + 0.26, LINE_DARK, lw=0.9)

    rows = [("MAR 01", "Contribution received", "Monthly deposit", "+₹2,000", "₹2,000", True),
            ("MAR 12", "Electronics components", "Line-follower robot rebuild", "−₹650", "₹1,350", False),
            ("APR 01", "Contribution received", "Monthly deposit", "+₹2,000", "₹3,350", True),
            ("APR 18", "Learning resources", "Course and reference book", "−₹600", "₹2,750", False),
            ("MAY 01", "Contribution received", "Monthly deposit", "+₹2,000", "₹4,750", True)]
    y = hy + 0.36
    for (d, item, purpose, amt, bal, pos) in rows:
        s.text(0.75, y, 1.00, 0.2, d, size=7.4, weight=500, color="#8194AE", track=0.8)
        s.text(1.78, y, 2.30, 0.2, item, size=8.6, weight=500, color="#DDE6F1")
        s.text(4.16, y, 2.60, 0.2, purpose, size=8.4, weight=400, color="#8799B3")
        s.text(6.86, y, 0.95, 0.2, amt, size=8.6, weight=700,
               color=CYAN_BRIGHT if pos else "#C3CEE0", align="r")
        s.text(7.92, y, 1.00, 0.2, bal, size=8.6, weight=700, color=WHITE, align="r")
        y += 0.46
        s.line(0.75, y - 0.14, 8.90, y - 0.14, LINE_DARK, lw=0.6)

    # right rules panel
    px, pw = 9.22, 3.36
    s.rect(px, 3.44, pw, 3.06, fill=PANEL_D2, line=LINE_DARK, lw=0.9, r=0.10)
    s.text(px + 0.26, 3.62, pw - 0.5, 0.2, "THE FOUR RULES", size=6.9, weight=700,
           color=CYAN_BRIGHT, track=2.0)
    rules = ["Record every transaction the day it happens.",
             "Write the purpose, not just the amount.",
             "Share the whole record, unedited.",
             "Discuss anything significant beforehand."]
    yy = 3.90
    for r in rules:
        icon(s, "check", px + 0.36, yy + 0.09, 0.14, CYAN, lw=1.5)
        s.text(px + 0.56, yy, pw - 0.86, 0.44, r, size=8.2, weight=400, color="#B8C6D8", lh=1.45)
        yy += 0.50

    s.line(px + 0.26, 5.92, px + pw - 0.26, 5.92, LINE_DARK, lw=0.9)
    s.text(px + 0.26, 6.02, pw - 0.5, 0.2, "NO HIDDEN LINES.", size=7.2, weight=700,
           color=WHITE, track=1.8)
    s.text(px + 0.26, 6.22, pw - 0.5, 0.2, "Access to the full record, any time you ask.",
           size=7.4, weight=400, color="#6C8099")

    s.text(0.75, 6.62, 8.2, 0.2,
           "Illustrative figures for a three-month pilot. Real entries begin from the first month.",
           size=7.6, weight=400, color="#61738F")
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 10 — three-month pilot
# ---------------------------------------------------------------------------
def s10(deck):
    s = deck.slide()
    chrome(s, 10, "09 · THE PILOT", "Three months. Then we decide together.",
           "A defined trial, not an indefinite commitment — and not a decision you have to get right first time.")

    months = [("MONTH 01", "Set the system up", "Ledger opened · first resources"),
              ("MONTH 02", "Settle into the routine", "Consistent build time · review notes"),
              ("MONTH 03", "Prepare the review", "Progress summary · written record")]
    w = 3.72
    for i, (m, head, sub) in enumerate(months):
        x = 0.75 + i * (w + 0.34)
        s.rect(x, 2.26, w, 1.42, fill=WHITE, line=LINE, lw=0.9, r=0.12,
               shadow=dict(blur=0.20, dist=0.05, alpha=0.07))
        s.text(x + 0.28, 2.44, 2.0, 0.2, m, size=7.2, weight=700, color=BLUE, track=2.0)
        s.text(x + 0.28, 2.64, 2.0, 0.36, "₹2,000", size=19, weight=700, color=INK, track=-0.4)
        s.text(x + 1.55, 2.72, 2.0, 0.2, "₹1,900 dev · ₹100 personal", size=7.4, weight=400, color=MUTED)
        s.text(x + 0.28, 3.14, w - 0.5, 0.2, head, size=8.8, weight=600, color="#2C3B52")
        s.text(x + 0.28, 3.36, w - 0.5, 0.2, sub, size=7.6, weight=400, color=MUTED)

    # totals band
    s.rect(0.75, 3.86, 11.83, 0.90, fill=NAVY_900, r=0.10)
    stats = [("TOTAL CONTRIBUTED", "₹6,000"), ("DEVELOPMENT FUND", "₹5,700"), ("PERSONAL ALLOCATION", "₹300")]
    for i, (lab, val) in enumerate(stats):
        x = 0.75 + 0.30 + i * 2.35
        s.text(x, 4.02, 2.1, 0.18, lab, size=6.6, weight=700, color="#7E93B0", track=1.6)
        s.text(x, 4.22, 2.1, 0.34, val, size=17, weight=700, color=WHITE, track=-0.4)
    s.text(8.05, 4.06, 4.3, 0.5,
           "Three contributions.\nOne written review.", size=10.2, weight=600, color="#C9D5E4",
           align="r", lh=1.4)

    # review criteria
    s.rect(0.75, 4.98, 7.42, 1.84, fill=BG_SOFT, line=LINE, lw=0.9, r=0.12)
    s.text(1.02, 5.14, 5.0, 0.2, "WHAT WE REVIEW AT THE END", size=7, weight=700, color=BLUE, track=2.0)
    crit = ["Academic consistency", "Fulfilment of responsibilities", "Personal discipline",
            "Financial transparency", "Progress in technical learning", "Whether the arrangement works"]
    for i, c in enumerate(crit):
        col, row = i % 2, i // 2
        x = 1.02 + col * 3.52
        y = 5.44 + row * 0.40
        s.text(x - 0.02, y, 0.26, 0.2, f"0{i + 1}", size=7.6, weight=700, color=BLUE, track=0.8)
        s.text(x + 0.30, y, 3.1, 0.32, c, size=8.6, weight=400, color="#33445C")

    # options
    s.rect(8.36, 4.98, 4.22, 1.84, fill=WHITE, line=LINE, lw=0.9, r=0.12)
    s.text(8.62, 5.14, 3.6, 0.2, "THEN YOU DECIDE", size=7, weight=700, color=BLUE, track=2.0)
    opts = ["Continue as it stands", "Continue with changes", "Stop — no explanation needed"]
    for i, o in enumerate(opts):
        y = 5.42 + i * 0.40
        s.rect(8.62, y, 3.68, 0.32, fill="#F4F7FD", r=0.06)
        s.text(8.78, y + 0.07, 3.4, 0.2, o, size=8.4, weight=500, color="#2C3B52")

    footer(s)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 11 — parental concerns
# ---------------------------------------------------------------------------
def s11(deck):
    s = deck.slide()
    chrome(s, 11, "10 · QUESTIONS", "The questions you're most likely to ask.",
           "Straight answers, in advance.")

    qa = [
        ("You already buy the equipment I ask for. Why a monthly fund?",
         "It isn't a replacement. It adds structure: a fixed amount, planned ahead and accounted for."),
        ("Why not simply ask whenever something is needed?",
         "Individual requests solve today's need. A fund builds towards goals that are still months away."),
        ("How do we know the money is used properly?",
         "A shared ledger records every contribution and purchase. Anything significant is discussed first."),
        ("What happens if academics or discipline slip?",
         "It becomes a review item at month three — on consistency, responsibilities and progress."),
        ("Do I actually need expensive equipment right now?",
         "No. The point is to save now so that a purchase later is deliberate rather than sudden."),
    ]
    y = 2.22
    for i, (q, a) in enumerate(qa):
        s.text(0.76, y + 0.045, 0.45, 0.2, f"0{i + 1}", size=9.6, weight=700, color="#B8C6DA", track=1.2)
        s.text(1.34, y + 0.01, 4.65, 0.5, q, size=10.4, weight=700, color=INK, lh=1.35)
        s.text(6.30, y + 0.03, 6.20, 0.5, a, size=9.4, weight=400, color=SLATE, lh=1.45)
        y += 0.86
        s.line(0.75, y - 0.16, 12.58, y - 0.16, LINE, lw=0.9)

    s.text(0.75, y + 0.08, 11.8, 0.24,
           "There is a longer written list of questions and answers in the supporting document.",
           size=8.6, weight=400, color=MUTED)
    footer(s)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 12 — the decision (dark)
# ---------------------------------------------------------------------------
def s12(deck):
    s = deck.slide(bg=NAVY_950, dark=True)
    s.circle(11.9, 0.4, 6.2, radial=[(0.0, "#10305F", 0.36), (0.45, "#0A1B36", 0.15), (1.0, NAVY_950, 0.0)])
    chrome(s, 12, "11 · THE DECISION", "What I'm asking you to approve.",
           "A three-month pilot, with everything visible and a review built in.", dark=True)

    s.text(0.75, 2.32, 5.6, 0.2, "THE REQUEST", size=7.2, weight=700, color=CYAN_BRIGHT, track=2.2)
    reqs = ["₹2,000 at the beginning of each month",
            "₹1,900 to the Future Development Fund",
            "₹100 for personal expenses",
            "Complete visibility of every transaction",
            "The accountability agreement, from month one",
            "A formal review at the end of month three"]
    for i, r in enumerate(reqs):
        y = 2.66 + i * 0.58
        s.circle(0.90, y + 0.145, 0.115, fill=None, line="#2C5C97", lw=1.0)
        icon(s, "check", 0.90, y + 0.145, 0.115, CYAN_BRIGHT, lw=1.5)
        s.text(1.20, y + 0.04, 5.3, 0.3, r, size=10.2, weight=400, color="#D5DEEA")

    # decision card
    cx, cy, cw, ch = 7.15, 2.30, 5.43, 3.30
    s.rect(cx, cy, cw, ch, fill=PANEL_D, line="#1B3A66", lw=1.0, r=0.14,
           shadow=dict(blur=0.34, dist=0.10, alpha=0.22))
    s.rect(cx, cy, cw, 0.05, fill=CYAN_BRIGHT, r=0.02)
    s.text(cx + 0.42, cy + 0.42, cw - 0.84, 0.2, "DECISION REQUESTED", size=7.4, weight=700,
           color=CYAN_BRIGHT, track=2.4)
    s.text(cx + 0.42, cy + 0.72, cw - 0.84, 0.9, "Approve the\nthree-month pilot", size=21,
           weight=700, color=WHITE, lh=1.24, track=-0.6)
    s.text(cx + 0.42, cy + 1.86, cw - 0.84, 0.5,
           "₹6,000 in total.  ₹5,700 developing the fund.  ₹300 personal.",
           size=9.4, weight=400, color="#9AAEC8", lh=1.5)
    s.line(cx + 0.42, cy + 2.50, cx + cw - 0.42, cy + 2.50, LINE_DARK, lw=0.9)
    s.text(cx + 0.42, cy + 2.62, 2.2, 0.2, "STUDENT", size=6.6, weight=700, color="#617A9C", track=1.8)
    s.text(cx + 0.42, cy + 2.94, 2.2, 0.2, "________________", size=8, weight=400, color="#3C5A85")
    s.text(cx + 2.95, cy + 2.62, 2.2, 0.2, "PARENTS", size=6.6, weight=700, color="#617A9C", track=1.8)
    s.text(cx + 2.95, cy + 2.94, 2.2, 0.2, "________________", size=8, weight=400, color="#3C5A85")

    # five principles
    s.line(0.75, 6.02, 12.58, 6.02, LINE_DARK, lw=0.9)
    s.text(0.75, 6.16, 2.6, 0.2, "THE FIVE PRINCIPLES", size=6.8, weight=700, color="#617A9C", track=1.9)
    pr = ["Long-term development", "Financial responsibility", "Academic consistency",
          "Personal discipline", "Full transparency"]
    for i, p in enumerate(pr):
        x = 0.75 + i * 2.38
        s.circle(x + 0.04, 6.53, 0.03, fill=CYAN_BRIGHT, alpha=0.9)
        s.text(x + 0.16, 6.43, 2.2, 0.2, p, size=8.2, weight=500, color="#B8C6D8")

    footer(s, dark=True)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 13 — closing (dark)
# ---------------------------------------------------------------------------
def s13(deck):
    s = deck.slide(bg=NAVY_950, dark=True)
    bg_mesh(s, accent_top=(12.6, 6.9), accent_bottom=None)
    s.line(0.0, 0.0, 13.333, 0.0, CYAN_BRIGHT, lw=2.4, alpha=0.55)

    s.text(0.90, 1.12, 6.0, 0.24, "12 · CLOSING", size=8.6, weight=700, color=CYAN_BRIGHT, track=2.6)

    s.text(0.90, 1.55, 7.60, 3.86, [
        {"t": "“I don't want to keep asking for individual purchases whenever I need something.",
         "size": 19.5, "weight": 400, "color": WHITE, "lh": 1.44, "space_after": 13},
        {"t": "I want to plan ahead, save towards my goals and take greater responsibility for my "
              "development.",
         "size": 19.5, "weight": 400, "color": WHITE, "lh": 1.44, "space_after": 13},
        {"t": "With your support, I hope to build something that helps me grow — not just as a "
              "student, but as a future engineer.”",
         "size": 19.5, "weight": 400, "color": CYAN_BRIGHT, "lh": 1.44},
    ])

    s.rect(0.90, 5.74, 0.62, 0.035, fill=CYAN_BRIGHT)
    s.text(0.90, 5.94, 6.4, 0.3, "Thank you for considering it.", size=13, weight=400, color="#D5DEEA")
    s.text(0.90, 6.34, 7.4, 0.3, "Investing in skills today. Building possibilities for tomorrow.",
           size=10.5, weight=400, color="#7E90AB")

    cycle_ring(s, 10.45, 3.70, 1.52, CYAN_BRIGHT, "#8FA6C4", node_r=0.038,
               label_r=0.30, alpha=0.34, label_alpha=0.60, font=7.2, track=1.4, inner=False)

    s.line(0.90, 6.96, 12.40, 6.96, WHITE, lw=0.8, alpha=0.13)
    s.text(0.90, 7.06, 5.0, 0.2, "PROJECT FUTURE", size=7.4, weight=700, color="#5E708C", track=2.2)
    s.text(8.40, 7.06, 4.0, 0.2, "OCTOBER 2026", size=7, weight=600, color="#5E708C", align="r", track=1.8)
    s.notes("")
    return s
