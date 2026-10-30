"""Minimal geometric icon + motif library drawn with the deck engine."""
from __future__ import annotations
import math


def icon(s, name, cx, cy, size, color, lw=1.5, alpha=1.0):
    """Stroke icons built from primitives so they render identically in
    PowerPoint and in the preview."""
    h = size / 2.0
    ln = lambda x1, y1, x2, y2, w=lw: s.line(cx + x1 * h, cy + y1 * h, cx + x2 * h, cy + y2 * h,
                                            color=color, lw=w, alpha=alpha)
    circ = lambda x, y, r, w=lw, fill=None: s.circle(cx + x * h, cy + y * h, r * h,
                                                     fill=fill, line=color, lw=w, alpha=alpha,
                                                     line_alpha=alpha)
    box = lambda x, y, w_, h_, r=0.0, lw_=lw: s.rect(cx + (x - w_ / 2) * h, cy + (y - h_ / 2) * h,
                                                     w_ * h, h_ * h,
                                                     fill=None, line=color, lw=lw_, r=r * h,
                                                     line_alpha=alpha)
    dot = lambda x, y, r=0.09: s.circle(cx + x * h, cy + y * h, r * h, fill=color, alpha=alpha)

    if name == "chip":
        box(0, 0, 0.68, 0.68, 0.10)
        box(0, 0, 0.30, 0.30, 0.04)
        for t in (-0.22, 0.0, 0.22):
            ln(-0.34, t, -0.50, t)
            ln(0.34, t, 0.50, t)
            ln(t, -0.34, t, -0.50)
            ln(t, 0.34, t, 0.50)

    elif name == "code":
        s.poly([(cx - 0.18 * h, cy - 0.44 * h), (cx - 0.54 * h, cy), (cx - 0.18 * h, cy + 0.44 * h)],
               fill=None, line=color, lw=lw, line_alpha=alpha, close=False)
        s.poly([(cx + 0.18 * h, cy - 0.44 * h), (cx + 0.54 * h, cy), (cx + 0.18 * h, cy + 0.44 * h)],
               fill=None, line=color, lw=lw, line_alpha=alpha, close=False)

    elif name == "network":
        nodes = [(-0.42, 0.30), (-0.42, -0.30), (0.0, 0.0), (0.42, -0.28), (0.42, 0.32)]
        for a, b in [(0, 2), (1, 2), (2, 3), (2, 4), (0, 1)]:
            ln(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], lw * 0.8)
        for (x, y) in nodes:
            circ(x, y, 0.11, lw * 0.9, fill=None)

    elif name == "gear":
        circ(0, 0, 0.34)
        circ(0, 0, 0.12, lw * 0.9)
        for i in range(8):
            a = math.radians(i * 45)
            ln(0.44 * math.cos(a), 0.44 * math.sin(a), 0.62 * math.cos(a), 0.62 * math.sin(a))

    elif name == "orbit":
        circ(0, 0, 0.50)
        dot(0, 0, 0.14)
        dot(-0.34, -0.36, 0.10)
        dot(0.42, 0.26, 0.10)
        ln(-0.2, -0.2, 0.2, 0.2, lw * 0.7)

    elif name == "printer":
        box(0, -0.12, 0.84, 0.54, 0.08)
        ln(-0.44, -0.40, 0.44, -0.40)
        ln(0.0, -0.40, 0.0, -0.26, lw * 0.9)
        s.poly([(cx - 0.13 * h, cy - 0.02 * h), (cx + 0.13 * h, cy - 0.02 * h), (cx, cy + 0.20 * h)],
               fill=None, line=color, lw=lw * 0.9, line_alpha=alpha, close=True)
        ln(-0.50, 0.22, 0.50, 0.22)
        box(0, 0.40, 0.44, 0.14, 0.02, lw * 0.85)

    elif name == "laptop":
        box(0, -0.14, 0.74, 0.48, 0.05)
        s.poly([(cx - 0.50 * h, cy + 0.28 * h), (cx + 0.50 * h, cy + 0.28 * h),
                (cx + 0.40 * h, cy + 0.14 * h), (cx - 0.40 * h, cy + 0.14 * h)],
               fill=None, line=color, lw=lw, line_alpha=alpha, close=True)
        ln(-0.14, 0.36, 0.26, 0.36, lw * 0.85)
        ln(-0.20, -0.26, 0.30, -0.26, lw * 0.7)

    elif name == "target":
        circ(0, 0, 0.50)
        circ(0, 0, 0.30)
        dot(0, 0, 0.11)
        ln(-0.50, 0, -0.66, 0, lw * 0.9)
        ln(0.50, 0, 0.66, 0, lw * 0.9)
        ln(0, -0.50, 0, -0.66, lw * 0.9)
        ln(0, 0.50, 0, 0.66, lw * 0.9)

    elif name == "wallet":
        box(0, 0.04, 0.86, 0.60, 0.10)
        ln(-0.43, -0.10, 0.43, -0.10, lw * 0.9)
        circ(0.24, 0.10, 0.09, lw * 0.9)
        ln(-0.30, -0.30, 0.10, -0.30, lw * 0.85)

    elif name == "shield":
        s.poly([(cx, cy - 0.52 * h), (cx + 0.44 * h, cy - 0.34 * h),
                (cx + 0.44 * h, cy + 0.10 * h), (cx, cy + 0.52 * h),
                (cx - 0.44 * h, cy + 0.10 * h), (cx - 0.44 * h, cy - 0.34 * h)],
               fill=None, line=color, lw=lw, line_alpha=alpha, close=True)
        s.poly([(cx - 0.18 * h, cy + 0.02 * h), (cx - 0.03 * h, cy + 0.18 * h),
                (cx + 0.22 * h, cy - 0.14 * h)], fill=None, line=color, lw=lw * 1.1,
               line_alpha=alpha, close=False)

    elif name == "clock":
        circ(0, 0, 0.50)
        ln(0, 0.04, 0, -0.28)
        ln(0, 0.04, 0.26, 0.16)

    elif name == "doc":
        box(-0.02, 0, 0.62, 0.84, 0.05)
        for t in (-0.20, 0.02, 0.24):
            ln(-0.18, t, 0.16, t, lw * 0.85)

    elif name == "calendar":
        box(0, 0.04, 0.82, 0.72, 0.06)
        ln(-0.41, -0.14, 0.41, -0.14, lw * 0.9)
        ln(-0.22, -0.46, -0.22, -0.24, lw * 1.1)
        ln(0.22, -0.46, 0.22, -0.24, lw * 1.1)
        for (x, y) in [(-0.20, 0.16), (0.0, 0.16), (0.20, 0.16), (-0.20, 0.34)]:
            dot(x, y, 0.055)

    elif name == "chart":
        ln(-0.52, 0.48, 0.54, 0.48, lw * 0.9)
        ln(-0.52, 0.48, -0.52, -0.52, lw * 0.9)
        box(-0.34, 0.16, 0.16, 0.30, 0.02, lw * 0.9)
        box(-0.08, -0.02, 0.16, 0.48, 0.02, lw * 0.9)
        box(0.18, -0.24, 0.16, 0.70, 0.02, lw * 0.9)

    elif name == "arrow":
        ln(-0.50, 0, 0.48, 0)
        s.poly([(cx + 0.16 * h, cy - 0.26 * h), (cx + 0.50 * h, cy), (cx + 0.16 * h, cy + 0.26 * h)],
               fill=None, line=color, lw=lw, line_alpha=alpha, close=False)

    elif name == "check":
        s.poly([(cx - 0.44 * h, cy + 0.02 * h), (cx - 0.10 * h, cy + 0.34 * h),
                (cx + 0.48 * h, cy - 0.32 * h)], fill=None, line=color, lw=lw * 1.3,
               line_alpha=alpha, close=False)

    elif name == "lock":
        box(0, 0.14, 0.68, 0.56, 0.08)
        s.poly([(cx - 0.24 * h, cy + 0.02 * h), (cx - 0.24 * h, cy - 0.18 * h),
                (cx - 0.12 * h, cy - 0.40 * h), (cx, cy - 0.44 * h),
                (cx + 0.12 * h, cy - 0.40 * h), (cx + 0.24 * h, cy - 0.18 * h),
                (cx + 0.24 * h, cy + 0.02 * h)],
               fill=None, line=color, lw=lw, line_alpha=alpha, close=False)
        dot(0, 0.36, 0.055)

    elif name == "people":
        circ(-0.20, -0.20, 0.18)
        s.poly([(cx - 0.50 * h, cy + 0.44 * h), (cx - 0.50 * h, cy + 0.18 * h),
                (cx - 0.20 * h, cy + 0.04 * h), (cx + 0.10 * h, cy + 0.18 * h),
                (cx + 0.10 * h, cy + 0.44 * h)], fill=None, line=color, lw=lw,
               line_alpha=alpha, close=False)
        circ(0.32, -0.26, 0.14, lw * 0.9)
        s.poly([(cx + 0.16 * h, cy + 0.44 * h), (cx + 0.16 * h, cy + 0.24 * h),
                (cx + 0.32 * h, cy + 0.12 * h), (cx + 0.52 * h, cy + 0.22 * h)],
               fill=None, line=color, lw=lw * 0.9, line_alpha=alpha, close=False)

    elif name == "spark":
        pts = []
        for i in range(8):
            a = math.radians(-90 + i * 45)
            rr = 0.58 if i % 2 == 0 else 0.20
            pts.append((cx + rr * h * math.cos(a), cy + rr * h * math.sin(a)))
        s.poly(pts, fill=color, alpha=alpha, line=None)

    elif name == "dot":
        dot(0, 0, 0.22)

    return s


CYCLE = ["LEARN", "EXPERIMENT", "DESIGN", "PROTOTYPE", "TEST", "IMPROVE"]


def cycle_ring(s, cx, cy, r, color, label_color, node_r=0.045, label_r=0.34,
               alpha=0.55, label_alpha=0.8, font=8, track=1.4, labels=True, lw=1.0,
               start=-90, inner=True):
    s.circle(cx, cy, r, fill=None, line=color, lw=lw, line_alpha=alpha)
    if inner:
        s.circle(cx, cy, r * 0.62, fill=None, line=color, lw=lw * 0.8, line_alpha=alpha * 0.5)
    for i, name in enumerate(CYCLE):
        a = math.radians(start + i * 60)
        nx, ny = cx + r * math.cos(a), cy + r * math.sin(a)
        s.circle(nx, ny, node_r, fill=color, alpha=alpha)
        s.circle(nx, ny, node_r * 2.1, fill=None, line=color, lw=lw * 0.8, line_alpha=alpha * 0.5)
        if not labels:
            continue
        lx = cx + (r + label_r) * math.cos(a)
        ly = cy + (r + label_r) * math.sin(a) - 0.075
        if abs(math.cos(a)) < 0.22:
            s.text(lx - 0.9, ly, 1.8, 0.22, name, size=font, weight=600, track=track,
                   color=label_color, align="c", opacity=label_alpha)
        elif math.cos(a) > 0:
            s.text(lx - 0.06, ly, 1.5, 0.22, name, size=font, weight=600, track=track,
                   color=label_color, align="l", opacity=label_alpha)
        else:
            s.text(lx - 1.44, ly, 1.5, 0.22, name, size=font, weight=600, track=track,
                   color=label_color, align="r", opacity=label_alpha)
