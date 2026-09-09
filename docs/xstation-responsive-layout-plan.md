# XTATION responsive layout and behavior plan

| Field | Decision |
|---|---|
| Status | Ready for implementation |
| Target | Live landing page at `index.html` |
| Redesign mode | Targeted evolution with structural responsive fixes |
| Existing stack | Static HTML, CSS, JavaScript, GSAP, ScrollTrigger, Lenis, Three.js |
| Design direction | Sleek, light, editorial, spatial, and product-focused |
| Design dials | `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 6`, `VISUAL_DENSITY: 3` |
| Theme | Preserve the current light forest, signal green, mist, and paper palette |
| Dependency policy | Add no UI framework and no second animation system |

**Design read:** This is a B2B AI product portfolio for business buyers, with a calm premium-technology language that should preserve XTATION's spatial orbit signature while making every section readable, useful, and stable on phones, tablets, laptops, and wide screens.

## 1. Outcome

The finished page should extend the validated desktop composition into a coherent responsive system without redesigning desktop:

1. Fit cleanly from 320px wide phones through 1600px and wider displays.
2. Preserve the welcome field and orbit as signature brand moments without allowing them to block, overlap, or slow down the page.
3. Keep the hero headline, supporting copy, and actions visible in the initial viewport on common phone and laptop heights.
4. Preserve the established desktop product rhythm and create a clear stacked reading order below 1024px.
5. Keep navigation and conversion actions easy to reach at every viewport.
6. Make hover-only behavior available through keyboard and touch equivalents.
7. Use native scrolling below 1024px and preserve the established Lenis behavior on desktop.
8. Respect reduced motion, data saver, orientation changes, browser zoom, safe areas, and dynamic mobile browser chrome.
9. Meet WCAG 2.2 AA for text contrast, focus visibility, target size, semantics, and keyboard use.
10. Maintain the static deployment model and existing anchor IDs.

## 2. Current-state audit

### 2.1 What already works and should be preserved

- The light green visual language is distinctive and consistent: `--deep-forest`, `--signal`, `--sage`, `--mist`, and `--page`.
- Apfel Grotezk gives the page more character than a generic system sans.
- The welcome field, orbit, and product model system create a recognizable signature.
- The hero has one clear headline and two clear intents: browse products and book a demo.
- Product copy is concise and consistently structured.
- Product videos have a poster and only the most visible video is attached and played.
- Existing code already has reduced-motion branches for the welcome, orbit, entries, parallax, and videos.
- Focus-visible styling exists for major calls to action.
- The contact and footer stay simple rather than becoming a link farm.

### 2.2 Structural issues to fix

1. **Responsive rules are duplicated and override each other.** `index.html` has two separate `@media (max-width: 767px)` blocks for `#hero-copy`, heading sizes, body sizes, and buttons. Later declarations win, which makes the intended mobile rules hard to predict.
2. **The viewport model is inconsistent.** The page mixes `svh`, `dvh`, `vh`, fixed minimums, and `window.innerHeight`. `#root` is fixed to `100svh` with a 720px minimum, which is too tall for short phones and landscape devices.
3. **JavaScript and CSS disagree on the compact boundary.** The welcome and field use 720px while layout CSS and scroll behavior use 767px. A device between those values can receive desktop 3D geometry and mobile CSS.
4. **Some responsive behavior is decided only once at startup.** `welcome.js` stores `compact` from the initial `window.innerWidth`. `bindEnter()` and `bindParallax()` also select mobile behavior once, so resizing or rotating can leave the wrong behavior active.
5. **The tablet transition is abrupt.** At 1024px, every product section changes from a two-column composition to one column. There is no tuned tablet layout between phone and desktop.
6. **The page lacks a shared content container.** Gutters are fluid, but major sections do not share one maximum inline size. Product content can feel stretched on large screens.
7. **The current product sequence repeats one split layout eight times.** Alternating image and copy for that many sections becomes mechanical and makes products harder to distinguish.
8. **The navigation stops helping after the hero.** The header currently contains only the brand, and `bindBrandVisibility()` hides it as the product section enters.
9. **The accessible heading structure is broken.** The only `h1` sits inside an `aria-hidden="true"` welcome layer that is removed. The persistent hero headline is an `h2`.
10. **The orbit looks interactive but is not keyboard-accessible.** Orbit nodes are generated as `div` elements inside an `aria-hidden` container and respond to pointer hover.
11. **The welcome can trap user intent.** Wheel, touch, and key input are prevented while only accelerating the timeline, and orbit readiness can delay exit for up to 15 seconds.
12. **Signal green is borderline for body-sized text.** `#1C855C` passes against white at about 4.61:1 but falls to about 4.32:1 against `#F7F8F5`. It should not be the only color carrying small text.
13. **Contact copy assumes a desktop position.** “Scan the QR code on the side” becomes incorrect when the code stacks below the text.
14. **The stylesheet contains multiple historical layers.** Base declarations, option-one overrides, and later project-detail overrides all style the same selectors. This increases regression risk for every breakpoint change.

## 3. Locked design decisions

### 3.1 Preserve

- Keep the brand name, palette family, font files, product names, product descriptions, client logos, section IDs, and `#work` and `#contact` destinations.
- Keep the welcome and interactive orbit, but adapt their composition and cost by capability.
- Treat the existing layout at 1024px and above as a visual regression baseline: its geometry, product alternation, hero proportions, welcome bumper, and smooth-scroll feel must remain unchanged.
- Keep GSAP and ScrollTrigger as the single animation owner.
- Keep the static HTML deployment. Do not introduce React, Tailwind, or a component library for this work.
- Keep the page light. Dark mode is not part of this pass because the present brand system and supplied assets are designed around a light spatial field.

### 3.2 Change

- Add one documented responsive layer below the existing desktop source of truth.
- Stack the existing alternating product sections at phone and tablet widths without changing their desktop classes or order.
- Keep compact navigation available below desktop without altering the established desktop header.
- Make mobile use native scrolling.
- Turn hover-only orbit controls into real buttons with keyboard and touch behavior.
- Consolidate conflicting CSS before visual tuning.
- Make all full-viewport sections use dynamic viewport behavior without a phone-hostile fixed minimum.

### 3.3 Avoid

- No hamburger menu for only two page destinations.
- No generic three-card feature row.
- No extra gradients, purple AI color, excessive glass, decorative badges, or pill overload.
- No new scroll hijack.
- No custom cursor.
- No animation of layout properties such as `top`, `left`, `width`, or `height` during continuous motion.
- No automatic video playback for reduced-motion or data-saver users.

## 4. Responsive foundation

### 4.1 Breakpoint contract

Use mobile-first rules and document the same thresholds in CSS and JavaScript.

| Mode | Width | Primary behavior |
|---|---:|---|
| Small phone | 320-479px | Single column, full-width actions when needed, compact orbit, 16px gutters |
| Large phone | 480-767px | Single column, inline actions when they fit, larger visual stage |
| Tablet | 768-1023px | Single-column product stories with wider copy and landscape media |
| Compact desktop | 1024-1279px | Two-column hero and selected product layouts, restrained gutters |
| Desktop | 1280-1439px | Full editorial compositions within a shared max-width |
| Wide | 1440px and above | Content stops growing; whitespace absorbs extra width |

Implementation rules:

- Use `48rem`, `64rem`, and `90rem` as the main CSS thresholds.
- Store matching query strings once in `work.js` for behavior code.
- Replace the 720px compact check in `welcome.js` and `field.js` with the documented phone query.
- Use `gsap.matchMedia()` for behavior that must be created and destroyed when a query changes.
- Test exact boundary values: 767/768px, 1023/1024px, and 1439/1440px.

### 4.2 Shared tokens

Add one responsive token layer close to the existing color and type tokens:

```css
:root {
  --content-max: 90rem;
  --reading-max: 42rem;
  --page-gutter: clamp(1rem, 3.5vw, 4rem);
  --section-space: clamp(4.5rem, 9vw, 9rem);
  --section-space-compact: clamp(3rem, 7vw, 5rem);
  --nav-height: clamp(4rem, 6vw, 4.75rem);
  --radius-control: 0.25rem;
  --radius-panel: clamp(0.75rem, 1vw, 1rem);
  --focus-ring: 2px solid var(--deep-forest);
}
```

Apply these principles:

- One outer container rule: `width: min(calc(100% - 2 * var(--page-gutter)), var(--content-max)); margin-inline: auto`.
- Use logical properties such as `padding-inline`, `margin-block`, and `inset-inline`.
- Use `clamp()` for display type, section spacing, and media heights.
- Keep body copy between 45 and 65 characters per line.
- Add safe-area padding with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` where fixed chrome touches an edge.
- Use `100dvh` for current viewport composition and `100svh` only as a fallback.
- Remove the 720px minimum from phones. A desktop minimum can remain inside a desktop-and-tall-screen query.

### 4.3 CSS ownership

Before tuning the design:

1. Move the inline page and hero styles from `index.html` into a dedicated `videos/gateway-hero/page.css`.
2. Keep orbit component styles in `field.css`.
3. Keep product, client, inquiry, and footer styles in `work.css`.
4. Merge duplicate declarations so each component has one base block and adjacent responsive overrides.
5. Remove commented-out and superseded declarations after screenshot parity is confirmed.
6. Preserve the final cascade order: tokens, page shell, field, work.

This cleanup is not cosmetic. It removes the source of conflicting mobile behavior before new responsive rules are added.

## 5. Page-wide layout specification

### 5.1 Document shell and semantics

- Add a keyboard-visible skip link targeting the main content.
- Wrap the hero and page sections in a semantic `<main id="main-content">`.
- Keep the site footer outside `<main>`.
- Promote the persistent hero title to the page's single `h1`.
- Change the welcome title to non-heading display text because it is decorative and hidden from accessibility APIs.
- Preserve all existing section heading IDs and `aria-labelledby` relationships.
- Add a concise meta description, favicon, canonical URL, and social metadata as a separate low-risk metadata task.

### 5.2 Header and navigation

Recommended structure:

- Left: XTATION wordmark.
- Right: `Products` linking to `#work` and `Contact` linking to `#contact`.
- Do not add a menu button. Two links fit at 320px when spacing and tracking are tuned.

Behavior:

- Keep the header fixed and visible for the full page.
- On the hero, use a transparent surface.
- After the hero, transition to a mostly opaque paper surface with a subtle bottom border. Blur may be used as enhancement, but the fallback must remain readable without it.
- Reduce header height slightly after leaving the hero, using only transform, opacity, background, and border transitions.
- Mark the nearest major destination as current with a quiet underline, not a filled pill.
- Keep every target at least 44 by 44 CSS pixels.
- Remove `bindBrandVisibility()` once the replacement header state behavior is implemented.
- Offset anchor destinations using `scroll-margin-top: calc(var(--nav-height) + 1rem)`.

### 5.3 Welcome bumper

Visual layout:

- Keep the centered gateway title and moving slabs.
- On phones, allow the title to wrap naturally within `min(18ch, 92vw)`.
- Scale and space slabs from live viewport metrics rather than a startup-only `compact` constant.
- Account for landscape phones, where height rather than width is the limiting dimension.

Behavior:

- Cap the full blocking welcome experience at 4 seconds. If the orbit is not ready, reveal the usable hero and allow models to finish progressively.
- Any wheel, touch, pointer, Enter, Space, Escape, or Tab intent should complete the exit promptly. Do not hold or discard the visitor's intended scroll for multiple seconds.
- Skip the bumper for repeat views in the same session.
- Do not run slab motion in reduced-motion mode. Use a brief static title crossfade.
- Listen to `visualViewport.resize` when available and window resize as fallback. Recalculate pitch, gutter, rail, and slab size without rebuilding the DOM.
- Clean up every listener and ticker on finish.

### 5.4 Orbit hero

Desktop composition:

- Use a two-area editorial grid: copy occupies roughly 40-44%, orbit occupies the remaining area.
- Keep the orbit's visual center right of the page center so the headline remains dominant.
- Constrain hero content to `--content-max`.
- Keep the `h1` to two lines at common laptop and desktop sizes.
- Keep both actions visible without scrolling at 768px high.

Tablet composition:

- Use a top-left copy block and a lower-right orbit.
- Keep at least 2rem of visual separation between the copy/action bounding box and the nearest orbit node.
- Let the orbit crop at the right edge deliberately rather than shrinking it until its labels become unreadable.

Phone composition:

- Use one column with copy first and orbit as the lower visual layer.
- Keep the heading, short lead, and actions in the top 50-58% of the viewport.
- Move the orbit center down and right. Its decorative rings may crop, but interactive nodes may not be clipped.
- Stack CTAs only below roughly 360px or when text zoom causes them to wrap. Otherwise retain a compact inline pair.
- Buttons remain at least 44px high and labels never wrap.
- On short landscape phones, prioritize copy and actions, reduce orbit scale, and remove the desktop minimum height.

Content refinement:

- Keep the headline.
- Tighten the default lead to roughly 16-22 words so it remains scannable on a phone.
- Keep `See Products` and `Book a Demo` as the two distinct intents.

Orbit interaction:

- Generate orbit controls as `<button type="button">`, not `div`.
- Remove `aria-hidden` from the interactive group while leaving canvas artwork hidden.
- Give each control an accessible name and an `aria-pressed` state.
- Match pointer hover with `focus` and touch `click`.
- Pause autoplay while a control is hovered, focused, pressed, or while the page is hidden.
- Resume only after a short idle delay. Do not fight a user's selection.
- In reduced-motion mode, show the default hero copy and a static orbit. Manual selection may swap copy without animated transitions.

### 5.5 Product chapter introduction

- Place the “Explore What We Can Do for Your Business” heading inside the shared max-width container.
- Keep it left aligned and limit it to two lines on desktop and three on the smallest phones.
- Reduce the glass-like emphasis treatment to a quiet tinted text highlight with a solid fallback.
- Use `text-wrap: balance` for the heading and `text-wrap: pretty` for supporting copy.
- Add a one-sentence introduction only if it helps explain the upcoming product groups. Do not add decorative microcopy.

### 5.6 Product story rhythm

Preserve every product, anchor, source order, and desktop zigzag. Below 1024px, collapse every product into the same media-first reading pattern.

#### Family A: lead showcases

Products: BikinKonten and Lubna.

- Keep two premium split showcases, one media-left and one media-right.
- Desktop ratio remains exactly as established by `work.css`.
- Tablet: media above copy, landscape media ratio around 16:10.
- Phone: media above copy, full bleed to the section's inner edge, copy below.
- This is the only consecutive alternating pair.

#### Operational products

Products: CRM AI Agent, HireAssess, and Arkiv.

- Keep the established alternating desktop sections.
- At tablet and phone sizes, each row becomes media, title, tagline, and description in document order.
- Use consistent spacing and geometry between stacked sections.

#### Build and intelligence products

Products: CoDev, CoFrame, and CoFinance.

- Keep CoDev, CoFrame, and CoFinance in the original alternating desktop sequence.
- At tablet and phone sizes, stack CoFrame and CoFinance in source order.
- Keep their media aspect ratios stable so the ending does not jump during load.

Shared product rules:

- Preserve product IDs and heading associations.
- Add an optional product destination link only when a real URL exists. Do not create dead `#` links.
- Use one category-label treatment across all families.
- Keep label text in the darker accessible accent. Signal green can remain the decorative dot or underline.
- Set media with explicit `aspect-ratio`, `width`, and reserved block size to prevent layout shift.
- Use `object-position` per asset instead of one global center crop.
- Avoid fixed `min-height: 70dvh` on stacked mobile sections.

### 5.7 Client proof

- Keep “Trusted by” and the real logo assets.
- Desktop: title and logos share one quiet horizontal row.
- Tablet: title above a centered logo row.
- Phone: two-column logo grid with equal optical space, not forced equal logo widths.
- Preserve logo aspect ratios and set explicit width and height.
- Do not reduce opacity on touch devices because there is no hover path to restore it.
- Verify every supplied logo against the paper background and use a consistent monochrome treatment only if it does not erase brand recognition.

### 5.8 Inquiry section

- Replace position-dependent copy with: “Scan the code to connect, or tap it to email us.”
- Desktop: left-aligned copy beside a 280-352px code.
- Tablet: centered or left-aligned stack based on measured line length, with the code below.
- Phone: left-aligned copy followed by a code no wider than `min(16rem, 78vw)`.
- Keep the mail action directly tappable and give it an accurate accessible label.
- Add a visible text email fallback beneath the code. QR-only contact is not sufficient.
- Keep focus and pressed feedback. Disable lift motion under reduced motion.

### 5.9 Footer

- Keep the footer compact.
- Add `Products` and `Contact` links only if they mirror the header and do not create a link farm.
- Stack only when 200% text zoom or a 320px viewport requires it.
- Respect bottom safe-area inset.
- Use the current year from markup or a tiny deterministic script. Do not make the footer dependent on a library.

## 6. Motion and responsive behavior

### 6.1 Motion principles

Every animation needs one purpose:

- Welcome motion communicates entry into the XTATION product field.
- Hero copy motion establishes hierarchy.
- Orbit transitions communicate selection.
- Product reveals establish reading order.
- Header transition communicates that the visitor has left the immersive hero.
- CTA motion provides input feedback.

Anything not serving one of those purposes should remain still.

### 6.2 Scroll behavior

- Use native scrolling for `pointer: coarse`, `hover: none`, reduced motion, data saver, and shot/test modes.
- Limit Lenis to fine-pointer desktops where it measurably improves the experience.
- Reduce the current long, floaty feel. Target an anchor transition around 0.8-1.1 seconds rather than 2.4 seconds.
- Keep anchor behavior interruptible. Wheel, touch, or key input should cancel an in-progress programmatic scroll.
- Do not attach a raw scroll listener for animation.
- Keep ScrollTrigger for the hero fold and product entrances.

### 6.3 Responsive GSAP lifecycle

Refactor `work.js` to use `gsap.matchMedia()`:

- `all`: header state, accessible manual interactions, and basic entries.
- `(min-width: 48rem)`: richer product entrance staggering.
- `(min-width: 64rem) and (hover: hover) and (pointer: fine)`: desktop-only blur, parallax, and enhanced smooth scrolling.
- `(prefers-reduced-motion: reduce)`: immediate static states.

Each query callback must return cleanup. On query change:

1. Kill owned timelines and ScrollTriggers.
2. Clear only properties that the query branch applied.
3. Recompute layout.
4. Refresh ScrollTrigger after fonts and media dimensions settle.

### 6.4 Entrance language

- Keep one restrained reveal language across products.
- Use opacity plus a small `translateY` or scale shift. Do not combine scale, blur, rotation, and large translation on every section.
- Desktop: 500-700ms, 50-70ms child stagger, `cubic-bezier(0.16, 1, 0.3, 1)` or GSAP `power3.out`.
- Phone: opacity and 8-12px translation only, no blur.
- Reduced motion: content is present immediately with no hidden initial state.
- Reveal once. Do not replay long entrances when scrolling back.

### 6.5 Media policy

- Continue playing only the most visible project video.
- Prefer an `IntersectionObserver` with a generous root margin to prepare the next media item without attaching all sources.
- Use posters instead of video when `prefers-reduced-motion`, `navigator.connection.saveData`, or a low-capability policy is active.
- Pause and release video when the document is hidden.
- Verify that source removal and restoration do not collapse reserved dimensions.
- Produce smaller mobile encodes only after measuring the existing 9.4MB video on a real constrained profile.

## 7. Accessibility and resilience

### 7.1 Keyboard and focus

- Add a skip link as the first focusable element.
- Make header links, orbit controls, hero CTAs, the mail action, and footer links keyboard reachable.
- Use one 2px high-contrast focus ring with at least 2px offset.
- Never remove focus outlines without a replacement.
- Confirm focus is not trapped by the welcome bumper.
- Confirm fixed navigation does not cover focused anchors.

### 7.2 Semantics and announcements

- Maintain one accessible `h1`.
- Use headings in order for the chapter, products, clients, and inquiry.
- Keep decorative canvases, rings, slabs, and videos hidden from accessibility APIs.
- Do not put the interactive button group inside an `aria-hidden` ancestor.
- Do not announce autoplaying story changes through an aggressive live region.
- When a user manually selects an orbit item, update the selected state and associated copy relationship with `aria-controls` or a clearly labelled region.

### 7.3 Contrast

- Use `--deep-forest` or `--accent-readable` for normal-sized green text on `--page`.
- Reserve `--signal` for large text, controls with verified contrast, focus treatment, dots, and decorative emphasis.
- Verify body, label, button, hover, focus, and disabled states against their actual computed backgrounds.
- Target at least 4.5:1 for normal text and 3:1 for large text and non-text UI boundaries.

### 7.4 User preferences and fallbacks

- `prefers-reduced-motion`: no welcome slab travel, no orbit autoplay, no smooth scroll, no parallax, no looping button color animation, no video autoplay.
- `prefers-reduced-transparency`: replace any blurred header or highlight surface with an opaque paper fill.
- `forced-colors`: retain visible focus, buttons, links, and control boundaries.
- 200% zoom: no horizontal scrolling, clipped controls, or overlapping fixed header.
- No JavaScript: show hero copy, static media posters, all product content, contact information, and footer.
- WebGL failure: hide failed canvases and retain the static orbit/poster fallback without blocking page entry.

## 8. Implementation work packages

### WP0: baseline and visual contract

1. Record the current Git commit and preserve unrelated changes.
2. Run the live root page, not the isolated hero page.
3. Capture screenshots at 320x568, 375x667, 390x844, 768x1024, 1024x768, 1280x800, 1440x900, and 1536x864.
4. Capture phone landscape at 844x390.
5. Record the welcome, hero, first product, product midpoint, clients, inquiry, and footer.
6. Run keyboard-only and reduced-motion walkthroughs.
7. Record performance and layout-shift baselines.

Exit condition: screenshots and behavior notes make regressions visible.

### WP1: semantic shell and CSS consolidation

1. Add the skip link and semantic `main`.
2. Fix the single-`h1` structure.
3. Extract inline layout CSS to `page.css`.
4. Consolidate tokens and duplicate mobile rules.
5. Add the shared container, gutter, spacing, viewport, and safe-area tokens.
6. Preserve visual parity before proceeding.

Exit condition: the current design still looks equivalent, but each component has one understandable style owner.

### WP2: header and hero responsiveness

1. Add the two-link primary navigation.
2. Replace brand disappearance with transparent/scrolled header states.
3. Implement phone, tablet, compact-desktop, and wide hero compositions.
4. Remove the phone-hostile 720px minimum.
5. Align CSS and JavaScript breakpoints.
6. Make welcome metrics responsive to visual viewport changes.
7. Add fast exit, session skip, and failure timeout behavior.

Exit condition: hero content and actions fit without overlap in every target viewport and input mode.

### WP3: accessible orbit behavior

1. Convert nodes to semantic buttons.
2. Add focus, pressed, and touch states.
3. Pause autoplay for user interaction and document visibility.
4. Add reduced-motion and WebGL-failure static states.
5. Verify resize and orientation behavior.

Exit condition: every orbit selection is operable with mouse, touch, and keyboard, and decorative rendering remains hidden from assistive technology.

### WP4: product layout system

1. Group products into the three defined layout families while preserving IDs and source order.
2. Implement mobile-first media and copy ordering.
3. Add tuned tablet rules instead of relying on a 1024px collapse.
4. Reserve media dimensions.
5. Normalize type measures, spacing, category treatment, and accessible colors.
6. Update ScrollTrigger entrances for the new structure.

Exit condition: the sequence has visual rhythm on desktop and a clear, consistent reading order on mobile.

### WP5: clients, inquiry, and footer

1. Tune logo layout and hover-independent visibility.
2. Make inquiry copy position-independent.
3. Add a visible email fallback.
4. Add safe-area and text-zoom resilience to the footer.
5. Verify the final navigation and conversion path.

Exit condition: the lower page remains polished, readable, and actionable at all widths.

### WP6: behavior, performance, and final QA

1. Move responsive animation ownership to `gsap.matchMedia()`.
2. Disable Lenis on touch and preference-constrained modes.
3. Verify media/data-saver policy.
4. Remove obsolete rules and dead listeners.
5. Run the complete validation matrix below.
6. Update project documentation with final deviations and measured results.

Exit condition: no known blocker remains in layout, access, input, motion preference, or performance.

## 9. Validation matrix

### 9.1 Viewports

| Viewport | Must verify |
|---|---|
| 320x568 | No horizontal scroll, hero actions available, no orbit overlap, footer fits |
| 375x667 | Welcome and hero fit, CTAs do not wrap, product media reserves height |
| 390x844 | Full phone rhythm and contact tap target |
| 844x390 | Landscape fallback prioritizes copy and actions |
| 768x1024 | Tablet product stack, balanced media, navigation spacing |
| 1024x768 | Compact desktop transition has no sudden oversized whitespace |
| 1280x800 | Hero split, header state, product family rhythm |
| 1440x900 | Reference desktop composition |
| 1536x864 and wider | Shared max-width prevents over-stretching |

### 9.2 Interaction

- Mouse with hover.
- Touch simulation and a real coarse-pointer device when available.
- Keyboard only: Tab, Shift+Tab, Enter, Space, Escape, Page Up/Down, Home, and End.
- Screen reader smoke test for landmarks, headings, button names, and link destinations.
- Browser back/forward and same-page anchor restoration.
- Resize across each breakpoint while the page is open.
- Portrait-to-landscape rotation during the welcome and after it.
- Interrupted anchor scroll.

### 9.3 Preferences and failure modes

- Reduced motion enabled before load.
- Reduced motion toggled while the page is open where the browser supports it.
- Data saver or a mocked `navigator.connection.saveData`.
- JavaScript disabled.
- WebGL disabled or context creation forced to fail.
- Slow network with uncached fonts, video, and models.
- Failed CDN request for GSAP, Three.js, or Lenis.
- Hidden tab and resumed tab.
- 200% browser zoom and enlarged text.

### 9.4 Quality gates

- No unintended horizontal overflow at any test width.
- No text collision, orphaned CTA label, clipped focus ring, or covered anchor.
- No content hidden before JavaScript initializes.
- No duplicate `h1`.
- All interactive targets are at least 44 by 44 CSS pixels.
- Normal text meets 4.5:1 contrast.
- Reduced-motion mode contains no autoplay, parallax, smooth scroll, or looping button animation.
- Layout shift remains below 0.1.
- Largest Contentful Paint target is below 2.5 seconds on the agreed test profile.
- Interaction to Next Paint target is below 200ms.
- Welcome never blocks usable content beyond the 4-second failure cap.
- Only one product video is active at a time.
- Every event listener, observer, ticker, timeline, and ScrollTrigger has explicit cleanup.

## 10. Recommended delivery sequence

Ship as three reviewable changes rather than one large redesign:

1. **Foundation:** WP0-WP2. Semantics, CSS ownership, tokens, navigation, welcome, and hero.
2. **Content system:** WP3-WP5. Orbit access, product families, clients, inquiry, and footer.
3. **Hardening:** WP6. Responsive motion lifecycle, performance, failure modes, and complete QA.

Each change should include before-and-after screenshots at phone, tablet, compact desktop, and desktop widths. Do not start the next change while the previous one has an unresolved overflow or accessibility regression.

## 11. Definition of done

The project is complete when:

- The page reads as one coherent XTATION experience at every target width.
- The hero remains distinctive without sacrificing copy, actions, or input.
- The product sequence no longer feels like eight repeated templates.
- Navigation remains useful after the hero.
- Mouse, keyboard, and touch users receive equivalent controls and feedback.
- Preference-constrained and failure modes retain all essential content and actions.
- CSS and responsive JavaScript use a documented shared contract.
- Automated checks, screenshots, keyboard review, and real-device smoke testing all pass.
