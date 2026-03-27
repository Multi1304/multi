import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Zap, 
  CreditCard, 
  LogOut, 
  User, 
  Globe, 
  Activity, 
  Upload, 
  Shield, 
  Settings as SettingsIcon, 
  CalendarClock, 
  Menu, 
  X, 
  ChevronRight, 
  Server, 
  Monitor, 
  ShieldAlert, 
  FileText 
} from 'lucide-react';

import { useAuthStore } from '../store/authStore';
import api from '../api/client';

export default function Layout() {
  const { user, featureFlags, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    logout();
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Profiles', href: '/profiles', icon: Globe },
    { name: 'Accounts', href: '/accounts', icon: User },
    { name: 'Team', href: '/team', icon: Users },
    { name: 'Automation', href: '/automation', icon: Zap },
    { name: 'Network', href: '/network', icon: Shield },
    ...(featureFlags?.includes('feature.tasks.enabled') ? [{ name: 'Task Builder', href: '/tasks', icon: CalendarClock }] : []),
    ...(featureFlags?.includes('feature.liveops.enabled') ? [{ name: 'Live Ops', href: '/live-ops', icon: Activity }] : []),
    ...(featureFlags?.includes('feature.bulk.enabled') ? [{ name: 'Bulk Ops', href: '/bulk', icon: Upload }] : []),
    ...(user?.role === 'ADMIN' ? [
      { name: 'Billing', href: '/billing', icon: CreditCard },
      { name: 'Audit Logs', href: '/audit', icon: FileText },
      { name: 'Ban Analysis', href: '/ban-analysis', icon: ShieldAlert },
      { name: 'Security Dashboard', href: '/security', icon: Activity },
      { name: 'Cluster Dashboard', href: '/cluster', icon: Server },
      { name: 'Platform Admin', href: '/admin', icon: Shield },
    ] : []),
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  // Helper for Breadcrumbs
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0 || location.pathname === '/') return [{ name: 'Dashboard', href: '/' }];
    
    return [
      { name: 'Home', href: '/' },
      ...paths.map((p, i) => {
        const href = `/${paths.slice(0, i + 1).join('/')}`;
        const name = p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ');
        return { name, href };
      })
    ];
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col md:flex-row relative">
      {/* Mobile Header overlay */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/5 bg-dark-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-brand-400 to-brand-600 p-2 rounded-xl shadow-lg shadow-brand-500/20">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <span className="font-black tracking-tight text-xl text-white uppercase italic tracking-tighter">CamelFarm</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-lg border border-white/10">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-dark-900 border-r border-dark-800 flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Desktop Logo */}
          <div className="hidden md:block">
            <h1 className="text-2xl font-black text-white flex flex-col gap-1 tracking-tighter">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-brand-gradient flex items-center justify-center shadow-lg shadow-brand-500/20">
                  <Zap className="h-6 w-6 text-white fill-white" />
                </div>
                <span className="text-xl font-black bg-brand-gradient bg-clip-text text-transparent tracking-tighter">CamelFarm</span>
              </div>
            </h1>
          </div>
          
          <nav className="mt-8 space-y-1.5">
            <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Enterprise Suite</div>
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive ? 'bg-brand-500/10 text-brand-400' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-brand-300'}`} />
                  <span className="font-semibold text-sm">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-white/5 bg-dark-950/50">
          <div className="flex items-center gap-3 mb-6 p-2 rounded-xl bg-white/5 border border-white/5">
            <div className="h-10 w-10 rounded-lg bg-brand-gradient flex items-center justify-center text-white font-bold shadow-md">
              {user?.email[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user?.email}</p>
              <p className="text-[10px] text-brand-400 font-bold uppercase tracking-tight">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-500/20"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-dark-950 relative w-full">
        {/* Top Navigation / Breadcrumbs */}
        <div className="sticky top-0 z-30 p-4 md:p-6 bg-dark-950/80 backdrop-blur-md border-b border-dark-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <nav className="flex items-center space-x-2 text-sm text-slate-400 font-medium overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {breadcrumbs.map((crumb, idx) => (
              <div key={crumb.href} className="flex items-center whitespace-nowrap">
                <Link to={crumb.href} className="hover:text-brand-400 transition-colors">
                  {crumb.name}
                </Link>
                {idx < breadcrumbs.length - 1 && <ChevronRight className="w-4 h-4 mx-2 text-slate-600 flex-shrink-0" />}
              </div>
            ))}
          </nav>
          
          <div className="flex items-center justify-end gap-4 text-sm whitespace-nowrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-dark-900 border border-dark-700 shadow-inner hidden md:flex">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <span className="text-slate-300 font-mono text-xs">CamelFarm Stable</span>
            </div>
          </div>
        </div>

        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-500/5 to-transparent pointer-events-none z-0"></div>
        <div className="max-w-7xl mx-auto p-4 md:p-8 lg:p-12 relative z-10 min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
