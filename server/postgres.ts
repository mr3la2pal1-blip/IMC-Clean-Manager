import crypto from 'node:crypto';
import {Pool, type PoolClient, type QueryResult, type QueryResultRow} from 'pg';

/**
 * PostgreSQL connection for the IMC Clean Manager server.
 *
 * This module is intentionally separate from the current SQLite adapter while
 * the route handlers are being migrated. Do not switch the live server to it
 * until every database-backed route has been converted and tested.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === 'production' && process.env.ENABLE_POSTGRES_MIGRATION === 'true') {
  throw new Error('DATABASE_URL is required when ENABLE_POSTGRES_MIGRATION=true.');
}

export const pgPool = new Pool({
  ...(connectionString ? {connectionString} : {}),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(connectionString ? {ssl: {rejectUnauthorized: false}} : {}),
  application_name: 'imc-clean-manager',
});

pgPool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }
  return pgPool.query<T>(text, values);
}

export async function withPgTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('PostgreSQL rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

const REQUIRED_TABLES = [
  'app_settings',
  'users',
  'departments',
  'cleaning_requests',
  'worker_shifts',
  'shift_handovers',
  'nursing_status_reports',
  'nursing_performance_ratings',
  'worker_notes',
  'audit_logs',
] as const;

let sessionSecret: string | null = null;

/**
 * Validate the existing Supabase schema and load/create the server session
 * secret before accepting requests. This does not recreate or overwrite data.
 */
export async function initializePostgres(): Promise<void> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize PostgreSQL.');
  }

  const result = await pgQuery<{table_name: string}>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])`,
    [[...REQUIRED_TABLES]],
  );

  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length) {
    throw new Error(`Supabase schema is incomplete. Missing tables: ${missing.join(', ')}`);
  }

  const setting = await pgQuery<{value: string}>(
    "SELECT value FROM app_settings WHERE key = 'session_secret' LIMIT 1",
  );

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    sessionSecret = process.env.SESSION_SECRET;
  } else if (setting.rows[0]?.value) {
    sessionSecret = setting.rows[0].value;
  } else {
    const generated = crypto.randomBytes(48).toString('hex');
    await pgQuery(
      'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      ['session_secret', generated],
    );
    const saved = await pgQuery<{value: string}>(
      "SELECT value FROM app_settings WHERE key = 'session_secret' LIMIT 1",
    );
    if (!saved.rows[0]?.value) {
      throw new Error('Could not initialize the application session secret.');
    }
    sessionSecret = saved.rows[0].value;
  }

  console.log('PostgreSQL schema verified; IMC application persistence is ready.');
}

export function getPostgresSessionSecret(): string {
  if (!sessionSecret) {
    throw new Error('PostgreSQL has not been initialized before session use.');
  }
  return sessionSecret;
}

export async function writePostgresAuditLog(params: {
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
}): Promise<void> {
  const id = `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await pgQuery(
    `INSERT INTO audit_logs
      (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      params.actorId,
      params.actorName,
      params.actorRole,
      params.action,
      params.entityType,
      params.entityId,
      params.details ?? '',
      new Date().toISOString(),
    ],
  );
}
