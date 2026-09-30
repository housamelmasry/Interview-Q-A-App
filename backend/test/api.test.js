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

describe("migrations/indexes", () => {
  test("has 4 migration versions in schema_migrations", async () => {
    const rows = await all("SELECT version FROM schema_migrations ORDER BY version");
    // migrate.js stores the migration filename without its extension, so the
    // version column is text rather than a 1..n counter.
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.map((r) => r.version),
      [
        "001-initial-schema",
        "002-question-metadata",
        "003-performance-indexes",
        "004-full-text-search",
      ],
    );
  });

  test("has critical indexes via sqlite_master", async () => {
    const rows = await all(
      `SELECT name FROM sqlite_master
        WHERE type = 'index'
          AND name IN (
            'idx_questions_category_id',
            'idx_answers_question_id',
            'idx_questions_category_created'
          )
        ORDER BY name`
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      [
        "idx_answers_question_id",
        "idx_questions_category_created",
        "idx_questions_category_id",
      ],
    );
  });

  test("EXPLAIN QUERY PLAN: filtering questions by category uses an index", async () => {
    const rows = await all(
      "EXPLAIN QUERY PLAN SELECT * FROM questions WHERE category_id = ?",
      ["laravel-core"],
    );
    const detail = rows.map((r) => r.detail).join(" | ");

    // Must not degrade into a full table scan.
    assert.ok(
      /USING INDEX/.test(detail) && !/SCAN questions\b/.test(detail),
      `expected an index scan, got: ${detail}`,
    );

    // SQLite picks whichever of the two category indexes is cheapest. Both cover
    // this predicate, and the planner prefers the composite (category_id, id) one,
    // so either is an acceptable answer for this test.
    assert.match(
      detail,
      /idx_questions_category_(id|created)/,
      `expected a questions category index, got: ${detail}`,
    );
  });

  test("EXPLAIN QUERY PLAN: fetching answers by question_id uses an index", async () => {
    const rows = await all(
      "EXPLAIN QUERY PLAN SELECT * FROM answers WHERE question_id = ?",
      [1]
    );
    assert.ok(rows.some((r) => /idx_answers_question_id/.test(JSON.stringify(r))));
  });
});

describe("categories", () => {
  test("seeds the starter categories on first run", async () => {
    const res = await api.get("/api/categories").expect(200);
    const ids = res.body.map((c) => c.id);
    assert.ok(ids.includes("laravel-core"));
    assert.ok(ids.includes("system-design"));
    assert.equal(res.body.length, 10);
  });

  test("returns categories ordered by label", async () => {
    const res = await api.get("/api/categories").expect(200);
    const labels = res.body.map((c) => c.label);
    assert.deepEqual(labels, [...labels].sort());
  });

  test("includes question_count per category", async () => {
    const res = await api.get("/api/categories").expect(200);
    assert.ok(res.body.every((c) => "question_count" in c));
  });

  test("creates a category", async () => {
    const res = await api
      .post("/api/categories")
      .send({ id: "sre-tools", label: "SRE Tools", icon: "⚙️", color: "#00B8D9" })
      .expect(201);
    assert.equal(res.body.id, "sre-tools");

    const rows = await all("SELECT * FROM categories WHERE id = ?", ["sre-tools"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].color, "#00B8D9");
  });

  test("applies defaults for omitted icon and color", async () => {
    await api.post("/api/categories").send({ id: "bare", label: "Bare" }).expect(201);
    const rows = await all("SELECT * FROM categories WHERE id = ?", ["bare"]);
    assert.equal(rows[0].icon, "");
    assert.equal(rows[0].color, "#666666");
  });

  test("rejects a create with no id or label", async () => {
    const res = await api.post("/api/categories").send({ label: "No id" }).expect(400);
    assert.match(res.body.error, /required/i);
  });

  test("rejects a duplicate id", async () => {
    await api.post("/api/categories").send({ id: "sre-tools", label: "Dupe" }).expect(500);
  });

  test("updates a category (regression: this route was missing)", async () => {
    const res = await api
      .put("/api/categories/sre-tools")
      .send({ label: "SRE Tools & Platform", icon: "🛠️", color: "#123456" })
      .expect(200);
    assert.match(res.body.message, /updated/i);

    const rows = await all("SELECT * FROM categories WHERE id = ?", ["sre-tools"]);
    assert.equal(rows[0].label, "SRE Tools & Platform");
    assert.equal(rows[0].icon, "🛠️");
  });

  test("rejects an update with no label", async () => {
    const res = await api.put("/api/categories/sre-tools").send({ icon: "x" }).expect(400);
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
      .expect(201);

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
      .expect(201);

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [res.body.id]);
    assert.deepEqual(answers.map((a) => a.answer_text), ["First", "Second"]);
  });

  test("creates a question with no answers", async () => {
    const res = await api
      .post("/api/questions")
      .send({ category_id: "nodejs", question_text: "No answers yet?" })
      .expect(201);
    assert.ok(res.body.id || res.body.message);

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [res.body.id || -1]);
    assert.equal(answers.length, 0);
  });

  test("creates a question with difficulty and tags", async () => {
    const res = await api
      .post("/api/questions")
      .send({
        category_id: "laravel-core",
        question_text: "Hard question",
        answers: ["Answer"],
        difficulty: "hard",
        tags: ["advanced", "php"],
      })
      .expect(201);

    const rows = await all("SELECT * FROM questions WHERE id = ?", [res.body.id]);
    assert.equal(rows[0].difficulty, "hard");
    assert.deepEqual(JSON.parse(rows[0].tags), ["advanced", "php"]);

    const listed = await api.get("/api/questions?category=laravel-core&limit=100").expect(200);
    const item = listed.body.items.find((q) => q.id === res.body.id);
    assert.equal(item.difficulty, "hard");
    assert.deepEqual(item.tags, ["advanced", "php"], "tags are exposed as a JSON array");
  });

  test("defaults difficulty and tags when they are omitted", async () => {
    const res = await api
      .post("/api/questions")
      .send({ category_id: "laravel-core", question_text: "No metadata supplied" })
      .expect(201);

    const rows = await all("SELECT * FROM questions WHERE id = ?", [res.body.id]);
    assert.equal(rows[0].difficulty, "intermediate");
    assert.deepEqual(JSON.parse(rows[0].tags), []);
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
    assert.ok(res.body.items);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.total >= 0);
    assert.ok("page" in res.body);
    assert.ok("limit" in res.body);
    assert.ok("pages" in res.body);

    if (res.body.items.length > 0) {
      const first = res.body.items[0];
      assert.ok("question_text" in first);
      assert.ok("category_label" in first);
      assert.ok("icon" in first);
      assert.ok("color" in first);
      assert.ok("difficulty" in first);
      assert.ok("tags" in first);
      assert.ok(Array.isArray(first.answers));
      first.answers.forEach((a) => {
        assert.ok("id" in a);
        assert.ok("answer_text" in a);
      });
    }
  });

  test("does not duplicate question rows when a question has several answers", async () => {
    const res = await api.get("/api/questions").expect(200);
    const items = res.body.items;
    const multi = items.find((q) => q.answers.length > 1);
    assert.ok(multi, "expected a question with more than one answer");
    const ids = items.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, "question ids must be unique");
  });

  test("filters questions by category", async () => {
    const res = await api.get("/api/questions?category=laravel-core").expect(200);
    assert.ok(res.body.items.length > 0);
    assert.ok(res.body.items.every((q) => q.category_id === "laravel-core"));
  });

  test("returns an empty envelope for a category with no questions", async () => {
    const res = await api.get("/api/questions?category=sre-tools").expect(200);
    assert.deepEqual(res.body.items, []);
    assert.equal(res.body.total, 0);
    assert.ok("page" in res.body);
    assert.ok("limit" in res.body);
    assert.ok("pages" in res.body);
  });

  test("pagination splits results and reports consistent envelope fields", async () => {
    // Three questions in one category, each with a different number of answers,
    // so the page must be sized by question and not by joined answer rows.
    for (const [text, answers] of [
      ["Page question one", ["p1a1", "p1a2", "p1a3"]],
      ["Page question two", ["p2a1", "p2a2"]],
      ["Page question three", ["p3a1"]],
    ]) {
      await api
        .post("/api/questions")
        .send({ category_id: "databases", question_text: text, answers })
        .expect(201);
    }

    const total = (await api.get("/api/questions?category=databases").expect(200)).body.total;
    assert.equal(total, 3);

    const first = await api.get("/api/questions?category=databases&limit=2&page=1").expect(200);
    assert.equal(first.body.limit, 2);
    assert.equal(first.body.page, 1);
    assert.equal(first.body.total, 3);
    assert.equal(first.body.pages, 2);
    assert.equal(first.body.items.length, 2, "limit counts questions, not answer rows");

    const second = await api.get("/api/questions?category=databases&limit=2&page=2").expect(200);
    assert.equal(second.body.items.length, 1);
    assert.equal(second.body.total, 3, "total reflects the whole match set, not the page");

    const firstIds = new Set(first.body.items.map((q) => q.id));
    const overlap = second.body.items.filter((q) => firstIds.has(q.id));
    assert.equal(overlap.length, 0, "pages must not repeat questions");
  });

  test("pagination clamps an out-of-range limit and defaults an invalid page", async () => {
    const high = await api.get("/api/questions?limit=9999&page=1").expect(200);
    assert.equal(high.body.limit, 100, "limit is clamped to MAX_LIMIT");

    const zero = await api.get("/api/questions?limit=0&page=0").expect(200);
    assert.equal(zero.body.limit, 1, "a zero limit is clamped up to 1");
    assert.equal(zero.body.page, 1, "page falls back to 1");

    const junk = await api.get("/api/questions?limit=abc&page=xyz").expect(200);
    assert.equal(junk.body.limit, 20);
    assert.equal(junk.body.page, 1);
  });

  test("updates question text and category without touching answers", async () => {
    const created = await api
      .post("/api/questions")
      .send({
        category_id: "nodejs",
        question_text: "Original text",
        answers: ["Keep this answer"],
      })
      .expect(201);

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
      .expect(201);

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
      [created.body.id]
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
      .expect(201);

    await api.delete(`/api/questions/${created.body.id}`).expect(200);

    const answers = await all("SELECT * FROM answers WHERE question_id = ?", [created.body.id]);
    assert.equal(answers.length, 0, "answers must cascade on question delete");
  });

  test("returns 404 when deleting an unknown question", async () => {
    await api.delete("/api/questions/999999").expect(404);
  });
});

describe("search", () => {
  // The FTS index is populated by INSERT triggers, so these fixtures are both
  // inserted and indexed by going through the API.
  const ids = {};

  before(async () => {
    const fixtures = [
      [
        "arabic",
        "ما هو الـ Service Container في لارافيل؟",
        ["الحاوية تحل التبعيات تلقائياً."],
      ],
      [
        "english",
        "How does the service container resolve bindings?",
        ["Bindings are registered in service providers."],
      ],
      ["other", "Explain database transactions", ["Use DB::transaction to group writes."]],
    ];

    for (const [key, question_text, answers] of fixtures) {
      const res = await api
        .post("/api/questions")
        .send({ category_id: "laravel-core", question_text, answers })
        .expect(201);
      ids[key] = res.body.id;
    }
  });

  test("returns a paginated envelope for search results", async () => {
    const res = await api.get("/api/search?q=container").expect(200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok("total" in res.body);
    assert.ok("page" in res.body);
    assert.ok("limit" in res.body);
    assert.ok("pages" in res.body);
  });

  test("empty q returns an empty envelope", async () => {
    const res = await api.get("/api/search?q=").expect(200);
    assert.deepEqual(res.body.items, []);
    assert.equal(res.body.total, 0);
  });

  test("whitespace-only q returns an empty envelope", async () => {
    const res = await api.get("/api/search?q=%20%20%20").expect(200);
    assert.deepEqual(res.body.items, []);
    assert.equal(res.body.total, 0);
  });

  test("returns results for Arabic terms", async () => {
    const res = await api.get("/api/search?q=لارافيل").expect(200);
    const found = res.body.items.map((q) => q.id);
    assert.ok(
      found.includes(ids.arabic),
      `expected the Arabic question in the results, got ${JSON.stringify(found)}`,
    );
  });

  test("returns results for a partial prefix term", async () => {
    const res = await api.get("/api/search?q=cont").expect(200);
    const found = res.body.items.map((q) => q.id);
    assert.ok(
      found.includes(ids.english),
      `expected the prefix match on "cont", got ${JSON.stringify(found)}`,
    );
  });

  test("matches on answer text as well as question text", async () => {
    const res = await api.get("/api/search?q=transactions").expect(200);
    const found = res.body.items.map((q) => q.id);
    assert.ok(
      found.includes(ids.other),
      `expected an answer-only match to be returned, got ${JSON.stringify(found)}`,
    );
  });

  test("multi-token query prefers AND before falling back to OR", async () => {
    const and = await api.get("/api/search?q=service container").expect(200);
    const andIds = and.body.items.map((q) => q.id);
    assert.ok(andIds.includes(ids.arabic), "question text matches both tokens");
    assert.ok(andIds.includes(ids.english), "AND matches every question containing both tokens");
    assert.ok(
      !andIds.includes(ids.other),
      "AND results must exclude questions matching only one token",
    );

    // A leading Arabic article ("ال") has no matching token in the corpus, so the
    // AND attempt comes back empty and the query is retried with OR.
    const fallback = await api.get("/api/search?q=ال container").expect(200);
    assert.ok(
      fallback.body.items.some((q) => q.id === ids.arabic),
      "expected the OR fallback to recover the Arabic match",
    );
  });

  test("hydrates results with the same nested shape as the questions route", async () => {
    const res = await api.get("/api/search?q=container").expect(200);
    const item = res.body.items.find((q) => q.id === ids.english);
    assert.ok(item, "expected the English question in the results");
    assert.ok("question_text" in item);
    assert.ok("category_label" in item);
    assert.ok(Array.isArray(item.tags));
    assert.ok(Array.isArray(item.answers));
    assert.ok(item.answers.length > 0);
    assert.ok("answer_text" in item.answers[0]);
  });

  test("sanitizes unsafe query syntax instead of executing it", async () => {
    const injected = await api.get("/api/search?q= OR 1=1 --").expect(200);
    const all = await api.get("/api/questions?limit=100").expect(200);

    assert.ok(Array.isArray(injected.body.items));
    assert.ok(
      injected.body.total < all.body.total,
      "an injection attempt must not return the whole corpus",
    );
  });

  test("strips FTS5 operators rather than erroring", async () => {
    // Unbalanced quotes and NEAR would both be a syntax error if passed
    // straight to MATCH.
    for (const q of ['"', "NEAR", "*", "container^", "a OR", "((("]) {
      const res = await api
        .get("/api/search")
        .query({ q })
        .expect(200);
      assert.ok(Array.isArray(res.body.items), `expected an envelope for ${JSON.stringify(q)}`);
    }
  });
});

describe("answers", () => {
  let questionId;
  let answerId;

  before(async () => {
    const created = await api
      .post("/api/questions")
      .send({ category_id: "react", question_text: "Answer routes", answers: ["first"] })
      .expect(201);
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
      .expect(201);
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
      [questionId, answerId]
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
    await api.post("/api/categories").send({ id: "temp-cat", label: "Temp" }).expect(201);
    const q1 = await api
      .post("/api/questions")
      .send({ category_id: "temp-cat", question_text: "q1", answers: ["a1"] })
      .expect(201);
    const q2 = await api
      .post("/api/questions")
      .send({ category_id: "temp-cat", question_text: "q2", answers: ["a2", "a3"] })
      .expect(201);

    await api.delete("/api/categories/temp-cat").expect(200);

    const questions = await all("SELECT * FROM questions WHERE category_id = ?", ["temp-cat"]);
    assert.equal(questions.length, 0);

    const answers = await all(
      "SELECT * FROM answers WHERE question_id IN (?, ?)",
      [q1.body.id, q2.body.id]
    );
    assert.equal(answers.length, 0);
  });
});
