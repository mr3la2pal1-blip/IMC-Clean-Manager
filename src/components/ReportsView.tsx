import {AlertCircle, Download, Info, Printer} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import type {ReportData} from '../types.ts';
import {PriorityLabel, StatusLabel, WorkerPresenceText} from './StatusIndicators.tsx';

export const ReportsView: React.FC = () => {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getReports(period, date)
      .then((res) => {
        if (active) setReport(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'تعذر تحميل التقرير');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, date]);

  const handleExportCsv = () => {
    if (!report) return;
    const rows: string[][] = [
      ['تقرير خدمات النظافة - IMC Clean Manager'],
      ['الفترة', period === 'daily' ? 'يومي' : 'أسبوعي', report.startDate, report.endDate],
      [],
      ['القسم', 'إجمالي الطلبات', 'المكتملة', 'المعلقة', 'عالية الخطورة'],
      ...report.byDepartment.map((d) => [
        d.departmentName,
        String(d.total),
        String(d.completed),
        String(d.pending),
        String(d.highRisk),
      ]),
      [],
      ['العامل', 'الحالة', 'الوردية', 'المهام المنجزة', 'المهام الجارية', 'مهام عالية الخطورة'],
      ...report.byWorker.map((w) => [
        w.workerName,
        w.workerStatus,
        w.shiftName || 'غير محددة',
        String(w.completedCount),
        String(w.activeCount),
        String(w.highRiskHandled),
      ]),
    ];

    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `IMC-Clean-Report-${period}-${report.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setPeriod('daily')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                period === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              التقرير اليومي
            </button>
            <button
              type="button"
              onClick={() => setPeriod('weekly')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                period === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              التقرير الأسبوعي
            </button>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="تاريخ التقرير"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تصدير CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading || !report ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          جاري إعداد بيانات التقرير...
        </div>
      ) : (
        <>
          {/* Period Summary & Response Times */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                ملخص الأداء التشغيلي ({report.period === 'daily' ? 'يومي' : 'أسبوعي'})
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                الفترة: {report.startDate} إلى {report.endDate}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              <div>
                <p className="text-xs text-slate-500">إجمالي الطلبات</p>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {report.summary.totalRequests}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">المكتملة</p>
                <p className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
                  {report.summary.completedRequests}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">المعلقة / الجارية</p>
                <p className="mt-1 text-xl font-bold text-amber-700 tabular-nums">
                  {report.summary.pendingRequests}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">عالية الخطورة</p>
                <p className="mt-1 text-xl font-bold text-red-700 tabular-nums">
                  {report.summary.highRiskRequests}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">متوسط زمن الإسناد</p>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {report.summary.avgAssignmentMinutes !== null
                    ? `${report.summary.avgAssignmentMinutes} د`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">متوسط زمن البدء</p>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {report.summary.avgStartMinutes !== null
                    ? `${report.summary.avgStartMinutes} د`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">متوسط زمن الإتمام</p>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {report.summary.avgCompletionMinutes !== null
                    ? `${report.summary.avgCompletionMinutes} د`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Requests by Department */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">الطلبات حسب القسم</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">القسم</th>
                      <th className="px-4 py-3">الإجمالي</th>
                      <th className="px-4 py-3">المكتمل</th>
                      <th className="px-4 py-3">المعلق</th>
                      <th className="px-4 py-3">عالي الخطورة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byDepartment.map((d) => (
                      <tr key={d.departmentId}>
                        <td className="px-4 py-3 font-medium text-slate-900">{d.departmentName}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold">{d.total}</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-700">{d.completed}</td>
                        <td className="px-4 py-3 tabular-nums text-amber-700">{d.pending}</td>
                        <td className="px-4 py-3 tabular-nums text-red-700">{d.highRisk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tasks Completed by Worker */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 space-y-2">
                <h3 className="text-base font-bold text-slate-900">المهام المنجزة لكل عامل</h3>
                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <span>
                    ملاحظة حوكمة الأداء: لا يتم تقييم عمال النظافة بناءً على سرعة الإنجاز فقط، بل
                    يُراعى جودة التطهير، والالتزام ببروتوكول مكافحة العدوى في المهام عالية الخطورة،
                    وتوازن عبء العمل.
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">العامل</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">المنجزة</th>
                      <th className="px-4 py-3">الجارية</th>
                      <th className="px-4 py-3">عالية الخطورة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.byWorker.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-500">
                          لا يوجد عمال نظافة مسجلون بعد.
                        </td>
                      </tr>
                    ) : (
                      report.byWorker.map((w) => (
                        <tr key={w.workerId}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{w.workerName}</div>
                            <div className="text-xs text-slate-500">{w.shiftName || '—'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <WorkerPresenceText status={w.workerStatus} />
                          </td>
                          <td className="px-4 py-3 tabular-nums font-semibold text-emerald-700">
                            {w.completedCount}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-amber-700">{w.activeCount}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-700">
                            {w.highRiskHandled}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Pending and Delayed Requests */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">الطلبات المعلقة والمتأخرة حالياً</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                الإجمالي المفتوح: {report.pendingAndDelayed.length}
              </span>
            </div>
            {report.pendingAndDelayed.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                لا توجد طلبات معلقة أو متأخرة في الوقت الحالي.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">رقم الطلب</th>
                      <th className="px-4 py-3">القسم والموقع</th>
                      <th className="px-4 py-3">الأولوية</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">العامل</th>
                      <th className="px-4 py-3">المدة المنقضية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.pendingAndDelayed.map((item) => (
                      <tr key={item.id} className={item.isDelayed ? 'bg-red-50/40' : ''}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          {item.id}
                          <div className="font-sans text-[11px] font-normal text-slate-500 tabular-nums">
                            {formatArabicDateTime(item.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{item.departmentName}</div>
                          <div className="text-xs text-slate-500">{item.roomOrLocation}</div>
                        </td>
                        <td className="px-4 py-3">
                          <PriorityLabel priority={item.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusLabel status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {item.assignedWorkerName || 'غير مسند'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums">
                            {item.isDelayed && (
                              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            )}
                            <span className={item.isDelayed ? 'text-red-700' : 'text-slate-700'}>
                              {item.elapsedMinutes} دقيقة {item.isDelayed ? '(متأخر)' : ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
