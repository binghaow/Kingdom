# v26 — Larger villager construction pictures, compact readable text

2026-11-06. Scoped to the villager building catalogue; troop production, game simulation and world art scale remain unchanged.

Building cards use 10px desktop / 9.5px phone names and 9.5px prices, with intrinsic text rows instead of reserved 27px/25px tracks. Removed an inherited 22px minimum caption height and excess caption padding. The available space goes to the picture; typical simple-card image stages are around 43–54 CSS pixels at desktop size, with extra room on tall portrait cards. Long two-line names still have a Details affordance.

Previews now render each building from its real opaque bounds to a 240×160 canvas, fitting uniformly with padding. This avoids enlarging a small padded square icon and preserves native aspect ratio. Thumbnails are cached by type/nation/age, bounded to 100 entries, and are created after the complete art-ready promise. Frames, subtle lighting and shadows give the catalogue a clearer material finish. Locked entries remain legible while indicating their age requirement.

Costs use compact resource initials and numerals (Chinese 粮/木/金/石; English F/W/G/S), with full localized costs in accessible labels, tooltips and the existing Details dialog. Language switching updates these tokens. Required-age/insufficient-resource messages remain visible rather than being replaced by prices. Building cards retain a modest 96px width on narrow screens so three-resource prices can remain in a row without shrinking below 9.5px.

Validation: browser matrix at desktop 1280×720, phone nominal 393×852 / 852×393, narrow 360×780 and iPad 1180×820, Chinese/English, expanded/collapsed. Both ordinary locked buildings and unlocked final-age support buildings were inspected in an isolated tutorial. Full Command Palace cost (Wood 400, Gold 320, Stone 220) was verified through the real Details action. Clicking the enlarged House picture entered placement and Escape cancelled it. Long Signal & Ordnance Bureau caption fits two lines after removing inherited padding; nominal pixel rounding produces a 1px scroll/client difference. Unrelated long command descriptions and narrow selection summaries remain intentional truncation candidates. No new card bounds or price clipping failures were observed. Physical iPhone/iPad testing was not available.

node --check public/economy-ui.js, final build and check-artifact.cjs passed. No simulation test expansion was needed for this catalogue presentation change. The preference is saved in AGENTS.md for future work.
