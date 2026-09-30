# Skills demonstrated

A map of the engineering skills this project exercises, with the file and line where each can be inspected. Claims here are limited to what the code actually does — see [Known limitations](#known-limitations) at the end.

## Frontend

**React 18 with TypeScript** — function components and hooks (`useState`, `useEffect`) with strictly typed domain models. `strict`, `noUnusedLocals` and `noUnusedParameters` are enabled in `tsconfig.json`, so the type checker runs as part of `npm run build`.
`frontend/src/App.tsx:5-29`, `frontend/tsconfig.json:18-22`

**State modelling for a real UI** — thirteen pieces of state covering three modes of operation (loading, study, manage): selected category, expanded question, search term, loading and error flags, theme, manage-mode flag, and separate entities for the category and question forms being edited.
`frontend/src/App.tsx:32-48`

**Derived state, not duplicated state** — question counts per category and the filtered result list are computed during render from the existing question array instead of being stored. Category colour and label are mapped onto each result rather than kept in parallel state that could drift.
`frontend/src/App.tsx:206-224`, `frontend/src/App.tsx:424-427`

**Immutable array updates** — adding, editing and removing an answer builds a new array and replaces state, rather than mutating the existing one, so React's change detection stays correct.
`frontend/src/App.tsx:548-576`

**Asynchronous data loading** — a single `fetchData` function owns the loading flag, the error state and the data, with the error cleared at the start of each attempt and reset in `finally`. All four mutation handlers follow the same check-status-then-refetch pattern.
`frontend/src/App.tsx:51-89`, `frontend/src/App.tsx:96-205`

**Defensive state correction** — after loading categories, the selected tab is validated against what actually exists and falls back to the first category, so deleting the active category cannot leave the UI pointing at nothing.
`frontend/src/App.tsx:65-70`

**Configurable integration point** — the API base URL is read once from `VITE_API_URL` with a localhost default, instead of being hard-coded at each of the eight call sites.
`frontend/src/App.tsx:3`

**Form state handling** — controlled inputs for category id, label, icon and colour, plus a question form that manages a dynamic list of answers with per-row add and remove.
`frontend/src/App.tsx:475-582`

**Accessibility** — every form control is associated with its label via `htmlFor`/`id`; the error banner uses `role="alert"`; interactive elements are real `<button>` elements; dismiss controls have `aria-label`. Status messages are announced rather than being colour-only.
`frontend/src/App.tsx:475-545`, `frontend/src/App.tsx:590-645`

**Right-to-left interface** — `lang="ar"` and `dir="rtl"` at the document level, right-aligned text, and right-edge borders on answer blocks to follow reading direction. The app was designed RTL-first rather than mirrored afterwards.
`frontend/index.html:2`, `frontend/src/App.tsx:273`

## Backend and data

**Express 5 REST API** — thirteen resource-oriented routes with correct HTTP verbs, plus a consistent JSON error envelope.
`backend/src/server.js`

**Relational data modelling** — three tables with correctly chosen key types: text slugs for caller-controlled category ids, `INTEGER PRIMARY KEY AUTOINCREMENT` for questions and answers, and declared foreign keys.
`backend/src/database.js:39-78`

**Referential integrity** — `PRAGMA foreign_keys = ON` per connection (SQLite disables this by default) plus `ON DELETE CASCADE`, so dependent rows cannot be orphaned. Cascade behaviour is asserted by tests rather than assumed.
`backend/src/database.js:21`, `backend/src/database.js:59`, `backend/src/database.js:75`, `backend/test/api.test.js:366-385`

**ACID transactions** — question creation and question-with-answers updates run inside `BEGIN TRANSACTION` … `COMMIT` with `ROLLBACK` on every failure path, including prepared-statement finalisation. A question is therefore never persisted with partial answers.
`backend/src/server.js:166-203`, `backend/src/server.js:207-259`

**Prepared statements** — bulk answer inserts use `db.prepare` with `finalize`, rather than building interpolated SQL.
`backend/src/server.js:182-196`, `backend/src/server.js:239-253`

**SQL injection defence** — every query in the project uses `?` placeholders. No user input is concatenated into SQL anywhere.
`backend/src/server.js` (all 25 statements)

**Join and aggregation** — a three-table `LEFT JOIN` is collapsed into a nested structure in one pass using a `Map`, producing the `answers` array the client needs without an N+1 query pattern.
`backend/src/server.js:38-86`

**Input validation and status semantics** — required fields are checked before any write and return `400`; updates and deletes check `this.changes` and return `404` rather than reporting success on a no-op.
`backend/src/server.js:135-139`, `backend/src/server.js:211-215`, `backend/src/server.js:277-280`

**Idempotent startup** — schema creation uses `CREATE TABLE IF NOT EXISTS` and starter categories are inserted only when the table is empty, so restarting the server never duplicates or destroys data.
`backend/src/database.js:39`, `backend/src/database.js:102`

**Testability** — the Express app is exported and the port is bound only when the file is run directly, so tests drive the real application in-process. The database path is overridable via `DB_PATH`, which isolates tests from development data.
`backend/src/server.js:343-356`, `backend/src/database.js:9-13`

## API design and documentation

**OpenAPI 3.0 specification** — a committed 461-line specification with 7 paths, 10 reusable schemas, and worked examples on every operation, served both as raw JSON and through an interactive Swagger UI.
`backend/src/openapi.json`, `backend/src/server.js:17-23`

**Documented semantics** — cascade behaviour, the replace-not-patch contract of `PUT /api/questions/:id`, and the fact that `answers` accepts both strings and objects are all written down rather than left for the reader to infer.
`backend/src/openapi.json` (`description` fields)

## Testing

**API integration tests** — 33 tests across 6 suites using the built-in `node:test` runner and Supertest. They exercise the real app, real SQL, real transactions and real cascades against a temporary database, not mocks.
`backend/test/api.test.js`

**Regression tests as documentation** — the missing `PUT /api/categories/:id` route is pinned by a test named for the bug it prevents, and the transaction boundary is verified by asserting that a failed create leaves the question count unchanged.
`backend/test/api.test.js:102`, `backend/test/api.test.js:184-192`

**Component tests with accessible queries** — 27 tests render the real component in jsdom and assert through `getByRole`, `getByLabelText` and `getByPlaceholderText`, the same queries assistive technology uses. The tests therefore double as accessibility checks; the label/input association bug found while writing them was a real defect, not a test artefact.
`frontend/src/App.test.tsx`

**Test isolation** — each test run gets a fresh temp database that is removed afterwards, and `fetch` is restored and unstubbed between tests.
`backend/test/api.test.js:10-16`, `backend/test/api.test.js:38-41`, `frontend/src/test/setup.ts`

## Developer workflow and tooling

**Docker** — separate multi-stage-ready images per service, coordinated by Compose with port mapping, volumes and `depends_on`.
`backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`

**Modern linting** — ESLint 10 flat config combining `js.configs.recommended`, `typescript-eslint`, `react-hooks` and `react-refresh`, including React Hooks correctness rules. Getting this running surfaced a genuine `setState`-in-effect violation.
`frontend/eslint.config.js`, `frontend/src/App.tsx:92-97`

**Dependency hygiene** — both packages audit at `0 vulnerabilities`. This required upgrading Vite 5 → 8, Vitest 2 → 4, ESLint 8 → 10 and their plugins, because the previously pinned versions carried known advisories including a critical one.
`backend/package-lock.json`, `frontend/package-lock.json`

**Reproducible setup** — seeded content lives in version-controlled JSON, so a fresh clone can be brought to a fully populated state with one command and no manual data entry.
`backend/src/data.json`, `backend/src/seed-data.js`

## Practices worth calling out

- **Documentation treated as a deliverable.** Four documents covering the recruiter-facing overview, feature inventory, architecture and skills, each cross-linked and each verified against the code.
- **Known limitations stated openly** rather than omitted, including the absence of auth, pagination and migrations.
- **Defensive UI copy.** The delete-category confirmation originally told the user their questions would survive, while the foreign key silently cascaded and deleted them. The copy now matches the actual behaviour.
- **No dead code in the repository.** Superseded JSX drafts, a stale database file, a log file and an editor swap file had been committed; all were removed and the patterns added to `.gitignore`.

## Known limitations

Stated plainly, because claiming otherwise would be misleading:

- **No authentication, authorization, accounts or sessions.** Manage mode is open to any client that can reach the API.
- **No test coverage on the backend database module in isolation**, no load or performance testing, and no end-to-end browser tests — the frontend suite is component-level with `fetch` stubbed.
- **No CI pipeline.** The test, lint and build commands are documented and expected to pass, but nothing enforces them automatically on push.
- **Single-page frontend with no router.** Navigation is local state, so there are no deep links or shareable URLs to a specific question.
- **Client-side search and no pagination.** All questions are loaded at once; this is appropriate for 61 rows and would not be for thousands.
- **Individual answer endpoints are unused by the UI**, which edits answers through the question form instead.
- **No migrations, caching, rate limiting, structured logging or deployment configuration.** The database is created from a seed script, and there is no reverse proxy or TLS termination.
