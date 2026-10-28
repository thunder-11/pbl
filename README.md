# Cerebro — Computer Engineering Learning Workbench

A JavaScript MERN application implementing the nine learning capabilities in [PRD.md](./PRD.md). It uses React/Vite/Tailwind, Express, MongoDB7/Mongoose, JWT/bcrypt, Monaco and Recharts. The source-mapped curriculum contains SY Semester IV Data Structures plus TY Semester V DSA, AI and DBMS. Four subjects,20 units and40 topic groups are mapped;14 topics initially have authored learning resources. The remaining26 display an explicit unavailable-resource state.

## Run locally

Requires Node22+ and npm. From this directory:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** or **http://localhost:5173**. Both local origins support sign-in and session refresh; keep the same hostname during a session.

The first run downloads the actual MongoDB7.0.14 Windows binary (approximately592MB),starts a one-member local replica set,and creates the development dataset. This is a real MongoDB database,not an in-memory JavaScript database substitute. Its data and binaries are stored under ignored `.data/`; data survives normal restarts. No Docker daemon is required. When `MONGODB_URI` is supplied in `backend/.env`,the local launcher uses that MongoDB deployment instead. Development seeding requires a database name ending `_dev` or `_test` and is refused for production.

Passwords and the JWT secret are generated locally on first run. Initial credentials print in the development terminal and are retained in ignored `.data/dev-credentials.json`. The accounts are:

The local sign-in screen also shows demo email/password pairs and one-click Student, Faculty and Administrator buttons. A development-only Vite endpoint reads only these demo passwords; it never returns the JWT secret. This endpoint is development-only, and the demo controls are not shown in production. Normal sign-in remains available. In local development, successful sign-ins do not consume the login budget; failed attempts are limited to 20 per IP and per account over 15 minutes. Production retains its five-request limit per IP and account over 15 minutes and accepts only the configured frontend origin.

| Role | Email |
|---|---|
| TY student,all selected courses including SY prerequisite | student-a@example.invalid |
| TY student,same curriculum | student-b@example.invalid |
| SY student,initially unstarted | student-c@example.invalid |
| Faculty,Data Structures/DSA | faculty-a@example.invalid |
| Faculty,AI/DBMS | faculty-b@example.invalid |
| Administrator | admin@example.invalid |

These are synthetic development identities. Existing accounts retain changes made in the app; rerunning the launcher does not reset passwords,content,rules or progress. Browser tests make genuine application requests using these demo identities,so running them adds learning activity to the development database. The initial synthetic histories remain labeled FIXTURE and never enter real mastery or completion.

## What works

- Topic-scoped reading,availability and completion across the selected source syllabus.
- All11 deterministic simulator families:Linear/Binary Search,Bubble/Selection/Insertion/Merge Sort,Stack,Queue,BST,BFS and DFS. Playback,next/previous/reset,speed,input validation,internal state and counters work through the backend.
- Opening a simulation starts and plays it automatically. Prediction checkpoints pause playback; answering or skipping resumes it, with time to read the feedback. Values slide between array positions, changed cells and active nodes show state colors, and counters/timeline update with the trace. Pause, manual stepping, reset and speed remain available. Reduced-motion preferences suppress visual animations.
- Topic tabs and workflow steps only show published, available activities. Deep links to unavailable activities fall back to the first available activity; topics without activities show a single empty state.
- Binary Search,Bubble Sort and BFS prediction checkpoints,immediate explanations,one feedback-only retry and first-answer accuracy.
- Snapshot-based five-question assessments,answer saving,server deadlines,atomic grading,idempotent finalization and recent-score mastery.
- Deterministic recommendations and explicit recurring-misconception mappings,with separate compilation/runtime/test-failure categories.
- A locally bundled Monaco editor with C,C++,Java and Python buffers,sample stdin,grading contracts,attempt history and redacted hidden tests.
- Real operation-count comparisons for Bubble/Merge using equivalent datasets and seeded reproducible generators.
- Personal dashboards,scoped faculty analytics,content revisions,publication,question/test authoring,prediction configuration,curriculum mapping management,admin account/assignment/status controls,rule versions and audit views.
- JWT access tokens in memory,rotating hashed refresh credentials,CSRF bootstrap after reload,role/scope/ownership enforcement,closed request schemas,rate limits and retention/deletion handling.

DBMS currently has explanation/assessment resources for relational SQL and transactions. It does not run SQL/PLSQL,student MongoDB commands or an additional database engine. Academic AI content does not introduce a machine-learning recommender.

## External code execution

The default is **UNAVAILABLE**. No local compilation or untrusted shell execution is used. The editor remains usable,but real run/grade actions require an isolated Judge0-compatible service. `MOCK` permits only explicitly synthetic RUN responses; grading and learning correctness remain disabled.

For REAL mode,configure the server-only variables in `backend/.env.example`:JUDGE0_BASE_URL,JUDGE0_API_KEY,JUDGE0_AUTH_HEADER,the four verified JUDGE0_LANGUAGE_* IDs,EXECUTION_MODE=REAL,and PROVIDER_CAPABILITIES_VERIFIED=true. Verify the provider's isolation,disabled networking,2-second CPU/5-second wall/128MiB limits and output controls before enabling that flag. Provider plan support and language/compiler versions must be checked against your actual account.

The backend persists dispatch intent,submits each job once,polls bounded tokens and records terminal infrastructure failures separately. An uncertain submission response is never automatically resubmitted. Hidden tests stay server-side; only pass/fail identifiers leave the grading boundary. The provider adapter has automated contract/fault tests with synthetic transport; **a real remote compilation run has not been verified in this environment**.

## Tests and browser verification

```sh
npm test
npm run build
npm run test:e2e
npm run test:motion
```

The Node test suite covers all algorithm families,golden counters,closed inputs,authentication/refresh/revocation,ownership,enrollment boundaries,assessment scoring,recurrence,grading-result redaction,provider failure contracts,content publication,rate limiting and deletion. It uses an isolated `trace_integration_test` database and never drops the development database. If the local development replica set is not running,it starts a disposable MongoDB7 replica set using the same binary cache.

Browser tests require a running local app and installed Microsoft Edge. They exercise the student journey,Monaco/comparison screens and faculty/admin views at1440,768 and390 pixels. Screenshots and reports go to `.taste-skill/qa/`. With the installed taste skill,the test also runs its authenticated-page probes and app rules. The skill's native inspector can inspect the sign-in page with `node <taste-skill>/scripts/inspect.mjs --app http://127.0.0.1:5173`; it has no authentication hook,so authenticated checks use the same probe/rule modules through Playwright.

The85 cases in PRD.md are the requirements-level test catalogue; automated test counts are reported separately in [IMPLEMENTATION.md](./IMPLEMENTATION.md). No production load/accessibility certification or hosted availability guarantee is claimed.

## Project organization

| Location | Responsibility |
|---|---|
| backend/src/models.js | All20 collection schemas,nested structures,indexes and transaction helper |
| backend/src/auth.js | JWT/cookie/CSRF handling,roles,ownership,subject scope and audit helpers |
| backend/src/algorithms.js | Validated deterministic traces and comparison counters |
| backend/src/learning.js | Simulation,prediction and assessment lifecycles |
| backend/src/progress.js | Completion/mastery,misconceptions,recommendations and analytics |
| backend/src/content.js | Draft/revision validation,publication and curriculum mutations |
| backend/src/coding.js | Isolated-provider dispatch/polling,grading and public-result redaction |
| backend/src/app.js | REST routing,validation,rate policies and permission boundaries |
| backend/src/maintenance.js | Retention and account-deletion cleanup |
| backend/src/data/catalogue.json | Source-derived course/unit/topic inventory |
| backend/src/seed.js | Guarded,reproducible development fixtures and curriculum bootstrap |
| frontend/src | Routed React workbench,locally bundled fonts/Monaco and responsive styles |
| backend/tests | Algorithm and API integration tests |
| tests/journey.mjs | Browser journeys,screenshots and design checks |
| scripts/dev.mjs | Local MongoDB/backend/Vite process lifecycle |

## API usage

All business endpoints use `/api/v1`,JSON envelopes and bearer JWTs,except login/registration and cookie refresh/bootstrap. The PRD describes the core API. Supporting UI discovery routes also provide:

| Method / route | Scope |
|---|---|
| GET /auth/enrollment-options | Public published subject identities for registration;no learner data |
| GET /content/:kind | Assigned faculty/admin authoring catalogue;includes learningResources |
| GET /admin/users | Admin-only account list |
| GET /coding-attempts | Owned,redacted history with explicit provenance |
| GET /assessment-attempts | Owned attempts for resuming saved assessments |

Simulation responses distinguish prediction attempt IDs from checkpoint definition IDs. Published learning resources use the same staff publication action as other definitions. Unknown fields and client-supplied owner/score/correctness values are rejected. Production must use one backend instance; in-memory IP rate budgets reset on restart,while MongoDB enforces durable execution concurrency and daily assessment limits.

## Deployment

Frontend:Vercel static hosting,root directory `frontend`,build `npm run build`,output `dist`. Configure a same-origin `/api/v1/:path*` rewrite to the actual Render HTTPS backend **before** the React Router SPA fallback. Set VITE_API_BASE_URL to `/api/v1`. Without the real backend hostname,a rewrite cannot be finalized here.

Backend:Render Node service with root directory `backend`,install `npm ci` from the repository workspace root,start `npm start --workspace backend`,NODE_ENV=production,PORT supplied by Render,MONGODB_URI pointing to MongoDB7 on Atlas,a32+-byte random JWT_SECRET,and FRONTEND_ORIGIN matching the exact Vercel HTTPS origin. The backend binds0.0.0.0 in production. Configure trusted proxy hops only after verifying the hosting chain. Access/refresh tokens and provider credentials never enter the frontend bundle.

Before first production use,set ADMIN_EMAIL,ADMIN_NAME and ADMIN_PASSWORD in the server environment and run `npm run bootstrap:admin --workspace backend`. This creates only the initial administrator and default rules,and refuses to replace an existing administrator. To initialize the source-mapped curriculum without demo users or synthetic learner history,set ALLOW_CURRICULUM_BOOTSTRAP=true and run `npm run bootstrap:curriculum --workspace backend`. Then disable that variable. Review authored instructional content before institutional use. Production seeding never creates student-a or other development identities.

Use an Atlas replica set with transactions;restrict database credentials/network access to the application. The process runs polling/retention internally and recovers durable accepted job tokens after restart. Managed-backup retention and restoration/re-deletion are operational responsibilities described in the PRD. No cloud resources or public deployment have been created by the local setup.

## Design

Anthropic frontend-design and Leonxlnx design-taste-frontend informed the implementation. Framed-sheet direction,seed191100531;locally bundled IBM Plex Sans/Mono,neutral navigation,teal on data,and the algorithm's actual state trace as the signature element. See [DESIGN.md](./DESIGN.md) for screen questions and verification notes.
