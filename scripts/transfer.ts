import dotenv from 'dotenv';
import pkg from 'pg';
import Database3 from 'better-sqlite3';
import path from 'path';
import { createModuleLogger } from '../src/config/logger';

dotenv.config();

const { Pool } = pkg;
const logger = createModuleLogger('DbTransfer');

type SourceDb =
  | { kind: 'postgres'; pool: pkg.Pool }
  | { kind: 'sqlite'; sqlite: Database3.Database };

const TABLES = ['users', 'user_configs', 'user_behavior', 'chat_messages', 'goals'] as const;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function openSourceDb(sourceUrl: string): SourceDb {
  if (sourceUrl.startsWith('sqlite:')) {
    const dbPath = sourceUrl.replace('sqlite:', '');
    const resolved = path.resolve(process.cwd(), dbPath);
    logger.info('Using SQLite source', { path: resolved });
    return { kind: 'sqlite', sqlite: new Database3(resolved) };
  }

  logger.info('Using Postgres source', { databaseUrl: sourceUrl.replace(/:[^:@]*@/, ':***@') });
  return { kind: 'postgres', pool: new Pool(poolOptionsFromUrl(sourceUrl)) };
}

function poolOptionsFromUrl(connectionString: string): pkg.PoolConfig {
  let ssl: { rejectUnauthorized: boolean } | undefined;
  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get('sslmode');
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    const forceSsl = (process.env.PG_SSL || '').toLowerCase() === 'true';
    const shouldUseSsl = forceSsl || sslmode === 'require' || url.hostname.endsWith('supabase.co');
    if (shouldUseSsl) ssl = { rejectUnauthorized: false };
  } catch {
    // ignore
  }
  return { connectionString, ssl };
}

async function readSourceRows(source: SourceDb, table: (typeof TABLES)[number]): Promise<any[]> {
  if (source.kind === 'sqlite') {
    return source.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
  }

  const res = await source.pool.query(`SELECT * FROM "${table}" ORDER BY id ASC`);
  return res.rows;
}

async function getTargetColumns(target: pkg.Pool, table: string): Promise<string[]> {
  const res = await target.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position ASC`,
    [table]
  );
  return res.rows.map(r => r.column_name);
}

function buildUpsertSql(table: string, cols: string[]): string {
  const quotedCols = cols.map(c => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updateCols = cols.filter(c => c !== 'id');
  const updateSet =
    updateCols.length === 0
      ? 'NOTHING'
      : `UPDATE SET ${updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')}`;

  return `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT (id) DO ${updateSet}`;
}

async function setIdSequence(target: pkg.Pool, table: string): Promise<void> {
  const seqRes = await target.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [`public.${table}`]);
  const seq = seqRes.rows?.[0]?.seq as string | null | undefined;
  if (!seq) return;

  await target.query(
    `SELECT setval($1::regclass, (SELECT COALESCE(MAX(id), 0) FROM "${table}"), true)`,
    [seq]
  );
}

async function main() {
  const sourceUrl = requireEnv('SOURCE_DATABASE_URL');
  const targetUrl = requireEnv('TARGET_DATABASE_URL');
  const truncate = (process.env.TRANSFER_TRUNCATE || '').toLowerCase() === 'true';

  const source = openSourceDb(sourceUrl);
  const target = new Pool(poolOptionsFromUrl(targetUrl));

  try {
    await target.query('SELECT 1');
    logger.info('Target database connected');

    for (const table of TABLES) {
      logger.info('Transferring table', { table });

      const rows = await readSourceRows(source, table);
      logger.info('Source rows', { table, count: rows.length });

      if (truncate) {
        await target.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      }

      if (rows.length === 0) {
        await setIdSequence(target, table);
        continue;
      }

      const cols = await getTargetColumns(target, table);
      if (cols.length === 0) {
        throw new Error(`Target table not found: public.${table}. Run migrations first.`);
      }

      const sql = buildUpsertSql(table, cols);

      await target.query('BEGIN');
      try {
        for (const row of rows) {
          const values = cols.map(col => (row[col] === undefined ? null : row[col]));
          await target.query(sql, values);
        }
        await setIdSequence(target, table);
        await target.query('COMMIT');
      } catch (e) {
        await target.query('ROLLBACK');
        throw e;
      }
    }

    logger.info('Transfer completed successfully');
    process.exit(0);
  } finally {
    if (source.kind === 'postgres') await source.pool.end();
    if (source.kind === 'sqlite') source.sqlite.close();
    await target.end();
  }
}

main().catch(err => {
  logger.error('Transfer failed', { err: (err as Error).message });
  process.exit(1);
});
