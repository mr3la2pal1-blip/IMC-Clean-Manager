import {Download, Smartphone} from 'lucide-react';
import React from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, install} = usePWAInstall();

  return (
    <div className="flex items-center gap-2 shrink-0">
      <a
        href="/api/project-zip"
        download="IMC-Clean-Manager.zip"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
        title="تنزيل ملف المشروع بصيغة ZIP"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>تنزيل التطبيق (ZIP)</span>
      </a>

      {!isInstalled && isInstallable && (
        <button
          type="button"
          onClick={() => void install()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="تثبيت كتطبيق على الشاشة الرئيسية"
        >
          <Smartphone className="w-4 h-4 shrink-0 text-teal-700" />
          <span className="hidden sm:inline">تثبيت</span>
        </button>
      )}
    </div>
  );
};
