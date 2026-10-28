# Trace implementation and verification

Trace is a modular MERN monolith with a responsive React workbench, Express API, Mongoose models and MongoDB transactions. Application logic is JavaScript. Local development runs an actual MongoDB 7 replica set with persistent data; it does not substitute an in-memory document store for the database. Start with `npm install` and `npm run dev`; see README.md for environment and deployment instructions.

## Implemented scope

| PRD capability | Working implementation |
|---|---|
| Syllabus-aligned curriculum | SY Data Structures and TY DSA, AI and DBMS; course/unit/topic navigation, availability and faculty-scoped curriculum editing |
| Interactive algorithm simulation | Eleven algorithm families, validated inputs, deterministic trace states, array/tree/graph views, playback and operation counters |
| Understand–Test–Implement workflow | Linked reading acknowledgment, versioned question snapshots, saved answers, server deadlines, scored feedback and coding workspace with separate evidence |
| Adaptive learning paths | Deterministic next-activity choices from real mastery/completion evidence, stable priorities and recommendation lifecycle |
| Progress analytics | Category completion, assessment mastery, topic/subject summaries and scoped faculty views |
| Multi-language coding | Locally bundled Monaco, C/C++/Java/Python buffers, sample runs, hidden-test grading contracts and owned result history |
| Mistake-driven adaptation | Versioned deterministic recommendation rules, recurring misconception evidence, targeted revision and administrator rule editing |
| Predict the Next Step | Server-bound checkpoints, first-answer scoring, retries, feedback and state transition protection |
| Performance comparison | Same-input Bubble/Merge counts and generated-size series; comparisons measure operations rather than wall-clock execution |

Authentication includes memory-held access JWTs, rotating refresh-cookie families, CSRF checks, revocation and password changes. Accounts have one role; faculty receive explicit subject assignments. Authoring uses immutable published revisions and optimistic record versions. Ownership, publication status, enrollment and faculty scope are checked by the API. Administrative changes are audited. Retention and delayed deletion run inside the monolith.

All twenty PRD collections have Mongoose schemas and indexes. The curriculum seed includes four subjects, twenty units and forty topic groups. Fourteen topic groups have instructional resources and assessments, twelve have coding exercises, twelve simulation definitions cover eleven engine families, and three prediction checkpoint definitions are enabled. Development fixture histories are labeled FIXTURE and excluded from real learner analytics. Restarting development preserves learner work and authored content.

## Verification evidence

- Node algorithm and API integration suite: 74 tests, including golden operation counts, permissions, refresh reuse, assessment scoring, publication revisions, deletion, rate limits, code result redaction and provider transport failures. Database isolation guards prevent this suite from dropping development data.
- Browser acceptance: eight journeys through student, faculty and administrator views; no browser JavaScript errors. Reading, Binary Search prediction/completion, 100% server-graded assessment, Monaco loading, comparison counts and staff views are exercised.
- Responsive inspection: overview, simulation, coding, comparison and progress at 1440, 768 and 390 pixels. No horizontal page overflow. Authenticated pages use the installed Taste skill's browser probes and app rules. Sign-in also passes the skill's native browser inspector at all three widths.
- Frontend production build succeeds. Monaco is loaded separately; its bundle remains large. Build output warns about chunk size rather than a compilation failure.
- Screenshots and machine-readable reports are local artifacts under `.taste-skill/qa/` and `.taste-skill/sign-in/`. Test command output is in `.data/`.

The PRD test catalogue is broader than the automated suite; the test count above does not claim every catalogue case is automated. No production concurrency benchmark, comprehensive accessibility audit, backup restoration exercise or cloud availability test has been performed.

## Execution and content limits

Execution defaults to UNAVAILABLE. No local evaluation, compiler subprocess or simulated success is used for student source. MOCK mode is explicitly labeled and cannot award real correctness. REAL mode requires a configured, verified external Judge0-compatible service with supported language IDs and isolation limits. Adapter tests use synthetic transport responses; actual remote compilation has not been verified because provider credentials were not supplied. Hidden tests remain server-side and their contents are redacted from results.

The supplied SY/TY syllabi establish the course mappings. The instructional seed is a demonstrator, not complete teaching coverage of every syllabus topic. Twenty-six mapped groups currently have no instructional resource. AI currently includes introductory concept assessment and BFS state-space demonstration. DBMS includes relational/SQL and transaction concept assessments; it does not provide a live SQL or PL/SQL engine. Advanced capabilities identified in the PRD remain outside this MVP.

No Atlas connection, external execution provider or hosted frontend/backend has been provisioned. Local development is ready; production requires the environment configuration in README.md, institutional content review, and operational validation. Production account and curriculum bootstrap are separate from development fixtures. The current single-process deployment uses in-memory request-rate windows, which reset on restart; durable job ownership/concurrency is stored in MongoDB.
