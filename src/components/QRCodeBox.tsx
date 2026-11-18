import {Check, Copy, ExternalLink, Printer} from 'lucide-react';
import QRCode from 'qrcode';
import React, {useEffect, useState} from 'react';
import type {Department} from '../types.ts';

interface QRCodeBoxProps {
  department: Department;
  baseUrl?: string;
  onOpenForm?: (deptId: string) => void;
}

export const QRCodeBox: React.FC<QRCodeBoxProps> = ({department, baseUrl, onOpenForm}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

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
          <div>
            <h3 className="text-base font-bold text-slate-900">{department.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {department.floorOrWing} · رمز القسم:{' '}
              <span className="font-mono text-slate-700">{department.id}</span>
            </p>
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
