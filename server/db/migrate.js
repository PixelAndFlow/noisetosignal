import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool, { isDevMode } from './index.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schemaFile = isDevMode || (process.env.DATABASE_URL || '').startsWith('sqlite:')
    ? 'schema.sqlite.sql'
    : 'schema.sql';

  const schemaPath = path.join(__dirname, '../../sql', schemaFile);
  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    if (schemaFile === 'schema.sqlite.sql') {
      pool.exec(sql);
    } else {
      await pool.query(sql);
    }
    console.log(`Migration completed (${schemaFile}).`);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
