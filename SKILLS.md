# Skills demonstrated

A map of the engineering skills this project exercises, with the file and line where each can be inspected. Claims here are limited to what the code actually does — see [Known limitations](#known-limitations) at the end.

## Database and schema

**Relational data modelling** — three tables with correctly chosen key types: text slugs for caller-controlled category ids, `INTEGER PRIMARY KEY AUTOINCREMENT` for questions and answers, and declared foreign keys with `ON DELETE CASCADE`.
`backend/src/db/migrations/001-initial-schema.js`

**Schema design decisions made deliberately** — `difficulty` as `TEXT NOT NULL DEFAULT 'intermediate'` because SQLite has no enum type, with the valid set normalised in the seed script; `tags` as JSON-encoded `TEXT` rather than a join table, because the tag list is always read with its question and nothing queries by tag; no `created_at`/`updated_at` because the UI is not chronological and ordering is by `id`.
`backend/src/db/migrations/002-question-metadata.js`, `backend/src/db/migrations/001-initial-schema.js`, `backend/src/seed-data.js:21-44`

**Referential integrity** — `PRAGMA foreign_keys = ON` on every connection (SQLite defaults this off, which silently disables cascades) plus `ON DELETE CASCADE` on both foreign keys, so dependent rows cannot be orphaned. Asserted by tests rather than assumed: deleting a category removes its questions and their answers.
`backend/src/database.js:25-29`, `backend/src/db/migrations/001-initial-schema.js`, `backend/test/api.test.js:670-692`

## Versioned migrations

**A hand-rolled migration runner** — `schema_migrations (version, applied_at)` records what has run; `backend/src/db/migrations/*.js` is discovered, sorted, and applied by filename-without-extension as the version, so a migration cannot be silently renumbered into a different identity.
`backend/src/db/migrate.js:33-59`

**Transactional application with rollback** — each migration's `up(ctx)` and its `schema_migrations` insert commit together; a failure rolls that one back, aborts the run, and rethrows with the failing version named. The database is never left half-migrated.
`backend/src/db/migrate.js:62-85`

**Idempotent migrations** — `001` uses `CREATE TABLE IF NOT EXISTS` so it is a no-op on a database created by an earlier version of the app; `002` checks `PRAGMA table_info(questions)` before each `ALTER TABLE ADD COLUMN`, because SQLite has no `ADD COLUMN IF NOT EXISTS` and a bare `ALTER` on an existing column raises "duplicate column name".
`backend/src/db/migrations/001-initial-schema.js`, `backend/src/db/migrations/002-question-metadata.js:8-24`

**Migrations as a reviewable, data-free interface** — each migration exports a single `up(ctx)` and receives `{ run, get, all }` promisified helpers rather than the raw `sqlite3` handle, so it reads as plain sequential SQL with no callback boilerplate. Content lives in `data.json`, not in a migration.
`backend/src/db/migrate.js:13-31`, `backend/src/data.json`

**Startup ordering** — the port is bound only after migrations have run and starter categories are in place, so no request can arrive before the schema is usable; a migration failure exits rather than serving a broken API.
`backend/src/database.js:31-40`, `backend/src/server.js:455-463`

## Query performance

**Index selection validated with `EXPLAIN QUERY PLAN`, not guessed.** The three indexes were added because SQLite does not index foreign key columns automatically — only `INTEGER PRIMARY KEY` is implicitly indexed as the rowid alias — which left the two hottest read paths as full table scans. The before/after plans are written into the migration's own comment.
`backend/src/db/migrations/003-performance-indexes.js`

**Composite index for a filter-and-order read path** — `idx_questions_category_created (category_id, id)` lets the list endpoint's "filter by category, ordered by id" query be satisfied from one index instead of scanning and sorting separately. A single-column index on `category_id` alone leaves the ordering to the planner, so the composite one carries the id as a second key.
`backend/src/db/migrations/003-performance-indexes.js:21-24`

**Index existence as a test, including the query plan** — the suite reads the three index names back out of `sqlite_master`, then runs `EXPLAIN QUERY PLAN` on `questions WHERE category_id = ?` and `answers WHERE question_id = ?` and asserts the plan uses an index and does not regress to `SCAN questions`. The test accepts either category index because the planner legitimately picks the cheaper one; the assertion is on the property that matters, not the exact string.
`backend/test/api.test.js:76-127`

**Paginating by entity, not by joined row** — the result query fans each question out to one row per answer, so `LIMIT` applied to it would let a question's answer count consume the page budget (a page of 20 could return 7 questions). Both list endpoints page the question ids first and hydrate exactly those ids in a second statement; the placeholder list is built from the actual id count rather than padded to a fixed width.
`backend/src/server.js:210-233`, `backend/src/search.js:70-93`, `backend/src/search.js:164-172`

**Aggregation for counts instead of extra requests** — `GET /api/stats` returns the site-wide totals and the per-category breakdown in one response for the header summary, and `GET /api/categories` carries `question_count` per row for the tab badges, so neither needs a second request.
`backend/src/server.js:90-108`, `backend/src/server.js:114-127`

## Full-text search

**SQLite FTS5, two virtual tables keyed to their base tables** — `search_questions` (rowid = `questions.id`) and `search_answers` (rowid = `answers.id`), kept in step by six `AFTER INSERT/UPDATE/DELETE` triggers, with a backfill for rows that predate the index.
`backend/src/db/migrations/004-full-text-search.js`

**Working around a SQL limitation rather than working around the spec** — the obvious design (one FTS row per question holding concatenated question + answers, refreshed by an `AFTER UPDATE` trigger) is not expressible in SQLite, because a trigger body cannot contain a subquery and recomputing the concatenated text needs `SELECT group_concat(answer_text) FROM answers WHERE question_id = ...`. Indexing each base row individually keeps every trigger a single-row statement, and the two result sets are merged at query time instead. The reason is recorded in the migration file and the decision in [ARCHITECTURE.md](ARCHITECTURE.md#search-design-fts5).
`backend/src/db/migrations/004-full-text-search.js:10-14`

**Merging two result sets with a CTE** — a `WITH ... hits AS (...)` unions question-text hits (`source 0`) and answer-text hits (`source 1`), groups by question id taking `MIN(rank)`, and orders by `source` before `bm25()` rank so a question whose own text matched always outranks one that matched only via an answer. One CTE is shared by the count query and the page query, so `total` and `items` cannot disagree.
`backend/src/search.js:45-77`

**Arabic tokenization** — `tokenize = 'unicode61 remove_diacritics 2'`. `unicode61` classifies letters and digits by Unicode category, so Arabic letters are token characters and Arabic is indexed and matched with no custom tokenizer. `remove_diacritics 2` folds Latin accents (`café` matches `cafe`); it does not fold Arabic tashkeel or tatweel, so matching stays token-level with no stemming.
`backend/src/db/migrations/004-full-text-search.js:16-22`, `backend/test/api.test.js:477-482`

**Search-input sanitization treated as a security property** — FTS5 treats `"`, `*`, `^`, `NEAR`, `OR` and parentheses as syntax, so raw user input to `MATCH` yields `500`s and lets a term smuggle in operators. `buildMatchQuery` strips everything that is not a letter or digit, caps at 8 tokens, wraps each in double quotes so it becomes an inert string literal, and appends `*` to the last token only for prefix search. A table of FTS5 operators (`"`, `NEAR`, `*`, `container^`, `a OR`, `(((`) is run through the endpoint in tests, plus an assertion that an injection attempt does not return the whole corpus.
`backend/src/search.js:12-36`, `backend/test/api.test.js:579-600`

**A domain-specific fallback, not a generic one** — multi-word queries are ANDed, but Arabic writes the definite article attached to the word, so "ال container" contains a token that matches nothing in the corpus and the AND attempt returns zero. An empty AND result is retried with `OR`. The fallback only fires on an empty result set, so the extra round trip is paid only in the rare case.
`backend/src/search.js:139-159`, `backend/test/api.test.js:548-565`

**Prefix search for an as-you-type box** — only the final token gets the `*` suffix, so results narrow as the user types instead of every token becoming a prefix match.
`backend/src/search.js:33-35`

## API design

**Express 5 REST API** — 15 routes with correct HTTP verbs, plus a consistent `{ error }` JSON envelope across all of them.
`backend/src/server.js`

**A pagination envelope so the client needs no second request** — `GET /api/questions` and `GET /api/search` both answer with `{ items, total, page, limit, pages }`, where `total` counts the whole match set. `page` is 1-based, `limit` defaults to 20 and is clamped to 1..100, and invalid input falls back to a default rather than erroring, so a stale hand-edited link still renders.
`backend/src/server.js:51-79`, `backend/src/server.js:193-239`, `backend/src/server.js:242-259`

**Correct status semantics** — creates return `201` with the new id; required fields are checked before any write and return `400`; updates and deletes inspect `this.changes` and return `404` rather than reporting success on a no-op.
`backend/src/server.js:129-147`, `backend/src/server.js:261-315`, `backend/src/server.js:397-452`

**Falsy parameter parsing handled explicitly** — `Number.parseInt` returns `NaN` rather than `undefined` for junk input, so the code tests `Number.isFinite` before clamping. `?limit=abc&page=xyz` yields the defaults; `?limit=0&page=0` yields `limit=1, page=1`.
`backend/src/server.js:59-69`, `backend/test/api.test.js:384-395`

**Denormalised read payloads** — category `label`, `icon` and `color` are selected alongside each question so a search result can be labelled without a second lookup.
`backend/src/search.js:84-93`

**OpenAPI 3.0 specification as a committed artifact** — a 727-line document with 9 paths and 14 reusable schemas, served both as raw JSON and through an interactive Swagger UI. Because it is a file rather than route annotations, the contract is reviewable in a pull request and diffable over time. Cascade behaviour, the replace-not-patch contract of `PUT /api/questions/:id`, and the fact that `answers` accepts both strings and objects are written down rather than left to be inferred.
`backend/src/openapi.json`, `backend/src/server.js:19-27`

**Testability by construction** — the app is exported and the port is bound only when `server.js` is run directly, so the suite drives the real application in-process with no listener. `DB_PATH` redirects the database, isolating tests from local data.
`backend/src/server.js:452-465`, `backend/src/database.js:13-15`, `backend/test/api.test.js:10-16`

## Transactions and write integrity

**ACID transactions around multi-row writes** — question creation and question-with-answers updates run inside `BEGIN` … `COMMIT` with `ROLLBACK` on every failure path, including a no-op update that has to roll back before its own `404`. A question can therefore never persist with a partial answer set.
`backend/src/server.js:274-315`, `backend/src/server.js:337-379`

**A transaction boundary proven by a test** — a create whose `category_id` does not exist fails on the foreign key, and the test asserts the question count is unchanged afterwards. That is the assertion that actually pins the rollback rather than describing it.
`backend/test/api.test.js:292-300`

**Replace-not-patch semantics for a child collection** — a supplied `answers` array is the complete desired set, deleted and reinserted inside one transaction; omitting the array leaves answers untouched. Simpler and safer than diffing, and the reason the individual answer endpoints are unused by the UI.
`backend/src/server.js:317-364`, `backend/test/api.test.js:397-446`

**SQL injection defence** — every query in the project uses `?` placeholders. No user input is concatenated into SQL anywhere, including the id lists in the two hydrate queries, which are generated from placeholder marks.
`backend/src/server.js`, `backend/src/search.js`, `backend/src/db/migrations/`

**Non-destructive bootstrap versus explicit seed** — startup inserts any category from `data.json` that is missing and leaves existing rows alone; `npm run seed` is the deliberate destructive reset. A normal restart can never wipe a user's edits.
`backend/src/database.js:65-96`, `backend/src/seed-data.js:46-96`

## Frontend

**Component decomposition of a monolith** — `App.tsx` went from ~781 lines to 334 and is now a composition root holding view state and wiring, with data fetching in hooks and rendering in fourteen presentational components under `components/`, none of which fetch anything.
`frontend/src/App.tsx`, `frontend/src/components/`

**Layered data flow** — `api/types.ts` (wire types) → `api/client.ts` (typed fetch) → `hooks/useResource` (generic load/error/reload primitive) → domain hooks (`useQuestions`, `useCategories`, `useStats`) → components. `useCategories` and `useStats` are a handful of lines each because they are `useResource` pointed at a different endpoint.
`frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/hooks/useResource.ts`, `frontend/src/hooks/useCategories.ts`, `frontend/src/hooks/useStats.ts`

**A generic fetch primitive** — `useResource<T>` owns the loading flag, the error state, the `reload` counter and the abort-on-cleanup, so no hook reimplements the request lifecycle. It also exports `describeError`, the single place an unknown throwable becomes banner text.
`frontend/src/hooks/useResource.ts:23-64`

**TypeScript typing of an API contract** — the wire types mirror the JSON exactly, including snake_case and `difficulty` as a union, because the client passes responses through untouched instead of re-mapping them. `strict`, `noUnusedLocals` and `noUnusedParameters` are on, and `tsc --noEmit` runs in CI.
`frontend/src/api/types.ts`, `frontend/tsconfig.json`, `.github/workflows/ci.yml:76-77`

**Errors as thrown values, not status codes** — `request()` throws an `ApiError` carrying the HTTP status and the server's own message, so call sites use `try`/`catch` and a failed save shows "Category not found" rather than a status line. Non-JSON error bodies still produce a usable message.
`frontend/src/api/client.ts:15-54`

**Race-condition handling with `AbortController`** — `useQuestions` creates a controller per effect and aborts it on cleanup, with a local `active` flag as a second guard. Without this, a fast typist's earlier slow response can resolve after the later fast one and overwrite the newer results with stale ones. The test holds a response open, issues a newer query, asserts the first request's `signal.aborted`, then resolves the abandoned response and asserts the UI did not change.
`frontend/src/hooks/useQuestions.ts:55-87`, `frontend/src/App.test.tsx:389-421`

**Debouncing as a generic hook** — `useDebounce<T>(value, delay)` is a value-plus-delay primitive with timer cleanup, not a search-specific effect. The search box stays controlled and responsive while the list refetches only when typing pauses; a burst of three keystrokes collapses into one request.
`frontend/src/hooks/useDebounce.ts`, `frontend/src/App.test.tsx:245-282`

**Endpoint selection in one place** — `useQuestions` decides between `/api/search` and `/api/questions` on whether the term is non-empty, so no component knows that two endpoints exist. The envelope is spread straight into the hook's return value, so pagination controls read `total`/`pages` from the server instead of recomputing them client-side.
`frontend/src/hooks/useQuestions.ts:67-103`, `frontend/src/components/Pagination.tsx`

**Derived state, not duplicated state** — the theme object and the active category are `useMemo`-computed from existing state, so they cannot drift. `activeCategory` validates the selected id against what actually exists and falls back to the first category, which is why deleting the active category in manage mode cannot leave the list pointing at nothing.
`frontend/src/App.tsx:54`, `frontend/src/App.tsx:73-79`, `frontend/src/App.test.tsx:136-148`

**Optimistic-free mutation handling with a single failure path** — `reportFailure` turns any throwable into a banner message and keeps the form open, and `reloadAll` refreshes questions, categories and stats together so counts and tab badges cannot show a stale value after a write.
`frontend/src/App.tsx:94-98`, `frontend/src/App.tsx:120-127`

**Immutable array updates** — adding, editing and removing an answer builds a new array and replaces state, so React's change detection stays correct.
`frontend/src/components/QuestionForm.tsx`

**Accessibility as part of the design** — form controls are associated with labels via `htmlFor`/`id`, the error banner uses `role="alert"`, interactive elements are real `<button>`s, the answer toggle carries `aria-expanded`, the active tab carries `aria-pressed`, and every icon-only control (dismiss, edit, delete, remove answer) has an `aria-label`. RTL is designed in, not mirrored: `dir="rtl"` at the document level, and pagination places "previous" on the right where it belongs in reading order.
`frontend/src/components/ErrorBanner.tsx:13-49`, `frontend/src/components/CategoryTabs.tsx:47-82`, `frontend/src/components/QuestionCard.tsx:47`, `frontend/src/components/Pagination.tsx:41-65`, `frontend/index.html:2`

**Centralised configuration** — the API base URL is read once from `VITE_API_URL` at module scope and page size and debounce interval live in `constants.ts`, so no magic numbers are scattered through components.
`frontend/src/api/client.ts:13`, `frontend/src/constants.ts`

## Testing

**API integration tests** — 52 tests across 8 suites using the built-in `node:test` runner and Supertest. They exercise the real app, real SQL, real migrations, real transactions and real cascades against a temporary database, not mocks.
`backend/test/api.test.js`

**Asserting on query plans, not just results** — a test can pass while the data layer silently degrades to a full scan. The suite checks `sqlite_master` for the three index names and then checks `EXPLAIN QUERY PLAN` output for both foreign-key predicates, so a dropped index or a planner regression fails the build.
`backend/test/api.test.js:76-127`

**Contract tests for status codes and envelopes** — `201` on create, `400` on missing required fields, `404` on no-op update and delete, pagination clamping, and the full envelope shape on empty results as well as populated ones.
`backend/test/api.test.js`

**Search tests as security tests** — FTS5 operator input (`"`, `NEAR`, `*`, `container^`, `a OR`, `(((`) must return `200` with a well-formed envelope rather than a syntax error, and an injection attempt must not return the whole corpus.
`backend/test/api.test.js:579-600`

**The Arabic OR fallback pinned by a test** — the AND result is asserted to exclude questions matching only one token, and the "ال container" retry is asserted to recover the Arabic match, so both halves of the fallback are protected.
`backend/test/api.test.js:548-565`

**Regression tests as documentation** — the missing `PUT /api/categories/:id` route is pinned by a test named for the bug it prevents, and the page-size-by-question behaviour is pinned by a test that seeds three questions with three, two and one answers.
`backend/test/api.test.js:177`, `backend/test/api.test.js:351-382`

**Component tests with accessible queries** — 41 tests render the real `App` in jsdom and assert through `getByRole`, `getByLabelText` and `getByTestId`, the same queries assistive technology uses, so the suite doubles as an accessibility check. A further 4 cover `useDebounce` through `renderHook`, making 45 in total. The label/input association bug found while writing them was a real defect, not a test artefact.
`frontend/src/App.test.tsx`, `frontend/src/hooks/useDebounce.test.ts`

**A testing gotcha documented rather than worked around quietly** — `userEvent` deadlocks under Vitest fake timers, because Testing Library's async wrapper only advances Jest's clock and the awaited interaction never resolves. Debounce behaviour is therefore tested by driving a `fireEvent.change` burst and asserting at the debounce boundary: nothing at `DEBOUNCE_MS - 1`, exactly one request for the final value after `+1`. `userEvent` is still used everywhere real timers are in play. Timer state is reset in `afterEach` so a fake-timer test cannot stall the next one.
`frontend/src/App.test.tsx:245-282`, `frontend/src/test/setup.ts:5-13`

**Test isolation** — each backend run gets a fresh temp database removed in `after`, and `DB_PATH` is set before the app is imported so importing the server cannot touch the developer's local data. The frontend's `afterEach` runs `cleanup`, restores real timers, clears timers, restores mocks and un-stubs `fetch`.
`backend/test/api.test.js:10-16`, `backend/test/api.test.js:38-41`, `frontend/src/test/setup.ts`

## Developer workflow and tooling

**CI with a Node version matrix and audit gating** — the backend job runs on Node 20 and 22 with `fail-fast: false`, because FTS5 availability and the `sqlite3` native build differ across majors. Both jobs run `npm audit --audit-level=high`, so a new high-severity advisory fails the build rather than being noticed later. The frontend job runs lint, `tsc --noEmit`, tests and the production build in that order.
`.github/workflows/ci.yml`

**Superseded runs cancelled** — a `concurrency` group of `ci-${{ github.ref }}` with `cancel-in-progress: true` stops an older run on the same branch instead of queueing it behind a newer one.
`.github/workflows/ci.yml:9-12`

**Modern linting** — ESLint 10 flat config combining `js.configs.recommended`, `typescript-eslint`, `react-hooks` and `react-refresh`, including React Hooks correctness rules such as `set-state-in-effect`. The two places where a fetch hook must reset its loading flag carry an explicit, commented disable, because there the rule is right about the dependency and wrong about the situation.
`frontend/eslint.config.js`, `frontend/src/hooks/useResource.ts:36-39`, `frontend/src/hooks/useQuestions.ts:61-64`

**Dependency hygiene** — both packages install from lockfiles with `npm ci` and cache by lockfile path in CI. Bringing the tree to a clean audit required upgrading Vite 5 → 8, Vitest 2 → 4, ESLint 8 → 10 and their plugins, because the previously pinned versions carried known advisories including a critical one.
`backend/package-lock.json`, `frontend/package-lock.json`, `.github/workflows/ci.yml:40-44`

**Docker** — separate images per service, coordinated by Compose with port mapping, volumes, `env_file` and `depends_on`, both on `node:20-alpine` and installing from lockfiles.
`backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`

**Reproducible setup** — all content lives in version-controlled `data.json`, so a fresh clone reaches a fully populated state with one command and no manual data entry. The seed script normalises on the way in: `answers` may be a single string or an array, an unrecognised `difficulty` falls back to `intermediate`, and blank tags are dropped.
`backend/src/data.json`, `backend/src/seed-data.js:23-44`

## Practices worth calling out

- **Documentation treated as a deliverable.** Four documents covering the recruiter-facing overview, feature inventory, architecture and skills, each cross-linked and each verified against the code.
- **Non-obvious decisions recorded where they are made.** The trigger-subquery limitation, the tokenizer choice, the `MAX_TOKENS` cap and the before/after query plans are all explained in comments in the source, not only in this repository's documentation.
- **Known limitations stated openly** rather than omitted — see below.
- **Defensive UI copy.** The delete-category confirmation originally told the user their questions would survive, while the foreign key silently cascaded and deleted them. The copy now matches the actual behaviour, and a test asserts the warning text.
- **No dead code in the repository.** Superseded JSX drafts, a stale database file, a log file and an editor swap file had been committed; all were removed and the patterns added to `.gitignore`.

## Known limitations

Stated plainly, because claiming otherwise would be misleading:

- **No authentication, authorization, accounts or sessions.** Manage mode is open to any client that can reach the API.
- **Search is not scoped per category** — a term searches every category and the tabs are hidden while searching.
- **Arabic search is token-level.** Diacritics are normalised, but there is no stemming or morphological analysis, so inflected forms of one root are distinct tokens.
- **Pagination is offset-based**, so deep pages degrade linearly; keyset or cursor pagination would be the fix at scale.
- **FTS5 is synchronous and single-writer**, which is fine for 113 questions and would not be for a much larger corpus or concurrent writes.
- **No rate limiting, caching, structured logging or deployment configuration.** There is no reverse proxy or TLS termination.
- **Categories are bootstrapped from `data.json`** rather than migrated, so renaming a bundled category is a bootstrap gap rather than a tracked change.
- **No end-to-end browser tests.** The frontend suite is component-level with `fetch` stubbed; the search and pagination tests assert the request URLs and payloads sent.
- **Single-page frontend with no router.** Navigation is local state, so there are no deep links to a specific question.
- **Individual answer endpoints are unused by the UI**, which edits answers through the question form instead.
