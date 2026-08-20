# Dr. Bernie Lurie — Project Notes

## Overview
- Naturopathic doctor site: "Nature's Healing Process"
- No external CSS file — all styles are embedded in each HTML file
- Status: in progress

## Pages
- `index.html` — main site (general practice)
- `hormonal/index.html` — dedicated page for hormonal harmony / women's health

## Design — index.html
- Fonts: Cormorant Garamond (display/headings), Source Serif 4 (body)
- Tone: calm, clinical-but-warm, editorial
- Palette (slate/leaf — NOT the old forest/gold, NOT teal):
  - --slate-deep: #22495A
  - --slate-mid: #486573
  - --eucalyptus: #72827F
  - --sage: #A3B8B4
  - --off-white: #F4EFEB (tinted sections)
  - --leaf: #2F7B46 (accents, prices)
  - --charcoal: #414141
- Icons: inline SVG sprite at the top of the file. No Font Awesome.
- Single page. Sections: Hero → strip → Conditions → About → Treatments → Cancer & HIV Support → Dispensary → First Visit → Fees → FAQ → Patient Accounts → Contact.
- Sibling legal pages at repo root: disclaimer.html, terms.html, quality-control.html, privacy.html

## Design — hormonal/index.html
- Fonts: DM Sans (body), Cormorant Garamond (large editorial/italic display only), Playfair Display (headings). No Jost.
- Tone: soft, feminine, warm
- Color palette:
  - --blush: #f2ddd5 · --blush-deep: #ead0c8 · --blush-light: #faf3f0
  - --rose: #c4796a · --rose-dark: #a05c4e · --rose-soft: #d4938a
  - --sage: #7a9e7e · --sage-dark: #4f7452 · --sage-light: #b5cdb6 · --sage-pale: #deeadf
  - --text-dark: #3a2528 · --text-mid: #6e5a54
- Still uses Font Awesome — inline-SVG swap outstanding.
- This is the page that is actually live at the root domain.

## Notes
- **index.html is not deployed** — Cloudflare Pages builds from `hormonal/`. Pushing does not publish it.
- Each page has its own distinct visual identity — do not cross-apply styles between pages
