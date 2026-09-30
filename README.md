# Arabic Interview Guide

A full-stack interview-preparation app for browsing, searching and maintaining technical questions and answers. The UI is Arabic-first and right-to-left, covering Laravel, Node.js, React, React Native, backend engineering, system design, testing and security.

> The application interface is in **Arabic** (RTL). All documentation in this repository is in English.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why this project

This is a small but complete product rather than a code snippet. It demonstrates the full loop of shipping a feature:

- **A real data model** — three related entities backed by SQLite with enforced foreign keys and cascading deletes.
- **A documented REST API** — 13 endpoints, described by an OpenAPI 3 specification and served through an interactive Swagger UI.
- **A working UI** — category navigation, full-text search, expandable answers, light/dark themes, and a full content-management mode.
- **Automated tests** — 33 API tests and 27 component tests covering the behaviour described below.
- **Repeatable setup** — one-command Docker Compose startup, or plain `npm` for local development.

It was built as a personal study tool and is documented to the standard expected of a production codebase, which makes it a practical reference for interview preparation on both frontend and backend work.

## Features

**Study mode**

- Browse eight technical categories, each tab showing its live question count.
- Expand any question to read its answer; multi-line and code-oriented formatting is preserved.
- Search across both question *and* answer text, with each result labelled by its category.
- Light and dark themes.
- Clear loading, error and empty states, including a retry action when the API is unreachable.

**Manage mode**

- Create, edit and delete categories, including label, icon and colour.
- Create, edit and delete questions and move them between categories.
- Add, edit and remove multiple answers per question.
- Every change is validated by the API and persisted to SQLite; failed saves surface an error instead of failing silently.

**API**

- OpenAPI 3.0 specification with request/response schemas and examples: <http://localhost:3000/api/docs>
- Health check endpoint, consistent JSON error shape, and correct `400` / `404` / `500` semantics.

Full detail: [FEATURES.md](FEATURES.md). Design and data-model detail: [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech stack

| Layer     | Technology                                                       |
| --------- | ---------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite 8                                     |
| Styling   | Inline styles with a theme object; no CSS framework             |
| Backend   | Node.js 20, Express 5, ES modules                                |
| Database  | SQLite via `sqlite3`, parameterised SQL, foreign keys            |
| API docs  | OpenAPI 3.0 served with Swagger UI (`swagger-ui-express`)        |
| Testing   | `node:test` + Supertest (API), Vitest + Testing Library (UI)     |
| Tooling   | ESLint 10 flat config, TypeScript strict mode, Vite build        |
| Runtime   | Docker + Docker Compose, or local `npm`                          |

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

Load the 61 bundled questions and answers:

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

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── data.json        # Seed content: 8 categories, 61 Q&A pairs
│   │   ├── database.js      # SQLite connection, schema, starter categories
│   │   ├── openapi.json     # OpenAPI 3.0 specification
│   │   ├── seed-data.js     # Replaces DB content with data.json
│   │   └── server.js        # Express app, routes, Swagger UI
│   ├── test/
│   │   └── api.test.js      # 33 API tests
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Entire UI: study mode, manage mode, theme
│   │   ├── App.test.tsx     # 27 component tests
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── test/
│   │       ├── fixtures.ts
│   │       └── setup.ts
│   ├── Dockerfile
│   ├── eslint.config.js
│   ├── index.html
│   ├── vite.config.ts       # Vite + Vitest config
│   └── package.json
├── docker-compose.yml
├── ARCHITECTURE.md          # Design decisions and data model
├── FEATURES.md              # Feature inventory and API reference
├── SKILLS.md                # Skills demonstrated, with code evidence
├── LICENSE
└── README.md
```

The SQLite file is created at `backend/src/interview_guide.db` on first run. It is generated at runtime and git-ignored.

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
cd backend  && npm test    # 33 passing
cd frontend && npm test    # 27 passing
cd frontend && npm run lint && npm run build
```

Both packages also report `0 vulnerabilities` from `npm audit`.

## Testing approach

The backend suite drives the real Express app in-process with Supertest against a temporary SQLite database, so it exercises actual SQL, transactions and cascade behaviour rather than mocks. Setting `DB_PATH` isolates the run from your development data.

The frontend suite renders the real component in jsdom with `fetch` stubbed to deterministic fixtures, and asserts through accessible queries (`getByRole`, `getByLabelText`) — the same queries a screen reader uses, so the tests double as accessibility checks.

See [SKILLS.md](SKILLS.md) for the skills these tests demonstrate.

## Known limitations

This is a local portfolio and demo application. It is deliberately scoped as one:

- **No authentication or authorization.** Manage mode is open to anyone who can reach the API. Do not expose it publicly without adding access control.
- **SQLite and Compose target local development**, not production deployment. There is no migration system, no reverse proxy and no TLS termination.
- **No pagination or server-side search.** The client fetches all questions and filters in memory — fine for 61 rows, not for thousands.
- **Individual answer routes are API-only.** `PUT` and `DELETE /api/answers/:id` are implemented, documented and tested, but the UI edits answers through the question form.
- **The database is created from a seed script**, so there is no migration history.

## License

[MIT](LICENSE) © 2026 Houssam Elmasry
