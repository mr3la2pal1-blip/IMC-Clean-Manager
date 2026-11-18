import {ArrowLeftRight, CheckCircle2, RefreshCw} from 'lucide-react';
import React, {useCallback, useEffect, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import type {ShiftHandoverRecord, WorkerSummary} from '../types.ts';

export const ShiftHandoversView: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [records, setRecords] = useState<ShiftHandoverRecord[]>([]);
  const [fromWorkerId, setFromWorkerId] = useState('');
  const [toWorkerId, setToWorkerId] = useState('');
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState('صباحية');
  const [outgoingNotes, setOutgoingNotes] = useState('');
  const [incomingNotes, setIncomingNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [workerRes, handoverRes] = await Promise.all([api.getWorkers(), api.getHandovers()]);
    setWorkers(workerRes.workers.filter(w => w.isActive));
    setRecords(handoverRes.handovers);
  }, []);

  useEffect(() => { refresh().catch(e => setError(e instanceof Error ? e.message : 'تعذر تحميل السجل')); }, [refresh]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api.createHandover({fromWorkerId,toWorkerId,shiftDate,shiftType,outgoingNotes});
      setOutgoingNotes(''); setNotice('تم تسجيل التسليم، وبقي تأكيد استلام العامل التالي.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل التسليم'); }
    finally { setBusy(false); }
  };

  const confirm = async (id: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.confirmHandover(id, incomingNotes[id] || '');
      setNotice('تم تأكيد استلام الوردية بنجاح.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تأكيد الاستلام'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6" dir="rtl">
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700"><ArrowLeftRight className="h-5 w-5"/></div>
        <div><h2 className="font-bold text-slate-900">تسجيل تسليم وردية جديدة</h2>
          <p className="text-xs text-slate-500">يسجل الإدارة أو المشرف التسليم نيابةً عن العمال؛ لا يحتاج العامل إلى استخدام التطبيق.</p></div>
      </div>
      <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-700">العامل الذي يسلّم
          <select required value={fromWorkerId} onChange={e=>setFromWorkerId(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 font-normal">
            <option value="">اختر العامل</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700">العامل الذي يستلم
          <select required value={toWorkerId} onChange={e=>setToWorkerId(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 font-normal">
            <option value="">اختر العامل</option>{workers.filter(w=>w.id!==fromWorkerId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700">تاريخ الوردية
          <input type="date" required value={shiftDate} onChange={e=>setShiftDate(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 font-normal"/>
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700">نوع الوردية
          <select value={shiftType} onChange={e=>setShiftType(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 font-normal">
            <option>صباحية</option><option>مسائية</option><option>ليلية</option><option>مناوبة إضافية</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">ملاحظات العامل الذي يسلّم
          <textarea rows={3} maxLength={1000} value={outgoingNotes} onChange={e=>setOutgoingNotes(e.target.value)} placeholder="الأعمال غير المنجزة، النواقص، الأعطال، المواد المطلوبة..." className="w-full rounded-lg border border-slate-300 p-3 font-normal"/>
        </label>
        <div className="sm:col-span-2"><button disabled={busy || !fromWorkerId || !toWorkerId || fromWorkerId===toWorkerId} className="min-h-11 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy?'جارٍ الحفظ...':'حفظ سجل التسليم'}</button></div>
      </form>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div><h2 className="font-bold text-slate-900">سجل تسليم واستلام الورديات</h2><p className="text-xs text-slate-500">آخر 200 عملية مسجلة</p></div>
        <button onClick={()=>refresh().catch(e=>setError(e.message))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><RefreshCw className="h-4 w-4"/>تحديث</button>
      </div>
      {records.length===0 ? <p className="p-8 text-center text-sm text-slate-500">لا توجد عمليات تسليم مسجلة بعد.</p> :
        <div className="divide-y divide-slate-100">{records.map(r=><article key={r.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-bold text-slate-900">{r.fromWorkerName} <span className="px-1 text-slate-400">←</span> {r.toWorkerName}</p>
              <p className="text-xs text-slate-500">{r.shiftDate} · {r.shiftType} · سجّلها: {r.recordedByName}</p></div>
            <span className={r.status==='تم الاستلام'?'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700':'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800'}>{r.status}</span>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-700">الطلبات التي بقيت مفتوحة عند التسليم: {r.pendingTasks.length}</p>
            {r.pendingTasks.length>0 && <ul className="mt-2 list-disc space-y-1 pr-5 text-xs text-slate-600">{r.pendingTasks.map(t=><li key={t.id}>{t.id} · {t.request_type} · {t.room_or_location} · {t.status}</li>)}</ul>}
            {r.outgoingNotes && <p className="mt-2 text-slate-700">ملاحظات التسليم: {r.outgoingNotes}</p>}
            {r.incomingNotes && <p className="mt-2 text-slate-700">ملاحظات الاستلام: {r.incomingNotes}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>وقت التسجيل: {formatArabicDateTime(r.createdAt)}{r.confirmedAt ? ' · تأكيد: ' + formatArabicDateTime(r.confirmedAt) : ''}</span>
            {r.status!=='تم الاستلام' && <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
              <input value={incomingNotes[r.id]||''} onChange={e=>setIncomingNotes(p=>({...p,[r.id]:e.target.value}))} placeholder="ملاحظات المستلم (اختياري)" className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"/>
              <button disabled={busy} onClick={()=>confirm(r.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>تأكيد الاستلام</button>
            </div>}
          </div>
        </article>)}</div>}
    </section>
  </div>;
};
