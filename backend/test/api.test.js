import test, { before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the database at a throwaway file BEFORE importing the app, so importing
// src/server.js (which imports src/database.js) opens the temp database rather
// than the developer's local one.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "interview-guide-test-"));
const testDbPath = path.join(tmpDir, "test.db");
process.env.DB_PATH = testDbPath;

const { default: app } = await import("../src/server.js");
const { default: db, ready } = await import("../src/database.js");
const supertest = (await import("supertest")).default;

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

let api;

before(async () => {
  await ready;
  api = supertest(app);
});

after(async () => {
  await new Promise((resolve) => db.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  test("reports OK", async () => {
    const res = await api.get("/api/health").expect(200);
    assert.deepEqual(res.body, { status: "OK" });
  });
});

describe("GET /api/openapi.json", () => {
  test("serves a valid OpenAPI document", async () => {
    const res = await api.get("/api/openapi.json").expect(200);
    assert.equal(res.body.openapi, "3.0.3");
    assert.ok(res.body.paths["/api/questions"], "documents the questions route");
    assert.ok(res.body.paths["/api/categories/{id}"].put, "documents category update");
  });
});

describe("categories", () => {
  test("seeds the starter categories on first run", async () => {
    const res = await api.get("/api/categories").expect(200);
    const ids = res.body.map((c) => c.id);
    assert.ok(ids.includes("laravel-core"));
    assert.ok(ids.includes("system-design"));
    assert.equal(res.body.length, 8);
  });

  test("returns categories ordered by label", async () => {
    const res = await api.get("/api/categories").expect(200);
    const labels = res.body.map((c) => c.label);
    assert.deepEqual(labels, [...labels].sort());
  });

  test("creates a category", async () => {
    const res = await api
      .post("/api/categories")
      .send({ id: "devops", label: "DevOps", icon: "⚙️", color: "#00B8D9" })
      .expect(200);
    assert.equal(res.body.id, "devops");

    const rows = await all("SELECT * FROM categories WHERE id = ?", ["devops"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].color, "#00B8D9");
  });

  test("applies defaults for omitted icon and color", async () => {
    await api.post("/api/categories").send({ id: "bare", label: "Bare" }).expect(200);
    const rows = await all("SELECT * FROM categories WHERE id = ?", ["bare"]);
    assert.equal(rows[0].icon, "");
    assert.equal(rows[0].color, "#666666");
  });

  test("rejects a create with no id or label", async () => {
    const res = await api.post("/api/categories").send({ label: "No id" }).expect(400);
    assert.match(res.body.error, /required/i);
  });

  test("rejects a duplicate id", async () => {
    await api.post("/api/categories").send({ id: "devops", label: "Dupe" }).expect(500);
  });

  test("updates a category (regression: this route was missing)", async () => {
    const res = await api
      .put("/api/categories/devops")
      .send({ label: "DevOps & SRE", icon: "🛠️", color: "#123456" })
      .expect(200);
    assert.match(res.body.message, /updated/i);

    const rows = await all("SELECT * FROM categories WHERE id = ?", ["devops"]);
    assert.equal(rows[0].label, "DevOps & SRE");
    assert.equal(rows[0].icon, "🛠️");
  });

  test("rejects an update with no label", async () => {
    const res = await api.put("/api/categories/devops").send({ icon: "x" }).expect(400);
    assert.match(res.body.error, /label/i);
  });

  test("returns 404 when updating an unknown category", async () => {
    const res = await api
      .put("/api/categories/nope")
      .send({ label: "Nope" })
      .expect(404);
    assert.match(res.body.error, /not found/i);
  });

  test("deletes a category", async () => {
    await api.delete("/api/categories/bare").expect(200);
    const rows = await all("SELECT * FROM categories WHERE id = ?", ["bare"]);
    assert.equal(rows.length, 0);
  });

  test("returns 404 when deleting an unknown category", async () => {
    await api.delete("/api/categories/nope").expect(404);
  });
});

describe("questions", () => {
  test("creates a question with answers in one transaction", async () => {
    const res = await api
      .post("/api/questions")
      .send({
        category_id: "laravel-core",
        question_text: "What is the service container?",
        answers: ["It resolves dependencies.", "Bindings live in service providers."],
      })
      .expect(200);

    assert.ok(res.body.id);
    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [res.body.id]);
    assert.equal(answers.length, 2);
  });

  test("accepts answers as objects with answer_text", async () => {
    const res = await api
      .post("/api/questions")
      .send({
        category_id: "laravel-core",
        question_text: "Object-shaped answers?",
        answers: [{ answer_text: "First" }, { answer_text: "Second" }],
      })
      .expect(200);

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [res.body.id]);
    assert.deepEqual(answers.map((a) => a.answer_text), ["First", "Second"]);
  });

  test("creates a question with no answers", async () => {
    const res = await api
      .post("/api/questions")
      .send({ category_id: "nodejs", question_text: "No answers yet?" })
      .expect(200);
    assert.match(res.body.message, /added/i);

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [res.body.id]);
    assert.equal(answers.length, 0);
  });

  test("rejects a create with no category_id or question_text", async () => {
    await api.post("/api/questions").send({ question_text: "Orphan" }).expect(400);
    await api.post("/api/questions").send({ category_id: "nodejs" }).expect(400);
  });

  test("fails the whole create when category_id does not exist", async () => {
    const before_ = (await all("SELECT COUNT(*) AS c FROM questions"))[0].c;
    await api
      .post("/api/questions")
      .send({ category_id: "does-not-exist", question_text: "Should not persist" })
      .expect(500);
    const after_ = (await all("SELECT COUNT(*) AS c FROM questions"))[0].c;
    assert.equal(after_, before_, "question must not be persisted when its insert fails");
  });

  test("lists questions with nested answers and category metadata", async () => {
    const res = await api.get("/api/questions").expect(200);
    assert.ok(res.body.length > 0);

    const first = res.body[0];
    assert.ok("question_text" in first);
    assert.ok("category_label" in first);
    assert.ok("icon" in first);
    assert.ok("color" in first);
    assert.ok(Array.isArray(first.answers));
  });

  test("does not duplicate question rows when a question has several answers", async () => {
    const res = await api.get("/api/questions").expect(200);
    const multi = res.body.find((q) => q.answers.length > 1);
    assert.ok(multi, "expected a question with more than one answer");
    const ids = res.body.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, "question ids must be unique");
  });

  test("filters questions by category", async () => {
    const res = await api.get("/api/questions?category=laravel-core").expect(200);
    assert.ok(res.body.length > 0);
    assert.ok(res.body.every((q) => q.category_id === "laravel-core"));
  });

  test("returns an empty array for a category with no questions", async () => {
    const res = await api.get("/api/questions?category=devops").expect(200);
    assert.deepEqual(res.body, []);
  });

  test("updates question text and category without touching answers", async () => {
    const created = await api
      .post("/api/questions")
      .send({
        category_id: "nodejs",
        question_text: "Original text",
        answers: ["Keep this answer"],
      })
      .expect(200);

    const res = await api
      .put(`/api/questions/${created.body.id}`)
      .send({ question_text: "Updated text", category_id: "react" })
      .expect(200);
    assert.match(res.body.message, /updated/i);

    const rows = await all("SELECT * FROM questions WHERE id = ?", [created.body.id]);
    assert.equal(rows[0].question_text, "Updated text");
    assert.equal(rows[0].category_id, "react");

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [created.body.id]);
    assert.equal(answers.length, 1, "answers must survive a question-only update");
  });

  test("replaces the whole answer set when answers are supplied", async () => {
    const created = await api
      .post("/api/questions")
      .send({
        category_id: "nodejs",
        question_text: "Replaceable answers",
        answers: ["old one", "old two"],
      })
      .expect(200);

    await api
      .put(`/api/questions/${created.body.id}`)
      .send({
        question_text: "Replaceable answers",
        category_id: "nodejs",
        answers: ["only one now"],
      })
      .expect(200);

    const answers = await all(
      "SELECT * FROM answers WHERE question_id = ? ORDER BY id",
      [created.body.id],
    );
    assert.equal(answers.length, 1);
    assert.equal(answers[0].answer_text, "only one now");
  });

  test("rejects an update with no category_id or question_text", async () => {
    const res = await api.put("/api/questions/1").send({ question_text: "hi" }).expect(400);
    assert.match(res.body.error, /required/i);
    await api.put("/api/questions/1").send({ category_id: "nodejs" }).expect(400);
  });

  test("deletes a question and cascades to its answers", async () => {
    const created = await api
      .post("/api/questions")
      .send({ category_id: "testing", question_text: "Doomed", answers: ["a", "b", "c"] })
      .expect(200);

    await api.delete(`/api/questions/${created.body.id}`).expect(200);

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [created.body.id]);
    assert.equal(answers.length, 0, "answers must cascade on question delete");
  });

  test("returns 404 when deleting an unknown question", async () => {
    await api.delete("/api/questions/999999").expect(404);
  });
});

describe("answers", () => {
  let questionId;
  let answerId;

  before(async () => {
    const created = await api
      .post("/api/questions")
      .send({ category_id: "react", question_text: "Answer routes", answers: ["first"] })
      .expect(200);
    questionId = created.body.id;
    const answers = await all("SELECT id FROM answers WHERE question_id = ?", [questionId]);
    answerId = answers[0].id;
  });

  test("lists answers for a question", async () => {
    const res = await api.get(`/api/answers/${questionId}`).expect(200);
    assert.equal(res.body.length, 1);
    assert.ok("question_id" in res.body[0]);
  });

  test("updates a single answer without affecting siblings", async () => {
    const extra = await api
      .post("/api/questions")
      .send({ category_id: "react", question_text: "temp", answers: ["x"] })
      .expect(200);
    const tmpAnswers = await all("SELECT id FROM answers WHERE question_id = ?", [extra.body.id]);

    await run("INSERT INTO answers (question_id, answer_text) VALUES (?, ?)", [
      questionId,
      "sibling",
    ]);

    await api
      .put(`/api/answers/${answerId}`)
      .send({ answer_text: "edited first" })
      .expect(200);

    const rows = await all("SELECT * FROM answers WHERE id = ?", [answerId]);
    assert.equal(rows[0].answer_text, "edited first");

    const siblings = await all(
      "SELECT * FROM answers WHERE question_id = ? AND id != ?",
      [questionId, answerId],
    );
    assert.equal(siblings.length, 1);
    assert.equal(siblings[0].answer_text, "sibling");

    await run("DELETE FROM answers WHERE id = ?", [tmpAnswers[0].id]);
    await api.delete(`/api/questions/${extra.body.id}`);
  });

  test("returns 404 when updating an unknown answer", async () => {
    await api.put("/api/answers/999999").send({ answer_text: "nope" }).expect(404);
  });

  test("deletes a single answer", async () => {
    const res = await api.delete(`/api/answers/${answerId}`).expect(200);
    assert.match(res.body.message, /deleted/i);
    const rows = await all("SELECT * FROM answers WHERE id = ?", [answerId]);
    assert.equal(rows.length, 0);
  });

  test("returns 404 when deleting an unknown answer", async () => {
    await api.delete("/api/answers/999999").expect(404);
  });
});

describe("cascade behaviour", () => {
  test("deleting a category removes its questions and their answers", async () => {
    await api.post("/api/categories").send({ id: "temp-cat", label: "Temp" }).expect(200);
    const q1 = await api
      .post("/api/questions")
      .send({ category_id: "temp-cat", question_text: "q1", answers: ["a1"] })
      .expect(200);
    const q2 = await api
      .post("/api/questions")
      .send({ category_id: "temp-cat", question_text: "q2", answers: ["a2", "a3"] })
      .expect(200);

    await api.delete("/api/categories/temp-cat").expect(200);

    const questions = await all("SELECT * FROM questions WHERE category_id = ?", ["temp-cat"]);
    assert.equal(questions.length, 0);

    const answers = await all(
      "SELECT * FROM answers WHERE question_id IN (?, ?)",
      [q1.body.id, q2.body.id],
    );
    assert.equal(answers.length, 0);
  });
});
