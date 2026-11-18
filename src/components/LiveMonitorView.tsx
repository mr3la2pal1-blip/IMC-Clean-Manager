import {Activity, AlertTriangle, Building2, CheckCircle2, Clock3, RefreshCw, Users} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import type {CleaningRequest, Department, NursingStatusReport, WorkerSummary} from '../types.ts';

interface LiveMonitorViewProps {
  requests: CleaningRequest[];
  workers: WorkerSummary[];
  departments: Department[];
  loading: boolean;
  onRefresh: () => void;
}

const isOpen = (request: CleaningRequest) => request.status !== 'مكتمل' && request.status !== 'ملغي';

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  requests,
  workers,
  departments,
  loading,
  onRefresh,
}) => {
  const [nursingReports, setNursingReports] = useState<NursingStatusReport[]>([]);
  const [nursingReportsError, setNursingReportsError] = useState<string | null>(null);

  const loadNursingReports = async () => {
    try {
      const result = await api.getNursingStatusReports();
      setNursingReports(result.reports);
      setNursingReportsError(null);
    } catch (error) {
      setNursingReportsError(error instanceof Error ? error.message : 'تعذر تحميل بلاغات التمريض');
    }
  };

  useEffect(() => {
    void loadNursingReports();
  }, []);

  const metrics = useMemo(() => {
    const openRequests = requests.filter(isOpen);
    const urgent = openRequests.filter((request) => request.priority === 'عاجل' || request.priority === 'عالي');
    const delayed = openRequests.filter((request) => {
      const created = new Date(request.createdAt).getTime();
      return Number.isFinite(created) && Date.now() - created >= 60 * 60 * 1000;
    });
    const completed = requests.filter((request) => request.status === 'مكتمل');
    const activeWorkers = workers.filter((worker) => worker.isActive && worker.workerStatus === 'نشط');
    return {openRequests, urgent, delayed, completed, activeWorkers};
  }, [requests, workers]);

  const departmentRows = useMemo(() => departments.filter((department) => department.isActive).map((department) => {
    const related = requests.filter((request) => request.departmentId === department.id);
    const open = related.filter(isOpen);
    const urgent = open.some((request) => request.priority === 'عاجل');
    const inProgress = open.some((request) => request.status === 'قيد التنفيذ');
    const status = urgent ? 'عاجل' : inProgress ? 'قيد التنفيذ' : open.length ? 'بانتظار التنظيف' : 'لا توجد طلبات مفتوحة';
    return {department, related, open, status, urgent};
  }), [departments, requests]);

  const urgentRequests = metrics.urgent.slice(0, 8);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-bold text-slate-900">مركز المراقبة المباشرة</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">ملخص تشغيلي من الطلبات والعمال والأقسام المسجلة في النظام</p>
        </div>
        <button type="button" onClick={() => { onRefresh(); void loadNursingReports(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Metric icon={<Building2 className="h-5 w-5" />} label="الأقسام النشطة" value={departments.filter((item) => item.isActive).length} tone="slate" />
        <Metric icon={<Clock3 className="h-5 w-5" />} label="الطلبات المفتوحة" value={metrics.openRequests.length} tone="amber" />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="طلبات عالية الأولوية" value={metrics.urgent.length} tone="red" />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="الطلبات المكتملة" value={metrics.completed.length} tone="green" />
        <Metric icon={<Users className="h-5 w-5" />} label="العمال النشطون" value={metrics.activeWorkers.length} tone="teal" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">حالة الأقسام</h3>
            <p className="mt-1 text-xs text-slate-500">الحالة محسوبة من الطلبات المفتوحة المسجلة لكل قسم</p>
          </div>
          <span className="text-xs text-slate-500">{departmentRows.length} قسم</span>
        </div>
        {departmentRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد أقسام نشطة حالياً.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {departmentRows.map(({department, related, open, status, urgent}) => (
              <div key={department.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{department.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{department.floorOrWing}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${urgent ? 'bg-red-100 text-red-800' : open.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{status}</span>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-600">
                  <span>إجمالي الطلبات: <strong className="tabular-nums">{related.length}</strong></span>
                  <span>مفتوحة: <strong className="tabular-nums">{open.length}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">آخر بلاغات التمريض عبر QR</h3>
            <p className="mt-1 text-xs text-slate-500">آخر 100 بلاغ مسجل، مرتبة من الأحدث</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{nursingReports.length} بلاغ</span>
        </div>
        {nursingReportsError ? <p className="py-4 text-sm text-red-700">{nursingReportsError}</p> : nursingReports.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">لا توجد بلاغات تمريض مسجلة حتى الآن.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {nursingReports.slice(0, 12).map((report) => (
              <li key={report.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{report.departmentName} · {report.status}</p>
                  {report.location && <p className="mt-1 text-xs text-slate-600">الموقع: {report.location}</p>}
                  {report.note && <p className="mt-1 text-xs text-slate-500">ملاحظة: {report.note}</p>}
                </div>
                <time className="shrink-0 text-xs text-slate-400">{formatArabicDateTime(report.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-900">الطلبات العاجلة وعالية الأولوية</h3>
          <p className="mt-1 text-xs text-slate-500">تحتاج متابعة المشرف أو إعادة الإسناد عند الحاجة</p>
          {urgentRequests.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">لا توجد طلبات عالية الأولوية مفتوحة.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {urgentRequests.map((request) => (
                <li key={request.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{request.departmentName} · {request.roomOrLocation}</p>
                    <p className="mt-1 text-xs text-slate-500">{request.requestType} · {request.status} · {request.assignedWorkerName || 'غير مسند'}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{request.priority}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-900">المهام التي تجاوزت ساعة</h3>
          <p className="mt-1 text-xs text-slate-500">مؤشر تنبيهي حسب وقت إنشاء الطلب، وليس حكماً نهائياً على التأخير</p>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-amber-50 p-4">
            <AlertTriangle className="h-7 w-7 shrink-0 text-amber-700" />
            <div>
              <p className="text-2xl font-bold tabular-nums text-amber-900">{metrics.delayed.length}</p>
              <p className="text-xs text-amber-800">طلب مفتوح مضى على إنشائه 60 دقيقة أو أكثر</p>
            </div>
          </div>
          {metrics.delayed.length > 0 && (
            <ul className="mt-3 space-y-2">
              {metrics.delayed.slice(0, 5).map((request) => (
                <li key={request.id} className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">{request.departmentName} · {request.roomOrLocation}</span>
                  <span className="shrink-0 text-slate-500">{request.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-slate-400">هذه الشاشة تعرض بيانات النظام الحالية عند آخر تحديث. التحديث التلقائي والتنبيهات الفورية سيتم ربطهما في مرحلة مستقلة بعد إضافة آلية تحديث آمنة.</p>
    </div>
  );
};

const Metric: React.FC<{icon: React.ReactNode; label: string; value: number; tone: 'slate' | 'amber' | 'red' | 'green' | 'teal'}> = ({icon, label, value, tone}) => {
  const tones = {
    slate: 'bg-slate-50 text-slate-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800',
    green: 'bg-emerald-50 text-emerald-800',
    teal: 'bg-teal-50 text-teal-800',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={`mb-3 inline-flex rounded-lg p-2 ${tones[tone]}`}>{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
};
