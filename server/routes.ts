import crypto from 'node:crypto';
import type {Express, Request, Response} from 'express';
import {
  CLEANING_REQUEST_TYPES,
  PRIORITY_SLA_MINUTES,
  REQUEST_PRIORITIES,
  ROLE_LABELS,
  detectHighRisk,
} from '../src/constants.ts';
import type {RequestPriority, RequestStatus, UserRole, WorkerStatus} from '../src/types.ts';
import {
  clearSessionCookie,
  extractTokenFromRequest,
  hashPassword,
  requireAuth,
  requireRole,
  setSessionCookie,
  signDownloadTicket,
  signSessionToken,
  verifyDownloadTicket,
  verifyPassword,
  verifySessionToken,
} from './auth.ts';
import type {AuthenticatedRequest, AuthenticatedUserRow} from './auth.ts';
import {db, writeAuditLog} from './db.ts';
import {buildProjectZipBuffer} from './zip.ts';

function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

const FORBIDDEN_PHI_KEYS = [
  'patientname',
  'patient_name',
  'mrn',
  'medicalrecord',
  'medical_record',
  'diagnosis',
  'patientid',
  'patient_id',
];

function containsPhiPayloadKeys(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return Object.keys(body).some((key) => FORBIDDEN_PHI_KEYS.includes(key.toLowerCase()));
}

function mapUserRow(row: {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  phone: string | null;
  shift_name: string | null;
  worker_status: WorkerStatus;
  is_active: number;
  created_at: string;
}) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    phone: row.phone,
    shiftName: row.shift_name,
    workerStatus: row.worker_status,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

interface RawRequestRow {
  id: string;
  department_id: string;
  department_name: string;
  floor_or_wing: string;
  room_or_location: string;
  request_type: string;
  priority: RequestPriority;
  description: string;
  is_high_risk: number;
  status: RequestStatus;
  assigned_worker_id: string | null;
  assigned_worker_name: string | null;
  assigned_worker_phone: string | null;
  assigned_worker_status: WorkerStatus | null;
  assigned_by_id: string | null;
  assigned_by_name: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: string;
  assigned_at: string | null;
  acknowledged_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  updated_at: string;
}

function mapRequestRow(r: RawRequestRow) {
  return {
    id: r.id,
    departmentId: r.department_id,
    departmentName: r.department_name,
    floorOrWing: r.floor_or_wing,
    roomOrLocation: r.room_or_location,
    requestType: r.request_type,
    priority: r.priority,
    description: r.description,
    isHighRisk: r.is_high_risk === 1,
    status: r.status,
    assignedWorkerId: r.assigned_worker_id,
    assignedWorkerName: r.assigned_worker_name,
    assignedWorkerPhone: r.assigned_worker_phone,
    assignedWorkerStatus: r.assigned_worker_status,
    assignedById: r.assigned_by_id,
    assignedByName: r.assigned_by_name,
    createdById: r.created_by_id,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    assignedAt: r.assigned_at,
    acknowledgedAt: r.acknowledged_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    updatedAt: r.updated_at,
  };
}

const REQUEST_SELECT_SQL = `
  SELECT
    r.*,
    d.name AS department_name,
    d.floor_or_wing AS floor_or_wing,
    w.name AS assigned_worker_name,
    w.phone AS assigned_worker_phone,
    w.worker_status AS assigned_worker_status,
    ab.name AS assigned_by_name,
    cb.name AS created_by_name
  FROM cleaning_requests r
  JOIN departments d ON d.id = r.department_id
  LEFT JOIN users w ON w.id = r.assigned_worker_id
  LEFT JOIN users ab ON ab.id = r.assigned_by_id
  LEFT JOIN users cb ON cb.id = r.created_by_id
`;

function generateRequestId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `REQ-${y}${m}${d}-${rand}`;
}

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ok: true, service: 'IMC Clean Manager'});
  });

  // First-run setup check: returns true only when 0 users exist in DB
  app.get('/api/auth/setup-status', (_req: Request, res: Response) => {
    const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as {count: number};
    res.json({needsSetup: Number(row.count) === 0});
  });

  // One-time bootstrap for initial System Administrator (no hardcoded passwords!)
  app.post('/api/auth/bootstrap', (req: Request, res: Response) => {
    const existingCount = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as {count: number}).count;
    if (existingCount > 0) {
      res.status(403).json({error: 'تمت تهيئة النظام مسبقاً. يرجى تسجيل الدخول.'});
      return;
    }

    const name = sanitizeText(req.body?.name, 80);
    const username = sanitizeText(req.body?.username, 60).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const phone = sanitizeText(req.body?.phone, 24) || null;
    const seedDepartments = Boolean(req.body?.seedDepartments);

    if (name.length < 2 || username.length < 3 || !/^[a-z0-9._@-]+$/.test(username)) {
      res.status(400).json({error: 'يرجى إدخال اسم صحيح واسم مستخدم بالأحرف الإنجليزية أو الأرقام.'});
      return;
    }
    if (password.length < 8) {
      res.status(400).json({error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.'});
      return;
    }

    const now = new Date().toISOString();
    const adminId = `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const passwordHash = hashPassword(password);

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, name, username, password_hash, role, phone, shift_name, worker_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, NULL, 'نشط', 1, ?, ?)`,
      ).run(adminId, name, username, passwordHash, phone, now, now);

      if (seedDepartments) {
        const defaultDepts = [
          {id: 'er', name: 'قسم الطوارئ والإسعاف', floor: 'الدور الأرضي - الجناح أ'},
          {id: 'icu', name: 'العناية المركزة (ICU)', floor: 'الدور الثاني - الجناح ب'},
          {id: 'or', name: 'غرف العمليات الجراحية', floor: 'الدور الثاني - الجناح أ'},
          {id: 'lab', name: 'المختبر وبنك الدم', floor: 'الدور الأول - الجناح ب'},
          {id: 'rad', name: 'قسم الأشعة التشخيصية', floor: 'الدور الأرضي - الجناح ب'},
          {id: 'opd', name: 'العيادات الخارجية', floor: 'الدور الأول - الجناح أ'},
          {id: 'ward-m', name: 'أجنحة التنويم الباطني', floor: 'الدور الثالث - الجناح أ'},
          {id: 'ward-s', name: 'أجنحة التنويم الجراحي', floor: 'الدور الثالث - الجناح ب'},
        ];
        const insertDept = db.prepare(
          `INSERT OR IGNORE INTO departments (id, name, floor_or_wing, is_active, created_at)
           VALUES (?, ?, ?, 1, ?)`,
        );
        for (const dept of defaultDepts) {
          insertDept.run(dept.id, dept.name, dept.floor, now);
        }
      }

      writeAuditLog({
        actorId: adminId,
        actorName: name,
        actorRole: 'admin',
        action: 'تهيئة النظام وإنشاء حساب مدير النظام الأول',
        entityType: 'user',
        entityId: adminId,
        details: seedDepartments ? 'مع إنشاء الأقسام القياسية للمستشفى' : 'بدون أقسام افتراضية',
      });
    });

    tx();

    const userRow = db
      .prepare('SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at FROM users WHERE id = ?')
      .get(adminId) as Parameters<typeof mapUserRow>[0];

    const token = signSessionToken(adminId, 'admin');
    setSessionCookie(res, token, req);
    res.status(201).json({user: mapUserRow(userRow), token});
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const username = sanitizeText(req.body?.username, 60).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({error: 'يرجى إدخال اسم المستخدم وكلمة المرور.'});
      return;
    }

    const userRow = db
      .prepare(
        `SELECT id, name, username, password_hash, role, phone, shift_name, worker_status, is_active, created_at
         FROM users WHERE username = ?`,
      )
      .get(username) as (Parameters<typeof mapUserRow>[0] & {password_hash: string}) | undefined;

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({error: 'اسم المستخدم أو كلمة المرور غير صحيحة.'});
      return;
    }

    if (userRow.is_active !== 1) {
      res.status(403).json({error: 'تم تعطيل هذا الحساب. يرجى مراجعة مدير النظام.'});
      return;
    }

    const token = signSessionToken(userRow.id, userRow.role);
    setSessionCookie(res, token, req);
    writeAuditLog({
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.role,
      action: 'تسجيل دخول',
      entityType: 'auth',
      entityId: userRow.id,
      details: ROLE_LABELS[userRow.role],
    });

    res.json({user: mapUserRow(userRow), token});
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
    clearSessionCookie(res, req);
    res.json({ok: true});
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({error: 'غير مصرح.'});
      return;
    }
    res.json({user: mapUserRow(req.user)});
  });

  // Public QR-code endpoints for department cleaning request submission
  app.get('/api/public/departments', (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT id, name, floor_or_wing, is_active, created_at FROM departments WHERE is_active = 1 ORDER BY name ASC')
      .all() as Array<{
      id: string;
      name: string;
      floor_or_wing: string;
      is_active: number;
      created_at: string;
    }>;
    res.json({
      departments: rows.map((d) => ({
        id: d.id,
        name: d.name,
        floorOrWing: d.floor_or_wing,
        isActive: d.is_active === 1,
        createdAt: d.created_at,
      })),
    });
  });

  app.post('/api/public/requests', (req: Request, res: Response) => {
    if (containsPhiPayloadKeys(req.body)) {
      res.status(400).json({error: 'يُمنع منعاً باتاً إرسال أو جمع أي بيانات أو معلومات صحية للمرضى.'});
      return;
    }

    const departmentId = sanitizeText(req.body?.departmentId, 64);
    const roomOrLocation = sanitizeText(req.body?.roomOrLocation, 120);
    const requestType = sanitizeText(req.body?.requestType, 120);
    const priority = sanitizeText(req.body?.priority, 20) as RequestPriority;
    const description = sanitizeText(req.body?.description, 500);
    const explicitHighRisk = Boolean(req.body?.isHighRisk);

    if (!departmentId || !roomOrLocation || !requestType) {
      res.status(400).json({error: 'يرجى استكمال القسم ورقم الغرفة أو الموقع ونوع طلب النظافة.'});
      return;
    }

    if (!REQUEST_PRIORITIES.includes(priority)) {
      res.status(400).json({error: 'درجة الأولوية المحددة غير صالحة.'});
      return;
    }

    const selectedTypes = requestType.split('؛').map((item) => item.trim()).filter(Boolean);
    const validType = selectedTypes.length > 0 && selectedTypes.every((value) => CLEANING_REQUEST_TYPES.some((t) => t.value === value));
    if (!validType) {
      res.status(400).json({error: 'نوع طلب النظافة غير مدرج ضمن الأنواع المعتمدة.'});
      return;
    }

    const dept = db
      .prepare('SELECT id, name, is_active FROM departments WHERE id = ?')
      .get(departmentId) as {id: string; name: string; is_active: number} | undefined;

    if (!dept || dept.is_active !== 1) {
      res.status(404).json({error: 'القسم المحدد غير موجود أو غير مفعل.'});
      return;
    }

    const isHighRisk = selectedTypes.some((value) => detectHighRisk(value, description, explicitHighRisk));
    const effectivePriority: RequestPriority = isHighRisk && priority === 'عادي' ? 'عاجل' : priority;
    const id = generateRequestId();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO cleaning_requests (
        id, department_id, room_or_location, request_type, priority, description,
        is_high_risk, status, created_by_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'جديد', NULL, ?, ?)`,
    ).run(id, dept.id, roomOrLocation, requestType, effectivePriority, description, isHighRisk ? 1 : 0, now, now);

    writeAuditLog({
      actorId: null,
      actorName: 'نموذج رمز QR للقسم',
      actorRole: 'qr_form',
      action: 'إنشاء طلب نظافة عبر رمز QR',
      entityType: 'request',
      entityId: id,
      details: `${dept.name} · ${roomOrLocation} · ${requestType}${isHighRisk ? ' · تنبيه خطورة عالية' : ''}`,
    });

    const created = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow;
    res.status(201).json({request: mapRequestRow(created)});
  });

  // Public nursing feedback about cleaning staff performance.
  app.post('/api/public/nursing-performance-ratings', (req: Request, res: Response) => {
    const departmentId = sanitizeText(req.body?.departmentId, 64);
    const requestId = sanitizeText(req.body?.requestId, 64);
    const location = sanitizeText(req.body?.location, 120);
    const rating = sanitizeText(req.body?.rating, 40);
    const reason = sanitizeText(req.body?.reason, 500);
    const allowedRatings = ['ممتاز', 'جيد', 'غير راضٍ عن الأداء'];
    if (!departmentId || !allowedRatings.includes(rating)) {
      res.status(400).json({error: 'يرجى اختيار تقييم أداء عامل النظافة.'});
      return;
    }
    if (rating === 'غير راضٍ عن الأداء' && !reason.trim()) {
      res.status(400).json({error: 'يرجى كتابة المشكلة أو سبب عدم الرضا.'});
      return;
    }
    const dept = db.prepare('SELECT id, name, is_active FROM departments WHERE id = ?').get(departmentId) as
      | {id: string; name: string; is_active: number}
      | undefined;
    if (!dept || dept.is_active !== 1) {
      res.status(404).json({error: 'القسم غير موجود أو غير نشط.'});
      return;
    }
    if (requestId) {
      const request = db.prepare('SELECT id, department_id FROM cleaning_requests WHERE id = ?').get(requestId) as
        | {id: string; department_id: string}
        | undefined;
      if (!request || request.department_id !== departmentId) {
        res.status(400).json({error: 'الطلب المرتبط غير صحيح لهذا القسم.'});
        return;
      }
    }
    const id = `RATE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO nursing_performance_ratings (id, department_id, request_id, location, rating, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, departmentId, requestId || null, location, rating, reason, now);
    writeAuditLog({
      actorId: null,
      actorName: 'طاقم التمريض عبر رمز QR',
      actorRole: 'qr_form',
      action: 'تقييم أداء عامل النظافة',
      entityType: 'nursing_performance_rating',
      entityId: id,
      details: `${dept.name} · ${rating}${location ? ` · الموقع: ${location}` : ''}${reason ? ` · السبب: ${reason}` : ''}${requestId ? ` · الطلب: ${requestId}` : ''}`,
    });
    res.status(201).json({rating: {id, departmentId, departmentName: dept.name, requestId: requestId || null, location, rating, reason, createdAt: now}});
  });

  // Admin and supervisor review of nursing performance ratings.
  app.get('/api/nursing-performance-ratings', requireAuth, requireRole(['admin', 'supervisor']), (_req: AuthenticatedRequest, res: Response) => {
    const rows = db.prepare(
      `SELECT p.id, p.department_id, d.name AS department_name, p.request_id, p.location, p.rating, p.reason, p.created_at
       FROM nursing_performance_ratings p JOIN departments d ON d.id = p.department_id
       ORDER BY p.created_at DESC LIMIT 150`,
    ).all() as Array<{id: string; department_id: string; department_name: string; request_id: string | null; location: string; rating: string; reason: string; created_at: string}>;
    res.json({ratings: rows.map((row) => ({id: row.id, departmentId: row.department_id, departmentName: row.department_name, requestId: row.request_id, location: row.location, rating: row.rating, reason: row.reason, createdAt: row.created_at}))});
  });

  // Public QR status report from nursing staff. This records feedback without changing the worker's task status.
  app.post('/api/public/nursing-status-reports', (req: Request, res: Response) => {
    const departmentId = sanitizeText(req.body?.departmentId, 64);
    const status = sanitizeText(req.body?.status, 80);
    const location = sanitizeText(req.body?.location, 120);
    const note = sanitizeText(req.body?.note, 400);
    const allowedStatuses = ['العامل متأخر ولم يحضر', 'تم إنجاز المهمة', 'لم يتم إنجاز المهمة بعد'];
    if (!departmentId || !allowedStatuses.includes(status)) {
      res.status(400).json({error: 'يرجى تحديد القسم وحالة العامل أو المهمة.'});
      return;
    }
    const dept = db.prepare('SELECT id, name, is_active FROM departments WHERE id = ?').get(departmentId) as
      | {id: string; name: string; is_active: number}
      | undefined;
    if (!dept || dept.is_active !== 1) {
      res.status(404).json({error: 'القسم غير موجود أو غير نشط.'});
      return;
    }
    const id = `NUR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO nursing_status_reports (id, department_id, status, location, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, departmentId, status, location, note, now);
    writeAuditLog({
      actorId: null,
      actorName: 'طاقم التمريض عبر رمز QR',
      actorRole: 'qr_form',
      action: 'تسجيل بلاغ حالة عامل أو مهمة من التمريض',
      entityType: 'nursing_status_report',
      entityId: id,
      details: `${dept.name} · ${status}${location ? ` · الموقع: ${location}` : ''}${note ? ` · ملاحظة: ${note}` : ''}`,
    });
    res.status(201).json({
      report: {id, departmentId, departmentName: dept.name, status, location, note, createdAt: now},
    });
  });

  // Admin and supervisor review of nursing QR status reports.
  app.get('/api/nursing-status-reports', requireAuth, requireRole(['admin', 'supervisor']), (_req: AuthenticatedRequest, res: Response) => {
    const rows = db.prepare(
      `SELECT n.id, n.department_id, d.name AS department_name, n.status, n.location, n.note, n.created_at
       FROM nursing_status_reports n JOIN departments d ON d.id = n.department_id
       ORDER BY n.created_at DESC LIMIT 100`,
    ).all() as Array<{
      id: string; department_id: string; department_name: string; status: string;
      location: string; note: string; created_at: string;
    }>;
    res.json({reports: rows.map((row) => ({
      id: row.id,
      departmentId: row.department_id,
      departmentName: row.department_name,
      status: row.status,
      location: row.location,
      note: row.note,
      createdAt: row.created_at,
    }))});
  });

  // Authenticated requests listing (strict server-side RBAC filtering!)
  app.get('/api/requests', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    let rows: RawRequestRow[];
    if (user.role === 'worker') {
      rows = db
        .prepare(`${REQUEST_SELECT_SQL} WHERE r.assigned_worker_id = ? ORDER BY r.created_at DESC`)
        .all(user.id) as RawRequestRow[];
    } else {
      rows = db
        .prepare(`${REQUEST_SELECT_SQL} ORDER BY r.created_at DESC`)
        .all() as RawRequestRow[];
    }
    res.json({requests: rows.map(mapRequestRow)});
  });

  // Single request + audit trail (workers can only view their own assigned tasks)
  app.get('/api/requests/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const id = sanitizeText(req.params.id, 64);
    const row = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow | undefined;

    if (!row) {
      res.status(404).json({error: 'الطلب غير موجود.'});
      return;
    }

    if (user.role === 'worker' && row.assigned_worker_id !== user.id) {
      res.status(403).json({error: 'لا يمكنك عرض مهام غير مسندة إليك.'});
      return;
    }

    const logs = db
      .prepare(
        `SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at
         FROM audit_logs WHERE entity_type = 'request' AND entity_id = ? ORDER BY created_at DESC`,
      )
      .all(id) as Array<{
      id: string;
      actor_id: string | null;
      actor_name: string;
      actor_role: string;
      action: string;
      entity_type: string;
      entity_id: string;
      details: string;
      created_at: string;
    }>;

    res.json({
      request: mapRequestRow(row),
      logs: logs.map((l) => ({
        id: l.id,
        actorId: l.actor_id,
        actorName: l.actor_name,
        actorRole: l.actor_role,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        details: l.details,
        createdAt: l.created_at,
      })),
    });
  });

  // Authenticated creation of cleaning request (Supervisor or Admin)
  app.post(
    '/api/requests',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (req: AuthenticatedRequest, res: Response) => {
      if (containsPhiPayloadKeys(req.body)) {
        res.status(400).json({error: 'يُمنع منعاً باتاً إرسال أو جمع أي بيانات أو معلومات صحية للمرضى.'});
        return;
      }

      const user = req.user!;
      const departmentId = sanitizeText(req.body?.departmentId, 64);
      const roomOrLocation = sanitizeText(req.body?.roomOrLocation, 120);
      const requestType = sanitizeText(req.body?.requestType, 120);
      const priority = sanitizeText(req.body?.priority, 20) as RequestPriority;
      const description = sanitizeText(req.body?.description, 500);
      const explicitHighRisk = Boolean(req.body?.isHighRisk);

      if (!departmentId || !roomOrLocation || !requestType || !REQUEST_PRIORITIES.includes(priority)) {
        res.status(400).json({error: 'يرجى التحقق من جميع الحقول المطلوبة.'});
        return;
      }

      const dept = db
        .prepare('SELECT id, name, is_active FROM departments WHERE id = ?')
        .get(departmentId) as {id: string; name: string; is_active: number} | undefined;
      if (!dept || dept.is_active !== 1) {
        res.status(404).json({error: 'القسم غير موجود أو غير نشط.'});
        return;
      }

      const isHighRisk = detectHighRisk(requestType, description, explicitHighRisk);
      const id = generateRequestId();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO cleaning_requests (
          id, department_id, room_or_location, request_type, priority, description,
          is_high_risk, status, created_by_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'جديد', ?, ?, ?)`,
      ).run(id, dept.id, roomOrLocation, requestType, priority, description, isHighRisk ? 1 : 0, user.id, now, now);

      writeAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'إنشاء طلب نظافة',
        entityType: 'request',
        entityId: id,
        details: `${dept.name} · ${roomOrLocation} · الأولوية: ${priority}`,
      });

      const created = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow;
      res.status(201).json({request: mapRequestRow(created)});
    },
  );

  // Assign or reassign worker (Supervisor or Admin ONLY)
  app.patch(
    '/api/requests/:id/assign',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const id = sanitizeText(req.params.id, 64);
      const workerId = sanitizeText(req.body?.workerId, 64);
      const reason = sanitizeText(req.body?.reason, 200);

      const existing = db.prepare('SELECT * FROM cleaning_requests WHERE id = ?').get(id) as
        | {id: string; status: RequestStatus; assigned_worker_id: string | null}
        | undefined;

      if (!existing) {
        res.status(404).json({error: 'الطلب غير موجود.'});
        return;
      }
      if (existing.status === 'مكتمل' || existing.status === 'ملغي') {
        res.status(400).json({error: 'لا يمكن إسناد طلب مكتمل أو ملغي.'});
        return;
      }

      const worker = db
        .prepare("SELECT id, name, worker_status, is_active FROM users WHERE id = ? AND role = 'worker'")
        .get(workerId) as {id: string; name: string; worker_status: WorkerStatus; is_active: number} | undefined;

      if (!worker || worker.is_active !== 1) {
        res.status(404).json({error: 'عامل النظافة المحدد غير موجود أو غير مفعل.'});
        return;
      }
      if (worker.worker_status === 'غائب') {
        res.status(400).json({error: 'العامل المحدد مسجل كغائب حالياً. يرجى اختيار عامل نشط.'});
        return;
      }

      const now = new Date().toISOString();
      const isReassign = Boolean(existing.assigned_worker_id && existing.assigned_worker_id !== workerId);

      db.prepare(
        `UPDATE cleaning_requests
         SET assigned_worker_id = ?, assigned_by_id = ?, status = 'تم الإسناد',
             assigned_at = ?, acknowledged_at = NULL, started_at = NULL, updated_at = ?
         WHERE id = ?`,
      ).run(worker.id, user.id, now, now, id);

      writeAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: isReassign ? 'إعادة إسناد المهمة لعامل آخر' : 'إسناد المهمة إلى عامل',
        entityType: 'request',
        entityId: id,
        details: `العامل المسند: ${worker.name}${reason ? ` · السبب: ${reason}` : ''}`,
      });

      const updated = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow;
      res.json({request: mapRequestRow(updated)});
    },
  );

  // Change priority (Supervisor or Admin ONLY)
  app.patch(
    '/api/requests/:id/priority',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const id = sanitizeText(req.params.id, 64);
      const priority = sanitizeText(req.body?.priority, 20) as RequestPriority;

      if (!REQUEST_PRIORITIES.includes(priority)) {
        res.status(400).json({error: 'الأولوية غير صالحة.'});
        return;
      }

      const existing = db.prepare('SELECT id, priority, status FROM cleaning_requests WHERE id = ?').get(id) as
        | {id: string; priority: RequestPriority; status: RequestStatus}
        | undefined;
      if (!existing) {
        res.status(404).json({error: 'الطلب غير موجود.'});
        return;
      }
      if (existing.status === 'مكتمل' || existing.status === 'ملغي') {
        res.status(400).json({error: 'لا يمكن تغيير أولوية طلب مكتمل أو ملغي.'});
        return;
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE cleaning_requests SET priority = ?, updated_at = ? WHERE id = ?').run(priority, now, id);

      writeAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'تعديل درجة الأولوية',
        entityType: 'request',
        entityId: id,
        details: `من "${existing.priority}" إلى "${priority}"`,
      });

      const updated = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow;
      res.json({request: mapRequestRow(updated)});
    },
  );

  // Cancel request (Supervisor or Admin ONLY)
  app.patch(
    '/api/requests/:id/cancel',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const id = sanitizeText(req.params.id, 64);
      const reason = sanitizeText(req.body?.reason, 250) || 'تم الإلغاء من قبل الإشراف';

      const existing = db.prepare('SELECT id, status FROM cleaning_requests WHERE id = ?').get(id) as
        | {id: string; status: RequestStatus}
        | undefined;
      if (!existing) {
        res.status(404).json({error: 'الطلب غير موجود.'});
        return;
      }
      if (existing.status === 'مكتمل' || existing.status === 'ملغي') {
        res.status(400).json({error: 'لا يمكن إلغاء طلب مكتمل أو ملغي بالفعل.'});
        return;
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE cleaning_requests
         SET status = 'ملغي', cancelled_at = ?, cancel_reason = ?, updated_at = ?
         WHERE id = ?`,
      ).run(now, reason, now, id);

      writeAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'إلغاء طلب النظافة',
        entityType: 'request',
        entityId: id,
        details: reason,
      });

      const updated = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow;
      res.json({request: mapRequestRow(updated)});
    },
  );

  // Worker task actions (Worker ONLY, strictly assigned tasks)
  app.patch(
    '/api/requests/:id/worker-action',
    requireAuth,
    requireRole(['worker']),
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const id = sanitizeText(req.params.id, 64);
      const action = sanitizeText(req.body?.action, 40);

      const existing = db.prepare('SELECT * FROM cleaning_requests WHERE id = ?').get(id) as
        | {
            id: string;
            status: RequestStatus;
            assigned_worker_id: string | null;
            acknowledged_at: string | null;
            started_at: string | null;
          }
        | undefined;

      if (!existing) {
        res.status(404).json({error: 'المهمة غير موجودة.'});
        return;
      }
      if (existing.assigned_worker_id !== user.id) {
        res.status(403).json({error: 'غير مصرح: هذه المهمة غير مسندة إلى حسابك.'});
        return;
      }
      if (existing.status === 'مكتمل' || existing.status === 'ملغي') {
        res.status(400).json({error: 'المهمة مغلقة بالفعل ولا يمكن تعديلها.'});
        return;
      }

      const now = new Date().toISOString();

      if (action === 'confirm_receipt') {
        if (existing.acknowledged_at) {
          res.status(400).json({error: 'تم تأكيد استلام المهمة مسبقاً.'});
          return;
        }
        db.prepare('UPDATE cleaning_requests SET acknowledged_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
        writeAuditLog({
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'تأكيد استلام المهمة',
          entityType: 'request',
          entityId: id,
          details: 'أكد عامل النظافة استلام المهمة',
        });
      } else if (action === 'start') {
        const ackAt = existing.acknowledged_at ?? now;
        db.prepare(
          `UPDATE cleaning_requests
           SET status = 'قيد التنفيذ', acknowledged_at = ?, started_at = COALESCE(started_at, ?), updated_at = ?
           WHERE id = ?`,
        ).run(ackAt, now, now, id);
        writeAuditLog({
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'بدء تنفيذ المهمة (قيد التنفيذ)',
          entityType: 'request',
          entityId: id,
          details: 'تحديث الحالة إلى قيد التنفيذ',
        });
      } else if (action === 'complete') {
        const ackAt = existing.acknowledged_at ?? now;
        const startAt = existing.started_at ?? now;
        db.prepare(
          `UPDATE cleaning_requests
           SET status = 'مكتمل', acknowledged_at = ?, started_at = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,
        ).run(ackAt, startAt, now, now, id);
        writeAuditLog({
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'إتمام المهمة (مكتمل)',
          entityType: 'request',
          entityId: id,
          details: 'تم إنجاز مهمة النظافة',
        });
      } else {
        res.status(400).json({error: 'الإجراء المطلوب غير صالح.'});
        return;
      }

      const updated = db.prepare(`${REQUEST_SELECT_SQL} WHERE r.id = ?`).get(id) as RawRequestRow;
      res.json({request: mapRequestRow(updated)});
    },
  );

  // Workers directory for Supervisors & Admins
  app.get(
    '/api/workers',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (_req: AuthenticatedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT u.id, u.name, u.phone, u.shift_name, u.worker_status, u.is_active,
            (SELECT COUNT(*) FROM cleaning_requests r
             WHERE r.assigned_worker_id = u.id AND r.status IN ('تم الإسناد', 'قيد التنفيذ')) AS active_tasks_count
           FROM users u
           WHERE u.role = 'worker'
           ORDER BY u.is_active DESC, u.worker_status ASC, u.name ASC`,
        )
        .all() as Array<{
        id: string;
        name: string;
        phone: string | null;
        shift_name: string | null;
        worker_status: WorkerStatus;
        is_active: number;
        active_tasks_count: number;
      }>;

      res.json({
        workers: rows.map((w) => ({
          id: w.id,
          name: w.name,
          phone: w.phone,
          shiftName: w.shift_name,
          workerStatus: w.worker_status,
          isActive: w.is_active === 1,
          activeTasksCount: w.active_tasks_count,
        })),
      });
    },
  );

  // Departments listing for Supervisors & Admins
  app.get(
    '/api/departments',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (_req: AuthenticatedRequest, res: Response) => {
      const rows = db
        .prepare('SELECT id, name, floor_or_wing, is_active, created_at FROM departments ORDER BY name ASC')
        .all() as Array<{
        id: string;
        name: string;
        floor_or_wing: string;
        is_active: number;
        created_at: string;
      }>;
      res.json({
        departments: rows.map((d) => ({
          id: d.id,
          name: d.name,
          floorOrWing: d.floor_or_wing,
          isActive: d.is_active === 1,
          createdAt: d.created_at,
        })),
      });
    },
  );

  // Admin: Manage Departments
  app.post(
    '/api/admin/departments',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const name = sanitizeText(req.body?.name, 100);
      const floorOrWing = sanitizeText(req.body?.floorOrWing, 100);
      const customCode = sanitizeText(req.body?.id, 32).toLowerCase().replace(/[^a-z0-9-]/g, '');

      if (name.length < 2 || floorOrWing.length < 2) {
        res.status(400).json({error: 'يرجى إدخال اسم القسم والطابق أو الجناح.'});
        return;
      }

      const id = customCode || `dept-${crypto.randomBytes(3).toString('hex')}`;
      const exists = db.prepare('SELECT id FROM departments WHERE id = ?').get(id);
      if (exists) {
        res.status(409).json({error: 'رمز القسم مستخدم مسبقاً. يرجى اختيار رمز آخر.'});
        return;
      }

      const now = new Date().toISOString();
      db.prepare('INSERT INTO departments (id, name, floor_or_wing, is_active, created_at) VALUES (?, ?, ?, 1, ?)').run(
        id,
        name,
        floorOrWing,
        now,
      );

      writeAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'إضافة قسم مستشفى جديد',
        entityType: 'department',
        entityId: id,
        details: `${name} · ${floorOrWing}`,
      });

      res.status(201).json({
        department: {id, name, floorOrWing, isActive: true, createdAt: now},
      });
    },
  );

  app.patch(
    '/api/admin/departments/:id',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const id = sanitizeText(req.params.id, 64);
      const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as
        | {id: string; name: string; floor_or_wing: string; is_active: number; created_at: string}
        | undefined;
      if (!existing) {
        res.status(404).json({error: 'القسم غير موجود.'});
        return;
      }

      const name = sanitizeText(req.body?.name, 100) || existing.name;
      const floorOrWing = sanitizeText(req.body?.floorOrWing, 100) || existing.floor_or_wing;
      const isActive = typeof req.body?.isActive === 'boolean' ? (req.body.isActive ? 1 : 0) : existing.is_active;

      db.prepare('UPDATE departments SET name = ?, floor_or_wing = ?, is_active = ? WHERE id = ?').run(
        name,
        floorOrWing,
        isActive,
        id,
      );

      writeAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'تحديث بيانات القسم',
        entityType: 'department',
        entityId: id,
        details: `${name} · ${isActive === 1 ? 'مفعل' : 'معطل'}`,
      });

      res.json({
        department: {id, name, floorOrWing, isActive: isActive === 1, createdAt: existing.created_at},
      });
    },
  );

  // Admin: Manage Users (Admins, Supervisors, Workers)
  app.get(
    '/api/admin/users',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthenticatedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at
           FROM users ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END, name ASC`,
        )
        .all() as Array<Parameters<typeof mapUserRow>[0]>;
      res.json({users: rows.map(mapUserRow)});
    },
  );

  app.post(
    '/api/admin/users',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const name = sanitizeText(req.body?.name, 80);
      const username = sanitizeText(req.body?.username, 60).toLowerCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const role = sanitizeText(req.body?.role, 20) as UserRole;
      const phone = sanitizeText(req.body?.phone, 24) || null;
      const shiftName = sanitizeText(req.body?.shiftName, 60) || null;

      if (name.length < 2 || username.length < 3 || !/^[a-z0-9._@-]+$/.test(username)) {
        res.status(400).json({error: 'يرجى إدخال الاسم الكامل واسم مستخدم إنجليزي صالح.'});
        return;
      }
      if (password.length < 8) {
        res.status(400).json({error: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.'});
        return;
      }
      if (!['admin', 'supervisor', 'worker'].includes(role)) {
        res.status(400).json({error: 'الدور الوظيفي غير صالح.'});
        return;
      }

      const duplicate = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (duplicate) {
        res.status(409).json({error: 'اسم المستخدم مسجل مسبقاً.'});
        return;
      }

      const now = new Date().toISOString();
      const id = `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const passwordHash = hashPassword(password);

      db.prepare(
        `INSERT INTO users (id, name, username, password_hash, role, phone, shift_name, worker_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'نشط', 1, ?, ?)`,
      ).run(id, name, username, passwordHash, role, phone, shiftName, now, now);

      writeAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: `إنشاء حساب ${ROLE_LABELS[role]}`,
        entityType: 'user',
        entityId: id,
        details: `${name} (${username})`,
      });

      const created = db
        .prepare('SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at FROM users WHERE id = ?')
        .get(id) as Parameters<typeof mapUserRow>[0];
      res.status(201).json({user: mapUserRow(created)});
    },
  );

  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const id = sanitizeText(req.params.id, 64);
      const existing = db
        .prepare('SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at FROM users WHERE id = ?')
        .get(id) as Parameters<typeof mapUserRow>[0] | undefined;

      if (!existing) {
        res.status(404).json({error: 'المستخدم غير موجود.'});
        return;
      }

      const name = sanitizeText(req.body?.name, 80) || existing.name;
      const username = req.body?.username !== undefined ? sanitizeText(req.body.username, 60).toLowerCase() : existing.username;
      const role = req.body?.role !== undefined ? sanitizeText(req.body.role, 20) as UserRole : existing.role;
      if (username.length < 3 || !/^[a-z0-9._@-]+$/.test(username)) { res.status(400).json({error: 'اسم المستخدم غير صالح.'}); return; }
      if (!['admin', 'supervisor', 'worker'].includes(role)) { res.status(400).json({error: 'الدور الوظيفي غير صالح.'}); return; }
      if (db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username, id)) { res.status(409).json({error: 'اسم المستخدم مستخدم من حساب آخر.'}); return; }
      if (existing.role === 'admin' && role !== 'admin') {
        const activeAdmins = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1").get() as {count:number}).count;
        if (activeAdmins <= 1) { res.status(400).json({error: 'لا يمكن تغيير دور آخر مدير نشط في النظام.'}); return; }
      }
      if (id === actor.id && role !== 'admin') { res.status(400).json({error: 'لا يمكنك تغيير دور حساب المدير الحالي.'}); return; }
      const phone = req.body?.phone !== undefined ? sanitizeText(req.body.phone, 24) || null : existing.phone;
      const shiftName =
        req.body?.shiftName !== undefined ? sanitizeText(req.body.shiftName, 60) || null : existing.shift_name;
      const workerStatus: WorkerStatus =
        req.body?.workerStatus === 'نشط' || req.body?.workerStatus === 'غائب'
          ? req.body.workerStatus
          : existing.worker_status;
      const isActive = typeof req.body?.isActive === 'boolean' ? (req.body.isActive ? 1 : 0) : existing.is_active;
      const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

      if (id === actor.id && isActive === 0) {
        res.status(400).json({error: 'لا يمكنك تعطيل حساب مدير النظام الحالي أثناء تسجيل الدخول.'});
        return;
      }

      const now = new Date().toISOString();
      if (newPassword) {
        if (newPassword.length < 8) {
          res.status(400).json({error: 'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.'});
          return;
        }
        const passwordHash = hashPassword(newPassword);
        db.prepare(
          `UPDATE users
           SET name = ?, username = ?, role = ?, phone = ?, shift_name = ?, worker_status = ?, is_active = ?, password_hash = ?, updated_at = ?
           WHERE id = ?`,
        ).run(name, username, role, phone, shiftName, workerStatus, isActive, passwordHash, now, id);
      } else {
        db.prepare(
          `UPDATE users
           SET name = ?, username = ?, role = ?, phone = ?, shift_name = ?, worker_status = ?, is_active = ?, updated_at = ?
           WHERE id = ?`,
        ).run(name, username, role, phone, shiftName, workerStatus, isActive, now, id);
      }

      const statusChanged = existing.worker_status !== workerStatus;
      writeAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: statusChanged ? `تغيير حالة العامل إلى "${workerStatus}"` : 'تحديث بيانات مستخدم',
        entityType: 'user',
        entityId: id,
        details: `${name} · الحالة: ${workerStatus} · ${isActive === 1 ? 'مفعل' : 'معطل'}`,
      });

      const updated = db
        .prepare('SELECT id, name, username, role, phone, shift_name, worker_status, is_active, created_at FROM users WHERE id = ?')
        .get(id) as Parameters<typeof mapUserRow>[0];
      res.json({user: mapUserRow(updated)});
    },
  );

  // Shifts Management
  app.get(
    '/api/shifts',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (req: AuthenticatedRequest, res: Response) => {
      const dateFilter = sanitizeText(req.query.date, 20);
      const baseSql = `
        SELECT s.*, w.name AS worker_name, rb.name AS recorded_by_name
        FROM worker_shifts s
        JOIN users w ON w.id = s.worker_id
        JOIN users rb ON rb.id = s.recorded_by_id
      `;
      const rows = dateFilter
        ? (db.prepare(`${baseSql} WHERE s.shift_date = ? ORDER BY s.created_at DESC`).all(dateFilter) as Array<{
            id: string;
            worker_id: string;
            worker_name: string;
            shift_date: string;
            shift_type: string;
            phone: string | null;
            status: 'نشط' | 'غائب' | 'مكتمل';
            notes: string;
            recorded_by_name: string;
            created_at: string;
          }>)
        : (db.prepare(`${baseSql} ORDER BY s.shift_date DESC, s.created_at DESC LIMIT 100`).all() as Array<{
            id: string;
            worker_id: string;
            worker_name: string;
            shift_date: string;
            shift_type: string;
            phone: string | null;
            status: 'نشط' | 'غائب' | 'مكتمل';
            notes: string;
            recorded_by_name: string;
            created_at: string;
          }>);

      res.json({
        shifts: rows.map((s) => ({
          id: s.id,
          workerId: s.worker_id,
          workerName: s.worker_name,
          shiftDate: s.shift_date,
          shiftType: s.shift_type,
          phone: s.phone ?? null,
          status: s.status,
          notes: s.notes,
          recordedByName: s.recorded_by_name,
          createdAt: s.created_at,
        })),
      });
    },
  );

  app.post(
    '/api/admin/shifts',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const actor = req.user!;
      const workerId = sanitizeText(req.body?.workerId, 64);
      const shiftDate = sanitizeText(req.body?.shiftDate, 20);
      const shiftType = sanitizeText(req.body?.shiftType, 60);
      const phone = sanitizeText(req.body?.phone, 40) || null;
      const status = sanitizeText(req.body?.status, 20) as 'نشط' | 'غائب' | 'مكتمل';
      const notes = sanitizeText(req.body?.notes, 250);

      if (!workerId || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate) || !shiftType) {
        res.status(400).json({error: 'يرجى تحديد العامل والتاريخ ونوع الوردية.'});
        return;
      }
      if (!['نشط', 'غائب', 'مكتمل'].includes(status)) {
        res.status(400).json({error: 'حالة الوردية غير صالحة.'});
        return;
      }

      const worker = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'worker'").get(workerId) as
        | {id: string; name: string}
        | undefined;
      if (!worker) {
        res.status(404).json({error: 'العامل غير موجود.'});
        return;
      }

      const now = new Date().toISOString();
      const id = `SHF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO worker_shifts (id, worker_id, shift_date, shift_type, phone, status, notes, recorded_by_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, worker.id, shiftDate, shiftType, phone, status, notes, actor.id, now);

        const mappedWorkerStatus: WorkerStatus = status === 'غائب' ? 'غائب' : 'نشط';
        db.prepare('UPDATE users SET shift_name = ?, phone = COALESCE(?, phone), worker_status = ?, updated_at = ? WHERE id = ?').run(
          shiftType,
          phone,
          mappedWorkerStatus,
          now,
          worker.id,
        );

        writeAuditLog({
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          action: 'تسجيل وردية عمل',
          entityType: 'shift',
          entityId: id,
          details: `${worker.name} · ${shiftDate} · ${shiftType} · ${status}${phone ? ` · هاتف: ${phone}` : ''}`,
        });
      });

      tx();

      res.status(201).json({
        shift: {
          id,
          workerId: worker.id,
          workerName: worker.name,
          shiftDate,
          shiftType,
          phone,
          status,
          notes,
          recordedByName: actor.name,
          createdAt: now,
        },
      });
    },
  );

  // Shift handover register (Admin & Supervisor). Workers do not need app accounts or access.
  app.get('/api/handovers', requireAuth, requireRole(['admin', 'supervisor']), (_req: AuthenticatedRequest, res: Response) => {
    const rows = db.prepare(`
      SELECT h.*, fw.name AS from_worker_name, tw.name AS to_worker_name,
             rb.name AS recorded_by_name, cb.name AS confirmed_by_name
      FROM shift_handovers h
      JOIN users fw ON fw.id = h.from_worker_id
      JOIN users tw ON tw.id = h.to_worker_id
      JOIN users rb ON rb.id = h.recorded_by_id
      LEFT JOIN users cb ON cb.id = h.confirmed_by_id
      ORDER BY h.created_at DESC LIMIT 200
    `).all() as Array<any>;
    res.json({handovers: rows.map((h) => ({
      id: h.id, fromWorkerId: h.from_worker_id, fromWorkerName: h.from_worker_name,
      toWorkerId: h.to_worker_id, toWorkerName: h.to_worker_name,
      shiftDate: h.shift_date, shiftType: h.shift_type, outgoingNotes: h.outgoing_notes,
      pendingTasks: JSON.parse(h.pending_tasks_json || '[]'), status: h.status,
      incomingNotes: h.incoming_notes, recordedByName: h.recorded_by_name,
      confirmedByName: h.confirmed_by_name, createdAt: h.created_at, confirmedAt: h.confirmed_at,
    }))});
  });

  app.post('/api/handovers', requireAuth, requireRole(['admin', 'supervisor']), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const fromWorkerId = sanitizeText(req.body?.fromWorkerId, 64);
    const toWorkerId = sanitizeText(req.body?.toWorkerId, 64);
    const shiftDate = sanitizeText(req.body?.shiftDate, 20);
    const shiftType = sanitizeText(req.body?.shiftType, 60);
    const outgoingNotes = sanitizeText(req.body?.outgoingNotes, 1000);
    if (!fromWorkerId || !toWorkerId || fromWorkerId === toWorkerId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(shiftDate) || !shiftType) {
      res.status(400).json({error: 'يرجى تحديد العاملين المختلفين وتاريخ ونوع الوردية.'}); return;
    }
    const workers = db.prepare("SELECT id, name FROM users WHERE id IN (?, ?) AND role = 'worker' AND is_active = 1 AND worker_status = 'نشط'").all(fromWorkerId, toWorkerId) as Array<{id:string;name:string}>;
    if (workers.length !== 2) { res.status(400).json({error: 'يجب اختيار عاملين نشطين مختلفين.'}); return; }
    const fromWorker = workers.find(w => w.id === fromWorkerId)!;
    const toWorker = workers.find(w => w.id === toWorkerId)!;
    const pendingTasks = db.prepare(`
      SELECT id, department_id, room_or_location, request_type, priority, status, created_at
      FROM cleaning_requests WHERE assigned_worker_id = ? AND status IN ('تم الإسناد', 'قيد التنفيذ')
      ORDER BY CASE priority WHEN 'عاجل' THEN 1 WHEN 'عالي' THEN 2 ELSE 3 END, created_at ASC
    `).all(fromWorkerId) as Array<{id:string;department_id:string;room_or_location:string;request_type:string;priority:string;status:string;created_at:string}>;
    const id = `HND-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO shift_handovers
        (id, from_worker_id, to_worker_id, shift_date, shift_type, outgoing_notes, pending_tasks_json, status, incoming_notes, recorded_by_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'بانتظار التأكيد', '', ?, ?)`
      ).run(id, fromWorkerId, toWorkerId, shiftDate, shiftType, outgoingNotes, JSON.stringify(pendingTasks), actor.id, now);

      // Transfer every still-open task to the incoming worker without closing it or resetting its progress.
      db.prepare(`UPDATE cleaning_requests
        SET assigned_worker_id = ?, assigned_by_id = ?, assigned_at = COALESCE(assigned_at, ?), updated_at = ?
        WHERE assigned_worker_id = ? AND status IN ('تم الإسناد', 'قيد التنفيذ')`
      ).run(toWorkerId, actor.id, now, now, fromWorkerId);

      writeAuditLog({actorId:actor.id, actorName:actor.name, actorRole:actor.role, action:'تسجيل تسليم وردية ونقل الطلبات المفتوحة', entityType:'shift_handover', entityId:id,
        details:`${fromWorker.name} إلى ${toWorker.name} · ${shiftDate} · ${shiftType} · طلبات معلقة نُقلت: ${pendingTasks.length}${outgoingNotes ? ` · ${outgoingNotes}` : ''}`});
    });
    tx();
    res.status(201).json({handover:{id,fromWorkerId,fromWorkerName:fromWorker.name,toWorkerId,toWorkerName:toWorker.name,shiftDate,shiftType,outgoingNotes,pendingTasks,status:'بانتظار التأكيد',incomingNotes:'',recordedByName:actor.name,confirmedByName:null,createdAt:now,confirmedAt:null}});
  });

  app.patch('/api/handovers/:id/confirm', requireAuth, requireRole(['admin', 'supervisor']), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const id = sanitizeText(req.params.id, 64);
    const incomingNotes = sanitizeText(req.body?.incomingNotes, 1000);
    const existing = db.prepare('SELECT id, status, from_worker_id, to_worker_id FROM shift_handovers WHERE id = ?').get(id) as
      | {id:string;status:string;from_worker_id:string;to_worker_id:string} | undefined;
    if (!existing) { res.status(404).json({error:'سجل التسليم غير موجود.'}); return; }
    if (existing.status === 'تم الاستلام') { res.status(400).json({error:'تم تأكيد استلام هذه الوردية مسبقاً.'}); return; }
    const now = new Date().toISOString();
    db.prepare("UPDATE shift_handovers SET status = 'تم الاستلام', incoming_notes = ?, confirmed_by_id = ?, confirmed_at = ? WHERE id = ?")
      .run(incomingNotes, actor.id, now, id);
    writeAuditLog({actorId:actor.id,actorName:actor.name,actorRole:actor.role,action:'تأكيد استلام وردية',entityType:'shift_handover',entityId:id,
      details:`تم تأكيد استلام الوردية من ${existing.from_worker_id} إلى ${existing.to_worker_id}${incomingNotes ? ` · ملاحظات: ${incomingNotes}` : ''}`});
    res.json({ok:true,status:'تم الاستلام',confirmedAt:now});
  });

  // Worker notes and incident history (Admin & Supervisor)
  app.get('/api/worker-notes', requireAuth, requireRole(['admin', 'supervisor']), (_req: AuthenticatedRequest, res: Response) => {
    const rows = db.prepare(`SELECT n.id, n.worker_id, w.name AS worker_name, n.note_type, n.details, u.name AS created_by_name, n.created_at
      FROM worker_notes n JOIN users w ON w.id = n.worker_id JOIN users u ON u.id = n.created_by_id
      ORDER BY n.created_at DESC LIMIT 300`).all() as Array<{id:string;worker_id:string;worker_name:string;note_type:string;details:string;created_by_name:string;created_at:string}>;
    res.json({notes: rows.map(n => ({id:n.id, workerId:n.worker_id, workerName:n.worker_name, noteType:n.note_type, details:n.details, createdByName:n.created_by_name, createdAt:n.created_at}))});
  });

  app.post('/api/worker-notes', requireAuth, requireRole(['admin', 'supervisor']), (req: AuthenticatedRequest, res: Response) => {
    const actor = req.user!;
    const workerId = sanitizeText(req.body?.workerId, 64);
    const noteType = sanitizeText(req.body?.noteType, 30);
    const details = sanitizeText(req.body?.details, 1000);
    if (!['تأخير', 'شكوى', 'ملاحظة', 'إشادة'].includes(noteType) || details.length < 3) { res.status(400).json({error:'يرجى تحديد نوع الملاحظة وكتابة تفاصيل واضحة.'}); return; }
    const worker = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'worker'").get(workerId) as {id:string;name:string}|undefined;
    if (!worker) { res.status(404).json({error:'العامل غير موجود.'}); return; }
    const id = `WNOTE-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const now = new Date().toISOString();
    db.prepare('INSERT INTO worker_notes (id, worker_id, note_type, details, created_by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, workerId, noteType, details, actor.id, now);
    writeAuditLog({actorId:actor.id,actorName:actor.name,actorRole:actor.role,action:'تسجيل ملاحظة في ملف العامل',entityType:'worker_note',entityId:id,details:`${worker.name} · ${noteType} · ${details}`});
    res.status(201).json({note:{id,workerId,workerName:worker.name,noteType,details,createdByName:actor.name,createdAt:now}});
  });

  // Admin-only point-in-time SQLite backup download. This exports a consistent database snapshot.
  app.get('/api/admin/backup', requireAuth, requireRole(['admin']), (_req: AuthenticatedRequest, res: Response) => {
    const snapshot = db.serialize();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="imc-clean-backup-${stamp}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(snapshot);
  });

  // Daily, weekly and monthly reports (Supervisor & Admin)
  app.get(
    '/api/reports',
    requireAuth,
    requireRole(['admin', 'supervisor']),
    (req: AuthenticatedRequest, res: Response) => {
      const period = req.query.period === 'monthly' ? 'monthly' : req.query.period === 'weekly' ? 'weekly' : 'daily';
      const rawDate = sanitizeText(req.query.date, 20);
      const endDateObj = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T23:59:59.999Z`) : new Date();
      const endDateIso = endDateObj.toISOString();
      const startDateObj = new Date(endDateObj);
      if (period === 'weekly') {
        startDateObj.setUTCDate(startDateObj.getUTCDate() - 6);
      } else if (period === 'monthly') {
        startDateObj.setUTCDate(1);
      }
      startDateObj.setUTCHours(0, 0, 0, 0);
      const startDateIso = startDateObj.toISOString();

      const requests = db
        .prepare(`${REQUEST_SELECT_SQL} WHERE r.created_at >= ? AND r.created_at <= ? ORDER BY r.created_at DESC`)
        .all(startDateIso, endDateIso) as RawRequestRow[];

      const departments = db
        .prepare('SELECT id, name FROM departments ORDER BY name ASC')
        .all() as Array<{id: string; name: string}>;

      const workers = db
        .prepare("SELECT id, name, worker_status, shift_name FROM users WHERE role = 'worker' ORDER BY name ASC")
        .all() as Array<{id: string; name: string; worker_status: WorkerStatus; shift_name: string | null}>;

      let totalAssignMins = 0;
      let assignCount = 0;
      let totalStartMins = 0;
      let startCount = 0;
      let totalCompleteMins = 0;
      let completeCount = 0;

      for (const r of requests) {
        const createdMs = Date.parse(r.created_at);
        if (r.assigned_at) {
          totalAssignMins += Math.max(0, (Date.parse(r.assigned_at) - createdMs) / 60000);
          assignCount++;
        }
        if (r.started_at && r.assigned_at) {
          totalStartMins += Math.max(0, (Date.parse(r.started_at) - Date.parse(r.assigned_at)) / 60000);
          startCount++;
        }
        if (r.completed_at) {
          totalCompleteMins += Math.max(0, (Date.parse(r.completed_at) - createdMs) / 60000);
          completeCount++;
        }
      }

      const byDepartment = departments.map((d) => {
        const deptReqs = requests.filter((r) => r.department_id === d.id);
        return {
          departmentId: d.id,
          departmentName: d.name,
          total: deptReqs.length,
          completed: deptReqs.filter((r) => r.status === 'مكتمل').length,
          pending: deptReqs.filter((r) => r.status === 'جديد' || r.status === 'تم الإسناد' || r.status === 'قيد التنفيذ')
            .length,
          highRisk: deptReqs.filter((r) => r.is_high_risk === 1).length,
        };
      });

      const byWorker = workers.map((w) => {
        const workerReqs = requests.filter((r) => r.assigned_worker_id === w.id);
        return {
          workerId: w.id,
          workerName: w.name,
          workerStatus: w.worker_status,
          shiftName: w.shift_name,
          completedCount: workerReqs.filter((r) => r.status === 'مكتمل').length,
          activeCount: workerReqs.filter((r) => r.status === 'تم الإسناد' || r.status === 'قيد التنفيذ').length,
          highRiskHandled: workerReqs.filter((r) => r.status === 'مكتمل' && r.is_high_risk === 1).length,
        };
      });

      // Also include any currently open requests even if created slightly earlier so delayed requests never disappear
      const allOpenRequests = db
        .prepare(`${REQUEST_SELECT_SQL} WHERE r.status IN ('جديد', 'تم الإسناد', 'قيد التنفيذ') ORDER BY r.created_at ASC`)
        .all() as RawRequestRow[];

      const nowMs = Date.now();
      const pendingAndDelayed = allOpenRequests.map((r) => {
        const elapsedMinutes = Math.max(0, Math.round((nowMs - Date.parse(r.created_at)) / 60000));
        const sla = PRIORITY_SLA_MINUTES[r.priority] ?? 60;
        return {
          id: r.id,
          departmentName: r.department_name,
          roomOrLocation: r.room_or_location,
          requestType: r.request_type,
          priority: r.priority,
          status: r.status,
          assignedWorkerName: r.assigned_worker_name,
          assignedWorkerStatus: r.assigned_worker_status,
          isHighRisk: r.is_high_risk === 1,
          createdAt: r.created_at,
          elapsedMinutes,
          isDelayed: elapsedMinutes > sla,
        };
      });

      res.json({
        period,
        startDate: startDateIso.slice(0, 10),
        endDate: endDateIso.slice(0, 10),
        summary: {
          totalRequests: requests.length,
          completedRequests: requests.filter((r) => r.status === 'مكتمل').length,
          pendingRequests: requests.filter(
            (r) => r.status === 'جديد' || r.status === 'تم الإسناد' || r.status === 'قيد التنفيذ',
          ).length,
          cancelledRequests: requests.filter((r) => r.status === 'ملغي').length,
          highRiskRequests: requests.filter((r) => r.is_high_risk === 1).length,
          avgAssignmentMinutes: assignCount ? Math.round(totalAssignMins / assignCount) : null,
          avgStartMinutes: startCount ? Math.round(totalStartMins / startCount) : null,
          avgCompletionMinutes: completeCount ? Math.round(totalCompleteMins / completeCount) : null,
        },
        byDepartment,
        byWorker,
        pendingAndDelayed,
      });
    },
  );

  // Admin: System Audit Logs
  app.get(
    '/api/admin/audit-logs',
    requireAuth,
    requireRole(['admin']),
    (_req: AuthenticatedRequest, res: Response) => {
      const rows = db
        .prepare(
          `SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at
           FROM audit_logs ORDER BY created_at DESC LIMIT 150`,
        )
        .all() as Array<{
        id: string;
        actor_id: string | null;
        actor_name: string;
        actor_role: string;
        action: string;
        entity_type: string;
        entity_id: string;
        details: string;
        created_at: string;
      }>;

      res.json({
        logs: rows.map((l) => ({
          id: l.id,
          actorId: l.actor_id,
          actorName: l.actor_name,
          actorRole: l.actor_role,
          action: l.action,
          entityType: l.entity_type,
          entityId: l.entity_id,
          details: l.details,
          createdAt: l.created_at,
        })),
      });
    },
  );

  // Public: Download clean project source ZIP (excludes DB, env, node_modules, and user uploads)
  app.get('/api/project-zip', (_req: Request, res: Response) => {
    const zipBuffer = buildProjectZipBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="IMC-Clean-Manager.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(zipBuffer);
  });

  // Admin: Issue short-lived signed ticket for direct native browser ZIP download
  app.get(
    '/api/admin/project-zip-ticket',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const signed = signDownloadTicket(req.user!.id, 'project-zip');
      res.setHeader('Cache-Control', 'no-store');
      res.json(signed);
    },
  );

  // Admin: Download project source ZIP (supports cookie/Bearer OR short-lived ?ticket=)
  app.get('/api/admin/project-zip', (req: Request, res: Response) => {
    const ticketParam = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : '';
    let uid: string | null = null;

    if (ticketParam) {
      const ticketPayload = verifyDownloadTicket(ticketParam, 'project-zip');
      if (!ticketPayload) {
        res.status(401).json({error: 'انتهت صلاحية رابط التنزيل أو أنه غير صالح. يرجى تحديث الصفحة والمحاولة مجدداً.'});
        return;
      }
      uid = ticketPayload.uid;
    } else {
      const token = extractTokenFromRequest(req);
      const tokenPayload = token ? verifySessionToken(token) : null;
      if (!tokenPayload) {
        res.status(401).json({error: 'يلزم تسجيل الدخول بحساب مدير النظام لتنزيل ملف المشروع.'});
        return;
      }
      uid = tokenPayload.uid;
    }

    const user = db
      .prepare('SELECT id, role, is_active FROM users WHERE id = ?')
      .get(uid) as Pick<AuthenticatedUserRow, 'id' | 'role' | 'is_active'> | undefined;

    if (!user || user.is_active !== 1) {
      res.status(401).json({error: 'الحساب غير نشط أو غير موجود.'});
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({error: 'تنزيل نسخة المشروع متاح لمدير النظام فقط.'});
      return;
    }

    const zipBuffer = buildProjectZipBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="IMC-Clean-Manager.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(zipBuffer);
  });
}
