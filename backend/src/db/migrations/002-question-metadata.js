/**
 * Adds question metadata used for filtering and prioritising study material.
 *
 * The column check keeps this safe to run against a database created before
 * these columns existed, and avoids the "duplicate column name" error that a
 * bare ALTER TABLE would raise.
 */
export async function up(ctx) {
  const columns = await ctx.all("PRAGMA table_info(questions)");
  const names = columns.map((c) => c.name);

  if (!names.includes("difficulty")) {
    await ctx.run(
      `ALTER TABLE questions
       ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'intermediate'`,
    );
  }

  if (!names.includes("tags")) {
    await ctx.run(
      `ALTER TABLE questions
       ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
    );
  }
}
