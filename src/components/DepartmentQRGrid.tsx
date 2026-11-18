import {AlertTriangle, Check, Globe, Pencil, X} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import type {Department} from '../types.ts';
import {QRCodeBox} from './QRCodeBox.tsx';

interface DepartmentQRGridProps {
  departments: Department[];
  onOpenForm: (deptId: string) => void;
  showAdminToggle?: boolean;
  onToggleDeptActive?: (dept: Department) => void;
  onRenameDepartment?: (dept: Department, name: string) => Promise<void>;
  onUpdateDepartmentLocation?: (dept: Department, location: string) => Promise<void>;
}

export const DepartmentQRGrid: React.FC<DepartmentQRGridProps> = ({
  departments,
  onOpenForm,
  showAdminToggle = false,
  onToggleDeptActive,
  onRenameDepartment,
  onUpdateDepartmentLocation,
}) => {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isDevPreview =
    typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');
  const suggestedSharedOrigin = useMemo(
    () => (isDevPreview ? currentOrigin.replace('://ais-dev-', '://ais-pre-') : currentOrigin),
    [isDevPreview, currentOrigin],
  );

  const [qrBaseUrl, setQrBaseUrl] = useState<string>(currentOrigin);

  return (
    <div className="space-y-4">
      {isDevPreview && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 space-y-2.5 no-print">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">تنبيه مهم عند مسح رمز QR بكاميرا الهاتف</p>
              <p className="text-xs leading-relaxed text-amber-900">
                أنت تفتح التطبيق الآن عبر رابط المعاينة التطويري (<code dir="ltr">ais-dev-...</code>)
                وهو محمي بجلسة Google الخاصة بك. إذا مسح هاتف آخر هذا الرابط قبل النشر، سيظهر له
                رمز خطأ (401/403). قم بنشر التطبيق أولاً عبر زر <strong>Share / Deploy</strong> في
                أعلى AI Studio، ثم استخدم رابط المشاركة العام أدناه لتوليد وطباعة رموز QR.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setQrBaseUrl(suggestedSharedOrigin)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                qrBaseUrl === suggestedSharedOrigin
                  ? 'bg-amber-800 text-white'
                  : 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
              }`}
            >
              استخدام رابط النشر العام (ais-pre)
            </button>
            <button
              type="button"
              onClick={() => setQrBaseUrl(currentOrigin)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                qrBaseUrl === currentOrigin
                  ? 'bg-amber-800 text-white'
                  : 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
              }`}
            >
              استخدام رابط المعاينة الحالي
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Globe className="w-4 h-4 text-teal-700 shrink-0" />
          <span>الرابط الأساسي المضمّن داخل رموز QR:</span>
        </div>
        <input
          type="url"
          dir="ltr"
          value={qrBaseUrl}
          onChange={(e) => setQrBaseUrl(e.target.value)}
          className="flex-1 min-w-[260px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-teal-600 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((dept) => (
          <div key={dept.id} className="space-y-2">
            <QRCodeBox
              department={dept}
              baseUrl={qrBaseUrl}
              onOpenForm={onOpenForm}
              showAdminRename={showAdminToggle}
              onRenameDepartment={onRenameDepartment}
              onUpdateDepartmentLocation={onUpdateDepartmentLocation}
            />
            {showAdminToggle && onToggleDeptActive && (
              <div className="flex justify-end px-1 no-print">
                <button type="button" onClick={() => onToggleDeptActive(dept)} className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer">
                  {dept.isActive ? 'تعطيل القسم مؤقتاً' : 'إعادة تفعيل القسم'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
