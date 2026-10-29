# Cerebro visual redesign

Implemented in the existing React application. The final hard rules take precedence over the earlier gradient, subject-color, card-accent and animation requests.

## Visual decisions
Inter for interface text, existing IBM Plex Mono for algorithm state and course codes. Warm off-white canvas, white grouped controls, deep teal as the only accent. Flat statistics, divider-based lists and tables. Shared tokens live in frontend/src/tokens.css. The algorithm trace is interactive with an explicit next-step control; it has no automatic motion.

## Alignment issues addressed
- Removed the enclosing white page panel; title, sections and table share the content edge.
- Sidebar uses 248px width, 40px navigation rows, 16px Lucide icons and one bottom account/sign-out block. Account settings already had only one navigation entry in source.
- Subject rows use a shared two-column grid, independent full-width progress track and right-aligned percentage; recent activity uses the same 96px row pitch.
- Completion bars use a fixed code column and fixed percentage column.
- Topic evidence heading stays on one line. Table uses explicit column widths, right-aligned numeric columns, 16px cell padding, sticky headings and internal scrolling.
- Authentication forms share a fixed top offset across modes, rather than centering each form based on its height.
- Settings use two columns and a separate ruled deletion section.
- Fixed comma spacing in page copy and singular/plural topic counts in curriculum, unit and subject rows.
- Removed entry, progress and state animations and shadows. Hover/focus transitions are 150ms and respect reduced motion.

## Verification
- npm run build: PASS (existing large bundle warning remains).
- Sign-in and registration screenshots reviewed at 1440, 1024 and 390px. Trace cells fit the mobile content width; both tabs keep the same heading offset. Local demo credentials are masked in captures.
- Authenticated browser verification: BLOCKED. The configured MongoDB endpoint is stale. A fresh local MongoDB replica set also closed its connection during startup. No authenticated-page screenshot or functional-pass claim is made.
- Reproduce the remaining checks once the backend is available: node scripts/redesign-qa.mjs. Authentication-only checks: add --auth-only.

The redesign does not change API contracts, route paths or stored learning data. The mastery map links to existing topic routes and uses existing dashboard mastery bands.

## Follow-up verification
Authenticated browser checks were subsequently completed during the student-profile implementation using a fresh development MongoDB directory. Overview, progress, curriculum, simulation lab, settings, workspace and comparison routes had no page overflow at 1440/1024/390px. See STUDENT_PROFILE.md for profile-specific checks.

## Login editorial design
The auth page now uses a scoped ivory/forest palette, Georgia editorial headings and a 53/47 split. The generated photographic asset `frontend/public/images/cerebro-workbench.png` shows a Computer Engineering study desk (laptop, algorithms and systems books, notebook, development board). There is no algorithm demonstration on the auth page. On phones the scene collapses to compact branding.

`frontend/src/auth.css` contains auth-only styling; auth tokens remain in tokens.css. The existing API calls, registration validation, session flow, redirects, credentials and role permissions are unchanged. Demo buttons show student/teacher/admin labels while using their existing account objects. A password visibility toggle was added. The ambient hook now moves the decorative environment by at most two pixels per axis and resets on leave; text and controls stay still.

Verification: `node tests/auth-editorial.mjs` checks registration against the running backend, subsequent password sign-in, password visibility, all three demo roles, page errors and overflow/screenshots at 1440/1024/390px. `node tests/auth-ambient.mjs` checks panel-relative lighting, bounded parallax, leave fade, touch/reduced motion, login tabs and sign-ins. Both pass. No visual reference image accompanied the pasted brief; the written art direction was used.
