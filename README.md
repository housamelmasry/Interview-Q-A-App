# Arabic Interview Guide

A full-stack interview-preparation guide for exploring, searching, and maintaining technical questions and answers. The interface is Arabic-first and covers Laravel, Node.js, React, React Native, backend engineering, system design, testing, and security.

Built with React and TypeScript, an Express REST API, and SQLite. The project demonstrates a small but complete product workflow: structured content, category-based navigation, search, persistent editing, and containerized local development.

## Highlights

- Browse questions by technical category or search across question and answer text.
- Expand questions to read formatted answers, including multi-line code examples.
- Switch between light and dark themes.
- Use manage mode to create, edit, and delete categories, questions, and answers.
- Persist guide content in a relational SQLite database through a REST API.
- Run the frontend and backend locally or with Docker Compose.

See [FEATURES.md](FEATURES.md) for product behavior and API routes, and [SKILLS.md](SKILLS.md) for the technologies and engineering skills demonstrated.

## Technology

| Area              | Technologies                                              |
| ----------------- | --------------------------------------------------------- |
| Frontend          | React 18, TypeScript, Vite                                |
| Backend           | Node.js, Express 5                                        |
| Database          | SQLite with relational categories, questions, and answers |
| Local environment | Docker, Docker Compose, npm                               |

## Project Structure

```text
.
├── backend/
│   ├── src/
│   │   ├── data.json        # Seed content
│   │   ├── database.js      # SQLite connection and schema setup
│   │   ├── seed-data.js     # Load seed content into SQLite
│   │   └── server.js        # Express API
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main guide interface
│   │   ├── index.css
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── FEATURES.md
├── SKILLS.md
└── README.md
```

The SQLite database file is created at `backend/src/interview_guide.db` when the API starts. It is generated at runtime and is not part of the source structure.

## Run With Docker

Prerequisites: Docker with the Compose plugin.

```bash
git clone <repository-url>
cd <repository-directory>
touch backend/.env
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173). The API is available at [http://localhost:3000](http://localhost:3000), with a health check at `/api/health`.

The Compose configuration references `backend/.env`; the application currently does not require environment variables, so an empty file is sufficient for a fresh clone. The `.env` files are excluded from Git.

## Load Sample Questions

The API creates the database schema and starter categories on first launch. Load the sample questions and answers from `backend/src/data.json` after the backend is running:

```bash
docker compose exec backend node src/seed-data.js
```

**Warning:** the seed script clears existing categories, questions, and answers before inserting the bundled sample content. Run it only when you intend to replace the current guide data.

## Run Locally Without Docker

Use separate terminals from the repository root:

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the API at `http://localhost:3000`. To load sample Q&A, run `node src/seed-data.js` from the `backend` directory after the backend has initialized the database.

## Quality Checks

From `frontend/`:

```bash
npm run build
npm run lint
```

## Scope Note

This is a local portfolio/demo application. Manage mode is not protected by authentication or authorization, so it should not be exposed as a public content-management service without adding appropriate access controls and deployment configuration.
