"""Assemble PROJECT FUTURE and write the PPTX deliverable + preview sheets."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import Deck
import content_a as A
import content_b as B
from notes import NOTES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PPTX = os.path.join(ROOT, "PROJECT_FUTURE_Presentation.pptx")
PREV = os.path.join(ROOT, "previews")


def build(with_previews=True):
    deck = Deck()
    for fn in (A.s01, A.s02, A.s03, A.s04, A.s05, A.s06,
               B.s07, B.s08, B.s09, B.s10, B.s11, B.s12, B.s13):
        sl = fn(deck)
        sl.notes(NOTES[len(deck.slides)])

    cp = deck.prs.core_properties
    cp.title = "PROJECT FUTURE — Personal Development & Technology Fund"
    cp.subject = "Three-month pilot proposal for parental support"
    cp.author = "Student proposal"
    cp.keywords = "development fund, robotics, engineering, proposal"
    cp.comments = ("A three-month pilot proposal for a ₹2,000 monthly personal development fund. "
                   "Typeset in Inter. All figures are contributions only.")

    deck.save(OUT_PPTX)
    print(f"saved {OUT_PPTX}  ({len(deck.slides)} slides)")

    if with_previews:
        os.makedirs(PREV, exist_ok=True)
        pages = []
        for i, sl in enumerate(deck.slides, 1):
            im = sl.finalize()
            im.resize((1600, 900)).save(os.path.join(PREV, f"slide-{i:02d}.png"))
            pages.append(im.resize((2000, 1125)))
        pdf = os.path.join(ROOT, "PROJECT_FUTURE_Presentation_review.pdf")
        pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=150.0,
                      title="PROJECT FUTURE — Personal Development & Technology Fund")
        print("previews + review pdf written")

    deck.report()
    return deck


if __name__ == "__main__":
    build()
