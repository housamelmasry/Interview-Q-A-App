# Architecture

Design decisions, data model and request lifecycle for the Arabic Interview Guide. For feature detail see [FEATURES.md](FEATURES.md); for the skills this demonstrates see [SKILLS.md](SKILLS.md).

## System shape

A two-service application with a clear network boundary and no shared runtime state.

```text
┌────────────────────────────┐         ┌──────────────────────────────┐
│  frontend  (Vite dev :5173)│  HTTP   │  backend  (Express :3000)    │
│                            │────────▶│                              │
│  React 18 + TypeScript     │  /api/* │  CORS enabled, JSON bodies   │
│  fetches JSON, renders RTL │         │                              │
│  no server-side rendering  │         │  ┌────────────────────────┐  │
└────────────────────────────┘         │  │ routes ──▶ openapi.json│  │
                                       │  └────────────────────────┘  │
                                       │              │               │
                                       │         ┌────▼─────┐         │
                                       │         │  SQLite  │         │
                                       │         │  (file)  │         │
                                       │         └──────────┘         │
                                       └──────────────────────────────┘
```

The frontend never talks to the database, and the API holds no UI concerns. Either side can be replaced without touching the other, as long as the OpenAPI contract holds.

## Why these choices

**SQLite over a hosted database.** The app's entire dataset is 61 rows of static study content. A file-based database makes the project clone-and-run with no accounts, no connection strings and no external service, and it keeps the whole data layer inspectable in a single file. The trade-off is a single writer and no network concurrency, which is acceptable here and is why this is scoped to local development rather than production.

**Express with no ORM.** The schema is three tables. Hand-written parameterised SQL is shorter, has no query-builder abstraction to learn, and makes the transaction and cascade behaviour explicit rather than hidden behind an ORM's lifecycle hooks. Every statement uses `?` placeholders.

**A single endpoint returning nested questions.** Rather than `GET /api/questions` plus `GET /api/answers/:id` per question — an N+1 pattern — one `LEFT JOIN` across questions, categories and answers is collapsed server-side into a nested structure using a `Map`. One round trip, no N+1, and the client receives exactly the shape it renders.

**Category id as a text slug.** Category ids are supplied by the caller (`laravel-core`) rather than auto-generated. Ids stay readable in URLs and query strings, and seeding from `data.json` stays idempotent because the same ids can be inserted repeatedly.

**Inline styles with a single theme object.** Styling is a `theme` object of colour values consumed through inline `style` props, giving one source of truth for both themes without a CSS-in-JS dependency or duplicated custom properties. The trade-off is no stylesheet cascade and no media queries; the layout is a single vertical flow that adapts by width on its own.

**Composable database transactions.** Question creation and question-with-answers updates are wrapped in `BEGIN TRANSACTION` … `COMMIT` with `ROLLBACK` on every failure path, including prepared-statement finalisation errors. Bulk answer inserts use `db.prepare`/`finalize` for efficiency. This guarantees a question is never persisted with a partial answer set.

**Cascade deletes at the schema level.** `ON DELETE CASCADE` on both foreign keys makes orphan rows structurally impossible, rather than relying on application code to clean up. `PRAGMA foreign_keys = ON` is required because SQLite disables foreign key enforcement by default on every connection.

## Data model

```text
┌──────────────────────────┐
│ categories               │
├──────────────────────────┤
│ id           TEXT  PK    │◀──────┐
│ label        TEXT  NOT NULL      │ category_id
│ icon         TEXT               │ ON DELETE CASCADE
│ color        TEXT               │
└──────────────────────────┘       │
                                   │
┌──────────────────────────┐       │
│ questions                │       │
├──────────────────────────┤       │
│ id            INTEGER PK AUTOINCREMENT
│ category_id   TEXT  NOT NULL ──────┘
│ question_text TEXT  NOT NULL
└──────────────────────────┘
                │ question_id
                │ ON DELETE CASCADE
                ▼
┌──────────────────────────┐
│ answers                  │
├──────────────────────────┤
│ id           INTEGER PK AUTOINCREMENT
│ question_id  INTEGER NOT NULL
│ answer_text  TEXT NOT NULL │
└──────────────────────────┘
```

Design points:

- **Category ids are caller-supplied text slugs**, stable across environments and readable in URLs.
- **Questions and answers use surrogate integer keys.** Their natural content is unbounded prose, so a content-based key would be impractical.
- **`answer_text` is plain text, not HTML.** The UI renders it inside a `<pre>` with `white-space: pre-wrap`, which preserves multi-line formatting without a markdown library and without an HTML injection surface.
- **No `created_at` / `updated_at` columns.** Deliberate: the app has no chronological UI, and the omission keeps the write paths minimal.
- **Schema creation is idempotent** (`CREATE TABLE IF NOT EXISTS`), and the 8 starter categories are inserted only when the table is empty, so restarting never duplicates or wipes data.

### Referential integrity

```sql
PRAGMA foreign_keys = ON;  -- required: SQLite defaults this OFF per connection
```

Deleting a category removes its questions and their answers. Deleting a question removes its answers. This is asserted by tests rather than assumed — see `backend/test/api.test.js:366-385`.

## Request lifecycle

Read path, on first load:

```text
App.tsx mounts
  └─ useEffect ──▶ fetchData()
       ├─ setLoading(true), setError(null)
       ├─ GET /api/categories  ──▶ SELECT * FROM categories ORDER BY label
       │     └─ validate selected category still exists, else fall back
       ├─ GET /api/questions   ──▶ 3-table LEFT JOIN, grouped by Map
       │     └─ setQuestions(...)
       └─ finally: setLoading(false)
```

The API awaits a `ready` promise before binding its port, so no request can arrive before the schema exists. That promise resolves only once the starter-category insert has been flushed via the prepared statement's `finalize` callback — resolving it earlier exposed a partially seeded table, which is exactly the kind of race the tests caught.

Write path, for any manage-mode mutation:

```text
user submits form
  └─ POST or PUT with JSON body
       ├─ validate required fields ──(fail)──▶ 400 { error }
       ├─ BEGIN TRANSACTION
       │    ├─ INSERT/UPDATE question
       │    ├─ DELETE previous answers   (only when answers are supplied)
       │    ├─ prepared INSERT per answer
       │    └─ finalize ──(error)──▶ ROLLBACK ──▶ 500 { error }
       └─ COMMIT ──▶ 200 { id, message }
  └─ client checks response.ok
       ├─ (fail) ──▶ show server error, keep form open
       └─ (ok)   ──▶ close form, clear error, refetch
```

`PUT /api/questions/:id` treats a supplied `answers` array as the **complete desired state** and replaces the previous rows inside the same transaction. This replace-not-patch contract is simpler and safer than diffing, and it is why the individual answer endpoints are not used by the UI.

## API surface

13 routes over three resources, plus health and documentation. Full reference with examples in [FEATURES.md](FEATURES.md#api-reference).

```text
GET    /api/health
GET    /api/docs              Swagger UI
GET    /api/openapi.json      OpenAPI 3.0 spec

GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id

GET    /api/questions[?category=<id>]
POST   /api/questions
PUT    /api/questions/:id
DELETE /api/questions/:id

GET    /api/answers/:questionId
PUT    /api/answers/:id
DELETE /api/answers/:id
```

The specification is a committed file (`backend/src/openapi.json`) rather than annotations in the route handlers, so the contract is reviewable in a pull request and diffable over time. `backend/src/server.js` reads it once at startup and serves it both raw and through Swagger UI.

## Error handling

- Every API failure returns `{ "error": "..." }`. Validation failures are `400`, missing records `404`, database failures `500`.
- Updates and deletes inspect `this.changes` and return `404` rather than reporting success on a no-op.
- The frontend checks `response.ok` on all four mutations, displays the server's `error` field when present and falls back to a status-based message otherwise, and keeps the form open so input is never lost. Unexpected client errors are logged rather than shown raw.

## Seeding strategy

Two distinct mechanisms, deliberately separated:

| Mechanism | File | Behaviour |
| --- | --- | --- |
| Schema + starter categories | `backend/src/database.js` | Runs automatically on every start. Creates tables if absent; inserts the 8 categories **only if the table is empty**. |
| Bundled Q&A content | `backend/src/seed-data.js` (`npm run seed`) | Explicit and **destructive**: clears all three tables, then inserts 8 categories and 61 Q&A pairs from `data.json`. |

Keeping these separate means a normal restart never destroys the user's edits, while a deliberate reset is always one command away. `data.json` is version-controlled, so a fresh clone reaches a fully populated state reproducibly.

The seed script is a maintenance tool and prints what it is doing; its destructive nature is called out in both the README and its own output.

## Testing architecture

**Backend** — `node:test` + Supertest drive the real exported Express app in-process against a temporary SQLite file. No mocked database: real SQL, real transactions, real cascade behaviour. Isolation comes from `DB_PATH`, set before the app is imported, and the temp directory is removed afterwards.

**Frontend** — Vitest + jsdom render the real `App.tsx` with `fetch` stubbed to deterministic fixtures. Assertions use accessible queries (`getByRole`, `getByLabelText`), so the suite doubles as an accessibility check. `cleanup` and mock restoration run in `setup.ts` after every test.

Current totals: 33 API tests, 27 component tests.

## Docker topology

```text
docker-compose.yml
├── backend   build ./backend   :3000   volume ./backend:/app   env_file ./backend/.env
└── frontend  build ./frontend  :5173   volume ./frontend:/app  depends_on backend
```

Both images use `node:20-alpine`, install from lockfiles, and run the dev server. Compose references `backend/.env` through `env_file`, so an empty file is needed for a fresh clone; the application currently reads no environment variables from it.

## Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | `3000` | API listen port |
| `DB_PATH` | backend | `backend/src/interview_guide.db` | SQLite file location; used by tests |
| `VITE_API_URL` | frontend | `http://localhost:3000` | API base URL |

The frontend reads its API URL once at module scope from `import.meta.env.VITE_API_URL`, so all eight call sites share one value and deployment needs no code change.

## Extension points

Natural next steps, in rough order of value:

1. **Authentication and authorization** on manage-mode routes — the single most important gap.
2. **Server-side search and pagination** — move filtering and paging into the API before the dataset outgrows a single response.
3. **A migration tool** (for example `node-pg-migrate`'s SQLite equivalent) to replace seed-script schema management.
4. **Wire the individual answer endpoints into the UI**, or remove them if the replace-all contract is preferred as the only editing model.
5. **A router** for deep links to a category or question.
6. **Extract CSS from the inline style objects** and add responsive breakpoints.
7. **CI** running `npm test`, `npm run lint` and `npm run build` on push.

## Known trade-offs

Decisions made knowingly, recorded so they are not mistaken for oversights:

- **Creates return `200`, not `201`.** Semantically `201` is correct for a resource creation with a body. It was left as `200` because changing it is a breaking contract change and the current behaviour is internally consistent.
- **No ORM.** Manual SQL means more repetition across five CRUD routes, accepted in exchange for transparency over a three-table schema.
- **Full dataset on every load.** The client fetches all questions and filters in memory. Simple and instant at this size, and the first thing to change at scale.
- **Single monolithic component.** `App.tsx` is ~780 lines covering study mode, manage mode and theming. Splitting it would improve maintainability; it was left intact because the state is heavily shared and the prop-drilling alternative would arguably be worse.
- **Inline styles.** No stylesheet cascade, no media queries, no `@keyframes`. Acceptable for a single-column layout, not for a growing design system.
- **No caching, rate limiting, structured logging or graceful shutdown.** Appropriate for a local demo, required before any public deployment.
