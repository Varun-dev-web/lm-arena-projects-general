#!/usr/bin/env python3
"""Generate SYNTHETIC PDFs used to test QP Page Finder.

These are NOT Cambridge question papers. Every sentence here is invented for
testing only. No real exam content is downloaded, copied or reproduced.

Usage:  python3 make_fixtures.py /path/to/output/folder
Requires (development only): reportlab, pillow  ->  pip install reportlab pillow
The shipped app does NOT need these packages.
"""
import io
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont

W, H = A4


def draw_page(c, header, lines, printed_no, footer_extra="[Turn over"):
    """Draw one page. Each string is its own text line so pdf.js reconstructs
    clean line boundaries, just like a real typeset paper."""
    y = H - 46
    c.setFont("Helvetica", 9)
    c.drawString(50, y, header)
    y -= 26
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, "SYNTHETIC TEST DOCUMENT - NOT A REAL QUESTION PAPER")
    y -= 30
    c.setFont("Helvetica", 10)
    for line in lines:
        c.drawString(50, y, line)
        y -= 17
    c.setFont("Helvetica", 8)
    c.drawString(50, 46, "© UCLES 2025   " + header + "   " + footer_extra)
    c.setFont("Helvetica", 10)
    c.drawCentredString(W / 2, 28, str(printed_no))   # bare printed page number
    c.showPage()


def fixture_a(path):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("Synthetic fixture 0625_w25_qp_41")
    draw_page(c, "0625/41/O/N/25", [
        "INSTRUCTIONS",
        "Answer all questions.",
        "Write your answers in the spaces provided.",
        "The number of marks is given in brackets at the end of each question.",
        "You may use a calculator.",
    ], 2)
    draw_page(c, "0625/41/O/N/25", [
        "1 A car travels at a constant speed. Calculate the distance travelled in 20 s.",
        "2 A student has a bar magnet and a compass.",
        "State which pole of the compass points towards the north pole of the magnet.",
        "Describe the magnetic field pattern around a bar magnet.",
    ], 3)
    draw_page(c, "0625/41/O/N/25", [
        "State two magnetic materials that can be magnetised by stroking with a permanent magnet.",
        "3 Fig. 3.1 shows a d.c. motor with a coil in a magnetic field.",
        "State the direction of the force on the coil.",
        "4 A transformer has a primary coil and a secondary coil.",
        "Calculate the output voltage.",
    ], 4)
    draw_page(c, "0625/41/O/N/25", [
        "5 Explain the difference between a permanent magnet and an induced magnet.",
        "Describe how a plotting compass can be used to find the magnetic field pattern.",
        "6 A bar magnet is moved into a coil connected to a galvanometer.",
        "Explain the induced e.m.f. produced by electromagnetic induction.",
    ], 5)
    c.save()


def fixture_b(path):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("Synthetic fixture 0625_w24_qp_42")
    draw_page(c, "0625/42/O/N/24", [
        "INSTRUCTIONS",
        "Answer all questions in the spaces provided.",
    ], 1)
    draw_page(c, "0625/42/O/N/24", [
        "1 The north pole of one magnet is brought near the north pole of a second magnet.",
        "State whether the magnets attract or repel.",
        "2 A coil of wire is rotated in a magnetic field to generate an induced current.",
    ], 2)
    draw_page(c, "0625/42/O/N/24", [
        "3 A student uses a plotting compass to trace the field lines near a bar magnet.",
        "Describe the pattern of the magnetic field.",
    ], 3)
    c.save()


def fixture_scanned(path):
    """An IMAGE-only page: pdf.js finds no text, so the app must use offline OCR."""
    img = Image.new("RGB", (1650, 1050), "white")
    d = ImageDraw.Draw(img)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    try:
        font = ImageFont.truetype(font_path, 42)
        small = ImageFont.truetype(font_path, 28)
    except OSError:
        font = ImageFont.load_default()
        small = font
    d.text((60, 50), "SYNTHETIC SCANNED PAGE - NOT A REAL PAPER", fill="black", font=small)
    for i, line in enumerate([
        "A compass is placed near a bar magnet.",
        "The north pole of the compass needle",
        "points along the magnetic field lines",
        "around the permanent magnet.",
    ]):
        d.text((60, 180 + i * 130), line, fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    c = canvas.Canvas(path, pagesize=A4)
    c.drawImage(ImageReader(buf), 0, 0, width=W, height=H)
    c.showPage()
    c.save()


def fixture_encrypted(path):
    """Password-protected synthetic PDF, to verify the app SKIPS it."""
    try:
        from reportlab.lib.pdfencrypt import StandardEncryption
        enc = StandardEncryption("synthetic-test-password", canPrint=1)
        c = canvas.Canvas(path, pagesize=A4, encrypt=enc)
        draw_page(c, "0625/43/O/N/25", ["A compass is placed near a permanent magnet."], 2)
        c.save()
        return True
    except Exception as exc:      # pragma: no cover
        print("  (encryption unavailable: %s; writing corrupt PDF instead)" % exc)
        with open(path, "wb") as f:
            f.write(b"%PDF-1.4\nThis is a deliberately broken synthetic PDF.\n%%EOF\n")
        return False


def fixture_nonpaper(path):
    """A PDF with no magnetism content at all."""
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("Synthetic non-paper")
    draw_page(c, "DOC/1", ["A student measures the temperature of water.", "Record the reading."], 1)
    c.save()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/qp-fixtures"
    os.makedirs(out, exist_ok=True)
    fixture_a(os.path.join(out, "0625_w25_qp_41.pdf"))
    fixture_b(os.path.join(out, "0625_w24_qp_42.pdf"))
    fixture_scanned(os.path.join(out, "scanned_magnetism_notes.pdf"))
    encrypted = fixture_encrypted(os.path.join(out, "locked_synthetic.pdf"))
    fixture_nonpaper(os.path.join(out, "temperature_notes.pdf"))
    print("Fixtures written to %s (encrypted fixture: %s)" % (out, encrypted))
    for f in sorted(os.listdir(out)):
        print("  %s  %d bytes" % (f, os.path.getsize(os.path.join(out, f))))


if __name__ == "__main__":
    main()
