import {AlertCircle, Award, FileText, Plus, RefreshCw} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {api, formatArabicDateTime} from '../api.ts';
import type {WorkerNoteRecord, WorkerSummary} from '../types.ts';

export const WorkerNotesView: React.FC<{workers: WorkerSummary[]}> = ({workers}) => {
  const [notes,setNotes] = useState<WorkerNoteRecord[]>([]);
  const [workerId,setWorkerId] = useState('');
  const [noteType,setNoteType] = useState<WorkerNoteRecord['noteType']>('ملاحظة');
  const [details,setDetails] = useState('');
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const load = async () => { setLoading(true); try { const r=await api.getWorkerNotes(); setNotes(r.notes); setError(''); } catch(e) { setError(e instanceof Error?e.message:'تعذر تحميل السجل'); } finally { setLoading(false); } };
  useEffect(()=>{void load();},[]);
  const submit = async (e:React.FormEvent) => { e.preventDefault(); if(!workerId || details.trim().length<3) return; setSaving(true); setError(''); try { await api.createWorkerNote({workerId,noteType,details:details.trim()}); setDetails(''); await load(); } catch(e) { setError(e instanceof Error?e.message:'تعذر حفظ الملاحظة'); } finally { setSaving(false); } };
  return <div className="space-y-5" dir="rtl">
    <div><h2 className="text-lg font-bold text-slate-900">سجل ملاحظات ومخالفات العاملين</h2><p className="mt-1 text-sm text-slate-500">توثيق التأخير والشكاوى والملاحظات والإشادات مع اسم من سجلها وتاريخها</p></div>
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 grid gap-3 md:grid-cols-2">
      <div><label className="mb-1 block text-xs font-semibold text-slate-700">العامل</label><select required value={workerId} onChange={e=>setWorkerId(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="">اختر العامل</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div><label className="mb-1 block text-xs font-semibold text-slate-700">نوع السجل</label><select value={noteType} onChange={e=>setNoteType(e.target.value as WorkerNoteRecord['noteType'])} className="w-full rounded-lg border border-slate-300 p-2 text-sm">{['تأخير','شكوى','ملاحظة','إشادة'].map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="md:col-span-2"><label className="mb-1 block text-xs font-semibold text-slate-700">التفاصيل</label><textarea required minLength={3} maxLength={1000} value={details} onChange={e=>setDetails(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="اكتب تفاصيل الملاحظة أو الشكوى..."/></div>
      <div className="md:col-span-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">يُحفظ السجل في ملف العامل وسجل التدقيق.</p><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{saving?'جارٍ الحفظ...':'حفظ الملاحظة'}</button></div>
    </form>
    {error&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">السجل السابق</h3><button onClick={()=>void load()} className="inline-flex items-center gap-1 text-xs text-slate-600"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')}/> تحديث</button></div>
      {notes.length===0?<p className="py-8 text-center text-sm text-slate-500">لا توجد ملاحظات مسجلة.</p>:<ul className="divide-y divide-slate-100">{notes.map(n=><li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="flex gap-2"><span className="mt-0.5 text-slate-500">{n.noteType==='إشادة'?<Award className="h-4 w-4"/>:n.noteType==='تأخير'||n.noteType==='شكوى'?<AlertCircle className="h-4 w-4"/>:<FileText className="h-4 w-4"/>}</span><div><p className="text-sm font-semibold text-slate-900">{n.workerName} · {n.noteType}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.details}</p><p className="mt-1 text-xs text-slate-400">سجلها: {n.createdByName}</p></div></div><time className="text-xs text-slate-400">{formatArabicDateTime(n.createdAt)}</time></li>)}</ul>}
    </section>
  </div>;
};
