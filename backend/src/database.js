import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create database path
// DB_PATH lets the test suite point at a throwaway database file so that
// running tests never touches the local development database.
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "interview_guide.db");

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run("PRAGMA foreign_keys = ON;");
    initializeDatabase();
  }
});

// Resolves once the schema exists and starter categories have been checked.
// The test suite and the server bootstrap both await this so no request can
// arrive before the tables are ready.
let resolveReady;
export const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

// Initialize database tables
function initializeDatabase() {
  // Create categories table
  db.run(
    `
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      icon TEXT,
      color TEXT
    )
  `,
    (err) => {
      if (err) {
        console.error("Error creating categories table:", err);
        return;
      }

      // Create questions table
      db.run(
        `
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id TEXT NOT NULL,
        question_text TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
      )
    `,
        (err) => {
          if (err) {
            console.error("Error creating questions table:", err);
            return;
          }

          // Create answers table
          db.run(
            `
        CREATE TABLE IF NOT EXISTS answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id INTEGER NOT NULL,
          answer_text TEXT NOT NULL,
          FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
        )
      `,
            (err) => {
              if (err) {
                console.error("Error creating answers table:", err);
                return;
              }

              // Insert initial data only after tables are created
              insertInitialData();
            },
          );
        },
      );
    },
  );
}

function insertInitialData() {
  // Check if data already exists
  db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
    if (err) {
      console.error("Error checking categories:", err);
      return;
    }

    if (row.count === 0) {
      // Insert categories
      const categories = [
        {
          id: "laravel-core",
          label: "Laravel Core",
          icon: "🔴",
          color: "#FF4444",
        },
        {
          id: "laravel-advanced",
          label: "Laravel Advanced",
          icon: "🟠",
          color: "#FF8C00",
        },
        {
          id: "backend-general",
          label: "Backend عام",
          icon: "🟢",
          color: "#00C853",
        },
        {
          id: "system-design",
          label: "System Design",
          icon: "🔵",
          color: "#2979FF",
        },
        { id: "nodejs", label: "Node.js", icon: "🟡", color: "#F7DF1E" },
        { id: "react", label: "React", icon: "⚛️", color: "#61DAFB" },
        {
          id: "react-native",
          label: "React Native",
          icon: "📱",
          color: "#00D8FF",
        },
        {
          id: "testing",
          label: "Testing & Security",
          icon: "🟣",
          color: "#AA00FF",
        },
      ];

      const stmt = db.prepare(
        "INSERT INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)",
      );
      categories.forEach((cat) => {
        stmt.run(cat.id, cat.label, cat.icon, cat.color);
      });

      console.log("Inserting initial categories...");
      // Resolve only once the prepared statement has actually been flushed,
      // otherwise callers awaiting `ready` can observe a partially seeded table.
      stmt.finalize((err) => {
        if (err) {
          console.error("Error inserting initial categories:", err);
        } else {
          console.log("Initial categories inserted.");
        }
        resolveReady(db);
      });
      return;
    }

    resolveReady(db);
  });
}

export default db;
