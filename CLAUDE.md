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

## Deployment — read this before touching anything
Repo: `vyager-digital/Dr-Bernie-Lurie`, git-connected Cloudflare Pages.
**The `hormonal/` folder is the web root.** `herbernie.co.za/` serves `hormonal/index.html`.

- `index.html` at the repo root is **not deployed**. Pushing it does not publish it.
- `/hormonal/` is not a real path on the live site. It renders only because Cloudflare falls
  back to index.html for unmatched routes — images break. **Every outbound or shared link must
  use the bare root** `herbernie.co.za/...`, never `/hormonal/...`.
- `thankyou.html` is at `/thankyou.html` live (repo path `hormonal/thankyou.html`).

## Working rules
- **Review before shipping.** The auto-commit hook deploys every saved change straight to the
  live site. Anything conversion-facing (booking screen, offer copy, CTAs, payment flow) needs
  Sean's go-ahead first. "Let me know your thoughts" means discuss, not build.
- **PayFast worker — only ever change the amount line.** The URL constants in
  `functions/create-checkout.js` are load-bearing for ZAR. Don't touch anything else.
- **Never add new payment notification email types.** Two emails only: one payment-attempt per
  "Confirm My Booking" click, and one payment-received. Make those more reliable instead.
- **Check the Drive folder before asking Sean for content.**
- **Don't restructure layouts unless asked.** Verify by code review, never by self-screenshot.
- **Full mobile QA before calling anything done** — ≥16px body, weight ≥500 on Cormorant
  Garamond, no wrapping breakage.

## Images
- Never downscale or over-compress. Portraits ≤1200px long side at `cwebp -q 82`; banners
  ≤1400–1600px wide at `-q 80`. Never below q78 or 800px. Update the width/height attributes.
- Infographics with baked-in text labels need separate desktop and mobile orientations —
  a square composition goes illegible at ~335–380px.
- **`bernie-profile-*` in `hormonal/assets/images/` is the whole shoot, not just Bernie.**
  Five of the nine are Joanne. Check the photo library memory before using one as "Bernie".

## Reporting to the client
Business register, not landing-page language. Lead with the finding and the numbers.
Use South African data, not US/global benchmarks — label any global figure as a rough proxy.

## Full project memory
`drbernie_index` in the memory store — 37 entries covering the Meta Ads funnel, quiz and
assessment flow, PayFast/booking, Clarity, deliverability, FAQ work and performance reports.
