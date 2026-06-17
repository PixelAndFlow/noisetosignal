import pg from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const isDevMode = process.env.DEV_MODE === 'true';
const useSqlite =
  isDevMode || (process.env.DATABASE_URL || '').startsWith('sqlite:');

function toSqlite(sql) {
  return sql.replace(/\$(\d+)/g, '?').replace(/\bNOW\(\)/gi, "datetime('now')");
}

function bindParams(params) {
  return params.map((p) => {
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

function createSqlitePool() {
  const raw = process.env.DATABASE_URL || 'sqlite:./data/dev.db';
  const filePath = raw.startsWith('sqlite:')
    ? path.resolve(process.cwd(), raw.replace('sqlite:', ''))
    : path.resolve(process.cwd(), 'data/dev.db');

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const query = (sql, params = []) => {
    const normalized = toSqlite(sql);
    const bound = bindParams(params);
    const upper = normalized.trim().toUpperCase();

    if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
      const stmt = db.prepare(normalized);
      const rows = stmt.all(...bound);
      return { rows };
    }

    if (upper.startsWith('INSERT') && upper.includes('RETURNING')) {
      const stmt = db.prepare(normalized);
      const row = stmt.get(...bound);
      return { rows: row ? [row] : [] };
    }

    const stmt = db.prepare(normalized);
    const info = stmt.run(...bound);
    return { rows: [], rowCount: info.changes };
  };

  const connect = async () => {
    let inTransaction = false;

    const client = {
      query: async (sql, params = []) => {
        const trimmed = sql.trim().toUpperCase();
        if (trimmed === 'BEGIN') {
          if (!inTransaction) db.exec('BEGIN');
          inTransaction = true;
          return { rows: [] };
        }
        if (trimmed === 'COMMIT') {
          if (inTransaction) db.exec('COMMIT');
          inTransaction = false;
          return { rows: [] };
        }
        if (trimmed === 'ROLLBACK') {
          if (inTransaction) db.exec('ROLLBACK');
          inTransaction = false;
          return { rows: [] };
        }
        return query(sql, params);
      },
      release: () => {
        if (inTransaction) {
          db.exec('ROLLBACK');
          inTransaction = false;
        }
      },
    };

    return client;
  };

  const exec = (sql) => {
    db.exec(sql);
  };

  const end = async () => {
    db.close();
  };

  return { query, exec, connect, end };
}

function createPgPool() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  return {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    connect: () => pool.connect(),
    end: () => pool.end(),
  };
}

const pool = useSqlite ? createSqlitePool() : createPgPool();

export default pool;
