import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Lock,
  QrCode,
  Send,
} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import {
  CLEANING_REQUEST_TYPES,
  REQUEST_PRIORITIES,
  detectHighRisk,
} from '../constants.ts';
import type {CleaningRequest, Department, RequestPriority} from '../types.ts';
import {InfectionControlWarning} from './StatusIndicators.tsx';

interface CleaningRequestFormProps {
  initialDeptId?: string | null;
  isAuthenticated: boolean;
  onSuccess?: (request: CleaningRequest) => void;
  onBack?: () => void;
}

export const CleaningRequestForm: React.FC<CleaningRequestFormProps> = ({
  initialDeptId,
  isAuthenticated,
  onSuccess,
  onBack,
}) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [departmentId, setDepartmentId] = useState(initialDeptId || '');
  const [roomOrLocation, setRoomOrLocation] = useState('');
  const [selectedRequestTypes, setSelectedRequestTypes] = useState<string[]>([CLEANING_REQUEST_TYPES[0].value]);
  const [priority, setPriority] = useState<RequestPriority>('عادي');
  const [description, setDescription] = useState('');
  const [explicitHighRisk, setExplicitHighRisk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<CleaningRequest | null>(null);
  const [nowClock, setNowClock] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date().toISOString()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingDepts(true);
    api
      .getPublicDepartments()
      .then((res) => {
        if (!active) return;
        setDepartments(res.departments);
        if (initialDeptId && res.departments.some((d) => d.id === initialDeptId)) {
          setDepartmentId(initialDeptId);
        } else if (!departmentId && res.departments.length > 0) {
          setDepartmentId(res.departments[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'تعذر تحميل الأقسام');
      })
      .finally(() => {
        if (active) setLoadingDepts(false);
      });
    return () => {
      active = false;
    };
  }, [initialDeptId]);

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === departmentId) || null,
    [departments, departmentId],
  );

  const isHighRisk = useMemo(
    () => selectedRequestTypes.some((type) => detectHighRisk(type, description, explicitHighRisk)),
    [selectedRequestTypes, description, explicitHighRisk],
  );

  useEffect(() => {
    if (isHighRisk && priority === 'عادي') {
      setPriority('عاجل');
    }
  }, [isHighRisk]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!departmentId || !roomOrLocation.trim() || selectedRequestTypes.length === 0) {
      setError('يرجى تحديد القسم والغرفة أو الموقع واختيار احتياج واحد على الأقل.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        departmentId,
        roomOrLocation: roomOrLocation.trim(),
        requestType: selectedRequestTypes.join('؛ '),
        priority,
        description: description.trim(),
        isHighRisk,
      };
      const res = isAuthenticated
        ? await api.createRequest(payload)
        : await api.submitPublicRequest(payload);
      setSubmittedRequest(res.request);
      onSuccess?.(res.request);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmittedRequest(null);
    setRoomOrLocation('');
    setSelectedRequestTypes([CLEANING_REQUEST_TYPES[0].value]);
    setPriority('عادي');
    setDescription('');
    setExplicitHighRisk(false);
    setError(null);
  };

  if (submittedRequest) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">تم تسجيل طلب النظافة بنجاح</h2>
            <p className="text-sm text-slate-600">
              رقم الطلب:{' '}
              <span className="font-mono font-semibold text-slate-900">{submittedRequest.id}</span>{' '}
              · الحالة الحالية: <span className="font-semibold text-sky-700">{submittedRequest.status}</span>
            </p>
          </div>
        </div>

        {submittedRequest.isHighRisk && (
          <div className="mt-5">
            <InfectionControlWarning />
          </div>
        )}

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500">القسم</dt>
            <dd className="font-semibold text-slate-900 mt-0.5">{submittedRequest.departmentName}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">الغرفة / الموقع</dt>
            <dd className="font-semibold text-slate-900 mt-0.5">{submittedRequest.roomOrLocation}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">نوع الطلب</dt>
            <dd className="font-semibold text-slate-900 mt-0.5">{submittedRequest.requestType}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">تاريخ ووقت الإنشاء</dt>
            <dd className="font-semibold text-slate-900 tabular-nums mt-0.5">
              {formatArabicDateTime(submittedRequest.createdAt)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>إرسال طلب جديد</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-700">
            <QrCode className="w-4 h-4" />
            <span>نموذج طلب خدمات النظافة</span>
            {initialDeptId && selectedDept && (
              <>
                <span aria-hidden="true">·</span>
                <span>تم التحديد تلقائياً عبر رمز QR</span>
              </>
            )}
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {selectedDept ? selectedDept.name : 'تقديم طلب نظافة جديد'}
          </h2>
          {selectedDept && (
            <p className="mt-0.5 text-xs text-slate-500">{selectedDept.floorOrWing}</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>{formatArabicDateTime(nowClock)}</span>
        </div>
      </div>

      {/* Mandatory Privacy Policy Warning */}
      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
        <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <span>
          <strong className="font-semibold text-slate-900">تنبيه خصوصية البيانات:</strong> يُمنع منعاً
          باتاً إدخال أسماء المرضى أو أرقام الملفات الطبية أو التشخيصات أو أي معلومات صحية في هذا
          النموذج.
        </span>
      </div>

      {loadingDepts ? (
        <div className="py-12 text-center text-sm text-slate-500">جاري تحميل بيانات الأقسام...</div>
      ) : departments.length === 0 ? (
        <div className="my-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          لا توجد أقسام مفعلة في النظام حالياً. يرجى قيام مدير النظام بإضافة أقسام المستشفى أولاً.
        </div>
      ) : (
        <>
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="req-dept" className="block text-sm font-semibold text-slate-800 mb-1.5">
              اسم القسم <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="req-dept"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.floorOrWing})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="req-room" className="block text-sm font-semibold text-slate-800 mb-1.5">
              رقم الغرفة أو الموقع الدقيق <span className="text-red-600">*</span>
            </label>
            <input
              id="req-room"
              type="text"
              required
              maxLength={120}
              value={roomOrLocation}
              onChange={(e) => setRoomOrLocation(e.target.value)}
              placeholder="مثال: غرفة 204، سرير رقم 2، أو ممر الاستقبال الشرقي"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
            <div className="mb-3">
              <h3 className="text-base font-bold text-slate-900">ماذا تريد من فريق النظافة؟</h3>
              <p className="mt-1 text-xs text-slate-600">اختر خدمة واحدة أو أكثر، ويمكنك تحديد عدة احتياجات في نفس الطلب.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {CLEANING_REQUEST_TYPES.map((opt) => {
                const checked = selectedRequestTypes.includes(opt.value);
                return (
                  <label key={opt.value} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${checked ? 'border-teal-600 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSelectedRequestTypes((current) =>
                        e.target.checked
                          ? [...current, opt.value]
                          : current.filter((value) => value !== opt.value)
                      )}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="text-sm font-medium leading-5 text-slate-800">{opt.label}</span>
                    {opt.isHighRisk && <span className="mr-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">احتياج خاص</span>}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">الاختيارات المحددة: {selectedRequestTypes.length}</p>
          </section>

          <div>
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">
              الأولوية <span className="text-red-600">*</span>
            </span>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
              {REQUEST_PRIORITIES.map((p) => {
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-md py-2 text-sm font-semibold transition-colors cursor-pointer ${
                      active
                        ? p === 'عاجل'
                          ? 'bg-red-700 text-white shadow-sm'
                          : p === 'عالي'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={explicitHighRisk}
              onChange={(e) => setExplicitHighRisk(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
            />
            <span className="text-sm text-slate-800">
              يحتوي الموقع على دم أو سوائل جسم أو تلوث بيولوجي عالي الخطورة
            </span>
          </label>

          {isHighRisk && <InfectionControlWarning />}

          <div>
            <label htmlFor="req-desc" className="block text-sm font-semibold text-slate-800 mb-1.5">
              وصف مختصر (دون أي معلومات عن المريض)
            </label>
            <textarea
              id="req-desc"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب تفاصيل الموقع أو نوع الانسكاب أو المعدات المطلوبة باختصار..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة</span>
              </button>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'جاري إرسال الطلب...' : 'إرسال طلب النظافة'}</span>
            </button>
          </div>
        </form>
        </>
      )}
    </div>
  );
};
