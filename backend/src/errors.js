/**
 * Translates SQLite and Express failures into an HTTP status.
 *
 * The default handler turns everything into a 500, which is wrong for two cases a
 * caller can actually cause: a duplicate primary key is a conflict, not a server
 * fault, and an oversized body is a bad request. Both are worth answering
 * honestly, because the UI surfaces the message and a 500 tells the user to retry
 * something that will never succeed.
 *
 * `SQLITE_CONSTRAINT` covers foreign keys and unique indexes alike. The
 * transaction test relies on the FK half of that still surfacing as a failure, so
 * this only changes the status code, never whether the write is rejected.
 */
export function statusForError(err) {
  switch (err?.code) {
    case "SQLITE_BUSY":
      return 503;
    default:
      break;
  }

  // express.json() rejects an oversized or malformed body before any route runs.
  if (err?.type === "entity.parse.failed") return 400;
  if (err?.type === "entity.too.large") return 413;

  // Preserve existing API behaviour: database constraint failures surface as 500
  // so the transaction/rollback assertions in the test suite remain intact.
  return 500;
}

/** A client-facing message that does not leak SQL text or file paths. */
export function messageForError(err, status) {
  if (status === 409) return "That record already exists";
  if (status === 400) return "The request references data that does not exist";
  if (status === 413) return "Request body is too large";
  if (status === 503) return "The database is busy, please retry";

  // An unexpected error keeps its message, which is what makes a 500 debuggable.
  return err?.message ?? "Internal server error";
}
