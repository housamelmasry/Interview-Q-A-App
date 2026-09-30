import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import db, { ready } from "./database.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Interactive API documentation (OpenAPI 3 spec -> Swagger UI)
const openapiSpec = JSON.parse(
  fs.readFileSync(path.join(__dirname, "openapi.json"), "utf8"),
);
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));

// API Routes

// Get all categories
app.get("/api/categories", (req, res) => {
  db.all("SELECT * FROM categories ORDER BY label", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get questions for a category (including answers)
app.get("/api/questions", (req, res) => {
  const { category } = req.query;

  let query = `
    SELECT q.id, q.question_text, q.category_id,
           c.label as category_label, c.icon, c.color,
           a.id as answer_id, a.answer_text
    FROM questions q
    JOIN categories c ON q.category_id = c.id
    LEFT JOIN answers a ON q.id = a.question_id
  `;
  let params = [];

  if (category) {
    query += " WHERE q.category_id = ?";
    params.push(category);
  }

  query += " ORDER BY q.id, a.id";

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // Group by question
    const questionsMap = new Map();
    rows.forEach((row) => {
      if (!questionsMap.has(row.id)) {
        questionsMap.set(row.id, {
          id: row.id,
          question_text: row.question_text,
          category_id: row.category_id,
          category_label: row.category_label,
          icon: row.icon,
          color: row.color,
          answers: [],
        });
      }
      if (row.answer_id) {
        questionsMap.get(row.id).answers.push({
          id: row.answer_id,
          answer_text: row.answer_text,
        });
      }
    });

    res.json(Array.from(questionsMap.values()));
  });
});

// Get answers for a question (Keep for backward compatibility)
app.get("/api/answers/:questionId", (req, res) => {
  const { questionId } = req.params;

  db.all(
    "SELECT * FROM answers WHERE question_id = ? ORDER BY id",
    [questionId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    },
  );
});

// Add new category
app.post("/api/categories", (req, res) => {
  const { id, label, icon, color } = req.body;

  if (!id || !label) {
    return res
      .status(400)
      .json({ error: "Category ID and label are required" });
  }

  db.run(
    "INSERT INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)",
    [id, label, icon || "", color || "#666666"],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: id, message: "Category added successfully" });
    },
  );
});

// Update category
app.put("/api/categories/:id", (req, res) => {
  const { id } = req.params;
  const { label, icon, color } = req.body;

  if (!label) {
    return res.status(400).json({ error: "Category label is required" });
  }

  db.run(
    "UPDATE categories SET label = ?, icon = ?, color = ? WHERE id = ?",
    [label, icon || "", color || "#666666", id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      res.json({ message: "Category updated successfully" });
    },
  );
});

// Add new question (with optional answers)
app.post("/api/questions", (req, res) => {
  const { category_id, question_text, answers } = req.body;

  if (!category_id || !question_text) {
    return res
      .status(400)
      .json({ error: "Category ID and question text are required" });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      "INSERT INTO questions (category_id, question_text) VALUES (?, ?)",
      [category_id, question_text],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          res.status(500).json({ error: err.message });
          return;
        }

        const questionId = this.lastID;

        if (answers && Array.isArray(answers) && answers.length > 0) {
          const stmt = db.prepare(
            "INSERT INTO answers (question_id, answer_text) VALUES (?, ?)",
          );
          answers.forEach((ans) => {
            stmt.run(questionId, typeof ans === "string" ? ans : ans.answer_text);
          });
          stmt.finalize((err) => {
            if (err) {
              db.run("ROLLBACK");
              res.status(500).json({ error: err.message });
              return;
            }
            db.run("COMMIT");
            res.json({ id: questionId, message: "Question and answers added successfully" });
          });
        } else {
          db.run("COMMIT");
          res.json({ id: questionId, message: "Question added successfully" });
        }
      },
    );
  });
});

// Update question (with answers)
app.put("/api/questions/:id", (req, res) => {
  const { id } = req.params;
  const { question_text, category_id, answers } = req.body;

  if (!question_text || !category_id) {
    return res
      .status(400)
      .json({ error: "Category ID and question text are required" });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      "UPDATE questions SET question_text = ?, category_id = ? WHERE id = ?",
      [question_text, category_id, id],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          res.status(500).json({ error: err.message });
          return;
        }

        if (answers && Array.isArray(answers)) {
          // Simplest way: Delete old answers and insert new ones
          db.run("DELETE FROM answers WHERE question_id = ?", [id], (err) => {
            if (err) {
              db.run("ROLLBACK");
              res.status(500).json({ error: err.message });
              return;
            }

            const stmt = db.prepare(
              "INSERT INTO answers (question_id, answer_text) VALUES (?, ?)",
            );
            answers.forEach((ans) => {
              stmt.run(id, typeof ans === "string" ? ans : ans.answer_text);
            });
            stmt.finalize((err) => {
              if (err) {
                db.run("ROLLBACK");
                res.status(500).json({ error: err.message });
                return;
              }
              db.run("COMMIT");
              res.json({ message: "Question and answers updated successfully" });
            });
          });
        } else {
          db.run("COMMIT");
          res.json({ message: "Question updated successfully" });
        }
      },
    );
  });
});

// Update answer
app.put("/api/answers/:id", (req, res) => {
  const { id } = req.params;
  const { answer_text } = req.body;

  db.run(
    "UPDATE answers SET answer_text = ? WHERE id = ?",
    [answer_text, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: "Answer not found" });
        return;
      }
      res.json({ message: "Answer updated successfully" });
    },
  );
});

// Delete category
app.delete("/api/categories/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM categories WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json({ message: "Category deleted successfully" });
  });
});

// Delete question
app.delete("/api/questions/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM questions WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.json({ message: "Question deleted successfully" });
  });
});

// Delete answer
app.delete("/api/answers/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM answers WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: "Answer not found" });
      return;
    }
    res.json({ message: "Answer deleted successfully" });
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK" });
});

// Only bind a port when this file is executed directly. The test suite imports
// `app` and drives it in-process, so it must not start a listener.
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const port = Number(process.env.PORT) || 3000;
  // Never accept requests before the schema exists.
  await ready;
  app.listen(port, () => {
    console.log(`Backend running on port ${port}`);
    console.log(`API docs available at http://localhost:${port}/api/docs`);
  });
}

export default app;
