# Features

Every feature below is implemented in the code and covered by the test suites (52 API tests, 45 component and hook tests). Each section cites the file that implements it.

## Study mode

**Browse by category** — the 10 categories from `data.json` are bootstrapped on start and listed as horizontally scrollable tabs, each showing a live count of its questions. The count comes from `question_count`, which `GET /api/categories` computes with a `LEFT JOIN` and `COUNT(q.id)` on every request, so it reflects the current data rather than anything baked into the seed.

Implemented in `frontend/src/components/CategoryTabs.tsx`; count computed in `backend/src/server.js`.

| Category            | `id`               | Icon | Questions |
| ------------------- | ------------------ | ---- | --------- |
| Laravel Core        | `laravel-core`     | 🔴   | 12        |
| Laravel Advanced    | `laravel-advanced` | 🟠   | 11        |
| Backend عام          | `backend-general`  | 🟢   | 13        |
| System Design       | `system-design`    | 🔵   | 11        |
| Node.js             | `nodejs`           | 🟡   | 11        |
| React               | `react`            | ⚛️   | 11        |
| React Native        | `react-native`     | 📱   | 11        |
| Testing & Security  | `testing`          | 🟣   | 11        |
| Docker & DevOps     | `devops`           | 🐳   | 11        |
| قواعد البيانات & SQL  | `databases`        | 🗄️   | 11        |

Docker & DevOps and Databases & SQL are new. System Design, Testing & Security and Laravel Advanced were rebalanced up to 11 questions each, so no category is a token stub.

**Server-side pagination** — questions are paged in the database, not in the browser. `useQuestions` requests a page (10 per page, from `PAGE_SIZE` in `frontend/src/constants.ts`) and the response envelope supplies everything the controls need:

```json
{
  "items": [],
  "total": 113,
  "page": 1,
  "limit": 10,
  "pages": 12
}
```

`total` counts every matching question, not the page, so the client can render "page 2 of 12" and a result count without a second request. Page controls sit below the list, are hidden entirely when everything fits on one page, and reappear on the search results too. Selecting a different category or starting a new search returns to page 1, and switching pages collapses any open question.

Pagination is applied to question **ids** before answers are joined in. Applying the limit to the joined rows would count answer rows rather than questions, so a limit of 20 against questions averaging three answers each would return as few as seven, and `total` from a separate `COUNT(*)` would disagree with what arrived. The regression test in `backend/test/api.test.js` creates three questions with three, two and one answers, pages at a limit of 2, and asserts the pages hold two questions then one, do not overlap, and that `total` is 3.

**Expand a question to read its answers** — clicking a question reveals all of its answers. Answers render inside a `<pre>` with `white-space: pre-wrap`, so multi-line and code-oriented content keeps its line breaks without needing a markdown parser. 46 of the 113 questions carry more than one answer; each is shown as a separate block, so alternative answers read as alternatives rather than as one run-on paragraph.

**Difficulty badge** — every question has a `difficulty` of `beginner`, `intermediate` or `advanced`. It is stored as a column on `questions` and rendered as a coloured badge on each card. The three levels are defined once in `frontend/src/constants.ts` along with their labels and colours; the form's dropdown and the card's badge read from the same table, so they cannot drift. Bundled content is 21 beginner / 58 intermediate / 34 advanced. The API defaults the field to `intermediate` when it is omitted.

**Tags** — every question also carries `tags`, stored as a JSON array in a `tags` column and typed as `string[]` on the client. They are English kebab-case, 2 to 3 per question in the bundled content, drawn from 124 distinct values such as `service-container`, `dependency-injection` and `caching`. Tags render as a `#tag` row under the question, beside the difficulty badge. A question with no tags renders the badge without any tag chips, which is the case the API's `[]` default produces. In the manage form, tags are typed as a comma-separated list and split on submit.

**Search questions and answers** — see [Full-text search](#full-text-search) below. It is server-side, debounced, and paginated.

**Light and dark themes** — a toggle in the header switches between the two. Theming is driven by a single `theme` object of colour values applied through inline styles, so there is one source of truth rather than duplicated CSS custom properties. Dark mode is the default. The theme object also carries an `isDark` flag so a component can branch on depth without re-deriving it from a colour.

**Interface states**

- *Loading* — a full-screen "جاري التحميل..." shown until the categories arrive, then an inline spinner for question refreshes. The loading screen is held back while the active category is still unknown, because that category decides which questions to ask for.
- *Error* — a dismissible banner with a retry button, shown when the API is unreachable or a save fails. The API's error message is surfaced when it provides one; the banner is used for failures from questions, categories, stats and form saves alike.
- *Empty* — "لا توجد نتائج" when a category has no questions or a search matches nothing.
- *Pending search* — "جاري البحث..." is shown while the typed term is still debouncing or its request is in flight, because the previous result total says nothing about the new query.

**Right-to-left layout** — `direction: "rtl"` is set on the app root, text aligns right, answer blocks are bordered on the right edge to match reading direction, and the pagination controls are mirrored: "previous" sits on the right and points right, "next" sits on the left. Typography uses the Tajawal Arabic web font.

## Full-text search

`GET /api/search?q=<term>&page=&limit=`, implemented in `backend/src/search.js` and `backend/src/server.js`.

**What is searched** — both question text and answer text, across all categories at once. The category tabs are hidden while searching and each result carries a badge naming its category, because a search result can come from anywhere.

**How it works** — two FTS5 virtual tables, `search_questions` (keyed on `questions.id`) and `search_answers` (keyed on `answers.id`), kept in step with the base tables by six triggers: `AFTER INSERT`, `AFTER UPDATE` and `AFTER DELETE` on each. Indexing rows individually rather than concatenating a question with its answers is forced by a SQLite limitation: a trigger body may not contain a subquery, so "recompute this question's answers" is not expressible. Every trigger is therefore a single-row statement, and the database itself keeps the index correct.

**Ranking** — a question matches either because its own text matched (`source = 0`) or because one of its answers did (`source = 1`). Results are ordered by `source` first, then by `bm25()` within each group, so a question that matched directly always outranks one that matched only because an answer mentioned the term. Where a question matches on several answers it appears once, at its best score.

**Input sanitisation** — user input never reaches `MATCH` raw. FTS5 treats `"`, `*`, `^`, `NEAR`, `AND`, `OR` and parentheses as query syntax, so raw input produces `500`s on unbalanced quotes and lets a crafted term smuggle operators into the query. `buildMatchQuery` therefore:

1. Replaces every character that is not a letter or digit with a space, which removes the punctuation and the FTS5 operators.
2. Splits on whitespace and keeps at most 8 tokens.
3. Wraps each token in double quotes, making it an inert string literal.
4. Appends `*` to the **last** token only, so results narrow as the user types without every token becoming a prefix match.
5. Joins with `AND`.

```text
" OR 1=1 --"        →  "OR" AND "1" AND "1"*
cont                →  "cont"*
service container   →  "service" AND "container"*
```

Input that contains nothing searchable returns an empty result set rather than an error.

**Prefix matching** — the last token of a query is prefix-matched, so results narrow as the user types instead of only matching once a whole word has been entered. It is a prefix search, not a fuzzy one, so it can also match more than intended: `serv` returns 18 questions where `service` returns 10, because `serv` also matches words beginning with those letters.

**Arabic** — the tokenizer is `unicode61 remove_diacritics 2`. `unicode61` classifies letters and digits by Unicode category, so Arabic letters are token characters and Arabic content is indexed and matched with no custom tokenizer and no separate index. `remove_diacritics 2` folds Latin accents, so `café` matches `cafe`. Matching is token-level: there is no stemming and no morphological analysis, so inflected forms of one root remain distinct tokens.

**The `OR` fallback** — multi-word queries are `AND`ed first, because "service container" should not match a question that only mentions "service". Arabic breaks that. The definite article is written attached to the word, so a query like "ال container" produces a token `ال` that matches nothing in the corpus, and the strict form returns zero rows for a query the user plainly meant. When the `AND` attempt returns nothing and the expression contains `AND`, the query is retried with the operators replaced by `OR`. The extra round trip only happens on the rare empty-result path.

**In the browser** — the search box stays controlled and responsive while `useDebounce` decides when to hit the endpoint, so typing does not produce a request per keystroke. `useQuestions` passes an `AbortController` signal with every request and aborts it on cleanup, so a slow response from an earlier term can never overwrite a newer one.

## Manage mode

Toggled from the header. Reveals inline edit and delete controls on every category tab and question card, plus a create bar, and hides the search box.

**Categories** — create with an id, label, emoji icon and colour picker; edit any field except the id, which is disabled because it is the primary key; delete with a confirmation dialog that spells out the consequence:

> Delete this category? Every question inside it and all of their answers will be permanently deleted.

**Questions** — create with a category selector, difficulty dropdown, comma-separated tags field, question text and any number of answers; edit text, category, difficulty, tags and the answer set; delete with confirmation. A new question is pre-filled with the active category and `intermediate` difficulty.

**Answers** — a question can hold multiple answers. In the question form each answer is its own textarea, and answers can be added or removed individually. Existing answer ids are reused as list keys while editing so React does not remount the textareas and lose focus.

**Persistence and feedback** — every mutation goes through the API and is written to SQLite. The UI checks the HTTP status on all operations: on failure it displays the server's error message and keeps the form open so the input is not lost; on success it closes the form and refetches questions, categories and stats together, so the tab counts and header totals cannot go stale.

Answers are edited as a set: `PUT /api/questions/:id` treats the supplied `answers` array as the complete desired state and replaces the previous rows atomically, inside a transaction. This is simpler and safer than diffing individual answers, and it is why the individual answer endpoints are not used by the UI.

## API reference

Base URL `http://localhost:3000`. All request and response bodies are JSON. 15 route handlers, plus the Swagger UI mounted as middleware at `/api/docs`:

| Method   | Route                      | Purpose                                                              |
| -------- | -------------------------- | -------------------------------------------------------------------- |
| `GET`    | `/api/health`              | Health check — `{ "status": "OK" }`                                  |
| `GET`    | `/api/docs`                | Interactive Swagger UI                                               |
| `GET`    | `/api/openapi.json`        | Raw OpenAPI 3.0 specification                                        |
| `GET`    | `/api/stats`               | Site-wide totals plus per-category counts                            |
| `GET`    | `/api/categories`          | List categories ordered by label, each with `question_count`         |
| `POST`   | `/api/categories`          | Create a category — `201`                                            |
| `PUT`    | `/api/categories/:id`      | Update a category's label, icon and colour                           |
| `DELETE` | `/api/categories/:id`      | Delete a category, cascading to its questions and answers            |
| `GET`    | `/api/questions`           | One page of questions with nested answers; `?category=` `?page=` `?limit=` |
| `POST`   | `/api/questions`           | Create a question with answers, difficulty and tags — `201`           |
| `PUT`    | `/api/questions/:id`       | Update a question; replaces its answers when `answers` is supplied   |
| `DELETE` | `/api/questions/:id`       | Delete a question, cascading to its answers                          |
| `GET`    | `/api/search`              | Full-text search; `?q=` `?page=` `?limit=`                           |
| `GET`    | `/api/answers/:questionId` | List answers for one question                                        |
| `PUT`    | `/api/answers/:id`         | Update a single answer                                               |
| `DELETE` | `/api/answers/:id`         | Delete a single answer                                               |

**Interactive documentation** is served at <http://localhost:3000/api/docs> once the API is running, generated from the committed `backend/src/openapi.json` specification (9 paths, 14 schemas, with examples).

### Request and response shapes

`GET /api/questions` and `GET /api/search` return the same envelope, differing only in which questions it selects. Both are a flat three-table join grouped server-side into one object per question, so the client receives questions with their answers already nested:

```json
{
  "items": [
    {
      "id": 1,
      "question_text": "ما الفرق بين Service Container و Service Provider؟",
      "category_id": "laravel-core",
      "category_label": "Laravel Core",
      "icon": "🔴",
      "color": "#FF4444",
      "difficulty": "beginner",
      "tags": ["service-container", "dependency-injection", "architecture"],
      "answers": [{ "id": 1, "answer_text": "..." }]
    }
  ],
  "total": 113,
  "page": 1,
  "limit": 10,
  "pages": 12
}
```

`category_label`, `icon` and `color` are denormalised into the payload deliberately: without them the client would need a second request to label search results. `tags` is stored as a JSON string and parsed on the way out, falling back to `[]` for a row that cannot be parsed, so one bad value cannot break the whole list.

`POST` and `PUT /api/questions` accept answers either as plain strings or as objects with an `answer_text` field, which keeps the payload convenient for both the UI and `curl`. `difficulty` defaults to `intermediate` and `tags` to `[]` when omitted. `POST /api/categories` defaults `icon` to `""` and `color` to `#666666`.

### Pagination parameters

`page` is 1-based. `limit` defaults to 20 and is clamped to 1..100. Out-of-range or non-numeric input falls back to a default rather than erroring, so a hand-edited or stale link still renders something useful: `?limit=9999` gives 100, `?limit=0` gives 1, `?limit=abc` gives 20, `?page=xyz` gives 1. `pages` is at least 1, so an empty result set is still one page.

### Status codes

| Code  | When                                                                                   |
| ----- | -------------------------------------------------------------------------------------- |
| `200` | Success on a read, update or delete.                                                    |
| `201` | A category or question was created; the body carries the new `id`.                      |
| `400` | Missing required fields — category `id`/`label`, question `category_id`/`question_text`, answer `answer_text`. |
| `404` | Target record does not exist. Updates and deletes check the affected row count, so a no-op is a 404 rather than a misleading success. |
| `500` | Database-level failure, e.g. a duplicate category id or an unknown category on create.   |

### Errors

The API returns a consistent `{ "error": "..." }` body for every failure. The client reads that field and displays it, falling back to a status-based message when the body is not JSON. `ApiError` in `frontend/src/api/client.ts` carries the HTTP status alongside the message, so callers can distinguish a 404 from a 500. Unexpected client-side errors are logged to the console rather than surfaced as raw text.

## Data model

SQLite stores three related entities, defined by the migrations in `backend/src/db/migrations/`:

```text
categories (id TEXT PK, label TEXT NOT NULL, icon TEXT, color TEXT)
     │
     │ 1:N  ON DELETE CASCADE
     ▼
questions (id INTEGER PK AUTOINCREMENT, category_id TEXT NOT NULL → categories.id,
           question_text TEXT NOT NULL, difficulty TEXT NOT NULL, tags TEXT NOT NULL)
     │
     │ 1:N  ON DELETE CASCADE
     ▼
answers  (id INTEGER PK AUTOINCREMENT, question_id INTEGER NOT NULL → questions.id,
          answer_text TEXT NOT NULL)
```

- Foreign keys are enforced with `PRAGMA foreign_keys = ON`, which SQLite disables by default per connection.
- Deleting a category removes its questions and their answers. Deleting a question removes its answers.
- Category ids are caller-supplied text slugs rather than auto-increment integers, so ids stay readable in URLs and stable across environments.
- `difficulty` and `tags` are added by migration `002` with `NOT NULL DEFAULT`, so existing rows backfill without a data migration and the columns are never null.
- Three indexes cover the foreign key columns and the list endpoint's filter-and-order path; see [ARCHITECTURE.md](ARCHITECTURE.md).
- The two FTS5 virtual tables alongside them hold no data of their own; their `rowid`s mirror the base tables and the triggers keep them in step.

## Seeding

`backend/src/data.json` is the source of truth for bundled content: 10 categories, 113 questions and 296 answers, authored in Arabic, with `difficulty` and `tags` on every question.

- `backend/src/database.js` inserts any category from `data.json` that is not already present, so restarts never duplicate or wipe data and adding a category to the seed file is enough for it to appear.
- `backend/src/seed-data.js` (`npm run seed`) clears all three tables and reinserts from `data.json`. It is destructive by design and prints what it is doing.
- On the way in the seed script normalises: `a` may be a single string or an array of strings, `difficulty` falls back to `intermediate` outside the known set, and `tags` is filtered to non-empty strings.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, and cancels superseded runs on the same branch.

| Job | Steps |
| --- | ----- |
| `backend` on Node 20 and 22 | `npm ci` → `npm audit --audit-level=high` → `npm test` |
| `frontend` on Node 20 | `npm ci` → `npm audit --audit-level=high` → `npm run lint` → `npx tsc --noEmit` → `npm test` → `npm run build` |

The Node matrix exists because FTS5 availability and the `sqlite3` native build differ across Node majors. `--audit-level=high` means a new high-severity advisory fails the build rather than being noticed later.
