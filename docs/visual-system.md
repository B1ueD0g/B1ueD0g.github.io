# Blog visual system

Updated: 2026-10-14

## Visual direction

The site uses an editorial research style: paper gray, near-black text, a restrained blue-gray accent and quiet rules. Home introduces the author and a reading starting point. Articles favors scanning. Research presents selected public work before the full record. About keeps the personal narrative and existing facts.

## Typography and surfaces

- Bree Serif with the existing Chinese serif fallback remains the display and reading face. Manrope and the existing Chinese sans-serif fallback carry navigation, dates, labels and controls.
- Mobile section navigation is at least 12px with 44px-high targets, short labels and horizontal scrolling when needed. Do not shrink labels to fit an arbitrary column count.
- White surfaces identify featured content or tools. Long About sections and archive entries use spacing and fine dividers rather than repeated large cards.
- Content containers remain still on hover. Feedback belongs to links and controls.
- A section heading supplies one divider. Adjacent Markdown rules do not create a second visible divider. Automatic decorative section numbers are removed.

## Motion

- Action feedback: 160ms, mainly color and border.
- Local disclosure: about 220ms, opacity with a small translation where useful.
- First entry below the fold: 280ms, at most 8px and played once.
- Native page continuity retains 140ms exit and 190ms entry.
- Reading reduces the ambient frame. Mobile has no repeating ambient animation. All nonessential movement respects prefers-reduced-motion.
- Closed TOC panels are inert and absent from keyboard navigation. Closing returns focus to a visible trigger. Share subviews keep only visible controls in the focus loop.
- Only the latest search request owns the busy/update state, including its delayed animation frame.
- Initial search hydration and pointer feedback preserve the page position. Keyboard result navigation focuses and scrolls the selected result.
- The server emits the design identity class before first paint. Deferred JavaScript adds enhancement state without switching homepage geometry. The WeChat compatibility branch removes the identity class in the document head.

## Editable cover masters

The source masters are `static/branding/cover-analysis.svg`, `cover-guide.svg` and `cover-reading.svg`. Shared geometry and colors are in `static/branding/cover-system.json`.

The Canva design ID is `DAHX8r0FPgk`. Open it through your Canva account. Access and sharing permissions were not changed. The editable import source is `design/cover-masters/BlueDog-Cover-Masters.pptx`, with three 1200 x 630 pages. Text and line diagrams remain separate objects. This is a reusable design document, not an organization Brand Template with autofill fields.

- Original analysis: trust boundaries and evidence nodes.
- Field guide: connected steps.
- Reading and translation: source pages and marginal notes, with distinct published labels.
- Replace title, date, topic, author and archive ID with verified metadata. Placeholders in the masters are intentional.
- Keep titles complete. Long titles use the full text width and omit the illustration before reducing type size. The generator fails instead of cropping an unreasonable title.
- Existing article-specific covers retain precedence. Generated cards provide the fallback.
- CI installs Noto CJK fonts. Missing Chinese glyph support is a build failure rather than a silent Latin-only fallback.

The editable PPTX can be rebuilt with `scripts/generate_cover_masters.mjs` using the active artifact-tool presentation runtime. Set BLOG_ROOT, PRESENTATION_SKILL_DIR, RUNTIME_PYTHON and RUNTIME_NODE_MODULES to that runtime's documented paths. Run a private copy beside a node_modules link to the supplied runtime. The script preserves an existing final PPTX, so move the old final to a private rollback directory before creating a new revision. Inspect all three page renders before importing a revised copy into Canva.

## Checks before release

Run `npm run build`, `node scripts/check_interaction_states.cjs` and `python3 scripts/check_cover_system.py`. Serve `public/` on 127.0.0.1:8767 and run:

```sh
node scripts/check_visual_system.cjs --base-url http://127.0.0.1:8767 --output-dir /path/to/private/qa --playwright-module /path/to/installed/playwright
node scripts/check_home_composition.cjs --base-url http://127.0.0.1:8767 --output-dir /path/to/private/home-qa --playwright-module /path/to/installed/playwright
```

The visual check covers Home, Articles, About, Research, Search and two representative articles at 1440px and 390px, light and dark themes. It checks overflow, heading fit, readable section navigation, first-article placement, reduced motion, Research shelf width, TOC focus across viewport changes, share subview focus, Works tabs and search success/empty states. It also checks local code-block scrolling and mobile share-panel bounds. Cold-load cases delay enhancement by 0, 250 and 1000ms; the mobile homepage must remain usable with JavaScript disabled. Its unreadable-navigation negative control must be rejected. The original home composition test checks eleven viewports in both themes and rejects the old underscaled composition.

The cover regression check renders in a private temporary directory. It validates complete titles, long Chinese and unbroken English fallbacks, deterministic regeneration, all 39 current social-card dimensions and three editable PPTX pages. Excessive titles and missing CJK glyph support must fail explicitly.

Keep the production CSS gzip budget at 70,000 bytes and the search HTML budget at 100,000 bytes. Build and automated checks do not establish aesthetic approval, field performance or customer acceptance. Inspect fresh desktop, mobile and dark screenshots. Review the staged diff and exclude unrelated local edits before pushing.
