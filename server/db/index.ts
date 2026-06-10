import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";

// Singleton via globalThis: en dev, el HMR de Next recarga este modulo varias
// veces; sin esto abririamos multiples conexiones al mismo archivo SQLite.
const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
};

// DATABASE_PATH apunta al volumen persistente en el contenedor; en dev local
// cae en ./data.db.
const dbPath = process.env.DATABASE_PATH ?? "data.db";
const sqlite = globalForDb.sqlite ?? new Database(dbPath);
if (!globalForDb.sqlite) globalForDb.sqlite = sqlite;

// Bootstrap idempotente: creamos la tabla si no existe en cada arranque.
// Decision pragmatica para una herramienta local de un nodo (en prod seria
// drizzle-kit migrate). Tradeoff anotado para el README.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    repo_url TEXT NOT NULL,
    dockerfile_path TEXT NOT NULL,
    port INTEGER NOT NULL,
    subdomain TEXT NOT NULL,
    custom_labels TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    logs TEXT NOT NULL DEFAULT '',
    service_name TEXT,
    image_tag TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
