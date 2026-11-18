import {Check, Copy, ExternalLink, Pencil, Printer, X} from 'lucide-react';
import QRCode from 'qrcode';
import React, {useEffect, useState} from 'react';
import type {Department} from '../types.ts';

interface QRCodeBoxProps {
  department: Department;
  baseUrl?: string;
  onOpenForm?: (deptId: string) => void;
  showAdminRename?: boolean;
  onRenameDepartment?: (dept: Department, name: string) => Promise<void>;
  onUpdateDepartmentLocation?: (dept: Department, location: string) => Promise<void>;
}

export const QRCodeBox: React.FC<QRCodeBoxProps> = ({department, baseUrl, onOpenForm, showAdminRename = false, onRenameDepartment, onUpdateDepartmentLocation}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(department.name);
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationValue, setLocationValue] = useState(department.floorOrWing || '');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');

  const effectiveOrigin =
    (baseUrl && baseUrl.trim().replace(/\/+$/, '')) ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const targetUrl = `${effectiveOrigin}/?dept=${encodeURIComponent(department.id)}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(targetUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [targetUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };


  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {editingName ? (
                <form className="flex min-w-0 flex-wrap items-center gap-1.5" onSubmit={async (event) => {
                  event.preventDefault();
                  const nextName = nameValue.trim();
                  if (nextName.length < 2) { setRenameError('اسم القسم يجب أن يتكون من حرفين على الأقل.'); return; }
                  if (!onRenameDepartment) return;
                  setSavingName(true);
                  setRenameError('');
                  try {
                    await onRenameDepartment(department, nextName);
                    setEditingName(false);
                  } catch (error) {
                    setRenameError(error instanceof Error ? error.message : 'تعذر تعديل اسم القسم.');
                  } finally {
                    setSavingName(false);
                  }
                }}>
                  <input autoFocus value={nameValue} maxLength={100} onChange={(event) => setNameValue(event.target.value)} aria-label="اسم القسم الجديد" className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                  <button type="submit" disabled={savingName} className="rounded-md bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">حفظ</button>
                  <button type="button" disabled={savingName} onClick={() => {setEditingName(false);setNameValue(department.name);setRenameError('');}} title="إلغاء التعديل" className="rounded-md border border-slate-300 p-1 text-slate-600 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
                </form>
              ) : (
                <>
                  <h3 className="text-base font-bold text-slate-900">{department.name}</h3>
                  {showAdminRename && onRenameDepartment && <button type="button" onClick={() => {setNameValue(department.name);setRenameError('');setEditingName(true);}} className="inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50"><Pencil className="h-3 w-3" /> تعديل</button>}
                </>
              )}
            </div>
            {renameError && <p className="mt-1 text-xs text-red-600">{renameError}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {editingLocation ? (
                <form className="flex min-w-0 flex-wrap items-center gap-1.5" onSubmit={async (event) => {
                  event.preventDefault();
                  const nextLocation = locationValue.trim();
                  if (!nextLocation) { setLocationError('يرجى إدخال عنوان القسم.'); return; }
                  if (!onUpdateDepartmentLocation) return;
                  setSavingLocation(true);
                  setLocationError('');
                  try {
                    await onUpdateDepartmentLocation(department, nextLocation);
                    setEditingLocation(false);
                  } catch (error) {
                    setLocationError(error instanceof Error ? error.message : 'تعذر تعديل عنوان القسم.');
                  } finally {
                    setSavingLocation(false);
                  }
                }}>
                  <input autoFocus value={locationValue} maxLength={120} onChange={(event) => setLocationValue(event.target.value)} aria-label="عنوان القسم الجديد" placeholder="مثال: الطابق الثاني - جناح B" className="w-48 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                  <button type="submit" disabled={savingLocation} className="rounded-md bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">حفظ</button>
                  <button type="button" disabled={savingLocation} onClick={() => {setEditingLocation(false);setLocationValue(department.floorOrWing || '');setLocationError('');}} title="إلغاء التعديل" className="rounded-md border border-slate-300 p-1 text-slate-600 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
                </form>
              ) : (
                <>
                  <p className="text-xs text-slate-500">{department.floorOrWing || 'العنوان غير محدد'}</p>
                  {showAdminRename && onUpdateDepartmentLocation && <button type="button" onClick={() => {setLocationValue(department.floorOrWing || '');setLocationError('');setEditingLocation(true);}} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil className="h-3 w-3" /> تعديل العنوان</button>}
                </>
              )}
              <span className="text-xs text-slate-400">· رمز القسم: <span className="font-mono text-slate-700">{department.id}</span></span>
            </div>
            {locationError && <p className="mt-1 text-xs text-red-600">{locationError}</p>}
          </div>
          <span
            className={`text-xs font-semibold ${
              department.isActive ? 'text-emerald-700' : 'text-slate-400'
            }`}
          >
            {department.isActive ? 'مفعل' : 'معطل'}
          </span>
        </div>

        <div className="my-4 flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-4">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={`رمز QR لقسم ${department.name}`}
              className="h-44 w-44 rounded-md bg-white p-2 border border-slate-200"
            />
          ) : (
            <div className="h-44 w-44 flex items-center justify-center text-xs text-slate-400">
              جاري توليد الرمز...
            </div>
          )}
          <p className="mt-2.5 text-[11px] font-mono text-slate-500 truncate max-w-full" dir="ltr">
            {targetUrl}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 no-print">
        {onOpenForm && (
          <button
            type="button"
            onClick={() => onOpenForm(department.id)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>معاينة النموذج</span>
          </button>
        )}
        {dataUrl && (
          <a
            href={dataUrl}
            download={`QR-${department.id}.png`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>تنزيل PNG</span>
          </a>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
        </button>
      </div>
    </div>
  );
};
