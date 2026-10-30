# PROJECT FUTURE
### Personal Development & Technology Fund

*Investing in skills today. Building possibilities for tomorrow.*

A 13-slide, widescreen (16:9) proposal deck asking parents to support a **₹2,000 monthly
development fund** as a **three-month pilot**, with an accountability agreement, a transparent
ledger and a joint review at the end.

---

## What is in this folder

| File | What it is |
| --- | --- |
| `PROJECT_FUTURE_Presentation.pptx` | **The deliverable.** Fully editable PowerPoint, 13 slides, speaker notes on every slide. |
| `PROJECT_FUTURE_Presentation_review.pdf` | A flat PDF rendering of all 13 slides — for quick reading on a phone or before opening PowerPoint. |
| `PROJECT_FUTURE_Supporting_Documents.docx` | Executive summary, financial summary, accountability agreement, 14 parental Q&A, and the complete speaking script. |
| `previews/` | PNG rendering of each slide (build artefacts). |
| `src/` | The Python source that generates the deck and the document. |

---

## Slide map

| # | Section | Message |
| --- | --- | --- |
| 01 | Title | Project Future — the proposal, the tagline, the three headline facts |
| 02 | 01 · The Vision | Engineering is the direction I've chosen (interests + long-term goal + the six-stage cycle) |
| 03 | 02 · The Opportunity | From one-off requests to a planned fund — explicitly *not* a criticism of existing support |
| 04 | 03 · The Proposal | ₹2,000 split 1,900 / 100, as a donut + allocation bars |
| 05 | 04 · The Projection | What ₹1,900 a month becomes at 3 / 6 / 9 / 12 months |
| 06 | 05 · Equipment Goals | 3D printer and laptop as *planned* objectives — no prices invented |
| 07 | 06 · The Roadmap | Foundation → Expansion → Advanced, with the fund use for each phase |
| 08 | 07 · Accountability | Academics, school, home, personal discipline — judged on consistency and effort |
| 09 | 08 · Transparency | Sample ledger dashboard: contributions, balance, purchases, purpose, remaining |
| 10 | 09 · The Pilot | Three months, review criteria, and the three options parents actually have |
| 11 | 10 · Questions | The five hardest objections, answered in one line each |
| 12 | 11 · The Decision | The complete request, in checklist form, plus a signature block |
| 13 | 12 · Closing | The closing statement, bookended by the same cycle motif as the cover |

---

## The numbers (single source of truth)

| Item | Value |
| --- | --- |
| Monthly contribution | ₹2,000 |
| Future Development Fund (95%) | ₹1,900 / month |
| Personal expenses (5%) | ₹100 / month |
| 3-month development balance | ₹5,700 |
| 6-month development balance | ₹11,400 |
| 9-month development balance | ₹17,100 |
| 12-month development balance | ₹22,800 |
| Annual contributions | ₹24,000 |
| Annual personal allocation | ₹1,200 |
| Three-month pilot total | ₹6,000 (₹5,700 + ₹300) |

**No interest, returns, appreciation, equipment prices, marks or achievements are claimed
anywhere in the deck.** The projection slide says so explicitly, and the equipment slide states
that no price is assumed.

The sample ledger on slide 09 is clearly labelled *illustrative* and is internally consistent:
₹6,000 contributed − ₹1,250 spent = ₹4,750 available, of which ₹4,450 is the development balance
and ₹300 is the personal balance.

---

## Design system

- **Palette** — deep navy `#050A14` / `#070D1B`, electric blue `#1D4ED8` / `#2563EB`,
  cyan `#12B8D6` / `#22D3EE`, white and cool grey `#F7F9FC`.
- **Type** — Inter throughout (400 and 700 only, so PowerPoint can address both weights through
  a single family name). Sizes: 29 pt titles, 11.5 pt standfirsts, 8–10 pt supporting text,
  7 pt tracked labels. All small labels are letter-spaced.
- **Grid** — 0.75 in margins, 12 pt baseline rhythm, hairline rules at 2.10 in (header) and
  7.02 in (footer), page number top right.
- **Imagery** — no stock photography. Every visual (donut, bars, roadmap rail, ledger, icons,
  the six-stage cycle ring) is drawn as native PowerPoint vector shapes, so it stays sharp at any
  size, prints cleanly, and can be recoloured or edited directly in PowerPoint.
- The **six-stage development cycle** (Learn → Experiment → Design → Prototype → Test → Improve)
  recurs on the cover, on the vision slide, on the roadmap and on the closing slide.

---

## Editing the deck

Everything is standard PowerPoint: text boxes, autoshapes, tables-free vector charts, and
connectors. Nothing is a flat image, so you can rewrite any sentence, change any number, or move
any element.

- If Inter is not installed, PowerPoint substitutes a similar sans-serif; the layout has enough
  margin to survive that. Inter is free from <https://rsms.me/inter/>.
- Speaker notes are on every slide (View → Notes Page). The same text, with slide numbers, is in
  the `.docx` script section.
- The deck runs ~5–7 minutes as written.

## Rebuilding from source

```bash
python3 -m venv .venv && .venv/bin/pip install python-pptx pillow python-docx
cd src
python build.py     # writes the .pptx, previews and the review PDF
python docs.py      # writes the supporting .docx
```

`src/engine.py` is a small layout DSL that renders each shape twice — once into the PPTX and once
into a pixel-accurate PIL preview — which is how each slide was checked for overflow and spacing
without PowerPoint installed.
