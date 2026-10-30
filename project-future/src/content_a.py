"""PROJECT FUTURE — slide content."""
from __future__ import annotations
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import *          # noqa
from icons import icon, cycle_ring, CYCLE

TOTAL = 13
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MUTED_D = "#5D6F8C"   # muted on dark
SUB_D = "#A9B7CC"     # secondary text on dark
PANEL_D = "#0A1424"
PANEL_D2 = "#0C1729"


# ---------------------------------------------------------------------------
# shared chrome
# ---------------------------------------------------------------------------
def chrome(s, num, eyebrow, title, sub=None, dark=False):
    ln_color = LINE_DARK if dark else LINE
    s.text(0.75, 0.60, 9.6, 0.24, eyebrow, size=9, weight=600,
           color=CYAN_BRIGHT if dark else BLUE, track=2.6)
    s.text(0.75, 0.90, 11.3, 0.62, title, size=29, weight=700,
           color=WHITE if dark else INK, lh=1.08, track=-0.7)
    if sub:
        s.text(0.75, 1.55, 10.4, 0.46, sub, size=11.5, weight=400,
               color=SUB_D if dark else SLATE, lh=1.45)
    s.text(11.10, 0.60, 1.48, 0.24, f"{num:02d} / {TOTAL}", size=9, weight=600,
           color=MUTED_D if dark else MUTED, align="r", track=1.4)
    s.line(0.75, 2.10, 12.58, 2.10, ln_color, lw=0.9)


def footer(s, dark=False):
    ln_color = LINE_DARK if dark else LINE
    col = MUTED_D if dark else MUTED
    s.line(0.75, 7.02, 12.58, 7.02, ln_color, lw=0.9)
    s.text(0.75, 7.13, 3.2, 0.2, "PROJECT FUTURE", size=7, weight=600, color=col, track=1.9)
    w1 = text_width("PROJECT FUTURE", 7, 600, 1.9)
    s.text(0.75 + w1 + 0.09, 7.13, 0.2, 0.2, "·", size=7, weight=400, color=col)
    s.text(0.75 + w1 + 0.26, 7.14, 6.0, 0.2, "PERSONAL DEVELOPMENT & TECHNOLOGY FUND", size=7,
           weight=400, color=col, track=1.5)
    s.text(8.20, 7.13, 4.38, 0.2, "₹2,000 / MONTH   ·   3-MONTH PILOT   ·   FULL TRANSPARENCY",
           size=7, weight=600, color=col, align="r", track=1.4)


def label(s, x, y, t, color=MUTED, dark=False, size=7.8, w=6.0, track=2.0):
    s.text(x, y, w, 0.2, t, size=size, weight=600, color=color, track=track)


def donut_arc(s, cx, cy, r_in, r_out, a0, a1, fill, alpha=1.0):
    steps = max(6, int(abs(a1 - a0) / 2.5))
    pts = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + r_out * math.cos(a), cy + r_out * math.sin(a)))
    for i in range(steps + 1):
        a = math.radians(a1 - (a1 - a0) * i / steps)
        pts.append((cx + r_in * math.cos(a), cy + r_in * math.sin(a)))
    s.poly(pts, fill=fill, alpha=alpha, line=None)


def cycle_strip(s, y, label="THE DEVELOPMENT CYCLE", size=8.0, track=2.1,
                color="#8496AD", label_color=BLUE, left=0.75, width=11.83,
                rule=True, rule_color="#E7EDF6"):
    """Recurring brand element: LEARN -> EXPERIMENT -> ... -> IMPROVE."""
    seq = "  →  ".join(CYCLE)
    w = text_width(seq, size, 600, track)
    s.text(left + width - w, y, w + 0.05, 0.2, seq, size=size, weight=600, color=color, track=track)
    if label:
        s.text(left, y + 0.005, width - w - 0.3, 0.2, label, size=7.2, weight=600,
               color=label_color, track=2.2)
    if rule:
        s.line(left, y - 0.26, left + width, y - 0.26, rule_color, lw=0.9)


def bg_mesh(s, dark=True, accent_top=(11.2, 0.2), accent_bottom=None):
    """Very subtle technical grid used on dark slides."""
    col = WHITE
    a = 0.017
    x = 0.0
    while x < 13.333:
        s.line(x, 0, x, 7.5, col, lw=0.6, alpha=a)
        x += 0.96
    y = 0.0
    while y < 7.5:
        s.line(0, y, 13.333, y, col, lw=0.6, alpha=a)
        y += 0.96
    cx, cy = accent_top
    s.circle(cx, cy, 7.2, radial=[(0.0, "#123A78", 0.42), (0.35, "#0C2450", 0.22), (1.0, NAVY_950, 0.0)])
    if accent_bottom:
        s.circle(accent_bottom[0], accent_bottom[1], 5.4,
                 radial=[(0.0, "#0C4C63", 0.30), (0.5, "#08303F", 0.12), (1.0, NAVY_950, 0.0)])


# ---------------------------------------------------------------------------
# 01 — cover
# ---------------------------------------------------------------------------
def s01(deck):
    s = deck.slide(bg=NAVY_950, dark=True)
    bg_mesh(s, accent_top=(11.6, -0.6), accent_bottom=(0.4, 8.2))

    # faint horizontal accent line at the top
    s.line(0.0, 0.0, 13.333, 0.0, CYAN_BRIGHT, lw=2.4, alpha=0.55)

    s.text(0.90, 2.02, 7.2, 0.24, "A PROPOSAL FOR MY PARENTS", size=9.5, weight=600,
           color=CYAN_BRIGHT, track=3.0)
    s.text(0.90, 2.40, 8.4, 2.85, "PROJECT", size=76, weight=700, color=WHITE, lh=0.94, track=-1.8)
    s.text(0.90, 3.40, 8.4, 1.35, "FUTURE", size=76, weight=700, color=CYAN_BRIGHT, lh=0.94, track=-1.8)

    s.rect(0.90, 4.72, 0.62, 0.035, fill=CYAN_BRIGHT)
    s.text(0.90, 4.92, 7.0, 0.34, "Personal Development & Technology Fund",
           size=16.5, weight=400, color="#D5DEEA")
    s.text(0.90, 5.38, 6.9, 0.3, "Investing in skills today. Building possibilities for tomorrow.",
           size=11.5, weight=400, color="#7E90AB", track=0.2)

    # meta strip
    items = [("₹2,000", "PER MONTH"), ("3", "MONTH PILOT"), ("100%", "TRANSPARENT")]
    x = 0.90
    for i, (big, small) in enumerate(items):
        s.text(x, 6.06, 1.5, 0.3, big, size=13, weight=700, color=WHITE, track=-0.2)
        s.text(x, 6.34, 1.6, 0.2, small, size=7, weight=600, color="#6F819C", track=1.9)
        x += 1.72

    s.line(0.90, 6.86, 6.10, 6.86, WHITE, lw=0.8, alpha=0.13)
    s.text(0.90, 6.96, 6.0, 0.2, "OCTOBER 2026  ·  THREE-MONTH PILOT PROPOSAL", size=7,
           weight=600, color="#5E708C", track=1.7)

    cycle_ring(s, 10.42, 4.08, 1.60, CYAN_BRIGHT, "#8FA6C4", node_r=0.040,
               label_r=0.30, alpha=0.50, label_alpha=0.78, font=7.6, track=1.5, inner=False)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 02 — the vision
# ---------------------------------------------------------------------------
def s02(deck):
    s = deck.slide()
    chrome(s, 2, "01 · THE VISION", "Engineering is the direction I've chosen.",
           "Robotics, AI and electronics are not passing interests. They are the areas I keep "
           "returning to, and the areas I want to build a career in.")
    label(s, 0.75, 2.32, "MY FOCUS")
    s.text(0.75, 2.62, 5.55, 1.3,
           "Most of what I build today is small: a sensor, a microcontroller, a robot that "
           "follows a line or avoids a wall. Each project teaches something the next one needs — "
           "and each one depends on materials, tools and time.",
           size=11.2, weight=400, color=SLATE, lh=1.62)

    card = (0.75, 4.02, 5.55, 1.55)
    s.rect(*card, fill=NAVY_900, r=0.12, shadow=dict(blur=0.26, dist=0.07, alpha=0.13))
    s.rect(0.75, 4.02, 0.055, 1.55, fill=CYAN_BRIGHT)
    s.text(1.10, 4.28, 4.9, 0.2, "THE LONG-TERM GOAL", size=7.5, weight=600, color=CYAN_BRIGHT, track=2.2)
    s.text(1.10, 4.58, 4.85, 0.75,
           "Advanced engineering — artificial intelligence, robotics and space technology — "
           "studied properly and applied to real systems.",
           size=11.6, weight=400, color="#D8E1EC", lh=1.48)

    s.text(0.75, 5.86, 5.55, 0.5,
           "That kind of work is not a single purchase. It is a continuous cycle of learning and building.",
           size=9.2, weight=400, color=MUTED, lh=1.45)

    interests = [
        ("chip", "Robotics &\nAutomation"),
        ("network", "Artificial\nIntelligence"),
        ("chart", "Machine\nLearning"),
        ("gear", "Electronics &\nEmbedded Systems"),
        ("code", "Programming &\nSoftware"),
        ("orbit", "Space Technology\n& Exploration"),
    ]
    x0, y0, w, h, gx, gy = 6.68, 2.32, 2.90, 1.10, 0.15, 0.14
    for i, (ic, name) in enumerate(interests):
        col, row = i % 2, i // 2
        x = x0 + col * (w + gx)
        y = y0 + row * (h + gy)
        s.rect(x, y, w, h, fill=WHITE, line=LINE, lw=0.9, r=0.10,
               shadow=dict(blur=0.20, dist=0.05, alpha=0.07))
        s.rect(x + 0.19, y + 0.35, 0.40, 0.40, fill="#EEF3FC", r=0.09)
        icon(s, ic, x + 0.39, y + 0.55, 0.235, BLUE, lw=1.4)
        s.text(x + 0.71, y + 0.15, w - 0.86, h - 0.30, name, size=10.2, weight=600,
               color=INK, lh=1.30, anchor="m")

    cycle_strip(s, 6.60, color="#8598AF")
    footer(s)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 03 — why a structured fund
# ---------------------------------------------------------------------------
def s03(deck):
    s = deck.slide()
    chrome(s, 3, "02 · THE OPPORTUNITY", "From one-off requests to a planned fund.",
           "Nothing about this suggests a problem at home. The idea is to add structure to "
           "something you already support.")

    s.rect(0.75, 2.30, 5.02, 2.48, fill=BG_SOFT, line=LINE, lw=0.9, r=0.13)
    label(s, 1.05, 2.52, "TODAY", color=MUTED)
    s.text(1.05, 2.80, 4.4, 0.55, "Separate requests,\nas needs appear", size=13.5, weight=600,
           color="#3D4C63", lh=1.26)
    for i, t in enumerate(["Each purchase starts a new conversation.",
                           "Spending follows the moment, not a plan.",
                           "Larger items wait until the timing feels right."]):
        y = 3.72 + i * 0.35
        s.circle(1.13, y + 0.075, 0.028, fill="#B9C5D6")
        s.text(1.28, y, 4.2, 0.3, t, size=9.4, weight=400, color=SLATE)

    s.circle(6.36, 3.54, 0.30, fill=WHITE, line=LINE, lw=0.9)
    icon(s, "arrow", 6.36, 3.54, 0.26, BLUE, lw=1.5)

    s.rect(7.56, 2.30, 5.02, 2.48, fill="#F2F6FF", line="#CFDDFB", lw=0.9, r=0.13)
    label(s, 7.86, 2.52, "WITH PROJECT FUTURE", color=BLUE)
    s.text(7.86, 2.80, 4.4, 0.55, "One fund,\nplanned in advance", size=13.5, weight=600,
           color=INK, lh=1.26)
    for i, t in enumerate(["A fixed amount, agreed at the start.",
                           "Savings build towards equipment that is months away.",
                           "I set priorities — and explain every one."]):
        y = 3.72 + i * 0.35
        s.circle(7.94, y + 0.075, 0.028, fill=BLUE)
        s.text(8.09, y, 4.2, 0.3, t, size=9.4, weight=400, color="#33445C")

    tiles = [("target", "PLAN AHEAD", "Know what is coming before it is needed."),
             ("wallet", "ACCUMULATE", "Small monthly amounts add up to real capability."),
             ("shield", "OWN IT", "Age-appropriate financial responsibility.")]
    x0, w, gap = 0.75, 3.87, 0.16
    for i, (ic, t, d) in enumerate(tiles):
        x = x0 + i * (w + gap)
        s.rect(x, 5.10, w, 1.06, fill=WHITE, line=LINE, lw=0.9, r=0.11)
        icon(s, ic, x + 0.42, 5.63, 0.30, BLUE, lw=1.4)
        s.text(x + 0.80, 5.34, w - 0.98, 0.22, t, size=9.6, weight=700, color=INK, track=0.8)
        s.text(x + 0.80, 5.60, w - 0.98, 0.44, d, size=8.8, weight=400, color=SLATE, lh=1.4)

    s.text(0.75, 6.44, 11.8, 0.3,
           "This supplements what you already provide. It does not replace it.",
           size=9.6, weight=600, color=BLUE, track=0.2)
    footer(s)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 04 — the proposal (dark)
# ---------------------------------------------------------------------------
def s04(deck):
    s = deck.slide(bg=NAVY_950, dark=True)
    s.circle(11.4, 0.2, 6.6, radial=[(0.0, "#10305F", 0.40), (0.45, "#0A1B36", 0.18), (1.0, NAVY_950, 0.0)])
    chrome(s, 4, "03 · THE PROPOSAL", "₹2,000 a month, split with intent.",
           "Provided at the beginning of each month. The development portion is not spent by "
           "default — it accumulates.", dark=True)

    s.rect(0.75, 2.32, 5.35, 4.28, fill=PANEL_D, line=LINE_DARK, lw=0.9, r=0.14)
    label(s, 1.05, 2.54, "MONTHLY ALLOCATION", color="#6F86A8", dark=True, w=4.6)

    cx, cy, r_out, r_in = 3.42, 4.24, 1.30, 0.885
    donut_arc(s, cx, cy, r_in, r_out, -90, 248, BLUE_BRIGHT)
    donut_arc(s, cx, cy, r_in, r_out, 250.5, 266.5, CYAN_BRIGHT)

    s.text(cx - 1.0, cy - 0.42, 2.0, 0.5, "₹2,000", size=26, weight=700, color=WHITE,
           align="c", track=-0.6)
    s.text(cx - 1.0, cy + 0.14, 2.0, 0.22, "PER MONTH", size=7.2, weight=600, color="#7C8FA8",
           align="c", track=1.9)

    ly = 5.96
    s.circle(1.12, ly + 0.075, 0.045, fill=BLUE_BRIGHT)
    s.text(1.27, ly, 2.9, 0.22, "Future Development Fund", size=9.2, weight=500, color="#D5DEEA")
    s.text(4.05, ly - 0.005, 1.8, 0.24, "₹1,900  ·  95%", size=10, weight=700, color=WHITE, align="r")

    ly = 6.26
    s.circle(1.12, ly + 0.075, 0.045, fill=CYAN_BRIGHT)
    s.text(1.27, ly, 2.9, 0.22, "Personal expenses", size=9.2, weight=500, color="#D5DEEA")
    s.text(4.05, ly - 0.005, 1.8, 0.24, "₹100  ·  5%", size=10, weight=700, color=WHITE, align="r")

    rx = 6.75
    label(s, rx, 2.54, "WHAT EACH PART IS FOR", color="#6F86A8", dark=True, w=5.6)

    def block(y, num, name, amt, col, frac, desc):
        s.text(rx, y + 0.02, 0.5, 0.22, num, size=8, weight=600, color="#5D6F8C", track=1.6)
        s.text(rx + 0.42, y, 3.3, 0.3, name, size=12.4, weight=600, color=WHITE)
        s.text(rx + 3.55, y - 0.06, 1.3, 0.4, amt, size=19, weight=700, color=WHITE, align="r", track=-0.4)
        bw = 5.35
        s.rect(rx + 0.42, y + 0.54, bw, 0.075, fill="#16233C", r=0.0375)
        s.rect(rx + 0.42, y + 0.54, max(0.10, bw * frac), 0.075, fill=col, r=0.0375)
        s.text(rx + 0.42, y + 0.72, 4.9, 0.6, desc, size=8.9, weight=400, color="#93A4BC", lh=1.5)

    block(2.86, "01", "Future Development Fund", "₹1,900", BLUE_BRIGHT, 0.95,
          "Accumulates for educational resources, robotics parts, sensors, tools and larger "
          "equipment. Spent only when there is a clear purpose.")
    block(4.24, "02", "Personal expenses", "₹100", CYAN_BRIGHT, 0.05,
          "A small, ordinary allowance — not a development cost.")

    s.line(rx, 5.40, 12.58, 5.40, LINE_DARK, lw=0.9)
    s.text(rx, 5.62, 3.0, 0.22, "TOTAL PER MONTH", size=7.6, weight=600, color="#6F86A8", track=2.0)
    s.text(rx + 3.4, 5.52, 1.6, 0.45, "₹2,000", size=22, weight=700, color=WHITE, align="r", track=-0.4)

    s.text(0.75, 6.86, 11.8, 0.24,
           "PAID AT THE START OF EACH MONTH        ·        NO AUTOMATIC SPENDING        ·        "
           "EVERY TRANSACTION RECORDED",
           size=7.6, weight=600, color="#6C7F9B", track=1.5)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 05 — financial projection
# ---------------------------------------------------------------------------
def s05(deck):
    s = deck.slide()
    chrome(s, 5, "04 · THE PROJECTION", "What ₹1,900 a month becomes.",
           "Contributions only. No interest, no returns, nothing assumed beyond the monthly deposit.")

    data = [(3, 5700), (6, 11400), (9, 17100), (12, 22800)]
    gx0, gx1 = 1.95, 8.20
    base_y, top_y = 5.42, 2.62
    vmax = 24000.0
    scale = (base_y - top_y) / vmax

    for v in (0, 6000, 12000, 18000, 24000):
        y = base_y - v * scale
        if v:
            s.line(gx0, y, gx1, y, "#E8EDF5", lw=0.8, dash="dash")
        s.text(0.72, y - 0.10, 1.05, 0.2, f"₹{v // 1000}k" if v else "₹0", size=7.6, weight=500,
               color=MUTED, align="r")

    slot = (gx1 - gx0) / 4.0
    bw = 0.80
    for i, (m, v) in enumerate(data):
        cx = gx0 + slot * (i + 0.5)
        h = v * scale
        x = cx - bw / 2
        last = i == len(data) - 1
        top_col = "#4F93F5" if not last else "#38D9EE"
        bot_col = "#1D4ED8" if not last else "#0F9CB8"
        s.grad_rect(x, base_y - h, bw, h, [(0.0, bot_col, 1.0), (1.0, top_col, 1.0)], angle=0)
        s.text(cx - slot / 2, base_y - h - 0.34, slot, 0.26, f"₹{v:,}", size=10.5, weight=700,
               color=INK if not last else "#0B7F97", align="c")
        s.text(cx - slot / 2, base_y + 0.14, slot, 0.22, f"{m} MONTHS", size=7.4, weight=600,
               color=SLATE, align="c", track=1.5)

    s.line(gx0, base_y, gx1, base_y, "#C9D4E4", lw=1.1)
    s.text(0.75, 2.30, 5.0, 0.2, "PROJECTED DEVELOPMENT FUND BALANCE", size=7.8, weight=600,
           color=BLUE, track=2.0)

    cards = [("TOTAL CONTRIBUTED", "₹24,000", "12 × ₹2,000", BLUE),
             ("DEVELOPMENT FUND", "₹22,800", "Accumulated, unspent", CYAN),
             ("PERSONAL ALLOCATION", "₹1,200", "12 × ₹100", "#6B7E99")]
    y = 2.62
    for lab, val, note, col in cards:
        s.rect(8.72, y, 3.86, 1.12, fill=BG_SOFT, line=LINE, lw=0.9, r=0.10)
        s.rect(8.74, y + 0.16, 0.045, 0.80, fill=col, r=0.022)
        s.text(8.98, y + 0.17, 3.4, 0.2, lab, size=7.4, weight=600, color=MUTED, track=1.8)
        s.text(8.98, y + 0.37, 3.4, 0.38, val, size=20, weight=700, color=INK, track=-0.4)
        s.text(8.98, y + 0.80, 3.4, 0.2, note, size=8, weight=400, color=SLATE)
        y += 1.26

    s.text(0.75, 6.42, 11.8, 0.3,
           "These figures are projected contributions, not investment returns. The fund does not "
           "earn interest in this plan.",
           size=8.8, weight=400, color=MUTED)
    footer(s)
    s.notes("")
    return s


# ---------------------------------------------------------------------------
# 06 — equipment goals
# ---------------------------------------------------------------------------
def s06(deck):
    s = deck.slide()
    chrome(s, 6, "05 · EQUIPMENT GOALS", "Two goals that need planning, not impulse.",
           "Neither is requested today. Each becomes realistic through accumulation and a joint decision.")

    goals = [
        ("printer", "PHASE 2 · ACCUMULATION", "3D Printer",
         ["Turns CAD designs into physical parts.",
          "Custom brackets, mounts and enclosures stop being obstacles.",
          "Makes prototyping a routine instead of an event."],
         "Supports the design-and-build stage of the cycle."),
        ("laptop", "PHASE 3 · ADVANCED WORK", "Capable Laptop",
         ["Needed for AI, machine learning and CAD work.",
          "Supports larger projects and competition entries.",
          "A dependable machine for years of coursework."],
         "Supports simulation, training models and writing software."),
    ]
    x0, w, gap = 0.75, 5.86, 0.16
    for i, (ic, phase, name, bullets, note) in enumerate(goals):
        x = x0 + i * (w + gap)
        s.rect(x, 2.28, w, 3.52, fill=WHITE, line=LINE, lw=0.9, r=0.14,
               shadow=dict(blur=0.26, dist=0.07, alpha=0.08))
        s.rect(x + 0.34, 2.56, 0.74, 0.74, fill="#EDF3FE", r=0.13)
        icon(s, ic, x + 0.71, 2.93, 0.42, BLUE, lw=1.6)
        s.text(x + 1.26, 2.62, 3.9, 0.2, phase, size=7.2, weight=600, color=BLUE, track=1.9)
        s.text(x + 1.26, 2.84, 3.9, 0.4, name, size=19, weight=700, color=INK, track=-0.4)
        s.line(x + 0.34, 3.50, x + w - 0.34, 3.50, LINE, lw=0.9)
        for j, b in enumerate(bullets):
            y = 3.68 + j * 0.52
            icon(s, "check", x + 0.44, y + 0.10, 0.17, CYAN, lw=1.5)
            s.text(x + 0.66, y, w - 1.02, 0.48, b, size=9.6, weight=400, color=SLATE, lh=1.42)
        s.rect(x + 0.34, 5.16, w - 0.68, 0.44, fill=BG_SOFT, r=0.08)
        s.text(x + 0.50, 5.20, w - 1.0, 0.36, note, size=8.2, weight=500, color="#41536B", lh=1.35)

    s.rect(0.75, 6.04, 11.83, 0.62, fill=NAVY_900, r=0.10)
    s.text(1.02, 6.19, 11.2, 0.34,
           "No price is assumed on this slide.  The timing of either purchase depends on the "
           "balance available, what is genuinely needed, and your approval.",
           size=8.8, weight=400, color="#C3CEDD", lh=1.35)
    footer(s)
    s.notes("")
    return s
