---
target: blog index page
total_score: 26
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 3
timestamp: 2026-07-29T04-43-38Z
slug: src-pages-blog-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Static snapshot renders immediately with no loading ambiguity. |
| 2 | Match System / Real World | 2 | Card lift and pill-shaped tags imply clickability that does not exist. |
| 3 | User Control and Freedom | 3 | Navigation is conventional and safe; the index has no traps, but interaction targets are narrower than the visual surfaces imply. |
| 4 | Consistency and Standards | 2 | Inert tags resemble project filter controls; duplicated title/“Read more” destinations add inconsistent affordance. |
| 5 | Error Prevention | 4 | Build-time snapshot eliminates visitor-facing API/rate-limit failures; empty state is designed. |
| 6 | Recognition Rather Than Recall | 3 | Title/date/summary/tags are visible, but the page gives no editorial premise or topical orientation. |
| 7 | Flexibility and Efficiency | 2 | Repeated duplicate tab stops and no useful topical navigation as the archive grows. |
| 8 | Aesthetic and Minimalist Design | 2 | Clean, but under-authored; full-width cards and long summaries weaken reading hierarchy. |
| 9 | Error Recovery | 4 | Empty and missing-post states offer clear recovery paths. |
| 10 | Help and Documentation | n/a | A simple reading index does not need separate help documentation. |
| **Total** | | **26/36** | **Good foundation, barely; substantial hierarchy and affordance work remains.** |

## Design Specificity Verdict

**Under-authored and category-interchangeable.** The page is coherent with the site’s palette and restraint, but “Blog” + RSS + generic stacked cards could belong to almost any developer portfolio. It does not yet express the product’s specific promise: engineering judgment proven through maintained public work. The strongest design opportunity is not decoration; it is making the archive feel like an intentional body of evidence.

**Deterministic scan:** `detect.mjs` returned 0 findings for `src/pages/Blog.tsx`. That is useful but narrow: it checks static markup patterns, not full-width reading rhythm, misleading hover affordances, duplicate destinations, or cross-component visual semantics. Browser evidence confirmed one published post, responsive single-column rendering, theme switching, duplicate title/“Read more” links, and the expected RSS/navigation targets.

## Overall Impression

The page is fast, readable, and restrained—but it looks one pass short of authored. The biggest opportunity is to turn a generic card list into a confident editorial index without drifting into magazine affectation.

## What’s Working

1. **Instant, resilient delivery.** The committed snapshot produces immediate content with no async jitter or visitor-facing API failure.
2. **Clear basic anatomy.** Title, date, summary, tags, and a reading action are easy to scan; the empty state is purposeful rather than a dead end.
3. **Theme and responsive consistency.** Light/dark themes and mobile reflow preserve the same straightforward reading path.

## Priority Issues

### [P1] The index has no editorial premise
- **Why it matters:** Open-source peers land on a bare “Blog” heading with no clue what Marcus writes about or why this archive is evidence of engineering judgment. The secondary conversion path lacks a point of view.
- **Fix:** Add one compact, factual intro beneath the heading—what the writing covers and how it connects to shipped work. Keep it direct, not promotional or editorially theatrical.
- **Suggested command:** `$impeccable clarify`

### [P1] Card width destroys reading rhythm on desktop
- **Why it matters:** The single card stretches across the broad site container, producing summary lines far beyond the design system’s own 70ch reading rule. The archive feels bloated instead of deliberate.
- **Fix:** Constrain the index content/card text to a reading-width column (roughly 48–56rem or summary max-width 65–70ch), while preserving room for future multi-post scanning.
- **Suggested command:** `$impeccable layout`

### [P1] Visual affordances disagree with actual interaction
- **Why it matters:** The card lifts on hover as if the whole surface is clickable, but only the title and “Read more” links navigate. Tags look like interactive filter chips but are inert. Users get two false promises in one card.
- **Fix:** Choose one coherent model: make the card a single accessible destination with one tab stop, or remove the card-level lift and keep explicit links. Restyle tags as unmistakable metadata unless filtering is actually implemented.
- **Suggested command:** `$impeccable harden`

### [P2] Duplicate links add keyboard and screen-reader friction
- **Why it matters:** The title and “Read more” create two sequential focus stops to the same destination on every card. That repetition becomes painful as the archive grows.
- **Fix:** Preserve one semantic destination per card. If “Read more” remains visually, render it as non-focusable supporting copy within the single-link model.
- **Suggested command:** `$impeccable distill`

### [P2] Metadata lacks final polish
- **Why it matters:** Raw ISO dates (`2026-07-28`) feel machine-emitted, and fully rounded tag pills imply controls rather than taxonomy. Both weaken the otherwise precise “Working Bench” language.
- **Fix:** Display human-readable dates while retaining ISO in `dateTime`; use quieter static tag styling or make tags real filters.
- **Suggested command:** `$impeccable typeset`

## Persona Red Flags

**Jordan — first-time visitor:** “Blog” provides no topical orientation. Jordan cannot tell whether the archive contains tutorials, architecture notes, agent-workflow essays, or release updates before committing to the card.

**Sam — keyboard/screen-reader user:** Every post contributes two links to the same destination. The page remains operable, but the repeated tab/announcement pattern becomes unnecessary friction as the archive grows.

**Casey — distracted mobile visitor:** The card visually reads as a large tap target, but blank card space does nothing. Casey must accurately hit the title or smaller “Read more” link.

**Devon — skeptical open-source peer:** The page does not connect writing to public engineering evidence. A generic card list and long desktop line lengths undercut the “engineering with taste” claim before Devon opens the post.

## Minor Observations

- RSS is discoverable but visually detached from any explanation of what the feed contains.
- Grid `gap` and `.blog-post` margins both contribute spacing; one system should own vertical rhythm.
- The detector found no static anti-patterns; the meaningful problems are composition and interaction semantics, not syntax.
- The browser received the expected GitHub Pages SPA 404 shell for `/blog` before client restoration; content still rendered correctly.

## Questions to Consider

1. Should the archive read primarily as a chronological notebook, or as a curated body of technical evidence?
2. When tags become numerous, should they remain metadata or become the archive’s primary discovery mechanism?
3. What is the one sentence an open-source peer should understand before choosing the first post?
