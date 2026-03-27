import { useState, useEffect } from 'react';
import { Server, Activity, Cpu, Database, MapPin, ShieldCheck } from 'lucide-react';
import api from '../api/client';
import { 
  AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

export default function ClusterDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = () => {
      api.get('/cluster/status')
        .then(r => setData(r.data))
        .finally(() => setLoading(false));
    };
    fetch();
    const timer = setInterval(fetch, 10000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Server className="h-8 w-8 text-brand-400" />
            Cloud Edge Cluster
          </h1>
          <p className="text-slate-400 font-medium italic">Distributed high-concurrency browser orchestration</p>
        </div>
        <div className="flex gap-4">
           <div className="px-4 py-2 glass-dark rounded-xl border border-white/5 text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Concurrency</p>
              <p className="text-xl font-black text-brand-400">{data?.globalProfiles || 0} <span className="text-xs text-slate-500">Profiles</span></p>
           </div>
           <div className="px-4 py-2 glass-dark rounded-xl border border-white/5 text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Nodes</p>
              <p className="text-xl font-black text-white">{data?.totalNodes || 0}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {data?.nodes.map((node: any) => (
          <div key={node.id} className="glass-dark border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 blur-[60px] opacity-20 transition-all group-hover:opacity-40 ${node.status === 'OVERLOADED' ? 'bg-red-500' : 'bg-brand-500'}`} />
            
            <div className="flex justify-between items-start mb-6">
               <div className="p-3 bg-white/5 rounded-xl border border-white/10 group-hover:border-brand-500/30 transition-colors">
                  <Activity className={`w-6 h-6 ${node.status === 'OVERLOADED' ? 'text-red-400 animate-pulse' : 'text-brand-400'}`} />
               </div>
               <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${node.status === 'OVERLOADED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'}`}>
                  {node.status}
               </span>
            </div>

            <h3 className="text-lg font-bold text-white mb-1">{node.hostname}</h3>
            <p className="text-xs text-slate-500 font-mono mb-4">{node.id}</p>

            <div className="space-y-4">
               <div>
                  <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-1">
                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3"/> CPU LOADER</span>
                    <span>{(node.cpuUsage * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${node.cpuUsage > 0.8 ? 'bg-red-500' : 'bg-brand-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]'}`} 
                      style={{ width: `${node.cpuUsage * 100}%` }} 
                    />
                  </div>
               </div>

               <div>
                  <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-1">
                    <span className="flex items-center gap-1"><Database className="w-3 h-3"/> RAM USAGE</span>
                    <span>{(node.ramUsage * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-dark-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
                      style={{ width: `${node.ramUsage * 100}%` }} 
                    />
                  </div>
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
               <div className="flex items-center gap-2 text-slate-400">
                  <MapPin className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{node.id.split('-')[2]?.toUpperCase() || 'GLOBAL'}</span>
               </div>
               <p className="text-[10px] text-slate-500 font-medium tabular-nums">
                 Last heartbeat: {new Date(node.lastHeartbeat).toLocaleTimeString()}
               </p>
            </div>
          </div>
        ))}

        {/* Scalability Alert */}
        <div className="glass-dark border border-brand-500/20 bg-brand-500/5 rounded-2xl p-6 flex flex-col justify-between">
           <div>
              <div className="flex items-center gap-2 text-brand-400 mb-4">
                 <ShieldCheck className="w-6 h-6" />
                 <h3 className="font-bold uppercase tracking-widest text-sm">Cluster Health</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed italic mb-4">
                Systems are optimal. The Edge Mesh is currently balancing 10,000+ fingerprints across distributed worker nodes. Low latency achieved via geolocated routing.
              </p>
           </div>
           <button className="w-full py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl text-brand-400 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all">
              Provision Edge Node
           </button>
        </div>
      </div>

      {/* Persistence Overview */}
      <div className="glass-dark border border-white/5 rounded-2xl p-8">
         <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
               <Database className="h-5 w-5 text-purple-400" />
               Cloud Sync Persistence
            </h2>
            <div className="px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full">
               <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-green-400 rounded-full animate-ping" />
                  S3-Consistent
               </span>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
               <p className="text-sm text-slate-400">
                 Real-time synchronization of cookies, browser partitions, and session metadata. Automatic reconciliation between Edge Nodes.
               </p>
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-dark-900/50 rounded-xl border border-white/5">
                     <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Total Data Sync</p>
                     <p className="text-lg font-black text-white">12.4 TB</p>
                  </div>
                  <div className="p-4 bg-dark-900/50 rounded-xl border border-white/5">
                     <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Avg. Sync Time</p>
                     <p className="text-lg font-black text-white">450ms</p>
                  </div>
               </div>
            </div>
            
            <div className="h-[200px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[
                    { time: '00:00', sync: 40 },
                    { time: '04:00', sync: 30 },
                    { time: '08:00', sync: 65 },
                    { time: '12:00', sync: 45 },
                    { time: '16:00', sync: 90 },
                    { time: '20:00', sync: 70 },
                  ]}>
                    <defs>
                      <linearGradient id="colorSync" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#06b6d4', fontWeight: 'bold' }}
                    />
                    <Area type="monotone" dataKey="sync" stroke="#06b6d4" fillOpacity={1} fill="url(#colorSync)" strokeWidth={3} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>
      </div>
    </div>
  );
}
