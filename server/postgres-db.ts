import { Pool } from 'pg';
import type { AppDatabase, DbStatement } from '../functions/lib/db-types';

const toPostgresSql = (sql: string) => {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/\bunixepoch\(\)/gi, "extract(epoch FROM now())::bigint");
};

class PgStatement implements DbStatement {
  private values: unknown[] = [];
  private readonly pool: Pool;
  private readonly sql: string;

  constructor(pool: Pool, sql: string) {
    this.pool = pool;
    this.sql = sql;
  }

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<R>() {
    const result = await this.pool.query(toPostgresSql(this.sql), this.values);
    return (result.rows[0] || null) as R | null;
  }

  async all<R>() {
    const result = await this.pool.query(toPostgresSql(this.sql), this.values);
    return { results: result.rows as R[] };
  }

  async run() {
    await this.pool.query(toPostgresSql(this.sql), this.values);
    return {};
  }
}

export const createPostgresDatabase = (connectionString: string): AppDatabase => {
  const pool = new Pool({ connectionString });
  return {
    prepare: (sql: string) => new PgStatement(pool, sql),
  };
};
