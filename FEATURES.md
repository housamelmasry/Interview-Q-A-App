# Features

Arabic Interview Guide organizes technical interview preparation material into browsable categories and editable question-and-answer entries.

## Study Experience

- Browse categories including Laravel Core, Laravel Advanced, Backend, System Design, Node.js, React, React Native, and Testing & Security.
- View category-specific question counts and switch categories without leaving the page.
- Expand a question to reveal its answer. Answer formatting preserves line breaks and code-oriented examples.
- Search question and answer text across the guide; matching questions display their category.
- Switch between light and dark themes.
- See loading, error, and empty-result states.
- Use a right-to-left Arabic interface with Arabic seed content.

## Content Management

Manage mode provides in-app controls to:

- Create and edit categories, including label, icon, and color.
- Delete categories.
- Create and edit questions and assign them to categories.
- Add, edit, and remove answers associated with a question.
- Delete questions.

Changes are persisted by the API in SQLite. There is no authentication or authorization around manage mode in the current implementation; treat it as a portfolio/demo feature, not a secured administrator workflow.

## API Surface

The Express API listens on port `3000` and exposes:

| Method   | Route                      | Purpose                                                              |
| -------- | -------------------------- | -------------------------------------------------------------------- |
| `GET`    | `/api/health`              | Report API health                                                    |
| `GET`    | `/api/categories`          | List categories                                                      |
| `POST`   | `/api/categories`          | Create a category                                                    |
| `PUT`    | `/api/categories/:id`      | Update a category                                                    |
| `DELETE` | `/api/categories/:id`      | Delete a category                                                    |
| `GET`    | `/api/questions`           | List questions with answers; optionally filter with `?category=<id>` |
| `POST`   | `/api/questions`           | Create a question, optionally with answers                           |
| `PUT`    | `/api/questions/:id`       | Update a question and its answers                                    |
| `DELETE` | `/api/questions/:id`       | Delete a question                                                    |
| `GET`    | `/api/answers/:questionId` | List answers for a question                                          |
| `PUT`    | `/api/answers/:id`         | Update an answer                                                     |
| `DELETE` | `/api/answers/:id`         | Delete an answer                                                     |

## Data Model

SQLite stores three related entities:

- **Categories** define the guide sections and their display metadata.
- **Questions** belong to a category.
- **Answers** belong to a question.

Foreign keys are enabled, and deleting a category or question cascades to its dependent records. The bundled seed source is `backend/src/data.json`; the seed script replaces the current database content with this source.
