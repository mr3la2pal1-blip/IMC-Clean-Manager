export type UserRole = 'admin' | 'supervisor' | 'worker';

export type WorkerStatus = 'نشط' | 'غائب';

export type RequestStatus = 'جديد' | 'تم الإسناد' | 'قيد التنفيذ' | 'مكتمل' | 'ملغي';

export type RequestPriority = 'عادي' | 'عالي' | 'عاجل';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  phone: string | null;
  shiftName: string | null;
  workerStatus: WorkerStatus;
  isActive: boolean;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  floorOrWing: string;
  isActive: boolean;
  createdAt: string;
}

export interface CleaningRequest {
  id: string;
  departmentId: string;
  departmentName: string;
  floorOrWing?: string;
  roomOrLocation: string;
  requestType: string;
  priority: RequestPriority;
  description: string;
  isHighRisk: boolean;
  status: RequestStatus;
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
  assignedWorkerPhone: string | null;
  assignedWorkerStatus: WorkerStatus | null;
  assignedById: string | null;
  assignedByName: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  assignedAt: string | null;
  acknowledgedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  updatedAt: string;
}

export type NursingStatusChoice = 'العامل متأخر ولم يحضر' | 'تم إنجاز المهمة' | 'لم يتم إنجاز المهمة بعد';

export interface NursingStatusReport {
  id: string;
  departmentId: string;
  departmentName: string;
  status: NursingStatusChoice;
  location: string;
  note: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface WorkerSummary {
  id: string;
  name: string;
  phone: string | null;
  shiftName: string | null;
  workerStatus: WorkerStatus;
  isActive: boolean;
  activeTasksCount: number;
}

export interface WorkerShiftRecord {
  id: string;
  workerId: string;
  workerName: string;
  shiftDate: string;
  shiftType: string;
  phone: string | null;
  status: 'نشط' | 'غائب' | 'مكتمل';
  notes: string;
  recordedByName: string;
  createdAt: string;
}

export interface ReportData {
  period: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
  summary: {
    totalRequests: number;
    completedRequests: number;
    pendingRequests: number;
    cancelledRequests: number;
    highRiskRequests: number;
    avgAssignmentMinutes: number | null;
    avgStartMinutes: number | null;
    avgCompletionMinutes: number | null;
  };
  byDepartment: Array<{
    departmentId: string;
    departmentName: string;
    total: number;
    completed: number;
    pending: number;
    highRisk: number;
  }>;
  byWorker: Array<{
    workerId: string;
    workerName: string;
    workerStatus: WorkerStatus;
    shiftName: string | null;
    completedCount: number;
    activeCount: number;
    highRiskHandled: number;
  }>;
  pendingAndDelayed: Array<{
    id: string;
    departmentName: string;
    roomOrLocation: string;
    requestType: string;
    priority: RequestPriority;
    status: RequestStatus;
    assignedWorkerName: string | null;
    assignedWorkerStatus: WorkerStatus | null;
    isHighRisk: boolean;
    createdAt: string;
    elapsedMinutes: number;
    isDelayed: boolean;
  }>;
}
