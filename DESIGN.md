# Trace design notes

Both Anthropic frontend-design and design-taste-frontend informed this application. Taste draw: framed-sheet, seed191100531, no redraws.

## Product and data inventory

- Computer Engineering students revisit this workbench for focused learning sessions.
- Four official subject identities: SY Data Structures, TY DSA, AI and DBMS.
- Twenty units and forty topic groups; fourteen groups initially have resources.
- A topic holds explanations, distinct assessment/coding attempts and deterministic simulation sessions.
- Real progress starts at zero; synthetic fixture history never becomes real mastery.
- Assessment mastery is a mean of recent eligible scores, separate from completion.
- An algorithm state has an array/tree/graph, pointers, recursion/queue and counters.
- Code execution depends on an isolated external provider and must be honestly labeled.
- Faculty work inside assigned subjects; administrators manage roles and rules.
- The frequent action is continuing a topic or stepping through an algorithm.

## Direction

IBM Plex Sans is locally bundled; IBM Plex Mono is used only for code, IDs and state values. Tokens: frame #f9fbfc, sheet #ffffff, ink #131416, muted #5d5f60, edge #e8eaec, data teal #1b6c80. A 228px labeled sidebar and48px contextual top bar form a neutral L-frame. The white sheet has an8px inset and16px radius; its content uses24px gutters and8px panels, no resting shadows. At1440px the workspace is1440−228−8−48=1156px; two equal panels are566px with24px between them. Mobile folds navigation into a top menu and stacks panes.

The characteristic element is an algorithm's state trace: visible pointers, the current operation and actual comparison/write counters. It belongs to this product rather than a generic statistics dashboard. The syllabus list uses restrained course marks and a real hierarchy; charts use teal for current evidence and neutral comparisons. No invented attendance, streaks, ranks or learning gains.

## Screen questions

| Screen | First question | Main action |
|---|---|---|
| Overview | What should I work on next? | Open a recommended topic |
| Curriculum | What belongs to my syllabus? | Select a topic |
| Topic | Which part of this concept needs work? | Read, simulate, assess or implement |
| Simulation | What exactly happens next? | Step or predict |
| Assessment | Can I apply the concept? | Answer and submit |
| Workspace | Does this implementation pass its tests? | Run or grade externally |
| Comparison | How do operation counts change? | Compare identical datasets |
| Progress | What evidence supports my understanding? | Revise a weak topic |
| Faculty | Which assigned students need support? | Review scoped progress/content |
| Administration | Who can access what? | Provision and assign accounts |

Every screen includes loading, empty, error and focus states. Development credentials are generated locally. As requested, the local sign-in page exposes the three demo account passwords through a development-only endpoint; these values are not embedded in production assets. All displayed totals derive from API data.

## Verification

The installed Anthropic frontend-design and Leonxlnx design-taste-frontend skills were applied. Source inspection returned zero failures. Its five advisory warnings concern a zero-padded assessment clock and monospace algorithm values/pointers, which are intentional technical notation. The Taste native browser inspector passed sign-in at 1440, 768 and 390 pixels with four advisory warnings: development-server hosting, unused horizontal canvas, small supporting text and whitespace inside the sign-in layout. The centered form and reserved explanatory panel are deliberate; no failing rule was waived for sign-in. Authenticated browser tests use the same installed probe and app-rule modules for overview, simulation, workspace, comparison and progress; reports and screenshots are saved in `.taste-skill/qa/`.

One narrowly scoped inspector allowance applies to progress: Recharts creates a hidden text measurement span at the viewport origin, which the generic edge-text rule counts as visible-edge content. The measurement element is library infrastructure, so the progress check allows edge-text; horizontal overflow and all app rules remain enforced. The UI does not hide this measurement element or alter chart sizing to satisfy the checker.

Visual review corrected overlapping array-pointer labels by stacking simultaneous labels inside their cell. Native and authenticated inspection are evidence of the checked screens and sizes, not comprehensive accessibility certification.
