import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { loadLocalEnv } from './load-env';

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const sql = await readFile(join(process.cwd(), 'migrations-postgres', '0001_initial.sql'), 'utf8');
  await pool.query(sql);
  console.log('PostgreSQL migrations applied');
} finally {
  await pool.end();
}
