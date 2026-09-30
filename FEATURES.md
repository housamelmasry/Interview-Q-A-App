# Features

Every feature below is implemented in the code and covered by the test suites (33 API tests, 27 component tests). Each section cites the file that implements it.

## Study mode

**Browse by category** — eight categories seed on first run and are listed as horizontally scrollable tabs, each showing a live count of its questions. Selecting a tab filters the list without a page load.

Implemented in `frontend/src/App.tsx`; categories seeded in `backend/src/database.js`.

| Category        | `id`              | Questions |
| --------------- | ----------------- | --------- |
| Laravel Core    | `laravel-core`    | 10        |
| Laravel Advanced| `laravel-advanced`| 5         |
| Backend عام     | `backend-general` | 10        |
| System Design   | `system-design`   | 3         |
| Node.js         | `nodejs`          | 10        |
| React           | `react`           | 10        |
| React Native    | `react-native`    | 10        |
| Testing & Security | `testing`      | 3         |

**Expand a question to read its answer** — clicking a question reveals all of its answers. Answers render inside a `<pre>` with `white-space: pre-wrap`, so multi-line and code-oriented content keeps its line breaks without needing a markdown parser.

**Search questions and answers** — the search box matches against both question text and answer text. Search runs across all categories at once; the tabs are hidden while searching and each result carries a badge naming its category. The result count is displayed above the list.

**Light and dark themes** — a toggle in the header switches between the two. Theming is driven by a single `theme` object of colour values applied through inline styles, so there is one source of truth rather than duplicated CSS custom properties. Dark mode is the default.

**Interface states**

- *Loading* — a centred "جاري التحميل..." screen shown until the first payload arrives.
- *Error* — a dismissible banner with a retry button, shown when the API is unreachable or a save fails. The API's error message is surfaced when it provides one.
- *Empty* — "لا توجد نتائج" when a category has no questions or a search matches nothing.

**Right-to-left layout** — `dir="rtl"` and `lang="ar"` are declared on the document, text aligns right, and answer blocks are bordered on the right edge to match reading direction. Typography uses the Tajawal Arabic web font.

## Manage mode

Toggled from the header. Reveals inline edit and delete controls on every category tab and question card, plus a create bar.

**Categories** — create with an id, label, emoji icon and colour picker; edit any field except the id; delete with a confirmation dialog.

**Questions** — create with a category selector and question text; edit text and move between categories; delete with confirmation.

**Answers** — a question can hold multiple answers. In the question form each answer is its own textarea, and answers can be added or removed individually.

**Persistence and feedback** — every mutation goes through the API and is written to SQLite. The UI checks the HTTP status on all four operations: on failure it displays the server's error message and keeps the form open so the input is not lost; on success it closes the form and refetches.

Answers are edited as a set: `PUT /api/questions/:id` treats the supplied `answers` array as the complete desired state and replaces the previous rows atomically. This is simpler and safer than diffing individual answers, and it is why the individual answer endpoints are not used by the UI.

## API reference

Base URL `http://localhost:3000`. All request and response bodies are JSON.

| Method   | Route                      | Purpose                                                              |
| -------- | -------------------------- | -------------------------------------------------------------------- |
| `GET`    | `/api/health`              | Health check — `{ "status": "OK" }`                                  |
| `GET`    | `/api/docs`                | Interactive Swagger UI                                               |
| `GET`    | `/api/openapi.json`        | Raw OpenAPI 3.0 specification                                        |
| `GET`    | `/api/categories`          | List categories, ordered by label                                    |
| `POST`   | `/api/categories`          | Create a category                                                    |
| `PUT`    | `/api/categories/:id`      | Update a category's label, icon and colour                           |
| `DELETE` | `/api/categories/:id`      | Delete a category, cascading to its questions and answers            |
| `GET`    | `/api/questions`           | List questions with nested answers; filter with `?category=<id>`     |
| `POST`   | `/api/questions`           | Create a question, optionally with answers                           |
| `PUT`    | `/api/questions/:id`       | Update a question; replaces its answers when `answers` is supplied   |
| `DELETE` | `/api/questions/:id`       | Delete a question, cascading to its answers                          |
| `GET`    | `/api/answers/:questionId` | List answers for one question                                        |
| `PUT`    | `/api/answers/:id`         | Update a single answer                                               |
| `DELETE` | `/api/answers/:id`         | Delete a single answer                                               |

**Interactive documentation** is served at <http://localhost:3000/api/docs> once the API is running, generated from the committed `backend/src/openapi.json` specification (7 paths, 10 schemas, with examples on every operation).

### Request and response shapes

`GET /api/questions` returns a flat three-table join grouped server-side into one object per question, so the client receives questions with their answers already nested:

```json
[
  {
    "id": 1,
    "question_text": "ما الفرق بين Service Container و Service Provider؟",
    "category_id": "laravel-core",
    "category_label": "Laravel Core",
    "icon": "🔴",
    "color": "#FF4444",
    "answers": [{ "id": 1, "answer_text": "..." }]
  }
]
```

`category_label`, `icon` and `color` are denormalised into the payload deliberately: without them the client would need a second request to label search results.

`POST` and `PUT /api/questions` accept answers either as plain strings or as objects with an `answer_text` field, which keeps the payload convenient for both the UI and `curl`.

### Status codes

| Code  | When                                                                       |
| ----- | -------------------------------------------------------------------------- |
| `200` | Success.                                                                   |
| `201`*| Reserved for creates; the current handlers return `200` with the new id.   |
| `400` | Missing required fields — category `id`/`label`, question text, category id |
| `404` | Target record does not exist (update and delete routes)                    |
| `500` | Database-level failure, e.g. a duplicate category id or unknown category   |

\* Creates currently respond `200` rather than `201`. This is a deliberate, documented inconsistency rather than an oversight; see [ARCHITECTURE.md](ARCHITECTURE.md#known-trade-offs).

## Data model

SQLite stores three related entities, defined in `backend/src/database.js`:

```text
categories (id TEXT PK, label TEXT NOT NULL, icon TEXT, color TEXT)
     │
     │ 1:N  ON DELETE CASCADE
     ▼
questions (id INTEGER PK AUTOINCREMENT, category_id TEXT NOT NULL → categories.id,
           question_text TEXT NOT NULL)
     │
     │ 1:N  ON DELETE CASCADE
     ▼
answers  (id INTEGER PK AUTOINCREMENT, question_id INTEGER NOT NULL → questions.id,
          answer_text TEXT NOT NULL)
```

- Foreign keys are enforced with `PRAGMA foreign_keys = ON`, which SQLite disables by default per connection.
- Deleting a category removes its questions and their answers. Deleting a question removes its answers.
- Category ids are caller-supplied text slugs rather than auto-increment integers, so ids stay readable in URLs and stable across environments.
- The three tables are created with `CREATE TABLE IF NOT EXISTS`, making startup idempotent.

## Seeding

`backend/src/data.json` is the source of truth for bundled content: 8 categories and 61 question/answer pairs, authored in Arabic.

- `backend/src/database.js` creates the schema and inserts the 8 categories, but only when the categories table is empty, so restarts never duplicate or wipe data.
- `backend/src/seed-data.js` (`npm run seed`) clears all three tables and reinserts from `data.json`. It is destructive by design and prints what it is doing.

## Error handling

The API returns a consistent `{ "error": "..." }` body for every failure. The frontend reads that field and displays it, falling back to a status-based message when the body is not JSON. Unexpected client-side errors are logged to the console rather than surfaced as raw text.
