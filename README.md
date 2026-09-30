# Arabic Interview Guide

A full-stack interview-preparation app for browsing, searching and maintaining technical questions and answers. The UI is Arabic-first and right-to-left, covering 10 categories: Laravel Core, Laravel Advanced, backend engineering, System Design, Node.js, React, React Native, Testing & Security, Docker & DevOps, and Databases & SQL. The bundled content is 113 questions and 296 answers.

> The application interface is in **Arabic** (RTL). All documentation in this repository is in English.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why this project

This is a small but complete product rather than a code snippet. The database work is the part worth reading:

- **Versioned migrations.** The schema is not a `CREATE TABLE` blob in application code. `backend/src/db/migrate.js` keeps a `schema_migrations` table, reads `backend/src/db/migrations/*.js` in filename order, and applies each pending one inside `BEGIN` … `COMMIT` with its version row in the same transaction, so a failure rolls back and aborts rather than leaving a half-migrated database. Four migrations exist: `001-initial-schema`, `002-question-metadata`, `003-performance-indexes`, `004-full-text-search`.
- **Full-text search that works on Arabic.** Two FTS5 virtual tables, `search_questions` and `search_answers`, kept in sync by six triggers so the index cannot drift from the base tables. `unicode61` treats Arabic letters as token characters, so no custom tokenizer is needed. User input is sanitised into an inert `MATCH` expression, and a multi-word query is tried with `AND` first and retried with `OR` when the definite article makes the strict form return nothing.
- **Indexes proven, not asserted.** SQLite does not index foreign key columns automatically, so filtering by `category_id` and fetching a question's answers were both full table scans. Migration `003` adds three indexes. The test suite reads their names back out of `sqlite_master` and then runs `EXPLAIN QUERY PLAN` on both predicates, asserting the plan uses an index. Delete one of the indexes and the suite fails.
- **Real pagination.** `GET /api/questions` and `GET /api/search` return `{ items, total, page, limit, pages }`. Pagination is applied to question ids before the answers are joined in, because limiting the joined rows would let a question's answer count eat the page budget and `total` would disagree with what the client actually received.
- **Transactional writes.** Question create and question update each run in a transaction, so a partial answer set can never persist.
- **CI that gates on all of it.** `.github/workflows/ci.yml` runs the backend suite on Node 20 and 22, then frontend lint, type-check, tests and build, with `npm audit --audit-level=high` failing the build on a new high-severity advisory.
- **A decomposed frontend.** `App.tsx` went from 781 lines to 334, with a typed API client, five custom hooks and 14 components behind it. Search is server-side and debounced, and in-flight requests are cancelled with `AbortController` so fast typing cannot show stale results.

It was built as a personal study tool and is documented to the standard expected of a production codebase, which makes it a practical reference for interview preparation on both frontend and backend work.

## Features

**Study mode**

- Browse 10 technical categories, each tab showing its live question count.
- Page through questions server-side; the client never holds the whole set.
- Search across both question *and* answer text with SQLite FTS5, ranked so direct question matches come first.
- Difficulty badge and tags on every question; 46 of the 113 questions carry more than one answer.
- Light and dark themes.
- Clear loading, error and empty states, including a retry action when the API is unreachable.

**Manage mode**

- Create, edit and delete categories, including label, icon and colour.
- Create, edit and delete questions and move them between categories.
- Set difficulty and tags, and add, edit or remove multiple answers per question.
- Every change is validated by the API and persisted to SQLite; failed saves surface the server's error instead of failing silently.

**API**

- 15 routes over three resources, plus health, statistics and the OpenAPI document, described by an OpenAPI 3.0 specification and served through Swagger UI.
- `GET /api/stats` returns site-wide totals with a per-category breakdown in one request.
- Creates return `201` with the new id; updates and deletes return `200`; `400` / `404` / `500` carry a consistent `{ "error": "..." }` body.

Full detail: [FEATURES.md](FEATURES.md). Design and data-model detail: [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 18.2, TypeScript 5 (strict), Vite 8                         |
| Styling    | Inline styles with a theme object; no CSS framework              |
| Backend    | Node.js 20+, Express 5.2, ES modules                              |
| Database   | SQLite via `sqlite3` 6, FTS5, parameterised SQL, foreign keys     |
| Migrations | Versioned runner in `backend/src/db/`                            |
| API docs   | OpenAPI 3.0 served with Swagger UI (`swagger-ui-express` 5)      |
| Testing    | `node:test` + Supertest 7 (API), Vitest 4 + Testing Library (UI) |
| Tooling    | ESLint 10 flat config, `tsc --noEmit`, GitHub Actions             |
| Runtime    | Docker + Docker Compose, or local `npm`                           |

## Quick start

### Docker Compose

Requires Docker with the Compose plugin.

```bash
git clone https://github.com/housamelmasry/Interview.git
cd Interview
touch backend/.env        # Compose references this file; no values are required
docker compose up --build
```

- App: <http://localhost:5173>
- API: <http://localhost:3000>
- Swagger UI: <http://localhost:3000/api/docs>

On first start the schema is migrated and the 10 categories are bootstrapped from `data.json`; both steps are idempotent, so restarts change nothing. Load the bundled questions and answers with:

```bash
docker compose exec backend npm run seed
```

> **Warning** — the seed script clears all categories, questions and answers before inserting the bundled content. Run it only when you intend to replace your data.

### Local, without Docker

Use two terminals from the repository root.

```bash
cd backend
npm install
npm run seed     # optional: loads the bundled questions
npm run dev      # http://localhost:3000
```

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

The frontend calls `http://localhost:3000` by default. To point it elsewhere, set `VITE_API_URL`:

```bash
VITE_API_URL=https://api.example.com npm run dev
```

## Database and search design

### Migrations instead of a schema blob

`backend/src/database.js` opens the database, runs `PRAGMA foreign_keys = ON` (SQLite disables it per connection, so `ON DELETE CASCADE` would silently do nothing), then runs migrations, then bootstraps any category from `data.json` that is not present yet. Only then does it resolve the exported `ready` promise, which `server.js` awaits before `app.listen` — no request can arrive before the schema exists.

| Version | Change |
| ------- | ------ |
| `001-initial-schema` | `categories`, `questions`, `answers`, all `IF NOT EXISTS` so a database from an earlier version migrates cleanly |
| `002-question-metadata` | `difficulty` and `tags` via `ALTER TABLE ADD COLUMN`, guarded by a `PRAGMA table_info` check, since SQLite has no `ADD COLUMN IF NOT EXISTS` |
| `003-performance-indexes` | the three indexes below |
| `004-full-text-search` | the two FTS5 tables, six triggers, and a backfill of rows that predate the index |

Categories are a separate concern from schema: they are bootstrapped from `data.json` on every start, missing ids only, so a restart never duplicates or wipes user edits.

### Indexes, and proof they are used

```text
idx_questions_category_id        questions(category_id)
idx_questions_category_created   questions(category_id, id)
idx_answers_question_id          answers(question_id)
```

Before migration `003` there were no indexes on any foreign key column — only `INTEGER PRIMARY KEY` is implicitly indexed, as the rowid alias. The composite index exists because the list endpoint filters on `category_id` and orders by `id`, so one index covers both without a separate sort.

`EXPLAIN QUERY PLAN` moves from `SCAN questions` to `SEARCH questions USING INDEX idx_questions_category_id`, and the test suite asserts exactly that.

### Search with FTS5

Two virtual tables rather than one per question, because a trigger body may not contain a subquery and "recompute this question's answers" is exactly that. Each base row is therefore indexed individually, which keeps every trigger a single-row statement, and the two result sets are merged in the query.

A question matches either because its own text matched (`source = 0`) or because one of its answers did (`source = 1`). Ordering by `source` first, then `bm25()`, means a direct question match always outranks an answer-only match.

Input is sanitised before it reaches `MATCH`: everything that is not a letter or digit becomes a space, tokens are wrapped in double quotes so they are inert string literals rather than query syntax, at most 8 tokens are kept, and the last token gets a prefix `*` so results narrow as the user types. FTS5 operators in user input are stripped rather than executed.

The tokenizer is `unicode61 remove_diacritics 2`. `unicode61` classifies letters and digits by Unicode category, so Arabic is indexed and matched as-is; `remove_diacritics 2` folds Latin accents, so `café` matches `cafe`. It is token-level only — no stemming and no morphological analysis, so inflected forms of one root remain distinct tokens.

Multi-word queries are `AND`ed first, because "service container" should not match a question that only mentions "service". Arabic breaks that: the definite article is written attached to the word, so a query like "ال container" contains a token that matches nothing and the strict form returns zero rows. When that happens the query is retried with `OR`, which is a second round trip on the rare empty-result path.

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── data.json        # Bundled content: 10 categories, 113 Q, 296 A
│   │   ├── database.js      # Connection, PRAGMA, migrations, category bootstrap
│   │   ├── search.js        # FTS5 match building, result merge, row grouping
│   │   ├── openapi.json     # OpenAPI 3.0 specification (9 paths, 14 schemas)
│   │   ├── seed-data.js     # Replaces DB content with data.json
│   │   ├── server.js        # Express app, 15 routes, Swagger UI
│   │   └── db/
│   │       ├── migrate.js   # Versioned migration runner
│   │       └── migrations/
│   │           ├── 001-initial-schema.js
│   │           ├── 002-question-metadata.js
│   │           ├── 003-performance-indexes.js
│   │           └── 004-full-text-search.js
│   ├── test/
│   │   └── api.test.js      # 52 API tests, 8 suites
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Composition root: 334 lines
│   │   ├── App.test.tsx     # 41 component tests
│   │   ├── constants.ts     # Page size, debounce delay, difficulty labels
│   │   ├── theme.ts         # Theme object for both modes
│   │   ├── api/
│   │   │   ├── client.ts    # Typed fetch wrappers, ApiError, URL building
│   │   │   └── types.ts     # Wire types mirroring the JSON exactly
│   │   ├── hooks/
│   │   │   ├── useDebounce.ts
│   │   │   ├── useDebounce.test.ts   # 4 hook tests
│   │   │   ├── useQuestions.ts       # Endpoint choice, abort, pagination
│   │   │   ├── useResource.ts        # Load / reload / clearError
│   │   │   ├── useCategories.ts
│   │   │   └── useStats.ts
│   │   ├── components/      # 14 components + shared styles
│   │   ├── test/
│   │   │   ├── fixtures.ts  # In-memory fake API over the paginated contract
│   │   │   └── setup.ts
│   │   ├── index.css
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── eslint.config.js
│   ├── index.html
│   ├── vite.config.ts       # Vite + Vitest config
│   └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml           # Backend Node 20/22; frontend lint, types, tests, build
├── docker-compose.yml
├── ARCHITECTURE.md          # Design decisions and data model
├── FEATURES.md              # Feature inventory and API reference
├── SKILLS.md                # Skills demonstrated, with code evidence
├── LICENSE
└── README.md
```

The SQLite file is created at `backend/src/interview_guide.db` on first run. It is generated at runtime and git-ignored. Set `DB_PATH` to put it somewhere else.

## Scripts

| Command          | Where     | What it does                                   |
| ---------------- | --------- | ---------------------------------------------- |
| `npm run dev`    | both      | Start the dev server (API on `:3000`, UI on `:5173`) |
| `npm run build`  | `frontend`| Type-check with `tsc`, then build for production |
| `npm run lint`   | `frontend`| ESLint 10 flat config over the source          |
| `npm test`       | both      | Run the test suite                              |
| `npm run seed`   | `backend` | Reset the database to `data.json`               |
| `npm start`      | `backend` | Run the API server                              |

## Quality checks

Everything below is expected to pass on a fresh clone.

```bash
cd backend  && npm test    # 52 passing
cd frontend && npm test    # 45 passing
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

Both packages also report `0 vulnerabilities` from `npm audit`.

## Testing approach

The backend suite drives the real exported Express app in-process with Supertest against a temporary SQLite database, so it exercises actual SQL, migrations, transactions and cascade behaviour rather than mocks. `DB_PATH` is set before the app is imported, which is what keeps a test run from touching the local database. It covers:

- migrations applied, with the 4 versions recorded in `schema_migrations`
- index usage, via `EXPLAIN QUERY PLAN` on both foreign key predicates
- pagination: envelope fields, page splitting, clamping `limit=9999` to 100, non-numeric input, no overlap between pages
- search: Arabic terms, prefix matching, answer-only matches, the `AND`-then-`OR` fallback, and FTS5 operator sanitisation
- transactional writes: a create against a non-existent category leaves the question count unchanged
- cascade deletes at both levels
- CRUD for all three resources, including `201` on create and `404` on a no-op update or delete

The frontend suite renders the real component tree in jsdom with `fetch` stubbed to an in-memory fake API that speaks the real paginated contract, and asserts through accessible queries (`getByRole`, `getByLabelText`) alongside `data-testid` hooks — so the tests double as accessibility checks. It covers initial load and error/retry, category navigation and the empty state, expanding questions, difficulty and tag rendering, debounced server-side search, out-of-order response cancellation, pagination controls, the theme toggle, and the manage-mode create/edit/delete flows.

See [SKILLS.md](SKILLS.md) for the skills these tests demonstrate.

## Known limitations

This is a local portfolio and demo application. It is deliberately scoped as one:

- **No authentication or authorization.** Manage mode is open to anyone who can reach the API. Do not expose it publicly without adding access control.
- **SQLite and Compose target local development**, not production deployment. There is no reverse proxy and no TLS termination.
- **FTS5 is synchronous and single-writer.** Indexing happens inline on every write and SQLite serialises writers.
- **Pagination is offset-based.** Deep pages cost more because skipped rows are still counted and discarded.
- **Search is not scoped per category**, and Arabic matching is token-level with no stemming.
- **Individual answer routes are API-only.** `PUT` and `DELETE /api/answers/:id` are implemented, documented and tested, but the UI edits answers through the question form.
- **Categories are bootstrapped from `data.json` rather than migrated**, so renaming a bundled category is a bootstrap gap, not a tracked change.

## License

[MIT](LICENSE) © 2026 Houssam Elmasry
