# Blog visual system

Updated: 2026-10-14

## Visual direction

The site uses an editorial research style: paper white, deep-sea blue, a warmer signal accent and quiet rules. Home introduces the author and a reading starting point, with an original orbital field illustration. Articles favors scanning. Research begins directly with the full public record; duplicated featured cards and ornamental record numbers are omitted. About keeps the personal narrative and existing facts, with a light English section index.

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
- The homepage field draws its connections once, in 1200ms. Fine-pointer desktop movement shifts only the internal illustration by at most 8px horizontally and 6px vertically; leaving, hiding the page or requesting reduced motion clears it. There is no idle animation-frame loop.
- Theme changes use a 480ms circular reveal where native View Transitions are available. Reduced motion and unsupported browsers change the theme immediately. Repeated clicks cannot let an older callback overwrite the newest theme choice. This follows the [native transition readiness model](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition/ready).
- Closed TOC panels are inert and absent from keyboard navigation. Closing returns focus to a visible trigger. Share subviews keep only visible controls in the focus loop.
- Only the latest search request owns the busy/update state, including its delayed animation frame.
- Initial search hydration and pointer feedback preserve the page position. Keyboard result navigation focuses and scrolls the selected result.
- The server emits the design identity class before first paint. Deferred JavaScript adds enhancement state without switching homepage geometry. The WeChat compatibility branch removes the identity class in the document head.

## Research header

Research keeps its title and full introduction across the desktop header. Topic labels and social controls share the next row; the introduction keeps its normal type size. Mobile wraps the introduction naturally and stacks topic labels above the social controls. Publication, preprint and individual draft status wording remains explicit.

## A small 404 walk

The 404 page is a seeded seven-by-five island game. Each new island changes its paths, bushes, stars, mailbox, optional bone and paired violet portals. Free exploration and a move-budget challenge share the same movement rules. The dog collects three reading stars and then delivers them to the mailbox. A portal jump costs one move and never bounces recursively; a bone gives 50 points and three extra challenge moves, once only. Blocking a bush or boundary does not consume a move. The challenge budget comes from the shortest legal delivery route plus a small margin, without requiring the optional bone. Delivery on the final move wins.

Replay restores the same map; shuffle and the next island create a new one. Later islands add a few bushes while retaining a playable route. Points reward stars, optional detours and efficient delivery. Each mode keeps a best single-island score on the current device; unavailable or corrupted storage falls back to the current session. A terminal result still offers a real current-archive article, and a win also offers the next island. There is no network leaderboard or real-time countdown. The production engine is independently tested for deterministic variety, the actual directed portal graph, optional-bone delivery paths, budgets, scoring, terminal states and malformed maps.

The visual direction uses a small paper island, sage stepping stones, a blue mailbox and golden stars, with a Canva illustration as art reference. Native SVG renders the generated map, and the pure engine is bundled before its page-local controller. Step hops, collection bursts and portal feedback are finite, event-driven animations; reduced motion or a hidden page cancels them. Direction keys, WASD and four 44px direction buttons control the same state, with keyboard capture limited to the board and controls. Search inputs and whole-page scrolling keep their normal behavior. Home, Articles, GET search, skip-game navigation and three real article links remain available without JavaScript.

## Whole-page translation

The header offers three concise choices: 中文, English and Deutsch, with a check on the current language. English and German open the current public page in [Google Translate's website translation service](https://support.google.com/translate/answer/2534559?hl=en), in a new tab so the source stays available. Choosing the current language closes the menu without loading it again. Keyboard users can use Tab, arrow keys, Home, End and Escape. The translated proxy marks its actual English or German state. These are automatic translations rather than independently reviewed language editions or alternate SEO pages.

Native links work without JavaScript. Enhancement preserves the current search query and section fragment, excludes the provider's own `_x_tr_*` parameters and keeps the public canonical origin. The site does not load a translation widget or contact Google until the reader chooses a translated version. Preformatted source code is marked `translate="no"` in server-rendered HTML; code, keyboard labels and math are also protected during enhancement.

## Release integrations

Both link-check workflows pin Lychee v0.24.2 and resolve root-relative links against the absolute generated `public` directory; both use Hugo 0.157.0. Anchored remapping sends same-origin absolute URLs to that same local build, so a new page or asset is checked before deployment rather than requested from the previous live release. The remap argument is single-quoted to retain the literal `$1` capture through the action's shell parsing. The configuration keeps `verbose = "info"`; boolean verbosity is rejected by that version. Local offline fixtures verify the repaired configuration, root-relative assets and missing-link failure behavior. The Safari mask icon has a real monochrome SVG asset. Historical article links are repaired at their source: moved official resources use verified replacements, while unavailable historical references remain explicitly identified as non-clickable original addresses. DOI values remain visible, and article titles link to their publication records. Bot protection or third-party certificate failures remain distinguishable from missing local files and are not silently accepted.

IndexNow notification runs after a successful Pages deployment, using the sitemap artifact from that same build. The script validates host, key, key-file scope and public key contents before sending. It preserves response bodies on errors and returns nonzero for rejected or unsuccessful submissions. HTTP 200 means received; HTTP 202 means received with key validation pending. Neither confirms crawling or indexing. A new public verification file is used while the older file remains available. The endpoint is an [official participating IndexNow endpoint](https://www.indexnow.org/faq), with no silent fallback after failure.

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
node scripts/check_not_found.cjs --base-url http://127.0.0.1:8767 --output-dir /path/to/private/404-qa --playwright-module /path/to/installed/playwright
node scripts/check_not_found_engine.cjs
node scripts/check_language_switch.cjs --base-url http://127.0.0.1:8767 --output-dir /path/to/private/language-qa --playwright-module /path/to/installed/playwright
python3 scripts/check_release_integrations.py
```

The visual check covers Home, Articles, About, Research, Search and two representative articles at 1440px and 390px, light and dark themes. It checks overflow, heading fit, readable section navigation, first-article placement, reduced motion, Research shelf width, TOC focus across viewport changes, share subview focus, Works tabs and search success/empty states. It also checks local code-block scrolling and mobile share-panel bounds. Cold-load cases delay enhancement by 0, 250 and 1000ms; the mobile homepage must remain usable with JavaScript disabled. Its unreadable-navigation negative control must be rejected. The original home composition test checks eleven viewports in both themes and rejects the old underscaled composition.

The cover regression check renders in a private temporary directory. It validates complete titles, long Chinese and unbroken English fallbacks, deterministic regeneration, all 39 current social-card dimensions and three editable PPTX pages. Excessive titles and missing CJK glyph support must fail explicitly.

Keep the production CSS gzip budget at 70,000 bytes and the search HTML budget at 100,000 bytes. Build and automated checks do not establish aesthetic approval, field performance or customer acceptance. Inspect fresh desktop, mobile and dark screenshots. Review the staged diff and exclude unrelated local edits before pushing.
