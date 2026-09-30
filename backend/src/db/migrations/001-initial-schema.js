/**
 * Baseline schema: three related entities with enforced foreign keys and
 * cascading deletes. Uses IF NOT EXISTS so that running the migration against a
 * database created by an earlier version of this app is a no-op rather than an
 * error.
 */
export async function up(ctx) {
  await ctx.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id    TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      icon  TEXT,
      color TEXT
    )
  `);

  await ctx.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id   TEXT NOT NULL,
      question_text TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
    )
  `);

  await ctx.run(`
    CREATE TABLE IF NOT EXISTS answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer_text TEXT NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
    )
  `);
}
