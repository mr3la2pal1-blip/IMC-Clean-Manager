import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  Edit3,
  History,
  Plus,
  Printer,
  QrCode,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import {ROLE_LABELS, SHIFT_OPTIONS} from '../constants.ts';
import type {
  AuditLogEntry,
  AuthUser,
  Department,
  UserRole,
  WorkerShiftRecord,
  WorkerStatus,
} from '../types.ts';
import {DepartmentQRGrid} from './DepartmentQRGrid.tsx';
import {WorkerPresenceText} from './StatusIndicators.tsx';

interface AdminManagementViewProps {
  departments: Department[];
  onRefreshGlobal: () => void;
  onOpenDeptForm: (deptId: string) => void;
}

export const AdminManagementView: React.FC<AdminManagementViewProps> = ({
  departments,
  onRefreshGlobal,
  onOpenDeptForm,
}) => {
  const [subTab, setSubTab] = useState<'staff' | 'departments' | 'shifts' | 'audit'>('staff');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [shifts, setShifts] = useState<WorkerShiftRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [zipTicket, setZipTicket] = useState<string | null>(null);
  const [loadingZipTicket, setLoadingZipTicket] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [uName, setUName] = useState('');
  const [uUsername, setUUsername] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<UserRole>('worker');
  const [uPhone, setUPhone] = useState('');
  const [uShift, setUShift] = useState(SHIFT_OPTIONS[0]);
  const [uIsActive, setUIsActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  // Department modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [dName, setDName] = useState('');
  const [dFloor, setDFloor] = useState('');
  const [dCode, setDCode] = useState('');
  const [savingDept, setSavingDept] = useState(false);

  // Shift form state
  const [shiftWorkerId, setShiftWorkerId] = useState('');
  const [shiftPhone, setShiftPhone] = useState('');
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState(SHIFT_OPTIONS[0]);
  const [shiftStatus, setShiftStatus] = useState<'نشط' | 'غائب' | 'مكتمل'>('نشط');
  const [shiftNotes, setShiftNotes] = useState('');
  const [savingShift, setSavingShift] = useState(false);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, shiftsRes, logsRes] = await Promise.all([
        api.getUsers(),
        api.getShifts(),
        api.getAuditLogs(),
      ]);
      setUsers(usersRes.users);
      setShifts(shiftsRes.shifts);
      setAuditLogs(logsRes.logs);
      const firstWorker = usersRes.users.find((u) => u.role === 'worker');
      if (firstWorker && !shiftWorkerId) {
        setShiftWorkerId(firstWorker.id);
        setShiftPhone(firstWorker.phone || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الإدارة');
    } finally {
      setLoading(false);
    }
  };

  const refreshZipTicket = useCallback(async () => {
    setLoadingZipTicket(true);
    try {
      const res = await api.getProjectZipTicket();
      setZipTicket(res.ticket);
    } catch {
      setZipTicket(null);
    } finally {
      setLoadingZipTicket(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
    refreshZipTicket();
    const timer = window.setInterval(refreshZipTicket, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refreshZipTicket]);

  const supervisorCount = useMemo(
    () => users.filter((u) => u.role === 'supervisor' && u.isActive).length,
    [users],
  );
  const workerUsers = useMemo(() => users.filter((u) => u.role === 'worker'), [users]);

  const openCreateUser = (defaultRole: UserRole) => {
    setEditingUser(null);
    setUName('');
    setUUsername('');
    setUPassword('');
    setURole(defaultRole);
    setUPhone('');
    setUShift(SHIFT_OPTIONS[0]);
    setUIsActive(true);
    setShowUserModal(true);
  };

  const openEditUser = (u: AuthUser) => {
    setEditingUser(u);
    setUName(u.name);
    setUUsername(u.username);
    setUPassword('');
    setURole(u.role);
    setUPhone(u.phone || '');
    setUShift(u.shiftName || SHIFT_OPTIONS[0]);
    setUIsActive(u.isActive);
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    setError(null);
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          name: uName.trim(),
          username: uUsername.trim().toLowerCase(),
          role: uRole,
          phone: uPhone.trim() || null,
          shiftName: uRole === 'worker' ? uShift : null,
          isActive: uIsActive,
          password: uPassword || undefined,
        });
      } else {
        await api.createUser({
          name: uName.trim(),
          username: uUsername.trim().toLowerCase(),
          password: uPassword,
          role: uRole,
          phone: uPhone.trim() || undefined,
          shiftName: uRole === 'worker' ? uShift : undefined,
        });
      }
      setShowUserModal(false);
      await loadAdminData();
      onRefreshGlobal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ بيانات المستخدم');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleWorkerStatus = async (worker: AuthUser) => {
    const nextStatus: WorkerStatus = worker.workerStatus === 'نشط' ? 'غائب' : 'نشط';
    try {
      await api.updateUser(worker.id, {workerStatus: nextStatus});
      await loadAdminData();
      onRefreshGlobal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير حالة العامل');
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDept(true);
    setError(null);
    try {
      await api.createDepartment({
        id: dCode.trim() || undefined,
        name: dName.trim(),
        floorOrWing: dFloor.trim(),
      });
      setShowDeptModal(false);
      setDName('');
      setDFloor('');
      setDCode('');
      onRefreshGlobal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة القسم');
    } finally {
      setSavingDept(false);
    }
  };

  const handleToggleDeptActive = async (dept: Department) => {
    try {
      await api.updateDepartment(dept.id, {isActive: !dept.isActive});
      onRefreshGlobal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث حالة القسم');
    }
  };

  const handleRecordShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftWorkerId) return;
    setSavingShift(true);
    setError(null);
    try {
      await api.createShift({
        workerId: shiftWorkerId,
        shiftDate,
        shiftType,
        phone: shiftPhone.trim(),
        status: shiftStatus,
        notes: shiftNotes.trim(),
      });
      setShiftNotes('');
      await loadAdminData();
      onRefreshGlobal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الوردية');
    } finally {
      setSavingShift(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('staff')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'staff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>الموظفون والحسابات</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('departments')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'departments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>الأقسام ورموز QR</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('shifts')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'shifts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            <span>سجل الورديات</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل التدقيق</span>
          </button>
        </div>

        {zipTicket ? (
          <a
            href={`/api/admin/project-zip?ticket=${encodeURIComponent(zipTicket)}`}
            download="IMC-Clean-Manager.zip"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              window.setTimeout(refreshZipTicket, 1500);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-teal-700" />
            <span>تنزيل نسخة المشروع (ZIP)</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={refreshZipTicket}
            disabled={loadingZipTicket}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-teal-700" />
            <span>{loadingZipTicket ? 'جاري تجهيز رابط التنزيل...' : 'تجهيز رابط تنزيل المشروع (ZIP)'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* TAB 1: Staff & Users */}
      {subTab === 'staff' && (
        <div className="space-y-4">
          {supervisorCount < 2 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <span>
                عدد حسابات المشرفين النشطة حالياً: <strong className="tabular-nums">{supervisorCount}</strong>.
                يوصى بإنشاء حسابين مستقلين للمشرفين لإدارة جميع طلبات النظافة عبر الورديات.
              </span>
              <button
                type="button"
                onClick={() => openCreateUser('supervisor')}
                className="rounded-lg bg-sky-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 cursor-pointer"
              >
                إضافة مشرف جديد
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">إدارة حسابات المشرفين والعمال</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openCreateUser('supervisor')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة مشرف</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateUser('worker')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة عامل نظافة</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">جاري تحميل الطاقم...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">الاسم</th>
                      <th className="px-4 py-3">اسم المستخدم</th>
                      <th className="px-4 py-3">الدور</th>
                      <th className="px-4 py-3">رقم الجوال (واتساب)</th>
                      <th className="px-4 py-3">الوردية</th>
                      <th className="px-4 py-3">الحضور / الحالة</th>
                      <th className="px-4 py-3">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {u.name}
                          {!u.isActive && (
                            <span className="mr-2 text-xs font-normal text-red-600">(حساب معطل)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600" dir="ltr">
                          {u.username}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700">
                          {ROLE_LABELS[u.role]}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600" dir="ltr">
                          {u.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {u.role === 'worker' ? u.shiftName || 'غير محددة' : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'worker' ? (
                            <WorkerPresenceText status={u.workerStatus} />
                          ) : (
                            <span className="text-xs text-slate-500">حساب إداري</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {u.role === 'worker' && (
                              <button
                                type="button"
                                onClick={() => handleToggleWorkerStatus(u)}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                                  u.workerStatus === 'نشط'
                                    ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                }`}
                              >
                                {u.workerStatus === 'نشط' ? (
                                  <>
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>تسجيل غياب</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>تفعيل كنشط</span>
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Departments & QR Codes */}
      {subTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">أقسام المستشفى ورموز QR المخصصة</h2>
              <p className="text-xs text-slate-500">
                كل قسم يمتلك رمز QR مستقل يفتح نموذج طلب النظافة مع تحديد القسم تلقائياً.
              </p>
            </div>
            <div className="flex items-center gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة جميع الرموز</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDeptModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة قسم جديد</span>
              </button>
            </div>
          </div>

          <DepartmentQRGrid
            departments={departments}
            onOpenForm={onOpenDeptForm}
            showAdminToggle={true}
            onToggleDeptActive={handleToggleDeptActive}
          />
        </div>
      )}

      {/* TAB 3: Worker Shifts */}
      {subTab === 'shifts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 h-fit">
            <h2 className="text-base font-bold text-slate-900 mb-4">تسجيل وردية عامل</h2>
            {workerUsers.length === 0 ? (
              <p className="text-sm text-slate-500">يرجى إضافة عمال نظافة أولاً من تبويب الموظفين.</p>
            ) : (
              <form onSubmit={handleRecordShift} className="space-y-4">
                <div>
                  <label htmlFor="sh-worker" className="block text-xs font-semibold text-slate-700 mb-1">
                    عامل النظافة
                  </label>
                  <select
                    id="sh-worker"
                    value={shiftWorkerId}
                    onChange={(e) => {
                      const nextWorkerId = e.target.value;
                      setShiftWorkerId(nextWorkerId);
                      setShiftPhone(workerUsers.find((worker) => worker.id === nextWorkerId)?.phone || '');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {workerUsers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.workerStatus})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sh-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    رقم هاتف التواصل لهذه الوردية (واتساب)
                  </label>
                  <input
                    id="sh-phone"
                    type="tel"
                    dir="ltr"
                    value={shiftPhone}
                    onChange={(e) => setShiftPhone(e.target.value)}
                    placeholder="مثال: 9705XXXXXXXX"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">يمكن تغييره مع كل وردية. عند الحفظ يصبح هذا رقم التواصل الحالي للعامل.</p>
                </div>

                <div>
                  <label htmlFor="sh-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    تاريخ الوردية
                  </label>
                  <input
                    id="sh-date"
                    type="date"
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="sh-type" className="block text-xs font-semibold text-slate-700 mb-1">
                    فترة الوردية
                  </label>
                  <select
                    id="sh-type"
                    value={shiftType}
                    onChange={(e) => setShiftType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {SHIFT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sh-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    حالة الحضور
                  </label>
                  <select
                    id="sh-status"
                    value={shiftStatus}
                    onChange={(e) => setShiftStatus(e.target.value as 'نشط' | 'غائب' | 'مكتمل')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="نشط">نشط (حاضر)</option>
                    <option value="غائب">غائب</option>
                    <option value="مكتمل">مكتمل</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sh-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                    ملاحظات (اختياري)
                  </label>
                  <input
                    id="sh-notes"
                    type="text"
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="مثال: تغطية إضافية لقسم الطوارئ"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingShift}
                  className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingShift ? 'جاري الحفظ...' : 'تسجيل الوردية وتحديث الحالة'}
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">سجل الورديات المسجلة</h3>
            </div>
            {shifts.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">لا توجد ورديات مسجلة بعد.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">العامل</th>
                      <th className="px-4 py-3">الوردية</th>
                      <th className="px-4 py-3">رقم الهاتف</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">سجلت بواسطة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shifts.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">{s.shiftDate}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{s.workerName}</td>
                        <td className="px-4 py-3 text-xs text-slate-700">{s.shiftType}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600" dir="ltr">{s.phone || '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold">
                          <span
                            className={
                              s.status === 'غائب'
                                ? 'text-red-700'
                                : s.status === 'نشط'
                                  ? 'text-emerald-700'
                                  : 'text-slate-600'
                            }
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{s.recordedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Audit Log */}
      {subTab === 'audit' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">سجل التدقيق والعمليات الحساسة</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">التاريخ والوقت</th>
                  <th className="px-4 py-3">المستخدم المسؤول</th>
                  <th className="px-4 py-3">الإجراء</th>
                  <th className="px-4 py-3">المرجع</th>
                  <th className="px-4 py-3">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatArabicDateTime(l.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">{l.actorName}</td>
                    <td className="px-4 py-3 text-xs font-medium text-teal-800">{l.action}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{l.entityId}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{l.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingUser ? `تعديل حساب: ${editingUser.name}` : 'إضافة حساب مستخدم جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                  <label htmlFor="u-role" className="block text-xs font-semibold text-slate-700 mb-1">
                    الدور الوظيفي
                  </label>
                  <select
                    id="u-role"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="worker">عامل نظافة</option>
                    <option value="supervisor">مشرف خدمات النظافة</option>
                    <option value="admin">مدير النظام</option>
                  </select>
                </div>

              <div>
                <label htmlFor="u-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  الاسم الكامل
                </label>
                <input
                  id="u-name"
                  type="text"
                  required
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                  <label htmlFor="u-username" className="block text-xs font-semibold text-slate-700 mb-1">
                    اسم المستخدم (بالإنجليزية)
                  </label>
                  <input
                    id="u-username"
                    type="text"
                    required
                    dir="ltr"
                    value={uUsername}
                    onChange={(e) => setUUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>

              <div>
                <label htmlFor="u-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                  رقم الجوال بصيغة دولية للواتساب (مثال: 9665XXXXXXXX)
                </label>
                <input
                  id="u-phone"
                  type="tel"
                  dir="ltr"
                  value={uPhone}
                  onChange={(e) => setUPhone(e.target.value)}
                  placeholder="966500000000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>

              {uRole === 'worker' && (
                <div>
                  <label htmlFor="u-shift" className="block text-xs font-semibold text-slate-700 mb-1">
                    الوردية الأساسية
                  </label>
                  <select
                    id="u-shift"
                    value={uShift}
                    onChange={(e) => setUShift(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {SHIFT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="u-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingUser ? 'كلمة مرور جديدة (اتركه فارغاً للإبقاء على الحالية)' : 'كلمة المرور (8 أحرف فأكثر)'}
                </label>
                <input
                  id="u-pass"
                  type="password"
                  required={!editingUser}
                  minLength={editingUser ? undefined : 8}
                  dir="ltr"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {editingUser && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={uIsActive}
                    onChange={(e) => setUIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>الحساب مفعل</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingUser ? 'جاري الحفظ...' : 'حفظ الحساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-700" />
                <h3 className="text-base font-bold text-slate-900">إضافة قسم مستشفى جديد</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDept} className="space-y-4">
              <div>
                <label htmlFor="d-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم القسم
                </label>
                <input
                  id="d-name"
                  type="text"
                  required
                  value={dName}
                  onChange={(e) => setDName(e.target.value)}
                  placeholder="مثال: وحدة غسيل الكلى"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="d-floor" className="block text-xs font-semibold text-slate-700 mb-1">
                  الطابق أو الجناح
                </label>
                <input
                  id="d-floor"
                  type="text"
                  required
                  value={dFloor}
                  onChange={(e) => setDFloor(e.target.value)}
                  placeholder="مثال: الدور الأول - الجناح الشرقي"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="d-code" className="block text-xs font-semibold text-slate-700 mb-1">
                  رمز القسم بالإنجليزية (اختياري لرابط QR)
                </label>
                <input
                  id="d-code"
                  type="text"
                  dir="ltr"
                  value={dCode}
                  onChange={(e) => setDCode(e.target.value)}
                  placeholder="dialysis"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingDept}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingDept ? 'جاري الإضافة...' : 'إضافة القسم وتوليد QR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
