import React, { useEffect, useState } from 'react';
import { UserPlus, Shield, Trash2, Mail, UserCheck, Users as UsersIcon, ChevronDown } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

export default function Team() {
  const [users, setUsers] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [promotionTasks, setPromotionTasks] = useState<any[]>([]);
  const [approvalTasks, setApprovalTasks] = useState<any[]>([]);
  const [incidentRemediationTasks, setIncidentRemediationTasks] = useState<any[]>([]);
  const [incidentRemediationApprovals, setIncidentRemediationApprovals] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incidentSummary, setIncidentSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  
  const currentUser = useAuthStore(state => state.user);
  const seatsUsed = users.length;
  const seatsAllowed = summary?.tenant?.seatsAllowed ?? 0;
  const isUnlimitedSeats = typeof seatsAllowed === 'number' && seatsAllowed < 0;
  const isSeatsFull = !!summary && !isUnlimitedSeats && seatsAllowed > 0 && seatsUsed >= seatsAllowed;

  const handleInviteClick = () => {
    if (isSeatsFull) {
      toast.error('Workspace seat limit reached. Please remove a member or upgrade your plan.');
    } else {
      setShowModal(true);
    }
  };

  const fetchUsers = async () => {
    try {
      const [{ data }, summaryRes, taskRes, incidentRes, incidentTaskRes] = await Promise.all([
        api.get('/team'),
        api.get('/team/summary').catch(() => ({ data: null })),
        api.get('/monitor/promotion-tasks').catch(() => ({ data: { tasks: [], approvals: [] } })),
        api.get('/monitor/incidents').catch(() => ({ data: { incidents: [], summary: null } })),
        api.get('/monitor/incident-remediation-tasks').catch(() => ({ data: { tasks: [], approvals: [] } })),
      ]);
      setUsers(data);
      setSummary(summaryRes.data);
      setPromotionTasks(taskRes.data?.tasks || []);
      setApprovalTasks(taskRes.data?.approvals || []);
      setIncidentRemediationTasks(incidentTaskRes.data?.tasks || []);
      setIncidentRemediationApprovals(incidentTaskRes.data?.approvals || []);
      setIncidents(incidentRes.data?.incidents || []);
      setIncidentSummary(incidentRes.data?.summary || null);
    } catch (err) {
      console.error('Failed to load team', err);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprovePromotion = async (taskId: string) => {
    try {
      await api.post(`/monitor/promotion-tasks/${taskId}/approve`, {});
      toast.success('Promotion approved');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve promotion');
    }
  };

  const handleDismissPromotion = async (taskId: string) => {
    try {
      await api.post(`/monitor/promotion-tasks/${taskId}/resolve`, { resolution: 'dismissed' });
      toast.success('Promotion task dismissed');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to dismiss promotion task');
    }
  };

  const handleApproveIncidentRemediation = async (taskId: string) => {
    try {
      await api.post(`/monitor/incident-remediation-tasks/${taskId}/approve`, {});
      toast.success('Incident remediation approved');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve remediation');
    }
  };

  const handleDismissIncidentRemediation = async (taskId: string) => {
    try {
      await api.post(`/monitor/incident-remediation-tasks/${taskId}/resolve`, { resolution: 'dismissed' });
      toast.success('Incident remediation task dismissed');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to dismiss remediation task');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/team/invite', { email, role });
      toast.success('User invited successfully');
      setShowModal(false);
      setEmail('');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invitation failed');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put(`/team/${userId}/role`, { role: newRole });
      toast.success('Role updated');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email} from this workspace?`)) return;
    try {
      await api.delete(`/team/${userId}`);
      toast.success('User removed from workspace');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove user');
    }
  };

  const roleColors: Record<string, string> = {
    ADMIN: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    MANAGER: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
    AUDITOR: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    OPERATOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    USER: 'bg-slate-500/10 text-slate-400 border-white/5',
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <UsersIcon className="h-8 w-8 text-brand-400" />
            Team Management
          </h1>
          <p className="text-slate-400 font-medium">Control workspace access and assign operator roles</p>
        </div>
        <button 
          onClick={handleInviteClick} 
          className={`btn-primary flex items-center gap-2 px-6 ${isSeatsFull ? 'opacity-50 grayscale cursor-not-allowed border-white/10 bg-dark-800 shadow-none' : ''}`}
        >
          <UserPlus className="h-4 w-4" /> 
          {isSeatsFull ? 'Seats Full' : 'Invite Member'}
        </button>
      </div>

      <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-white/5 bg-white/[0.02]">
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Plan</p>
              <p className="text-lg font-black text-white mt-2">{summary.tenant?.plan || 'UNKNOWN'}</p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Seats</p>
              <p className="text-lg font-black text-white mt-2">
                {summary.tenant?.seatsUsed || 0}/{summary.tenant?.isUnlimitedSeats ? 'Unlimited' : (summary.tenant?.seatsAllowed || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">ACL Grants</p>
              <p className="text-lg font-black text-white mt-2">{summary.aclCount || 0}</p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Pending Invites</p>
              <p className="text-lg font-black text-white mt-2">{summary.pendingInvites || 0}</p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Active Incidents</p>
              <p className={`text-lg font-black mt-2 ${(incidentSummary?.critical || 0) > 0 ? 'text-red-400' : (incidentSummary?.open || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {incidentSummary?.open || 0}
              </p>
            </div>
          </div>
        )}
        {loading ? (
          <div className="p-20 text-center animate-pulse text-slate-500 font-bold uppercase tracking-widest text-xs">Synchronizing team data...</div>
        ) : users.length === 0 ? (
          <div className="p-20 text-center">
            <UsersIcon className="h-12 w-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No team members found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 text-[10px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5">
                  <th className="px-8 py-5">User Identity</th>
                  <th className="px-8 py-5">Security Role</th>
                  <th className="px-8 py-5">Access Date</th>
                  <th className="px-8 py-5 text-right">Management</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-5 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-bold shadow-lg shadow-brand-500/10">
                        {u.email[0].toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-white block">{u.email}</span>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {u.id.substring(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {u.id === currentUser?.id ? (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${roleColors[u.role] || roleColors.USER}`}>
                          <Shield className="h-3 w-3" />
                          {u.role}
                        </span>
                      ) : currentUser?.role === 'ADMIN' ? (
                        <div className="relative inline-flex items-center">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className={`appearance-none cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 pr-7 rounded-full text-[10px] font-black uppercase tracking-wider border bg-transparent ${roleColors[u.role] || roleColors.USER}`}
                          >
                            <option value="USER">User</option>
                            <option value="OPERATOR">Operator</option>
                            <option value="MANAGER">Manager</option>
                            <option value="AUDITOR">Auditor</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                          <ChevronDown className="h-3 w-3 absolute right-2 pointer-events-none text-slate-500" />
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${roleColors[u.role] || roleColors.USER}`}>
                          <UserCheck className="h-3 w-3" />
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-slate-400 font-medium">{new Date(u.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</td>
                    <td className="px-8 py-5 text-right">
                      {u.id !== currentUser?.id && currentUser?.role === 'ADMIN' ? (
                        <button
                          onClick={() => handleRemove(u.id, u.email)}
                          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : u.id === currentUser?.id ? (
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 bg-white/5 px-2 py-1 rounded">Self</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary?.recentAudit?.length > 0 && (
        <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-tight">Recent Team Audit</h2>
          </div>
          <div className="divide-y divide-white/5">
            {summary.recentAudit.map((entry: any) => (
              <div key={entry.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white">{entry.action}</p>
                  <p className="text-xs text-slate-400 mt-1">{entry.user?.email || entry.userId} · {new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-[10px] text-slate-500 font-mono bg-dark-950 border border-white/5 rounded-lg px-3 py-2 max-w-xs truncate">
                  {JSON.stringify(entry.detail || {})}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(approvalTasks.length > 0 || promotionTasks.length > 0 || incidentRemediationApprovals.length > 0 || incidentRemediationTasks.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h2 className="text-lg font-bold text-white tracking-tight">Pending Promotion Approvals</h2>
            </div>
            <div className="divide-y divide-white/5">
              {approvalTasks.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No promotion approvals assigned to your role.</div>
              ) : (
                approvalTasks.map((task: any) => (
                  <div key={task.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white">{task.resourceName}</p>
                      <p className="text-xs text-slate-400 mt-1">{task.resource} · {task.action.replace('_', ' ')} · requires {task.requiredRole}</p>
                      <p className="text-xs text-slate-500 mt-1">{task.reasons?.[0] || 'No reason provided'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleApprovePromotion(task.id)} className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">
                        Approve
                      </button>
                      <button onClick={() => handleDismissPromotion(task.id)} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h2 className="text-lg font-bold text-white tracking-tight">Recent Promotion Tasks</h2>
            </div>
            <div className="divide-y divide-white/5">
              {promotionTasks.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No promotion tasks recorded yet.</div>
              ) : (
                promotionTasks.slice(0, 8).map((task: any) => (
                  <div key={task.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white">{task.resourceName}</p>
                      <p className="text-xs text-slate-400 mt-1">{task.resource} · {task.action.replace('_', ' ')} · {task.status}</p>
                      <p className="text-xs text-slate-500 mt-1">{task.note || task.reasons?.[0] || 'No note'}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{task.requiredRole || 'n/a'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(incidentRemediationApprovals.length > 0 || incidentRemediationTasks.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h2 className="text-lg font-bold text-white tracking-tight">Pending Incident Remediation Approvals</h2>
            </div>
            <div className="divide-y divide-white/5">
              {incidentRemediationApprovals.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No sensitive remediations assigned to your role.</div>
              ) : (
                incidentRemediationApprovals.map((task: any) => (
                  <div key={task.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white">{task.incidentTitle}</p>
                      <p className="text-xs text-slate-400 mt-1">{task.actionLabel} · requires {task.requiredRole}</p>
                      <p className="text-xs text-slate-500 mt-1">{task.note || task.actionDetail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleApproveIncidentRemediation(task.id)} className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">
                        Approve
                      </button>
                      <button onClick={() => handleDismissIncidentRemediation(task.id)} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h2 className="text-lg font-bold text-white tracking-tight">Recent Remediation Tasks</h2>
            </div>
            <div className="divide-y divide-white/5">
              {incidentRemediationTasks.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No remediation tasks recorded yet.</div>
              ) : (
                incidentRemediationTasks.slice(0, 8).map((task: any) => (
                  <div key={task.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white">{task.incidentTitle}</p>
                      <p className="text-xs text-slate-400 mt-1">{task.actionLabel} · {task.status}</p>
                      <p className="text-xs text-slate-500 mt-1">{task.note || task.actionDetail}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{task.requiredRole || 'n/a'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(incidents.length > 0 || incidentSummary?.open > 0) && (
        <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-tight">Operational Incidents</h2>
            <p className="text-xs text-slate-500 mt-1">
              {incidentSummary?.critical || 0} critical · {incidentSummary?.high || 0} high · {incidentSummary?.warning || 0} warning
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {incidents.slice(0, 8).map((incident: any) => (
              <div key={incident.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white">{incident.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{incident.summary}</p>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">
                    {incident.severity} · {incident.status}
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{incident.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-dark-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-dark border-white/10 p-8 w-full max-w-md shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Invite Operative</h2>
                <p className="text-slate-500 text-sm font-medium">Grant workspace access to a new user</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-brand-gradient flex items-center justify-center">
                <UserPlus className="h-6 w-6 text-white" />
              </div>
            </div>

            <form onSubmit={handleInvite} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500 group-focus-within:text-brand-400 transition-colors" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-field pl-10"
                    placeholder="operative@company.io"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Permission Tier</label>
                <select 
                  className="input-field appearance-none"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                >
                  <option value="USER">Standard User</option>
                  <option value="OPERATOR">Operator</option>
                  <option value="MANAGER">Manager</option>
                  <option value="AUDITOR">Auditor</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary px-8 font-bold text-xs uppercase tracking-widest">Abort</button>
                <button type="submit" className="btn-primary px-10 font-black text-xs uppercase tracking-widest">Grant Access</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
