import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Copy, FileCode2, Play, Users, Clock, Loader2, Shield } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function TaskBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [payloadOverride, setPayloadOverride] = useState<any>({});
  const [batchName, setBatchName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [networkData, setNetworkData] = useState<{ pools: any[], policies: any[], presets: any[] }>({
    pools: [],
    policies: [],
    presets: []
  });
  const [filterArch, setFilterArch] = useState('All');
  const [filterTargetPlatform, setFilterTargetPlatform] = useState('All');

  useEffect(() => {
    // Fetch Templates (GET /tasks/templates now returns global + tenant)
    api.get('/tasks/templates').then(({ data }) => setTemplates(data)).catch(() => {});
    // Fetch targets (Accounts) since V1 tasks run on Accounts
    api.get('/accounts').then(({ data }) => setAccounts(data?.data || [])).catch(() => {});
    
    // Fetch Network Data
    api.get('/network/proxy-pools').then((r) => setNetworkData(prev => ({ ...prev, pools: r.data }))).catch(() => {});
    api.get('/network/policies').then((r) => setNetworkData(prev => ({ ...prev, policies: r.data }))).catch(() => {});
    api.get('/network/fingerprint-presets').then((r) => setNetworkData(prev => ({ ...prev, presets: r.data }))).catch(() => {});
  }, []);

  const platforms = ['All', ...new Set(templates.map(t => t.jobType.split('.')[0].toUpperCase()))];

  const filteredTemplates = filterPlatform === 'All' 
    ? templates 
    : templates.filter(t => t.jobType.split('.')[0].toUpperCase() === filterPlatform);

  const toggleAccount = (id: string) => {
    if (selectedAccounts.includes(id)) {
      setSelectedAccounts(selectedAccounts.filter(a => a !== id));
    } else {
      setSelectedAccounts([...selectedAccounts, id]);
    }
  };

  const handleExecute = async () => {
    if (!selectedTemplate || selectedAccounts.length === 0) {
      return toast.error('Check template and accounts selection');
    }
    setLoading(true);
    try {
      const payload: any = {
        name: batchName || `Batch ${new Date().toLocaleTimeString()}`,
        templateId: selectedTemplate.id,
        targetAccountIds: selectedAccounts,
        payloadOverride: payloadOverride
      };
      if (schedule) payload.scheduledAt = new Date(schedule).toISOString();

      await api.post('/tasks/batch', payload);
      toast.success('Batch created successfully');
      navigate('/live-ops'); 
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create batch');
    } finally {
      setLoading(false);
    }
  };

  const renderPayloadForm = () => {
    if (!selectedTemplate) return null;
    const fields: string[] = Object.keys(selectedTemplate.payload || {});
    
    return (
      <div className="space-y-4 mt-6 p-6 bg-dark-900/50 border border-white/5 rounded-xl">
        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <FileCode2 className="w-4 h-4" /> Configure Payload
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(field => (
            <div key={field}>
              <label className="block text-xs font-bold text-slate-400 mb-1 capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
              <input 
                type={typeof selectedTemplate.payload[field] === 'number' ? 'number' : 'text'}
                placeholder={`Value for ${field}...`}
                defaultValue={selectedTemplate.payload[field]}
                onChange={(e) => setPayloadOverride({ ...payloadOverride, [field]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })}
                className="w-full bg-dark-950 border border-dark-700 text-white rounded-lg px-3 py-2 text-sm focus:border-brand-500 outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <FileCode2 className="h-8 w-8 text-brand-400" />
          Task Builder
        </h1>
        <p className="text-slate-400 font-medium">Orchestrate complex automation tasks across multiple profiles</p>
      </div>

      <div className="flex items-center gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex-1 h-2 rounded-full transition-colors ${step >= i ? 'bg-brand-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-dark-800'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Copy className="h-5 w-5 text-brand-400" /> Select Task Template
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {platforms.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPlatform(p)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${filterPlatform === p ? 'bg-brand-500 border-brand-500 text-white' : 'bg-dark-900 border-dark-700 text-slate-400 hover:border-slate-500'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredTemplates.map(t => (
              <div 
                key={t.id} 
                onClick={() => { setSelectedTemplate(t); setPayloadOverride({}); }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedTemplate?.id === t.id ? 'bg-brand-500/10 border-brand-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-dark-900 border-dark-700 hover:border-slate-600'}`}
              >
                <div className="flex justify-between items-start mb-2">
                   <h3 className="font-bold text-white leading-tight">{t.name}</h3>
                   {t.tenantId === null && <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded uppercase font-black">Global</span>}
                </div>
                <p className="text-[10px] text-slate-500 mb-2 line-clamp-2">{t.description}</p>
                <p className="text-[10px] text-slate-400 font-mono bg-dark-950 p-1.5 rounded truncate">
                  {t.jobType}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button 
              onClick={() => setStep(2)} 
              disabled={!selectedTemplate}
              className="btn-primary"
            >
              Continue to Target Selection
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-400" /> Select Target Accounts
            </h2>
            <div className="flex gap-4 items-center">
              <div className="flex gap-2">
                {['All', 'x64', 'arm64'].map(arch => (
                  <button 
                    key={arch} 
                    onClick={() => setFilterArch(arch)}
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all border ${filterArch === arch ? 'bg-brand-500 border-brand-500 text-white' : 'bg-dark-900 border-dark-700 text-slate-500'}`}
                  >
                    {arch}
                  </button>
                ))}
              </div>
              <select 
                value={filterTargetPlatform} 
                onChange={(e) => setFilterTargetPlatform(e.target.value)}
                className="bg-dark-900 border border-dark-700 text-slate-400 text-[10px] font-black uppercase px-2 py-1 rounded outline-none"
              >
                <option value="All">All Platforms</option>
                <option value="DESKTOP">Desktop</option>
                <option value="MOBILE">Mobile</option>
                <option value="VISION_PRO">VisionPro</option>
                <option value="OCULUS">Oculus</option>
              </select>
              <button 
                onClick={() => setSelectedAccounts(accounts.filter(a => {
                  const archMatch = filterArch === 'All' || a.profile?.fingerprint?.arch === filterArch;
                  const platformMatch = filterTargetPlatform === 'All' || a.profile?.platform === filterTargetPlatform;
                  return archMatch && platformMatch;
                }).map(a => a.id))}
                className="text-xs text-brand-400 hover:text-brand-300 font-bold uppercase tracking-widest"
              >
                Select Filtered
              </button>
              <button 
                onClick={() => setSelectedAccounts([])}
                className="text-xs text-slate-500 hover:text-slate-400 font-bold uppercase tracking-widest"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 pb-2">
            {accounts.filter(a => {
              const archMatch = filterArch === 'All' || a.profile?.fingerprint?.arch === filterArch;
              const platformMatch = filterTargetPlatform === 'All' || a.profile?.platform === filterTargetPlatform;
              return archMatch && platformMatch;
            }).map(acc => (
              <div 
                key={acc.id}
                onClick={() => toggleAccount(acc.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedAccounts.includes(acc.id) ? 'bg-purple-500/10 border-purple-500' : 'bg-dark-900 border-dark-700'}`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center border ${selectedAccounts.includes(acc.id) ? 'bg-purple-500 border-purple-500' : 'border-slate-600'}`}>
                  {selectedAccounts.includes(acc.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white mb-1">{acc.username}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-black bg-white/5 border border-white/10 px-1 py-0.5 rounded text-slate-400 uppercase tracking-tighter">
                      {acc.profile?.platform || 'D'}
                    </span>
                    <span className="text-[8px] font-black bg-brand-500/5 border border-brand-500/10 px-1 py-0.5 rounded text-brand-400 uppercase tracking-tighter">
                      {acc.profile?.fingerprint?.arch || 'x64'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
            <button 
              onClick={() => setStep(3)} 
              disabled={selectedAccounts.length === 0}
              className="btn-primary"
            >
              Continue to Review ({selectedAccounts.length} selected)
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Play className="h-5 w-5 text-green-400" /> Review and Execute
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Batch Name (Optional)</label>
              <input 
                type="text" 
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="Give this run a memorable name..."
                className="w-full bg-dark-900 border border-dark-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500"
              />
            </div>

            {renderPayloadForm()}
            
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                 <Calendar className="w-4 h-4" /> Schedule (Optional)
              </label>
              <input 
                type="datetime-local" 
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="w-full bg-dark-900 border border-dark-700 text-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500"
              />
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Clock className="w-3 h-3"/> Leave empty to run immediately</p>
            </div>

            {/* Enterprise Overrides */}
            <div className="p-6 bg-brand-500/5 border border-brand-500/20 rounded-2xl space-y-4">
               <h3 className="text-sm font-black text-brand-400 uppercase tracking-widest flex items-center gap-2">
                 <Shield className="w-4 h-4" /> Enterprise Network Overrides
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Proxy Pool Override</label>
                    <select 
                      onChange={(e) => setPayloadOverride({ ...payloadOverride, proxyPoolId: e.target.value })}
                      className="w-full bg-dark-950 border border-dark-700 text-white rounded-lg px-3 py-2 text-sm focus:border-brand-500 outline-none"
                    >
                      <option value="">Use Profile Default</option>
                      {networkData.pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Network Policy Override</label>
                    <select 
                      onChange={(e) => setPayloadOverride({ ...payloadOverride, networkPolicyId: e.target.value })}
                      className="w-full bg-dark-950 border border-dark-700 text-white rounded-lg px-3 py-2 text-sm focus:border-brand-500 outline-none"
                    >
                      <option value="">Use Profile Default</option>
                      {networkData.policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Fingerprint Preset</label>
                    <select 
                      onChange={(e) => setPayloadOverride({ ...payloadOverride, fingerprintPresetId: e.target.value })}
                      className="w-full bg-dark-950 border border-dark-700 text-white rounded-lg px-3 py-2 text-sm focus:border-brand-500 outline-none"
                    >
                      <option value="">Use Profile Default</option>
                      {networkData.presets.map(p => <option key={p.id} value={p.id}>{p.name} ({p.platform})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">IP Rotation Strategy</label>
                    <select 
                      onChange={(e) => setPayloadOverride({ ...payloadOverride, ipRotationStrategy: e.target.value })}
                      className="w-full bg-dark-950 border border-dark-700 text-white rounded-lg px-3 py-2 text-sm focus:border-brand-500 outline-none"
                    >
                      <option value="NONE">None</option>
                      <option value="PER_TASK">Per Task</option>
                      <option value="PER_ACCOUNT">Per Account</option>
                      <option value="PER_RUN">Per Run</option>
                    </select>
                  </div>
               </div>
            </div>

            <div className="bg-dark-950 p-6 rounded-xl border border-dark-700 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">You are about to execute:</p>
                <p className="text-white font-bold text-lg">{selectedTemplate?.name}</p>
                <p className="text-brand-400 text-sm">{selectedAccounts.length} Target Accounts</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-between">
            <button onClick={() => setStep(2)} className="btn-secondary" disabled={loading}>Back</button>
            <button 
              onClick={handleExecute} 
              disabled={loading}
              className="btn-primary bg-green-500 hover:bg-green-600 shadow-green-500/20 text-white flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {schedule ? 'Schedule Batch' : 'Execute Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
