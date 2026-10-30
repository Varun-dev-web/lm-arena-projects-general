import sys, os, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine import Deck
OUT = "/tmp/prev"
os.makedirs(OUT, exist_ok=True)
mod = importlib.import_module(sys.argv[1] if len(sys.argv) > 1 else "content_a")
deck = Deck()
names = sorted([n for n in dir(mod) if n.startswith("s") and n[1:].isdigit()])
for n in names:
    getattr(mod, n)(deck)
path = "/tmp/prev/deck.pptx"
deck.save(path)
for i, sl in enumerate(deck.slides, 1):
    im = sl.finalize()
    im.thumbnail((1500, 1500))
    im.save(f"{OUT}/s{i:02d}.png")
print("rendered", len(deck.slides))
deck.report()
