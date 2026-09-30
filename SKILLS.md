# Skills Demonstrated

This project is a practical example of building and documenting a small full-stack application.

## Frontend

- **React:** stateful UI, component rendering, and effects for loading API data.
- **TypeScript:** typed category, question, and answer models.
- **Product interaction:** category navigation, text search, expandable answers, theme switching, forms, and loading/error/empty states.
- **Right-to-left interface:** Arabic-first content and layout.
- **API integration:** asynchronous fetch requests for reading and maintaining guide data.

Evidence: `frontend/src/App.tsx`, `frontend/src/index.css`, and `frontend/src/main.tsx`.

## Backend and Data

- **Node.js with ES modules:** modular server, database, and seed scripts.
- **Express REST API:** resource-oriented endpoints for categories, questions, and answers.
- **SQLite:** relational schema, foreign keys, parameterized SQL queries, and persistent local data.
- **CRUD workflows:** create, read, update, and delete operations used by the frontend.
- **Data import:** JSON-backed seed content for repeatable local setup.

Evidence: `backend/src/server.js`, `backend/src/database.js`, and `backend/src/seed-data.js`.

## Developer Workflow

- **Vite and npm:** frontend development server, production build, lint scripts, and dependency management.
- **Docker:** separate frontend and backend images coordinated with Docker Compose.
- **Project documentation:** setup instructions, architecture overview, feature inventory, API reference, and implementation-based skills summary.

Evidence: `frontend/package.json`, `backend/package.json`, `frontend/Dockerfile`, `backend/Dockerfile`, and `docker-compose.yml`.

## Engineering Concepts Practiced

- Modeling related content with categories, questions, and answers.
- Keeping the API and UI responsibilities separate.
- Handling asynchronous data loading and user-visible request states.
- Updating a question and its answers as a coordinated database operation.
- Supporting repeatable local data initialization.

## Current Boundaries

- The frontend API URL is configured directly as `http://localhost:3000`.
- The current application has no user accounts, authentication, or authorization.
- The SQLite database and Compose setup are intended for local development and demonstration, not production deployment.
