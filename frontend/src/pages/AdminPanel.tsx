import { useState, useEffect } from 'react';
import { ShieldAlert, Users, Server, Globe2, Power, PowerOff, ShieldCheck, Loader2 } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenants, setTenants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/tenants');
      setTenants(data);
    } catch {
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/flags');
      setFlags(data);
    } catch {
      toast.error('Failed to load flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tenants') fetchTenants();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'flags') fetchFlags();
  }, [activeTab]);

  const toggleTenantSuspension = async (id: string, currentStatus: boolean) => {
    try {
      await api.post(`/admin/tenants/${id}/suspend`, { suspended: !currentStatus });
      toast.success(`Tenant ${!currentStatus ? 'suspended' : 'activated'} successfully`);
      fetchTenants();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update tenant status');
    }
  };

  const toggleFlag = async (tenantId: string, key: string, currentStatus: boolean, description: string) => {
    try {
      await api.post(`/admin/flags`, { tenantId, key, enabled: !currentStatus, description });
      toast.success('Feature flag updated');
      fetchFlags();
    } catch {
      toast.error('Failed to update flag');
    }
  };

  const formatSeatLimit = (value: number) => value < 0 ? 'Unlimited' : value;

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            Superadmin Control Panel
          </h1>
          <p className="text-slate-400 mt-1 font-medium">Global system management, tenants, and feature flags.</p>
        </div>
        {loading && <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />}
      </div>

      <div className="flex space-x-6 border-b border-white/10 mb-8 overflow-x-auto pb-1">
        {[
          { id: 'tenants', label: 'Workspaces (Tenants)', icon: Server },
          { id: 'users', label: 'Global Users', icon: Users },
          { id: 'flags', label: 'Feature Flags', icon: Globe2 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.id ? 'border-red-500 text-red-400 shadow-[0_4px_10px_-4px_rgba(239,68,68,0.5)]' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tenants' && (
        <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-dark-900/50 border-b border-white/5 text-xs font-black text-slate-500 uppercase tracking-widest">
                <th className="p-4">Name</th>
                <th className="p-4">Plan</th>
                <th className="p-4">Seats Utilized</th>
                <th className="p-4">Created Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tenants.map(t => (
                <tr key={t.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-white flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${t.suspended ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    {t.name}
                  </td>
                  <td className="p-4">
                    <span className="bg-dark-800 text-brand-400 text-xs px-2 py-1 rounded font-bold uppercase">{t.plan}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                       <span className="text-slate-300 font-mono text-sm">{t.seatsUsed} / {formatSeatLimit(t.seatsAllowed)}</span>
                       <button 
                         onClick={async () => {
                           const newLimit = prompt('Enter new seat limit (-1 = unlimited):', String(t.seatsAllowed));
                           if (newLimit) {
                             await api.post(`/admin/tenants/${t.id}/seats`, { seatsAllowed: parseInt(newLimit) });
                             fetchTenants();
                           }
                         }}
                         className="p-1 hover:text-brand-400 text-slate-600 transition-colors"
                       >
                         <Users className="w-3 h-3" />
                       </button>
                    </div>
                  </td>
                  <td className="p-4 text-slate-400 text-sm font-mono">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">
                    {t.suspended ? (
                      <span className="text-red-400 bg-red-500/10 px-2 py-1 rounded text-xs font-bold">SUSPENDED</span>
                    ) : (
                      <span className="text-green-400 bg-green-500/10 px-2 py-1 rounded text-xs font-bold">ACTIVE</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => toggleTenantSuspension(t.id, t.suspended)}
                      className={`btn-secondary text-xs p-2 flex items-center justify-center ml-auto ${t.suspended ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`}
                    >
                      {t.suspended ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && !loading && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No tenants found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-dark-900/50 border-b border-white/5 text-xs font-black text-slate-500 uppercase tracking-widest">
                <th className="p-4">Email Address</th>
                <th className="p-4">System Role</th>
                <th className="p-4">Workspace (Tenant)</th>
                <th className="p-4">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-bold text-white">{u.email}</td>
                  <td className="p-4">
                     <span className={`text-xs px-2 py-1 rounded font-bold ${u.role === 'ADMIN' ? 'bg-red-500/10 text-red-400' : 'bg-brand-500/10 text-brand-400'}`}>
                       {u.role}
                     </span>
                  </td>
                  <td className="p-4 text-slate-300 font-mono text-sm break-all max-w-[200px] truncate">{u.tenant?.name || u.tenantId}</td>
                  <td className="p-4 text-slate-400 text-sm font-mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {users.length === 0 && !loading && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'flags' && (
        <div className="glass-dark border border-white/5 rounded-2xl p-6">
           <div className="mb-6 bg-dark-900 p-4 border border-dark-800 rounded-xl flex items-center gap-4">
             <div className="bg-blue-500/10 p-3 rounded-lg"><ShieldCheck className="w-6 h-6 text-blue-400" /></div>
             <div>
               <h3 className="text-white font-bold">Add Custom Flag (Backend DB execution required)</h3>
               <p className="text-sm text-slate-400">For V1 MVP, flags must be seeded natively or via raw API payload injections. Existing custom Tenant flags would appear below.</p>
             </div>
           </div>
           
           <div className="space-y-4">
              {flags.map(f => (
                <div key={f.id} className="flex items-center justify-between p-4 bg-dark-950 border border-dark-800 rounded-xl">
                  <div>
                    <h4 className="text-white font-bold font-mono tracking-tight">{f.key}</h4>
                    <p className="text-xs text-slate-400 mt-1">{f.description || 'No description'} · <span className="text-brand-400 font-mono">{f.tenant?.name || f.tenantId}</span></p>
                  </div>
                  <button 
                    onClick={() => toggleFlag(f.tenantId, f.key, f.enabled, f.description)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${f.enabled ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-dark-800 border-dark-700 text-slate-500 hover:text-white'}`}
                  >
                    {f.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
              {flags.length === 0 && !loading && <div className="text-center p-8 text-slate-500 bg-dark-950 rounded-xl border border-dark-800">No feature flags configured currently.</div>}
           </div>
        </div>
      )}

    </div>
  );
}
