import { useState, useEffect } from 'react';
import { Shield, Filter, Search, ChevronLeft, ChevronRight, Activity, Calendar } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function AuditViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });

  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [debouncedAction, setDebouncedAction] = useState('');
  const [debouncedUser, setDebouncedUser] = useState('');
  const [debouncedResource, setDebouncedResource] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAction(actionFilter);
      setDebouncedUser(userFilter);
      setDebouncedResource(resourceFilter);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [actionFilter, userFilter, resourceFilter]);

  useEffect(() => {
    api.get('/audit/summary')
      .then(({ data }) => setSummary(data))
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    const doFetch = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pagination.page.toString(),
          limit: pagination.limit.toString()
        });
        if (debouncedAction) params.append('action', debouncedAction);
        if (debouncedUser) params.append('userId', debouncedUser);
        if (debouncedResource) params.append('resource', debouncedResource);

        const { data } = await api.get(`/audit?${params.toString()}`);
        setLogs(data.data);
        setPagination(data.pagination);
      } catch {
        toast.error('Failed to load audit logs. Ensure you have ADMIN or AUDITOR role.');
      } finally {
        setLoading(false);
      }
    };
    void doFetch();
  }, [pagination.page, pagination.limit, debouncedAction, debouncedUser, debouncedResource]);

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-brand-500" />
            Audit Log Viewer
          </h1>
          <p className="text-slate-400 mt-1 font-medium">Immutable record of system actions, grants, restores and security events.</p>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden p-6">
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Records</p>
              <p className="text-2xl font-black text-white mt-2">{summary.total || 0}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top Action</p>
              <p className="text-sm font-bold text-white mt-2">{summary.topActions?.[0]?.action || 'n/a'}</p>
              <p className="text-xs text-slate-500 mt-1">{summary.topActions?.[0]?.count || 0} hits</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top Resource</p>
              <p className="text-sm font-bold text-white mt-2">{summary.topResources?.[0]?.resourceType || 'n/a'}</p>
              <p className="text-xs text-slate-500 mt-1">{summary.topResources?.[0]?.count || 0} hits</p>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by Action (e.g. team, profile, flow)"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full bg-dark-900 border border-dark-700 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by User ID"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full bg-dark-900 border border-dark-700 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by Resource (e.g. profile, flow)"
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="w-full bg-dark-900 border border-dark-700 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <button
            onClick={() => { setActionFilter(''); setUserFilter(''); setResourceFilter(''); }}
            className="btn-secondary whitespace-nowrap"
          >
            <Filter className="w-4 h-4 mr-2" /> Clear Filters
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-dark-800 bg-dark-950">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-dark-900/80 border-b border-dark-700 text-xs font-black text-slate-500 uppercase tracking-widest">
                <th className="p-4 rounded-tl-xl whitespace-nowrap">Timestamp</th>
                <th className="p-4 whitespace-nowrap">Action</th>
                <th className="p-4 whitespace-nowrap">User</th>
                <th className="p-4 whitespace-nowrap">Resource</th>
                <th className="p-4 whitespace-nowrap">IP Address</th>
                <th className="p-4 rounded-tr-xl w-1/3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-sm font-mono text-slate-400 whitespace-nowrap flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-4">
                    <span className="bg-dark-800 text-brand-400 text-xs px-2 py-1 rounded font-bold tracking-wider inline-flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-white">{log.user?.email || 'System'}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{log.userId}</div>
                  </td>
                  <td className="p-4 text-sm font-mono text-slate-300">
                    <span className="text-slate-500">{log.resourceType || log.resource || '-'}</span>
                    <div className="text-xs truncate max-w-[160px]" title={log.resourceId || log.resource}>
                      {log.resourceId || log.resource}
                    </div>
                  </td>
                  <td className="p-4 text-sm font-mono text-slate-400">{log.ipAddress || '—'}</td>
                  <td className="p-4">
                    <pre className="text-[10px] bg-dark-900 border border-dark-800 p-2 rounded text-slate-400 font-mono overflow-auto max-h-24 scrollbar-thin scrollbar-thumb-dark-700">
                      {JSON.stringify(log.metadata || log.detail || {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    No matching audit records found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-brand-500 animate-pulse">
                    Loading records...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
          <p className="text-sm text-slate-400">
            Showing <span className="text-white font-bold">{logs.length}</span> records (Total: {pagination.total})
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              disabled={pagination.page === 1 || loading}
              className="p-2 bg-dark-900 rounded-lg border border-dark-700 text-white hover:bg-dark-800 hover:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-white px-4">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="p-2 bg-dark-900 rounded-lg border border-dark-700 text-white hover:bg-dark-800 hover:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
