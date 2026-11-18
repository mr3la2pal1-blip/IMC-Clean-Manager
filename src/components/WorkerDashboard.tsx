import {CheckCheck, CheckCircle2, ClipboardCheck, PlayCircle, RefreshCw} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import type {AuthUser, CleaningRequest, RequestStatus} from '../types.ts';
import {
  InfectionControlWarning,
  PriorityLabel,
  StatusLabel,
  WorkerPresenceText,
} from './StatusIndicators.tsx';

interface WorkerDashboardProps {
  user: AuthUser;
  requests: CleaningRequest[];
  loading: boolean;
  onRefresh: () => void;
}

export const WorkerDashboard: React.FC<WorkerDashboardProps> = ({
  user,
  requests,
  loading,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'النشطة' | RequestStatus>('النشطة');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => requests.filter((r) => r.status === 'تم الإسناد' || r.status === 'قيد التنفيذ'),
    [requests],
  );
  const completedTasks = useMemo(
    () => requests.filter((r) => r.status === 'مكتمل'),
    [requests],
  );

  const visibleTasks = useMemo(() => {
    if (filter === 'النشطة') return activeTasks;
    return requests.filter((r) => r.status === filter);
  }, [requests, activeTasks, filter]);

  const handleWorkerAction = async (
    requestId: string,
    action: 'confirm_receipt' | 'start' | 'complete',
  ) => {
    setBusyId(requestId);
    setError(null);
    try {
      await api.workerAction(requestId, action);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Worker Summary Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>الوردية: {user.shiftName || 'غير محددة'}</span>
            <span aria-hidden="true">·</span>
            <WorkerPresenceText status={user.workerStatus} />
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">مهامي المسندة ({user.name})</h2>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-slate-500">مهام حالية</p>
            <p className="text-xl font-bold text-teal-700 tabular-nums">{activeTasks.length}</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <p className="text-xs text-slate-500">مهام منجزة</p>
            <p className="text-xl font-bold text-emerald-700 tabular-nums">
              {completedTasks.length}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['النشطة', 'تم الإسناد', 'قيد التنفيذ', 'مكتمل'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث المهام</span>
        </button>
      </div>

      {/* Assigned Tasks List */}
      {loading && requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          جاري تحميل مهامك...
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2">
          <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">لا توجد مهام في هذه القائمة حالياً</p>
          <p className="text-xs text-slate-500">ستظهر المهام المسندة إليك من المشرف فور إسنادها.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleTasks.map((task) => {
            const isBusy = busyId === task.id;
            return (
              <div
                key={task.id}
                className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">{task.id}</span>
                        <span aria-hidden="true">·</span>
                        <PriorityLabel priority={task.priority} />
                      </div>
                      <h3 className="mt-1 text-base font-bold text-slate-900">
                        {task.departmentName} — {task.roomOrLocation}
                      </h3>
                      {task.floorOrWing && (
                        <p className="text-xs text-slate-500">{task.floorOrWing}</p>
                      )}
                    </div>
                    <StatusLabel status={task.status} />
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm space-y-1">
                    <p className="font-semibold text-slate-800">{task.requestType}</p>
                    {task.description && (
                      <p className="text-xs text-slate-600 leading-relaxed">{task.description}</p>
                    )}
                  </div>

                  {task.isHighRisk && <InfectionControlWarning />}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 tabular-nums">
                    <span>أُسندت: {formatArabicDateTime(task.assignedAt)}</span>
                    {task.acknowledgedAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-teal-700 font-semibold inline-flex items-center gap-1">
                          <CheckCheck className="w-3.5 h-3.5" />
                          تم تأكيد الاستلام
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Touch-friendly (>= 44px) worker action controls */}
                {task.status !== 'مكتمل' && task.status !== 'ملغي' && (
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                    {!task.acknowledgedAt && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleWorkerAction(task.id, 'confirm_receipt')}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-60 transition-colors cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>تأكيد استلام المهمة</span>
                      </button>
                    )}

                    {task.status === 'تم الإسناد' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleWorkerAction(task.id, 'start')}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>بدء التنفيذ</span>
                      </button>
                    )}

                    {task.status === 'قيد التنفيذ' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleWorkerAction(task.id, 'complete')}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>إتمام المهمة</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
