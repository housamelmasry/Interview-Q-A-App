import db, { ready } from "./database.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, "data.json");
const categories = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const VALID_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);

/**
 * Normalises a question's answers to an array of strings.
 *
 * The seed file allows `a` to be either a single string or an array of strings,
 * so shorter entries stay readable while questions with several distinct points
 * can use the full form.
 */
function normaliseAnswers(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((entry) => (typeof entry === "string" ? entry : entry?.answer_text))
    .filter((text) => typeof text === "string" && text.trim().length > 0);
}

function normaliseDifficulty(raw) {
  return VALID_DIFFICULTIES.has(raw) ? raw : "intermediate";
}

function normaliseTags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
}

async function seed() {
  console.log("Starting seeding process...");

  try {
    await ready;

    // Clear existing data. Deleting children first keeps this correct even if
    // foreign key enforcement were ever disabled.
    await runQuery("DELETE FROM answers");
    await runQuery("DELETE FROM questions");
    await runQuery("DELETE FROM categories");
    console.log("Cleared existing data.");

    let questionCount = 0;
    let answerCount = 0;

    for (const cat of categories) {
      await runQuery(
        "INSERT INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)",
        [cat.id, cat.label, cat.icon, cat.color],
      );
      console.log(`Inserted category: ${cat.label}`);

      for (const question of cat.questions ?? []) {
        const questionResult = await runQuery(
          `INSERT INTO questions (category_id, question_text, difficulty, tags)
           VALUES (?, ?, ?, ?)`,
          [
            cat.id,
            question.q,
            normaliseDifficulty(question.difficulty),
            JSON.stringify(normaliseTags(question.tags)),
          ],
        );
        const questionId = questionResult.lastID;
        questionCount += 1;

        for (const answerText of normaliseAnswers(question.a)) {
          await runQuery(
            "INSERT INTO answers (question_id, answer_text) VALUES (?, ?)",
            [questionId, answerText],
          );
          answerCount += 1;
        }
      }
    }

    console.log(
      `\nDatabase seeding complete: ${categories.length} categories, ` +
        `${questionCount} questions, ${answerCount} answers.`,
    );
    process.exit(0);
  } catch (err) {
    console.error("Error during seeding:", err);
    process.exit(1);
  }
}

await seed();
