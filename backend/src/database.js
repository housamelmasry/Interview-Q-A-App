import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "./db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database path.
// DB_PATH lets the test suite point at a throwaway database file so that
// running tests never touches the local development database.
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "interview_guide.db");

// Create database connection
const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
    process.exit(1);
  }
  console.log("Connected to SQLite database.");

  // SQLite disables foreign key enforcement per connection, so it must be
  // switched on explicitly or ON DELETE CASCADE silently does nothing.
  await new Promise((resolve, reject) =>
    db.run("PRAGMA foreign_keys = ON;", (e) => (e ? reject(e) : resolve())),
  );

  try {
    await runMigrations(db);
    await bootstrapCategories();
  } catch (migrationError) {
    console.error("Database setup failed:", migrationError.message);
    process.exit(1);
  }

  resolveReady(db);
});

/**
 * Resolves once migrations have run and the starter categories are in place.
 * The test suite and the server bootstrap both await this, so no request can
 * arrive before the schema is usable.
 */
let resolveReady;
export const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

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

/**
 * Inserts any category from the bundled seed file that is not present yet.
 *
 * data.json is the single source of truth for category definitions, so this
 * deliberately does not hard-code the list: adding a category to the seed file is
 * enough for it to appear on a fresh install. Existing rows are left untouched,
 * which keeps a restart non-destructive and preserves any user edits.
 */
async function bootstrapCategories() {
  const seedPath = path.join(__dirname, "data.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

  const existing = new Set(
    (await all("SELECT id FROM categories")).map((row) => row.id),
  );
  const missing = seed.filter((cat) => !existing.has(cat.id));

  if (missing.length === 0) {
    console.log("Categories already present, nothing to bootstrap.");
    return;
  }

  for (const cat of missing) {
    await run("INSERT INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)", [
      cat.id,
      cat.label,
      cat.icon,
      cat.color,
    ]);
  }
  console.log(`Bootstrapped ${missing.length} categories.`);
}

export default db;
