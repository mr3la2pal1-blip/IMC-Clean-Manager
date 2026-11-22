import {parentPort} from 'node:worker_threads';
import {Client} from 'pg';

type RpcMessage = {buffer: SharedArrayBuffer; action: 'query'|'dump'; sql?: string; params?: unknown[]; method?: 'get'|'all'|'run'|'exec'};
const TABLES = ['app_settings','users','departments','cleaning_requests','worker_shifts','shift_handovers','nursing_status_reports','nursing_performance_ratings','worker_notes','audit_logs'];
let clientPromise: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured on the server.');
  if (!clientPromise) {
    const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, application_name: 'imc-clean-manager', keepAlive: true, connectionTimeoutMillis: 15000});
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

function toPostgres(sql: string): string {
  let output = '';
  let parameter = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]!;
    if (quote) {
      output += char;
      if (char === quote) {
        if (sql[i + 1] === quote) output += sql[++i];
        else quote = null;
      } else if (char === '\\' && quote === "'" && i + 1 < sql.length) output += sql[++i];
      continue;
    }
    if (char === "'" || char === '"') { quote = char; output += char; }
    else if (char === '?') output += '$' + (++parameter);
    else output += char;
  }
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(output)) {
    output = output.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO').trim().replace(/;$/, '');
    output += ' ON CONFLICT DO NOTHING';
  }
  return output;
}

function respond(buffer: SharedArrayBuffer, value: unknown, failed = false) {
  const header = new Int32Array(buffer, 0, 2);
  const bytes = new Uint8Array(buffer, 8);
  const payload = new TextEncoder().encode(JSON.stringify(value));
  if (payload.byteLength > bytes.byteLength) {
    const fallback = new TextEncoder().encode(JSON.stringify({error: 'Database response exceeded the supported size.'}));
    bytes.set(fallback); Atomics.store(header, 1, fallback.byteLength); Atomics.store(header, 0, 2);
  } else {
    bytes.set(payload); Atomics.store(header, 1, payload.byteLength); Atomics.store(header, 0, failed ? 2 : 1);
  }
  Atomics.notify(header, 0);
}

async function handle(message: RpcMessage) {
  try {
    const client = await getClient();
    if (message.action === 'dump') {
      const snapshot: Record<string, unknown[]> = {};
      for (const table of TABLES) snapshot[table] = (await client.query('SELECT * FROM "' + table + '"')).rows;
      respond(message.buffer, {format: 'imc-postgres-json-v1', exportedAt: new Date().toISOString(), tables: snapshot});
      return;
    }
    const result = await client.query(toPostgres(message.sql || ''), message.params || []);
    if (message.method === 'get') respond(message.buffer, result.rows[0] ?? null);
    else if (message.method === 'all') respond(message.buffer, result.rows);
    else if (message.method === 'run') respond(message.buffer, {changes: result.rowCount ?? 0});
    else respond(message.buffer, {rowCount: result.rowCount ?? 0});
  } catch (error) {
    respond(message.buffer, {error: error instanceof Error ? error.message : String(error)}, true);
  }
}
parentPort?.on('message', (message: RpcMessage) => { void handle(message); });
