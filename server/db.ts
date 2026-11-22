import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';

type QueryMethod = 'get'|'all'|'run';
const worker = new Worker(new URL('./db-worker.ts', import.meta.url), {execArgv: ['--import', 'tsx']});
let requestId = 0;

function rpc(action: 'query'|'dump', sql?: string, params: unknown[] = [], method?: QueryMethod|'exec'): any {
  const buffer = new SharedArrayBuffer(16 * 1024 * 1024);
  const header = new Int32Array(buffer, 0, 2);
  worker.postMessage({id: ++requestId, buffer, action, sql, params, method});
  const result = Atomics.wait(header, 0, 0, 60000);
  if (result === 'timed-out') throw new Error('Timed out while waiting for the Supabase PostgreSQL database.');
  const length = Atomics.load(header, 1);
  const value = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)));
  if (Atomics.load(header, 0) !== 1) throw new Error(value?.error || 'Supabase database operation failed.');
  return value;
}

export const db = {
  prepare(sql: string) {
    return {
      get: (...params: unknown[]) => rpc('query', sql, params, 'get'),
      all: (...params: unknown[]) => rpc('query', sql, params, 'all'),
      run: (...params: unknown[]) => rpc('query', sql, params, 'run'),
    };
  },
  transaction<T extends (...args: any[]) => any>(callback: T) {
    return (...args: Parameters<T>): ReturnType<T> => {
      rpc('query', 'BEGIN', [], 'exec');
      try {
        const result = callback(...args);
        rpc('query', 'COMMIT', [], 'exec');
        return result;
      } catch (error) {
        try { rpc('query', 'ROLLBACK', [], 'exec'); } catch { /* preserve original failure */ }
        throw error;
      }
    };
  },
  serialize(): Buffer {
    return Buffer.from(JSON.stringify(rpc('dump')));
  },
};

export function initializeDatabase(): void {
  rpc('query', 'SELECT 1 AS connected', [], 'get');
}

export function getOrCreateSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
  const existing = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('session_secret') as {value: string}|undefined;
  if (existing?.value) return existing.value;
  const generated = crypto.randomBytes(48).toString('hex');
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('session_secret', generated);
  return generated;
}

export function writeAuditLog(params: {actorId: string|null; actorName: string; actorRole: string; action: string; entityType: string; entityId: string; details?: string}): void {
  const id = 'AUD-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, params.actorId, params.actorName, params.actorRole, params.action, params.entityType, params.entityId, params.details ?? '', now);
}
