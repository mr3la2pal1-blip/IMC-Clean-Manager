import {KeyRound, LogIn, QrCode, ShieldCheck, UserPlus} from 'lucide-react';
import React, {useState} from 'react';
import {api, setStoredToken} from '../api.ts';
import type {AuthUser} from '../types.ts';
import {PWAInstallButton} from './PWAInstallButton.tsx';

interface SetupAdminViewProps {
  onSetupComplete: (user: AuthUser) => void;
}

export const SetupAdminView: React.FC<SetupAdminViewProps> = ({onSetupComplete}) => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [seedDepartments, setSeedDepartments] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.bootstrapAdmin({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        seedDepartments,
      });
      setStoredToken(res.token);
      onSetupComplete(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إتمام التهيئة الأولية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4">
      <div className="mx-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700 text-white">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900" dir="ltr">
                IMC Clean Manager
              </h1>
              <p className="text-xs text-slate-500">التهيئة الأولية لحساب مدير النظام</p>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          مرحباً بك. لا يحتوي النظام على كلمات مرور افتراضية حفاظاً على الأمان. قم بإنشاء حساب
          مدير النظام الأول لتبدأ بإدارة الأقسام، وإنشاء حسابي المشرفين المستقلين، وإضافة عمال
          النظافة.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="setup-name" className="block text-sm font-semibold text-slate-800 mb-1">
              الاسم الكامل لمدير النظام
            </label>
            <input
              id="setup-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: م. أحمد العتيبي"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="setup-user" className="block text-sm font-semibold text-slate-800 mb-1">
                اسم المستخدم (بالإنجليزية)
              </label>
              <input
                id="setup-user"
                type="text"
                required
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
            <div>
              <label htmlFor="setup-phone" className="block text-sm font-semibold text-slate-800 mb-1">
                رقم الجوال (اختياري)
              </label>
              <input
                id="setup-phone"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9665XXXXXXXX"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="setup-pass" className="block text-sm font-semibold text-slate-800 mb-1">
                كلمة المرور (8 أحرف فأكثر)
              </label>
              <input
                id="setup-pass"
                type="password"
                required
                minLength={8}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
            <div>
              <label htmlFor="setup-confirm" className="block text-sm font-semibold text-slate-800 mb-1">
                تأكيد كلمة المرور
              </label>
              <input
                id="setup-confirm"
                type="password"
                required
                minLength={8}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={seedDepartments}
              onChange={(e) => setSeedDepartments(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              إنشاء أقسام المستشفى القياسية تلقائياً (الطوارئ، العناية المركزة، العمليات، المختبر،
              الأشعة، العيادات الخارجية، أجنحة التنويم) مع رموز QR جاهزة.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{loading ? 'جاري تهيئة النظام...' : 'إنشاء حساب المدير والدخول للنظام'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser) => void;
  onOpenPublicRequest: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({onLoginSuccess, onOpenPublicRequest}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(username.trim().toLowerCase(), password);
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4">
      <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700 text-white">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900" dir="ltr">
                IMC Clean Manager
              </h1>
              <p className="text-xs text-slate-500">نظام إدارة خدمات النظافة ومكافحة العدوى</p>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="block text-sm font-semibold text-slate-800 mb-1.5">
              اسم المستخدم
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              dir="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-semibold text-slate-800 mb-1.5">
              كلمة المرور
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'جاري التحقق...' : 'تسجيل الدخول'}</span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <button
            type="button"
            onClick={onOpenPublicRequest}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-teal-700" />
            <span>تقديم طلب نظافة لقسم (نموذج QR)</span>
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">
            لا يوجد تسجيل عام؛ يتم إنشاء حسابات المشرفين والعمال من قبل مدير النظام فقط.
          </p>
        </div>
      </div>
    </div>
  );
};
