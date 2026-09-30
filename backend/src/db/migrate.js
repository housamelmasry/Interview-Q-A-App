import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Promisified helpers handed to each migration. Migrations receive this small
 * surface instead of the raw sqlite3 handle, which keeps them free of callback
 * boilerplate and makes them easy to read and review.
 */
function createContext(db) {
  return {
    run: (sql, params = []) =>
      new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      }),
    get: (sql, params = []) =>
      new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
      }),
    all: (sql, params = []) =>
      new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      }),
  };
}

async function ensureMigrationsTable(ctx) {
  await ctx.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export async function runMigrations(db, { log = console.log } = {}) {
  const ctx = createContext(db);
  await ensureMigrationsTable(ctx);

  const applied = new Set(
    (await ctx.all("SELECT version FROM schema_migrations")).map((r) => r.version),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

  const pending = files.filter((f) => !applied.has(f.replace(/\.js$/, "")));
  if (pending.length === 0) {
    log(`Database up to date (${files.length} migrations applied).`);
    return [];
  }

  const justApplied = [];
  for (const file of pending) {
    const version = file.replace(/\.js$/, "");
    const migration = await import(path.join(MIGRATIONS_DIR, file));

    // Each migration is atomic: a failure rolls back and aborts the run, so the
    // database is never left half-migrated.
    await ctx.run("BEGIN");
    try {
      await migration.up(ctx);
      await ctx.run(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [version],
      );
      await ctx.run("COMMIT");
    } catch (err) {
      await ctx.run("ROLLBACK");
      throw new Error(`Migration "${version}" failed: ${err.message}`, {
        cause: err,
      });
    }

    log(`Applied migration: ${version}`);
    justApplied.push(version);
  }

  return justApplied;
}
