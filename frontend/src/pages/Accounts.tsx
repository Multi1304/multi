import React, { useEffect, useState } from 'react';
import { Plus, User, Key, Globe, Trash2, ExternalLink } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { toast } from 'react-hot-toast';

export default function Accounts() {
  const [searchParams] = useSearchParams();
  const profileIdFromUrl = searchParams.get('profileId');
  
  const [accounts, setAccounts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    profileId: profileIdFromUrl || '',
    username: '',
    password: ''
  });

  const fetchData = async () => {
    try {
      const [accRes, profRes] = await Promise.all([
        api.get('/accounts', { params: { profileId: profileIdFromUrl } }),
        api.get('/profiles')
      ]);
      setAccounts(accRes.data);
      setProfiles(profRes.data);
      if (profRes.data.length > 0 && !formData.profileId) {
        setFormData(prev => ({ ...prev, profileId: profileIdFromUrl || profRes.data[0].id }));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/accounts', formData);
      toast.success('Account created');
      setFormData({ ...formData, username: '', password: '' });
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to create account');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await api.delete(`/accounts/${id}`);
      toast.success('Account deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Accounts</h1>
          <p className="text-slate-400">Manage credentials associated with your browser profiles</p>
        </div>
        <button 
          onClick={() => setShowModal(true)} 
          className="btn-primary flex items-center gap-2"
          disabled={profiles.length === 0}
        >
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {profiles.length === 0 && !loading && (
        <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded-2xl flex items-center gap-4 animate-pulse">
          <div className="h-12 w-12 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
             <Globe className="h-6 w-6 text-brand-400" />
          </div>
          <div>
            <h4 className="text-brand-400 font-bold uppercase tracking-widest text-xs mb-1">Configuración Requerida</h4>
            <p className="text-sm text-slate-400">
              Debes crear un <strong>Perfil de Navegador</strong> antes de poder añadir cuentas. Los perfiles son el contenedor seguro para tus identidades digitales.
            </p>
            <Link to="/profiles" className="text-brand-400 text-xs font-bold hover:underline mt-2 inline-block">Ir a Perfiles →</Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-48 animate-pulse bg-dark-800/50" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="card text-center py-12">
          <User className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white">No accounts found</h3>
          <p className="text-slate-400 mt-2">Add accounts to use them in the Automation Hub.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map(account => (
            <div key={account.id} className="card hover:border-brand-500/50 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-dark-700 flex items-center justify-center">
                    <User className="h-5 w-5 text-brand-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{account.username}</h3>
                    <p className="text-[10px] text-slate-500 truncate max-w-[150px]">ID: {account.id}</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(account.id)} className="text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              
              <div className="space-y-3 py-4 border-y border-dark-700/50 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><Globe className="h-4 w-4" /> Profile:</span>
                  <span className="text-white font-medium">{account.profile?.name || 'Unknown'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><Key className="h-4 w-4" /> Password:</span>
                  <span className="text-slate-500">••••••••</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Link 
                  to={`/automation?profileId=${account.profileId}&accountId=${account.id}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-brand-500/10 text-brand-400 text-xs font-semibold hover:bg-brand-500 hover:text-white transition-all"
                >
                  <ExternalLink className="h-3 w-3" /> Automation
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-dark-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <h2 className="text-xl font-bold text-white mb-6">Assign New Account</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Target Profile</label>
                <select
                  required
                  value={formData.profileId}
                  onChange={e => setFormData({ ...formData, profileId: e.target.value })}
                  className="input-field"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username / Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    className="input-field pl-10"
                    placeholder="e.g. user@gmail.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="input-field pl-10"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-dark-700">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Add Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
