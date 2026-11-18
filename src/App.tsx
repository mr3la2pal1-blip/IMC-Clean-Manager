import {
  Activity,
  BarChart3,
  ClipboardList,
  LogOut,
  Menu,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import React, {useCallback, useEffect, useState} from 'react';
import {api, setStoredToken} from './api.ts';
import {AdminManagementView} from './components/AdminManagementView.tsx';
import {LoginView, SetupAdminView} from './components/AuthViews.tsx';
import {LiveMonitorView} from './components/LiveMonitorView.tsx';
import {WorkerNotesView} from './components/WorkerNotesView.tsx';
import {CleaningRequestForm} from './components/CleaningRequestForm.tsx';
import {DepartmentQRGrid} from './components/DepartmentQRGrid.tsx';
import {OfflineIndicator} from './components/OfflineIndicator.tsx';
import {PWAInstallButton} from './components/PWAInstallButton.tsx';
import {ReportsView} from './components/ReportsView.tsx';
import {ShiftHandoversView} from './components/ShiftHandoversView.tsx';
import {SupervisorDashboard} from './components/SupervisorDashboard.tsx';
import {WorkerDashboard} from './components/WorkerDashboard.tsx';
import {ROLE_LABELS} from './constants.ts';
import type {AuthUser, CleaningRequest, Department, WorkerSummary} from './types.ts';

type ActiveSection = 'dashboard' | 'live-monitor' | 'reports' | 'admin' | 'qr-codes' | 'new-request' | 'handovers' | 'worker-notes';

function getDeptParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('dept');
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [publicDeptId, setPublicDeptId] = useState<string | null>(() => getDeptParamFromUrl());
  const [publicFormOpen, setPublicFormOpen] = useState<boolean>(() => Boolean(getDeptParamFromUrl()));

  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [requests, setRequests] = useState<CleaningRequest[]>([]);
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const loadWorkspaceData = useCallback(async (currentUser: AuthUser) => {
    setLoadingData(true);
    try {
      const reqRes = await api.getRequests();
      setRequests(reqRes.requests);

      if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
        const [workersRes, deptsRes] = await Promise.all([
          api.getWorkers(),
          api.getDepartments(),
        ]);
        setWorkers(workersRes.workers);
        setDepartments(deptsRes.departments);
      }
    } catch {
      // Handled by empty/auth state
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const status = await api.getSetupStatus();
        if (!active) return;
        if (status.needsSetup) {
          setNeedsSetup(true);
          setBooting(false);
          return;
        }

        try {
          const meRes = await api.me();
          if (!active) return;
          setUser(meRes.user);
          if (getDeptParamFromUrl()) {
            setActiveSection('new-request');
          }
          await loadWorkspaceData(meRes.user);
        } catch {
          if (active) setUser(null);
        }
      } finally {
        if (active) setBooting(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [loadWorkspaceData]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    setStoredToken(null);
    setUser(null);
    setRequests([]);
    setWorkers([]);
    setDepartments([]);
    setActiveSection('dashboard');
  };

  const handleOpenDeptForm = (deptId: string) => {
    setPublicDeptId(deptId);
    if (user) {
      setActiveSection('new-request');
    } else {
      setPublicFormOpen(true);
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="text-lg font-bold text-slate-900" dir="ltr">
            IMC Clean Manager
          </div>
          <p className="text-sm text-slate-500">جاري تحميل النظام...</p>
        </div>
      </div>
    );
  }

  // Initial setup takes priority when 0 users exist (unless scanning QR—still setup first)
  if (needsSetup) {
    return (
      <>
        <SetupAdminView
          onSetupComplete={(createdUser) => {
            setNeedsSetup(false);
            setUser(createdUser);
            setActiveSection('admin');
            loadWorkspaceData(createdUser);
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  // Public QR-code cleaning request view (unauthenticated ward staff scanning department QR)
  if (!user && publicFormOpen) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5">
          <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-base font-bold text-slate-900 whitespace-nowrap" dir="ltr">
                IMC Clean Manager
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => {
                  setPublicFormOpen(false);
                  if (window.location.search) {
                    window.history.replaceState({}, '', window.location.pathname);
                  }
                }}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                دخول الموظفين
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6 px-4">
          <CleaningRequestForm
            initialDeptId={publicDeptId}
            isAuthenticated={false}
            onBack={() => {
              setPublicFormOpen(false);
              if (window.location.search) {
                window.history.replaceState({}, '', window.location.pathname);
              }
            }}
          />
        </main>
        <OfflineIndicator />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView
          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setActiveSection('dashboard');
            loadWorkspaceData(loggedInUser);
          }}
          onOpenPublicRequest={() => {
            setPublicDeptId(null);
            setPublicFormOpen(true);
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  const navItems: Array<{id: ActiveSection; label: string; icon: React.ReactNode}> =
    user.role === 'worker'
      ? [{id: 'dashboard', label: 'مهامي المسندة', icon: <ClipboardList className="w-4 h-4" />}]
      : user.role === 'supervisor'
        ? [
            {id: 'dashboard', label: 'لوحة الطلبات', icon: <ClipboardList className="w-4 h-4" />},
            {id: 'reports', label: 'التقارير', icon: <BarChart3 className="w-4 h-4" />},
            {id: 'handovers', label: 'تسليم واستلام الورديات', icon: <ClipboardList className="w-4 h-4" />},
            {id: 'worker-notes', label: 'سجل ملاحظات العاملين', icon: <ClipboardList className="w-4 h-4" />},
            {id: 'qr-codes', label: 'رموز QR للأقسام', icon: <QrCode className="w-4 h-4" />},
            {id: 'new-request', label: 'طلب نظافة جديد', icon: <ShieldCheck className="w-4 h-4" />},
          ]
        : [
            {id: 'dashboard', label: 'لوحة الطلبات', icon: <ClipboardList className="w-4 h-4" />},
            {id: 'admin', label: 'إدارة الطاقم والأقسام', icon: <SlidersHorizontal className="w-4 h-4" />},
            {id: 'live-monitor', label: 'المراقبة المباشرة', icon: <Activity className="w-4 h-4" />},
            {id: 'reports', label: 'التقارير', icon: <BarChart3 className="w-4 h-4" />},
            {id: 'handovers', label: 'تسليم واستلام الورديات', icon: <ClipboardList className="w-4 h-4" />},
            {id: 'worker-notes', label: 'سجل ملاحظات العاملين', icon: <ClipboardList className="w-4 h-4" />},
            {id: 'new-request', label: 'نموذج طلب (QR)', icon: <QrCode className="w-4 h-4" />},
          ];

  const sectionTitle =
    navItems.find((item) => item.id === activeSection)?.label || 'لوحة التحكم';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-l lg:border-slate-200 lg:bg-white no-print">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-base font-bold text-slate-900 whitespace-nowrap" dir="ltr">
            IMC Clean Manager
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] bg-white border-l border-slate-200 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <span className="text-base font-bold text-slate-900" dir="ltr">
                  IMC Clean Manager
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold ${
                        active ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb/Title — Controls — Action */}
        <header className="border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5 no-print">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -mr-2 rounded-lg text-slate-700 hover:bg-slate-100"
                aria-label="فتح القائمة"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {sectionTitle}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <PWAInstallButton />
              <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
                {user.name} · {ROLE_LABELS[user.role]}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="lg:hidden inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeSection === 'new-request' ? (
            <CleaningRequestForm
              initialDeptId={publicDeptId}
              isAuthenticated={user.role !== 'worker'}
              onSuccess={() => loadWorkspaceData(user)}
              onBack={() => {
                setPublicDeptId(null);
                setActiveSection('dashboard');
                if (window.location.search) {
                  window.history.replaceState({}, '', window.location.pathname);
                }
              }}
            />
          ) : user.role === 'worker' ? (
            <WorkerDashboard
              user={user}
              requests={requests}
              loading={loadingData}
              onRefresh={() => loadWorkspaceData(user)}
            />
          ) : activeSection === 'dashboard' ? (
            <SupervisorDashboard
              requests={requests}
              workers={workers}
              departments={departments}
              loading={loadingData}
              onRefresh={() => loadWorkspaceData(user)}
              onNewRequest={() => {
                setPublicDeptId(null);
                setActiveSection('new-request');
              }}
            />
          ) : activeSection === 'live-monitor' && user.role === 'admin' ? (
            <LiveMonitorView requests={requests} workers={workers} departments={departments} loading={loadingData} onRefresh={() => loadWorkspaceData(user)} />
          ) : activeSection === 'reports' ? (
            <ReportsView />
          ) : activeSection === 'handovers' ? (
            <ShiftHandoversView />
          ) : activeSection === 'worker-notes' && (user.role === 'admin' || user.role === 'supervisor') ? (
            <WorkerNotesView workers={workers} />
          ) : activeSection === 'admin' && user.role === 'admin' ? (
            <AdminManagementView
              departments={departments}
              onRefreshGlobal={() => loadWorkspaceData(user)}
              onOpenDeptForm={handleOpenDeptForm}
            />
          ) : activeSection === 'qr-codes' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">رموز QR الخاصة بأقسام المستشفى</h2>
                <p className="text-xs text-slate-500">
                  مسح أي رمز يفتح نموذج طلب النظافة مع تحديد القسم تلقائياً.
                </p>
              </div>
              <DepartmentQRGrid
                departments={departments}
                onOpenForm={handleOpenDeptForm}
              />
            </div>
          ) : null}
        </main>
      </div>

      <OfflineIndicator />
    </div>
  );
}
