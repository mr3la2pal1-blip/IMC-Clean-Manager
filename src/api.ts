import type {
  AuditLogEntry,
  AuthUser,
  CleaningRequest,
  Department,
  ReportData,
  NursingStatusChoice,
  NursingStatusReport,
  NursingPerformanceRating,
  NursingPerformanceRatingChoice,
  RequestPriority,
  UserRole,
  WorkerShiftRecord,
  ShiftHandoverRecord,
  WorkerStatus,
  WorkerSummary,
  WorkerNoteRecord,
} from './types.ts';

const TOKEN_STORAGE_KEY = 'imc_clean_token';

// For the Android APK, set VITE_API_BASE_URL to the public HTTPS URL of the backend.
// In the normal web app, leaving it empty keeps the existing same-origin API behavior.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const requestUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `${API_BASE_URL}${url}`;

  const res = await fetch(requestUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({}))) as {error?: string} & T;
  if (!res.ok) {
    throw new Error(data.error || `خطأ في الاتصال بالخادم (${res.status})`);
  }
  return data;
}

export function formatArabicDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatTimeOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function buildWhatsAppHref(req: CleaningRequest): string {
  const cleanPhone = (req.assignedWorkerPhone || '').replace(/[^\d]/g, '');
  const lines = [
    `*IMC Clean Manager — إشعار مهمة نظافة*`,
    `رقم الطلب: ${req.id}`,
    `القسم: ${req.departmentName}`,
    `الموقع / الغرفة: ${req.roomOrLocation}`,
    `نوع الطلب: ${req.requestType}`,
    `الأولوية: ${req.priority}`,
    ...(req.isHighRisk
      ? [
          `تنبيه خطورة عالية: يتطلب اتباع بروتوكول مكافحة العدوى المعتمد والتصعيد الفوري.`,
        ]
      : []),
    ...(req.description ? [`التفاصيل: ${req.description}`] : []),
    `وقت الإنشاء: ${formatArabicDateTime(req.createdAt)}`,
  ];
  const text = encodeURIComponent(lines.join('\n'));
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export const api = {
  getSetupStatus: () => apiFetch<{needsSetup: boolean}>('/api/auth/setup-status'),

  bootstrapAdmin: (payload: {
    name: string;
    username: string;
    password: string;
    phone?: string;
    seedDepartments: boolean;
  }) =>
    apiFetch<{user: AuthUser; token: string}>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (username: string, password: string) =>
    apiFetch<{user: AuthUser; token: string}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({username, password}),
    }),

  logout: () => apiFetch<{ok: boolean}>('/api/auth/logout', {method: 'POST'}),

  me: () => apiFetch<{user: AuthUser}>('/api/auth/me'),

  getPublicDepartments: () => apiFetch<{departments: Department[]}>('/api/public/departments'),

  submitPublicRequest: (payload: {
    departmentId: string;
    roomOrLocation: string;
    requestType: string;
    priority: RequestPriority;
    description: string;
    isHighRisk: boolean;
  }) =>
    apiFetch<{request: CleaningRequest}>('/api/public/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitNursingStatusReport: (payload: {
    departmentId: string;
    status: NursingStatusChoice;
    location?: string;
    note?: string;
  }) => apiFetch<{report: NursingStatusReport}>('/api/public/nursing-status-reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  getNursingStatusReports: () => apiFetch<{reports: NursingStatusReport[]}>('/api/nursing-status-reports'),

  submitNursingPerformanceRating: (payload: {
    departmentId: string;
    requestId?: string;
    location?: string;
    rating: NursingPerformanceRatingChoice;
    reason?: string;
  }) => apiFetch<{rating: NursingPerformanceRating}>('/api/public/nursing-performance-ratings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  getNursingPerformanceRatings: () => apiFetch<{ratings: NursingPerformanceRating[]}>('/api/nursing-performance-ratings'),

  getRequests: () => apiFetch<{requests: CleaningRequest[]}>('/api/requests'),

  getRequestDetail: (id: string) =>
    apiFetch<{request: CleaningRequest; logs: AuditLogEntry[]}>(`/api/requests/${encodeURIComponent(id)}`),

  createRequest: (payload: {
    departmentId: string;
    roomOrLocation: string;
    requestType: string;
    priority: RequestPriority;
    description: string;
    isHighRisk: boolean;
  }) =>
    apiFetch<{request: CleaningRequest}>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  assignRequest: (id: string, workerId: string, reason?: string) =>
    apiFetch<{request: CleaningRequest}>(`/api/requests/${encodeURIComponent(id)}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({workerId, reason}),
    }),

  updatePriority: (id: string, priority: RequestPriority) =>
    apiFetch<{request: CleaningRequest}>(`/api/requests/${encodeURIComponent(id)}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({priority}),
    }),

  cancelRequest: (id: string, reason: string) =>
    apiFetch<{request: CleaningRequest}>(`/api/requests/${encodeURIComponent(id)}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({reason}),
    }),

  workerAction: (id: string, action: 'confirm_receipt' | 'start' | 'complete') =>
    apiFetch<{request: CleaningRequest}>(`/api/requests/${encodeURIComponent(id)}/worker-action`, {
      method: 'PATCH',
      body: JSON.stringify({action}),
    }),

  getWorkers: () => apiFetch<{workers: WorkerSummary[]}>('/api/workers'),

  getDepartments: () => apiFetch<{departments: Department[]}>('/api/departments'),

  createDepartment: (payload: {id?: string; name: string; floorOrWing: string}) =>
    apiFetch<{department: Department}>('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDepartment: (id: string, payload: {name?: string; floorOrWing?: string; isActive?: boolean}) =>
    apiFetch<{department: Department}>(`/api/admin/departments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getUsers: () => apiFetch<{users: AuthUser[]}>('/api/admin/users'),

  createUser: (payload: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
    phone?: string;
    shiftName?: string;
  }) =>
    apiFetch<{user: AuthUser}>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUser: (
    id: string,
    payload: {
      name?: string;
      username?: string;
      role?: UserRole;
      phone?: string | null;
      shiftName?: string | null;
      workerStatus?: WorkerStatus;
      isActive?: boolean;
      password?: string;
    },
  ) =>
    apiFetch<{user: AuthUser}>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getHandovers: () => apiFetch<{handovers: ShiftHandoverRecord[]}>('/api/handovers'),
  createHandover: (payload: {fromWorkerId:string;toWorkerId:string;shiftDate:string;shiftType:string;outgoingNotes?:string}) =>
    apiFetch<{handover:ShiftHandoverRecord}>('/api/handovers', {method:'POST', body:JSON.stringify(payload)}),
  confirmHandover: (id:string, incomingNotes:string) =>
    apiFetch<{ok:boolean;status:string;confirmedAt:string}>(`/api/handovers/${encodeURIComponent(id)}/confirm`, {method:'PATCH', body:JSON.stringify({incomingNotes})}),

  getShifts: (date?: string) =>
    apiFetch<{shifts: WorkerShiftRecord[]}>(`/api/shifts${date ? `?date=${encodeURIComponent(date)}` : ''}`),

  createShift: (payload: {
    workerId: string;
    shiftDate: string;
    shiftType: string;
    phone?: string;
    status: 'نشط' | 'غائب' | 'مكتمل';
    notes?: string;
  }) =>
    apiFetch<{shift: WorkerShiftRecord}>('/api/admin/shifts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getWorkerNotes: () => apiFetch<{notes: WorkerNoteRecord[]}>('/api/worker-notes'),
  createWorkerNote: (payload: {workerId:string;noteType:WorkerNoteRecord['noteType'];details:string}) =>
    apiFetch<{note:WorkerNoteRecord}>('/api/worker-notes', {method:'POST', body:JSON.stringify(payload)}),
  downloadBackup: () => `${API_BASE_URL}/api/admin/backup`,

  getReports: (period: 'daily' | 'weekly' | 'monthly', date: string) =>
    apiFetch<ReportData>(`/api/reports?period=${period}&date=${encodeURIComponent(date)}`),

  getAuditLogs: () => apiFetch<{logs: AuditLogEntry[]}>('/api/admin/audit-logs'),

  getProjectZipTicket: () => apiFetch<{ticket: string; expiresAt: string}>('/api/admin/project-zip-ticket'),
};
