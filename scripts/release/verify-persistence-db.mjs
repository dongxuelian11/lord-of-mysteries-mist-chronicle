import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [databaseArgument, ...extraArguments] = process.argv.slice(2);

function fail(message) {
  console.error(`[release-persistence] ${message}`);
  process.exitCode = 1;
}

if (!databaseArgument || extraArguments.length > 0) {
  fail("usage: node scripts/release/verify-persistence-db.mjs <database-path>");
} else {
  const databasePath = path.resolve(databaseArgument);
  let database;
  try {
    if (!fs.existsSync(databasePath)) throw new Error("database-file-missing");
    database = new DatabaseSync(databasePath, { readOnly: true });

    const journalMode = String(database.prepare("PRAGMA journal_mode").get()?.journal_mode ?? "").toLowerCase();
    if (journalMode !== "wal") throw new Error(`unexpected-journal-mode:${journalMode || "empty"}`);

    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("persistence_records");
    if (!table) throw new Error("persistence-records-table-missing");

    const columns = database.prepare("PRAGMA table_info(persistence_records)").all();
    const requiredColumns = ["key", "kind", "schema_version", "payload", "checksum", "updated_at"];
    const columnNames = new Set(columns.map((column) => column.name));
    const missingColumns = requiredColumns.filter((column) => !columnNames.has(column));
    if (missingColumns.length > 0) throw new Error(`persistence-records-columns-missing:${missingColumns.join(",")}`);

    console.log(JSON.stringify({
      databasePath,
      journalMode,
      persistenceRecordsTable: true,
      requiredColumns: requiredColumns.length,
      readOnlyProbe: true,
      ok: true,
    }));
  } catch (error) {
    fail(String(error?.message ?? error));
  } finally {
    database?.close();
  }
}
