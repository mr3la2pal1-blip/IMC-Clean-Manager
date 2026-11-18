import {
  AlertTriangle,
  History,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {api, buildWhatsAppHref, formatArabicDateTime} from '../api.ts';
import {REQUEST_PRIORITIES, REQUEST_STATUSES} from '../constants.ts';
import type {
  AuditLogEntry,
  CleaningRequest,
  Department,
  RequestPriority,
  RequestStatus,
  WorkerSummary,
} from '../types.ts';
import {
  InfectionControlWarning,
  PriorityLabel,
  StatusLabel,
  WorkerPresenceText,
} from './StatusIndicators.tsx';

interface SupervisorDashboardProps {
  requests: CleaningRequest[];
  workers: WorkerSummary[];
  departments: Department[];
  loading: boolean;
  onRefresh: () => void;
  onNewRequest: () => void;
}

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({
  requests,
  workers,
  departments,
  loading,
  onRefresh,
  onNewRequest,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'الكل' | 'يحتاج_إعادة_إسناد'>('الكل');
  const [priorityFilter, setPriorityFilter] = useState<RequestPriority | 'الكل'>('الكل');
  const [deptFilter, setDeptFilter] = useState<string>('الكل');

  const [assignModalReq, setAssignModalReq] = useState<CleaningRequest | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [detailReq, setDetailReq] = useState<CleaningRequest | null>(null);
  const [detailLogs, setDetailLogs] = useState<AuditLogEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [cancelModalReq, setCancelModalReq] = useState<CleaningRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const metrics = useMemo(() => {
    const total = requests.length;
    const newCount = requests.filter((r) => r.status === 'جديد').length;
    const urgentCount = requests.filter(
      (r) => r.priority === 'عاجل' && r.status !== 'مكتمل' && r.status !== 'ملغي',
    ).length;
    const assignedCount = requests.filter((r) => r.status === 'تم الإسناد').length;
    const inProgressCount = requests.filter((r) => r.status === 'قيد التنفيذ').length;
    const completedCount = requests.filter((r) => r.status === 'مكتمل').length;
    const needsReassignCount = requests.filter(
      (r) =>
        (r.status === 'تم الإسناد' || r.status === 'قيد التنفيذ') &&
        r.assignedWorkerStatus === 'غائب',
    ).length;

    return {
      total,
      newCount,
      urgentCount,
      assignedCount,
      inProgressCount,
      completedCount,
      needsReassignCount,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter === 'يحتاج_إعادة_إسناد') {
        const needs =
          (r.status === 'تم الإسناد' || r.status === 'قيد التنفيذ') &&
          r.assignedWorkerStatus === 'غائب';
        if (!needs) return false;
      } else if (statusFilter !== 'الكل' && r.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== 'الكل' && r.priority !== priorityFilter) return false;
      if (deptFilter !== 'الكل' && r.departmentId !== deptFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.departmentName.toLowerCase().includes(q) ||
        r.roomOrLocation.toLowerCase().includes(q) ||
        r.requestType.toLowerCase().includes(q) ||
        (r.assignedWorkerName || '').toLowerCase().includes(q)
      );
    });
  }, [requests, searchTerm, statusFilter, priorityFilter, deptFilter]);

  const activeWorkers = useMemo(
    () => workers.filter((w) => w.isActive && w.workerStatus === 'نشط'),
    [workers],
  );

  const openAssignModal = (req: CleaningRequest) => {
    setAssignModalReq(req);
    setActionError(null);
    setAssignReason(req.assignedWorkerStatus === 'غائب' ? 'إعادة إسناد بسبب غياب العامل' : '');
    const defaultWorker = activeWorkers.find((w) => w.id !== req.assignedWorkerId) || activeWorkers[0];
    setSelectedWorkerId(defaultWorker?.id || '');
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalReq || !selectedWorkerId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.assignRequest(assignModalReq.id, selectedWorkerId, assignReason.trim() || undefined);
      setAssignModalReq(null);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر إسناد المهمة');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePriorityChange = async (reqId: string, priority: RequestPriority) => {
    try {
      await api.updatePriority(reqId, priority);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تحديث الأولوية');
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalReq) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.cancelRequest(cancelModalReq.id, cancelReason.trim() || 'تم الإلغاء من قبل المشرف');
      setCancelModalReq(null);
      setCancelReason('');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر إلغاء الطلب');
    } finally {
      setActionBusy(false);
    }
  };

  const openDetailModal = async (req: CleaningRequest) => {
    setDetailReq(req);
    setLoadingDetail(true);
    try {
      const res = await api.getRequestDetail(req.id);
      setDetailReq(res.request);
      setDetailLogs(res.logs);
    } catch {
      setDetailLogs([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">إجمالي الطلبات</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{metrics.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">الطلبات الجديدة</p>
          <p className="mt-1.5 text-2xl font-bold text-sky-700 tabular-nums">{metrics.newCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">الطلبات العاجلة</p>
          <p className="mt-1.5 text-2xl font-bold text-red-700 tabular-nums">{metrics.urgentCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">الطلبات المسندة</p>
          <p className="mt-1.5 text-2xl font-bold text-amber-700 tabular-nums">
            {metrics.assignedCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">قيد التنفيذ</p>
          <p className="mt-1.5 text-2xl font-bold text-teal-700 tabular-nums">
            {metrics.inProgressCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">الطلبات المكتملة</p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
            {metrics.completedCount}
          </p>
        </div>
      </div>

      {/* Absent Worker Reassignment Banner */}
      {metrics.needsReassignCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
            <span>
              يوجد <strong className="tabular-nums">{metrics.needsReassignCount}</strong> مهمة مفتوحة
              مسندة إلى عمال مسجلين كغائبين حالياً وتحتاج إعادة إسناد فورية.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('يحتاج_إعادة_إسناد')}
            className="rounded-lg bg-amber-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            عرض المهام المتأثرة
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter & Actions Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['الكل', ...REQUEST_STATUSES] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
            <button
              type="button"
              onClick={onNewRequest}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>طلب نظافة جديد</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الطلب، الغرفة، القسم، أو العامل..."
              className="w-full rounded-lg border border-slate-300 pr-9 pl-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="تصفية حسب القسم"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none"
          >
            <option value="الكل">جميع الأقسام</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as RequestPriority | 'الكل')}
            aria-label="تصفية حسب الأولوية"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none"
          >
            <option value="الكل">جميع الأولويات</option>
            {REQUEST_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                الأولوية: {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Requests Table (Desktop) & Cards (Mobile) */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">جاري تحميل طلبات النظافة...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">لا توجد طلبات مطابقة للتصفية الحالية</p>
            <p className="text-xs text-slate-500">
              ستظهر الطلبات فور مسح رموز QR في الأقسام أو إضافة طلب جديد من هنا.
            </p>
            <button
              type="button"
              onClick={onNewRequest}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء طلب أول</span>
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">رقم الطلب والوقت</th>
                    <th className="px-4 py-3">القسم والموقع</th>
                    <th className="px-4 py-3">نوع الطلب</th>
                    <th className="px-4 py-3">الأولوية</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">العامل المسند</th>
                    <th className="px-4 py-3">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((r) => {
                    const isOpen = r.status !== 'مكتمل' && r.status !== 'ملغي';
                    const workerAbsent = isOpen && r.assignedWorkerStatus === 'غائب';
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-mono text-xs font-semibold text-slate-900">{r.id}</div>
                          <div className="mt-1 text-xs text-slate-500 tabular-nums">
                            {formatArabicDateTime(r.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">{r.departmentName}</div>
                          <div className="mt-0.5 text-xs text-slate-600">{r.roomOrLocation}</div>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="font-medium text-slate-800">{r.requestType}</div>
                          {r.description && (
                            <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{r.description}</p>
                          )}
                          {r.isHighRisk && <InfectionControlWarning compact />}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isOpen ? (
                            <select
                              value={r.priority}
                              onChange={(e) =>
                                handlePriorityChange(r.id, e.target.value as RequestPriority)
                              }
                              aria-label={`تغيير أولوية ${r.id}`}
                              className={`rounded-md border px-2 py-1 text-xs font-semibold focus:outline-none ${
                                r.priority === 'عاجل'
                                  ? 'border-red-300 bg-red-50 text-red-800'
                                  : r.priority === 'عالي'
                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                    : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              {REQUEST_PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <PriorityLabel priority={r.priority} />
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusLabel status={r.status} />
                          {r.acknowledgedAt && (
                            <div className="mt-1 text-[11px] text-slate-500">تم تأكيد الاستلام</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {r.assignedWorkerName ? (
                            <div>
                              <div className="font-medium text-slate-900">{r.assignedWorkerName}</div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <WorkerPresenceText status={r.assignedWorkerStatus} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">غير مسند بعد</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isOpen && (
                              <button
                                type="button"
                                onClick={() => openAssignModal(r)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                  workerAbsent
                                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                                    : r.assignedWorkerId
                                      ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                      : 'bg-teal-700 text-white hover:bg-teal-800'
                                }`}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>
                                  {workerAbsent
                                    ? 'إعادة إسناد'
                                    : r.assignedWorkerId
                                      ? 'تغيير العامل'
                                      : 'إسناد عامل'}
                                </span>
                              </button>
                            )}

                            {r.assignedWorkerId && (
                              <a
                                href={buildWhatsAppHref(r)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>إرسال واتساب</span>
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => openDetailModal(r)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>السجل</span>
                            </button>

                            {isOpen && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelModalReq(r);
                                  setCancelReason('');
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>إلغاء</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Cards */}
            <div className="lg:hidden divide-y divide-slate-200">
              {filteredRequests.map((r) => {
                const isOpen = r.status !== 'مكتمل' && r.status !== 'ملغي';
                const workerAbsent = isOpen && r.assignedWorkerStatus === 'غائب';
                return (
                  <div key={r.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-900">{r.id}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatArabicDateTime(r.createdAt)}</span>
                        </div>
                        <h3 className="mt-1 text-base font-bold text-slate-900">
                          {r.departmentName} — {r.roomOrLocation}
                        </h3>
                      </div>
                      <StatusLabel status={r.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <PriorityLabel priority={r.priority} />
                      <span aria-hidden="true" className="text-slate-300">
                        |
                      </span>
                      <span className="font-medium text-slate-700">{r.requestType}</span>
                    </div>

                    {r.description && <p className="text-xs text-slate-600">{r.description}</p>}
                    {r.isHighRisk && <InfectionControlWarning compact />}

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-500">
                        العامل:{' '}
                        <strong className="text-slate-800">
                          {r.assignedWorkerName || 'غير مسند'}
                        </strong>
                      </span>
                      {r.assignedWorkerStatus && (
                        <WorkerPresenceText status={r.assignedWorkerStatus} />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => openAssignModal(r)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer ${
                            workerAbsent
                              ? 'bg-amber-600 text-white'
                              : 'bg-teal-700 text-white'
                          }`}
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>
                            {workerAbsent
                              ? 'إعادة إسناد'
                              : r.assignedWorkerId
                                ? 'تغيير العامل'
                                : 'إسناد عامل'}
                          </span>
                        </button>
                      )}

                      {r.assignedWorkerId && (
                        <a
                          href={buildWhatsAppHref(r)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>إرسال واتساب</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => openDetailModal(r)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        <History className="w-4 h-4" />
                        <span>السجل</span>
                      </button>

                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelModalReq(r);
                            setCancelReason('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>إلغاء</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Assign / Reassign Worker Modal */}
      {assignModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {assignModalReq.assignedWorkerId ? 'إعادة إسناد المهمة' : 'إسناد المهمة لعامل نظافة'}
              </h3>
              <button
                type="button"
                onClick={() => setAssignModalReq(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1 mb-4">
              <div>
                <span className="font-mono font-semibold">{assignModalReq.id}</span> ·{' '}
                {assignModalReq.departmentName}
              </div>
              <div>الموقع: {assignModalReq.roomOrLocation}</div>
            </div>

            {activeWorkers.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                لا يوجد عمال نشطون متاحون حالياً. يرجى مراجعة مدير النظام لتفعيل عمال أو تسجيل
                الورديات.
              </div>
            ) : (
              <form onSubmit={handleAssignSubmit} className="space-y-4">
                <div>
                  <label htmlFor="assign-worker" className="block text-sm font-semibold text-slate-800 mb-1.5">
                    اختر العامل المتاح (النشطون فقط)
                  </label>
                  <select
                    id="assign-worker"
                    required
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none"
                  >
                    {activeWorkers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — {w.shiftName || 'وردية غير محددة'} (مهام حالية:{' '}
                        {w.activeTasksCount})
                      </option>
                    ))}
                  </select>
                </div>

                {assignModalReq.assignedWorkerId && (
                  <div>
                    <label htmlFor="assign-reason" className="block text-sm font-semibold text-slate-800 mb-1.5">
                      سبب إعادة الإسناد (اختياري)
                    </label>
                    <input
                      id="assign-reason"
                      type="text"
                      value={assignReason}
                      onChange={(e) => setAssignReason(e.target.value)}
                      placeholder="مثال: غياب العامل السابق / موازنة عبء العمل"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssignModalReq(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                  >
                    {actionBusy ? 'جاري الحفظ...' : 'تأكيد الإسناد'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Cancel Request Modal */}
      {cancelModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">إلغاء طلب النظافة</h3>
              <button
                type="button"
                onClick={() => setCancelModalReq(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <p className="text-sm text-slate-600">
                سيتم تغيير حالة الطلب <span className="font-mono font-semibold">{cancelModalReq.id}</span>{' '}
                إلى «ملغي» مع تسجيل ذلك في سجل التدقيق.
              </p>
              <div>
                <label htmlFor="cancel-reason" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  سبب الإلغاء
                </label>
                <input
                  id="cancel-reason"
                  type="text"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: طلب مكرر / تم التعامل معه مسبقاً"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalReq(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 cursor-pointer"
                >
                  {actionBusy ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Detail & Audit Log Modal */}
      {detailReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-lg space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="font-mono text-xs font-semibold text-slate-500">{detailReq.id}</div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {detailReq.departmentName} — {detailReq.roomOrLocation}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailReq(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailReq.isHighRisk && <InfectionControlWarning />}

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
              <div>
                <dt className="text-slate-500">الحالة</dt>
                <dd className="mt-1">
                  <StatusLabel status={detailReq.status} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">الأولوية</dt>
                <dd className="mt-1">
                  <PriorityLabel priority={detailReq.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">العامل المسند</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {detailReq.assignedWorkerName || 'غير مسند'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">وقت الإنشاء</dt>
                <dd className="mt-1 font-medium text-slate-800 tabular-nums">
                  {formatArabicDateTime(detailReq.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">وقت الإسناد</dt>
                <dd className="mt-1 font-medium text-slate-800 tabular-nums">
                  {formatArabicDateTime(detailReq.assignedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">وقت الإتمام</dt>
                <dd className="mt-1 font-medium text-slate-800 tabular-nums">
                  {formatArabicDateTime(detailReq.completedAt)}
                </dd>
              </div>
            </dl>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">سجل الإجراءات والتدقيق</h4>
              {loadingDetail ? (
                <p className="text-xs text-slate-500">جاري تحميل السجل...</p>
              ) : detailLogs.length === 0 ? (
                <p className="text-xs text-slate-500">لا توجد سجلات مسجلة.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {detailLogs.map((log) => (
                    <li key={log.id} className="p-3 text-xs flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{log.action}</p>
                        <p className="mt-0.5 text-slate-600">
                          بواسطة: {log.actorName} {log.details ? `· ${log.details}` : ''}
                        </p>
                      </div>
                      <span className="text-slate-500 tabular-nums">
                        {formatArabicDateTime(log.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
