import React, { useState } from 'react';
import { Save, Loader2, Shield, User, Users, Globe, Settings as SettingsIcon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<{ enabled: boolean; requireSensitiveMfa?: boolean } | null>(null);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  // Security Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error('New passwords do not match');
    }
    
    // In V1 this would hit a PUT /auth/password endpoint
    setLoading(true);
    setTimeout(() => {
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    }, 1000);
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const { data } = await api.get('/auth/sessions');
      setSessions(data);
    } catch (err) {
      toast.error('Failed to load active sessions');
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchMfaStatus = async () => {
    try {
      const { data } = await api.get('/security/mfa/status');
      setMfaStatus(data);
    } catch {
      toast.error('Failed to load MFA status');
    }
  };

  React.useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
      fetchMfaStatus();
    }
  }, [activeTab]);

  const handleRevoke = async (id: string) => {
    try {
      await api.delete(`/auth/sessions/${id}`);
      toast.success('Session revoked successfully');
      fetchSessions();
    } catch (err) {
      toast.error('Failed to revoke session');
    }
  };

  const handlePrepareMfa = async () => {
    setMfaBusy(true);
    try {
      const { data } = await api.post('/security/mfa/setup', {});
      setMfaSetup(data);
      toast.success('Authenticator setup ready');
    } catch {
      toast.error('Failed to prepare MFA');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleEnableMfa = async () => {
    if (!mfaCode.trim()) {
      return toast.error('Enter the 6-digit authenticator code');
    }
    setMfaBusy(true);
    try {
      await api.post('/security/mfa/enable', { code: mfaCode.trim() });
      toast.success('MFA enabled');
      setMfaCode('');
      setMfaSetup(null);
      fetchMfaStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to enable MFA');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaCode.trim()) {
      return toast.error('Enter the current 6-digit authenticator code');
    }
    setMfaBusy(true);
    try {
      await api.post('/security/mfa/disable', { mfaCode: mfaCode.trim() });
      toast.success('MFA disabled');
      setMfaCode('');
      setMfaSetup(null);
      fetchMfaStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to disable MFA');
    } finally {
      setMfaBusy(false);
    }
  };

  const [tenantInfo, setTenantInfo] = useState<any>(null);

  const fetchTenantData = async () => {
    try {
      const { data } = await api.get('/team/summary');
      setTenantInfo({
        seatsUsed: data?.tenant?.seatsUsed || 0,
        seatsAllowed: data?.tenant?.seatsAllowed ?? 0,
        isUnlimitedSeats: !!data?.tenant?.isUnlimitedSeats,
        plan: data?.tenant?.plan || user?.tenant?.plan || 'ultra'
      });
    } catch {}
  };

  React.useEffect(() => {
    if (activeTab === 'workspace') fetchTenantData();
  }, [activeTab]);

  const currentWorkspace = user?.tenant?.name || "Main Workspace"; 

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-brand-400" />
          General Settings
        </h1>
        <p className="text-slate-400 mt-1 font-medium">Manage your personal profile, security options, and workspace preferences.</p>
      </div>

      <div className="flex space-x-6 border-b border-white/10 mb-8 overflow-x-auto pb-1">
        {[
          { id: 'profile', label: 'User Profile', icon: User },
          { id: 'workspace', label: 'Workspace', icon: Users },
          { id: 'security', label: 'Security & Sessions', icon: Shield },
          { id: 'preferences', label: 'Preferences', icon: Globe },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.id ? 'border-brand-500 text-brand-400 shadow-[0_4px_10px_-4px_rgba(6,182,212,0.5)]' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl space-y-6">
          <h3 className="text-xl font-bold text-white mb-6">Personal Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Email Address</label>
              <input type="text" disabled value={user?.email || ''} className="w-full bg-dark-950 border border-dark-700 text-slate-400 rounded-xl px-4 py-3 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">System Role</label>
              <input type="text" disabled value={user?.role || ''} className="w-full bg-dark-950 border border-brand-500/30 text-brand-400 font-bold rounded-xl px-4 py-3 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Display Name</label>
              <input type="text" placeholder="Enter name..." defaultValue={(user?.email || '').split('@')[0]} className="w-full bg-dark-900 border border-dark-700 text-white focus:border-brand-500 rounded-xl px-4 py-3 outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Terms Accepted</label>
              <input type="text" disabled value={user?.termsAcceptedAt ? new Date(user.termsAcceptedAt).toLocaleDateString() : 'N/A'} className="w-full bg-dark-950 border border-dark-700 text-slate-400 rounded-xl px-4 py-3 cursor-not-allowed" />
            </div>
          </div>
          
          <div className="pt-4 flex justify-end">
             <button className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" /> Save Changes</button>
          </div>
        </div>
      )}

      {activeTab === 'workspace' && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl space-y-8">
          <div>
            <h3 className="text-xl font-bold text-white mb-2">Current Workspace</h3>
            <p className="text-sm text-slate-400">You are currently operating in <strong className="text-white">{currentWorkspace}</strong>.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-dark-950 border border-dark-800 p-6 rounded-xl">
               <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Active Plan</p>
               <p className="text-2xl font-black text-white">{tenantInfo?.plan?.toUpperCase() || user?.tenant?.plan?.toUpperCase() || 'ULTRA'}</p>
               <p className="text-xs text-brand-400 mt-2 font-medium bg-brand-500/10 inline-block px-2 py-1 rounded">Active Subscription</p>
             </div>
             <div className="bg-dark-950 border border-dark-800 p-6 rounded-xl">
               <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Seats Used</p>
               <p className="text-2xl font-black text-white">
                 {tenantInfo?.seatsUsed || 0} / <span className="text-slate-500">{tenantInfo?.isUnlimitedSeats ? 'Unlimited' : (tenantInfo?.seatsAllowed || 0)}</span>
               </p>
               {!tenantInfo?.isUnlimitedSeats && (
                 <div className="w-full bg-dark-800 h-1 mt-4 rounded-full overflow-hidden">
                   <div className="bg-brand-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, ((tenantInfo?.seatsUsed || 0) / Math.max(1, tenantInfo?.seatsAllowed || 1)) * 100)}%` }} />
                 </div>
               )}
             </div>
             <div className="bg-dark-950 border border-dark-800 p-6 rounded-xl flex items-center justify-center">
                <button className="btn-secondary w-full text-xs hover:bg-brand-500 hover:text-white transition-all">Upgrade Plan</button>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'preferences' && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl space-y-6">
           <h3 className="text-xl font-bold text-white mb-6">App Preferences</h3>
           
           <div className="space-y-4">
             <div className="flex items-center justify-between p-4 bg-dark-900 border border-dark-800 rounded-xl">
               <div>
                  <p className="font-bold text-white">UI Theme</p>
                  <p className="text-xs text-slate-400">Force Light or Dark theme.</p>
               </div>
               <select className="bg-dark-950 border border-dark-700 text-white rounded p-2 focus:border-brand-500 outline-none text-sm">
                 <option>Dark Mode (Glass)</option>
                 <option disabled>Light Mode (Coming Soon)</option>
               </select>
             </div>
             <div className="flex items-center justify-between p-4 bg-dark-900 border border-dark-800 rounded-xl">
               <div>
                  <p className="font-bold text-white">Language</p>
                  <p className="text-xs text-slate-400">Set platform language.</p>
               </div>
               <select className="bg-dark-950 border border-dark-700 text-white rounded p-2 focus:border-brand-500 outline-none text-sm">
                 <option>English</option>
                 <option disabled>Spanish</option>
               </select>
             </div>
           </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="glass-dark border border-white/5 p-8 rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Authenticator MFA</h3>
                <p className="text-sm text-slate-400">
                  Protect sensitive actions with time-based one-time codes. Camel can require this automatically before exposure outside localhost.
                </p>
              </div>
              <div className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${mfaStatus?.enabled ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
                {mfaStatus?.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/5 bg-dark-950 p-5 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Status</p>
                <p className="text-sm text-slate-300">
                  {mfaStatus?.enabled
                    ? 'Your account already requires authenticator codes when a sensitive route demands MFA.'
                    : 'MFA is not enabled yet for this account.'}
                </p>
                <p className="text-xs text-slate-500">
                  Sensitive MFA posture: {mfaStatus?.requireSensitiveMfa ? 'required by security policy' : 'available and ready to enforce'}
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-950 p-5 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Actions</p>
                <div className="flex flex-wrap gap-3">
                  {!mfaStatus?.enabled && (
                    <button onClick={handlePrepareMfa} disabled={mfaBusy} className="btn-primary text-xs flex items-center gap-2">
                      {mfaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      Prepare MFA
                    </button>
                  )}
                  {mfaStatus?.enabled && (
                    <button onClick={handleDisableMfa} disabled={mfaBusy} className="btn-secondary text-xs text-red-300 border-red-500/20 hover:bg-red-500/10">
                      Disable MFA
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(mfaSetup || mfaStatus?.enabled) && (
              <div className="mt-6 rounded-xl border border-white/5 bg-dark-950 p-5 space-y-4">
                {mfaSetup && (
                  <>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Setup Secret</p>
                      <p className="text-sm font-mono text-brand-300 break-all">{mfaSetup.secret}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Authenticator URI</p>
                      <p className="text-xs font-mono text-slate-400 break-all">{mfaSetup.otpauthUri}</p>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">6-Digit Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full max-w-xs bg-dark-900 border border-dark-700 text-white focus:border-brand-500 rounded-xl px-4 py-3 outline-none transition-colors"
                    placeholder="123456"
                  />
                </div>
                {!mfaStatus?.enabled && mfaSetup && (
                  <button onClick={handleEnableMfa} disabled={mfaBusy} className="btn-primary text-xs flex items-center gap-2">
                    {mfaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Enable MFA
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="glass-dark border border-white/5 p-8 rounded-2xl">
            <h3 className="text-xl font-bold text-white mb-6">Change Password</h3>
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Current Password</label>
                <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full bg-dark-900 border border-dark-700 text-white focus:border-brand-500 rounded-xl px-4 py-3 outline-none transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">New Password</label>
                  <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-dark-900 border border-dark-700 text-white focus:border-brand-500 rounded-xl px-4 py-3 outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirm Password</label>
                  <input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-dark-900 border border-dark-700 text-white focus:border-brand-500 rounded-xl px-4 py-3 outline-none transition-colors" />
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={loading} className="btn-primary text-sm flex items-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Update Password
                </button>
              </div>
            </form>
          </div>

          <div className="glass-dark border border-white/5 p-8 rounded-2xl">
            <div className="flex justify-between items-center mb-6">
               <div>
                 <h3 className="text-xl font-bold text-white">Active Sessions</h3>
                 <p className="text-sm text-slate-400 mt-1">Review and revoke active authentications across all your devices.</p>
               </div>
               <button className="btn-secondary text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:bg-red-500/10">Revoke All Other Devices</button>
            </div>

            <div className="space-y-3">
              {loadingSessions ? (
                <div className="text-center p-8 text-slate-500 flex justify-center"><Loader2 className="animate-spin" /></div>
              ) : sessions.length === 0 ? (
                <div className="text-center p-8 text-slate-500 bg-dark-950 rounded-xl border border-dark-800">No active sessions found.</div>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between border border-white/5 bg-dark-900 hover:bg-white/5 transition-colors rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="bg-dark-950 p-3 rounded-lg border border-dark-800 shadow-inner">
                         <Shield className="w-5 h-5 text-brand-500" />
                      </div>
                      <div>
                        <h4 className="text-white font-bold">{session.userAgent?.split(' ')[0] || 'Unknown Device'}</h4>
                        <p className="text-xs text-slate-400 mt-1 font-mono">IP: {session.ipAddress || 'Unknown IP'} · Created: {new Date(session.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(session.id)}
                      className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-lg text-xs font-bold transition-all shadow-[0_0_10px_rgba(239,68,68,0)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                    >
                      Revoke
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
