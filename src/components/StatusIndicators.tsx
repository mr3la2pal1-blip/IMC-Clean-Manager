import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  PlayCircle,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import React from 'react';
import type {RequestPriority, RequestStatus, WorkerStatus} from '../types.ts';

export const StatusLabel: React.FC<{status: RequestStatus}> = ({status}) => {
  switch (status) {
    case 'جديد':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>جديد</span>
        </span>
      );
    case 'تم الإسناد':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5 shrink-0" />
          <span>تم الإسناد</span>
        </span>
      );
    case 'قيد التنفيذ':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 whitespace-nowrap">
          <PlayCircle className="w-3.5 h-3.5 shrink-0" />
          <span>قيد التنفيذ</span>
        </span>
      );
    case 'مكتمل':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>مكتمل</span>
        </span>
      );
    case 'ملغي':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>ملغي</span>
        </span>
      );
  }
};

export const PriorityLabel: React.FC<{priority: RequestPriority}> = ({priority}) => {
  switch (priority) {
    case 'عاجل':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 whitespace-nowrap">
          <Flame className="w-3.5 h-3.5 shrink-0" />
          <span>عاجل</span>
        </span>
      );
    case 'عالي':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>عالي</span>
        </span>
      );
    case 'عادي':
      return <span className="text-xs font-medium text-slate-600 whitespace-nowrap">عادي</span>;
  }
};

export const WorkerPresenceText: React.FC<{status: WorkerStatus | null}> = ({status}) => {
  if (!status) return null;
  if (status === 'غائب') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>غائب</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      <span>نشط</span>
    </span>
  );
};

export const InfectionControlWarning: React.FC<{compact?: boolean}> = ({compact = false}) => {
  if (compact) {
    return (
      <div className="mt-1.5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
        <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
        <span>
          خطورة عالية (دم/سوائل/عزل): يجب تطبيق بروتوكول مكافحة العدوى المعتمد والتصعيد الفوري.
        </span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
    >
      <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
      <div className="space-y-1 text-sm">
        <p className="font-bold text-red-900">
          تحذير سلامة ومكافحة عدوى — تصعيد فوري مطلوب
        </p>
        <p className="text-red-800 leading-relaxed">
          الطلبات التي تتضمن دماً أو سوائل جسم أو تلوثاً عالي الخطورة تتطلب اتباع بروتوكول مكافحة
          العدوى المعتمد في المستشفى والتصعيد الفوري للمشرف المختص. يُمنع التعامل معها كنظافة
          روتينية أو البدء دون معدات الوقاية الشخصية المعتمدة.
        </p>
      </div>
    </div>
  );
};
