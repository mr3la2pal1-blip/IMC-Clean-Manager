import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {recursive: true});
}

const dbPath = path.join(dataDir, 'imc_clean.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'worker')),
    phone TEXT,
    shift_name TEXT,
    worker_status TEXT NOT NULL DEFAULT 'نشط' CHECK (worker_status IN ('نشط', 'غائب')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    floor_or_wing TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cleaning_requests (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL,
    room_or_location TEXT NOT NULL,
    request_type TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('عادي', 'عالي', 'عاجل')),
    description TEXT NOT NULL DEFAULT '',
    is_high_risk INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('جديد', 'تم الإسناد', 'قيد التنفيذ', 'مكتمل', 'ملغي')),
    assigned_worker_id TEXT,
    assigned_by_id TEXT,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    assigned_at TEXT,
    acknowledged_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,
    cancel_reason TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (assigned_worker_id) REFERENCES users(id),
    FOREIGN KEY (assigned_by_id) REFERENCES users(id),
    FOREIGN KEY (created_by_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS worker_shifts (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL CHECK (status IN ('نشط', 'غائب', 'مكتمل')),
    notes TEXT NOT NULL DEFAULT '',
    recorded_by_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (recorded_by_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS nursing_status_reports (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('العامل متأخر ولم يحضر', 'تم إنجاز المهمة', 'لم يتم إنجاز المهمة بعد')),
    location TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  );

  CREATE INDEX IF NOT EXISTS idx_nursing_status_reports_created ON nursing_status_reports(created_at);
  CREATE INDEX IF NOT EXISTS idx_nursing_status_reports_department ON nursing_status_reports(department_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_requests_status ON cleaning_requests(status);
  CREATE INDEX IF NOT EXISTS idx_requests_dept ON cleaning_requests(department_id);
  CREATE INDEX IF NOT EXISTS idx_requests_worker ON cleaning_requests(assigned_worker_id);
  CREATE INDEX IF NOT EXISTS idx_requests_created ON cleaning_requests(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
`);

// Add shift-specific contact numbers to existing databases without losing records.
const workerShiftColumns = db.pragma('table_info(worker_shifts)') as Array<{name: string}>;
if (!workerShiftColumns.some((column) => column.name === 'phone')) {
  db.exec('ALTER TABLE worker_shifts ADD COLUMN phone TEXT');
}

export function getOrCreateSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  const existing = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('session_secret') as
    | {value: string}
    | undefined;
  if (existing?.value) {
    return existing.value;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('session_secret', generated);
  return generated;
}

export function writeAuditLog(params: {
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
}): void {
  const id = `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.actorId,
    params.actorName,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId,
    params.details ?? '',
    now,
  );
}
