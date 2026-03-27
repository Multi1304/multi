import { useEffect, useState } from 'react';
import { Play, Clock, CheckCircle2, XCircle, RefreshCcw, Activity, Terminal, Database, MoreVertical, Search, Filter, Zap, Boxes, Sparkles } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { toast } from 'react-hot-toast';

export default function Automation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileIdFromUrl = searchParams.get('profileId');
  const accountIdFromUrl = searchParams.get('accountId');
  const runIdFromUrl = searchParams.get('runId');

  const [jobs, setJobs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnqueue, setShowEnqueue] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [contextProfile, setContextProfile] = useState<any>(null);
  const [contextProfileAccess, setContextProfileAccess] = useState<any>(null);
  const [contextFlowAccess, setContextFlowAccess] = useState<any>(null);
  const [contextFlowOperations, setContextFlowOperations] = useState<any>(null);

  // Enqueue state
  const [accountId, setAccountId] = useState(accountIdFromUrl || '');
  const [jobType, setJobType] = useState('login_check');
  const [payloadStr, setPayloadStr] = useState('{\n  "url": "https://example.com/login"\n}');

  const [voicePrompt, setVoicePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // JSON Import state
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [importJson, setImportJson] = useState('');

  const fetchJobs = async () => {
    try {
      const params: any = { limit: 50 };
      if (profileIdFromUrl && profileIdFromUrl !== 'null') params.profileId = profileIdFromUrl;
      if (accountIdFromUrl && accountIdFromUrl !== 'null') params.accountId = accountIdFromUrl;

      // Fetch V1 Jobs
      const jobsRes = await api.get('/automation/jobs', { params });
      const v1Jobs = (jobsRes.data.data || []).map((j: any) => ({
        ...j,
        moduleType: 'V1 Batch',
        title: j.type.replace('_', ' '),
        instanceId: j.id,
        persona: j.account?.username || 'System Default',
        lastActivity: j.createdAt,
        result: j.output ? 'Success' : j.error ? `Error: ${j.error}` : 'Running'
      }));

      // Fetch V2 Flow Runs
      const runsRes = await api.get('/flows/runs');
      const v2Runs = (runsRes.data || []).map((r: any) => ({
        ...r,
        moduleType: 'V2 Flow',
        title: r.flow?.name || 'V2 Flow',
        instanceId: r.id,
        persona: 'Dynamic AI Profile',
        lastActivity: r.createdAt,
        result: r.status === 'success' ? 'Completed' : r.error ? `Error: ${r.error}` : 'Tracing Steps...'
      }));

      // Unify and sort
      const unified = [...v1Jobs, ...v2Runs].sort((a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );

      setJobs(unified);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const params: any = {};
      if (profileIdFromUrl && profileIdFromUrl !== 'null') params.profileId = profileIdFromUrl;

      const { data } = await api.get('/accounts', { params });
      setAccounts(data);

      // Smart pre-selection
      if (accountIdFromUrl && accountIdFromUrl !== 'null') {
        setAccountId(accountIdFromUrl);
      } else if (data.length > 0 && !accountId) {
        setAccountId(data[0].id);
      }
    } catch {
      toast.error('Failed to load accounts');
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/flows');
      // Filter public flows or those tagged as templates
      const filtered = data.filter((f: any) => f.isPublic === true);

      // If we have templates from DB, use them but keep names for sorting
      if (filtered.length > 0) {
        setTemplates(filtered);
      } else {
        // Final Fallback (Should be handled by seeder now, but keep for safety)
        setTemplates([
          { id: 'template-hotmail', name: 'Outlook/Hotmail Builder', description: 'Structured mailbox signup flow with stronger validation and domain handling.', steps: [{}, {}, {}, {}, {}, {}, {}] },
          { id: 'template-instagram', name: 'Instagram Engagement', description: 'Simulate mobile scrolling, likes and bio updates.', steps: [{}, {}, {}, {}, {}] },
          { id: 'template-tiktok', name: 'TikTok Trend Farmer', description: 'Video interaction, swipe emulation and metadata spoofing.', steps: [{}, {}, {}, {}, {}] },
          { id: 'template-youtube', name: 'YouTube Warmup', description: 'Watch, like and subscribe with natural pacing.', steps: [{}, {}, {}, {}, {}] },
          { id: 'template-spotify', name: 'Spotify Playlist Pusher', description: 'Stream tracks and follow artists with mobile blending.', steps: [{}, {}, {}, {}, {}] },
          { id: 'template-facebook', name: 'FB Ads Trust Builder', description: 'Build account trust with organic newsfeed engagement.', steps: [{}, {}, {}, {}, {}] },
          { id: 'template-twitter', name: 'X Social Threader', description: 'Create threads and engage with viral hashtags.', steps: [{}, {}, {}, {}, {}] },
          { id: 'template-traffic', name: 'Web Traffic Journey', description: 'Deep path simulation with stronger session pathing defaults.', steps: [{}, {}, {}, {}] }
        ]);
      }
    } catch (err) {
      console.error('Failed to fetch templates');
      setTemplates([]);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchAccounts();
    fetchTemplates();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [profileIdFromUrl, accountIdFromUrl]);

  // Sync selected job with polled data
  useEffect(() => {
    if (showDetails && selectedJob) {
      const fresh = jobs.find(j => j.id === selectedJob.id);
      if (fresh) setSelectedJob(fresh);
    }
  }, [jobs, showDetails]);

  useEffect(() => {
    if (!runIdFromUrl) return;
    const targetRun = jobs.find((job) => job.instanceId === runIdFromUrl);
    if (!targetRun) return;
    setSelectedJob(targetRun);
    setShowDetails(true);
  }, [jobs, runIdFromUrl]);

  useEffect(() => {
    const loadContext = async () => {
      if (!showDetails || !selectedJob) {
        setContextProfile(null);
        setContextProfileAccess(null);
        setContextFlowAccess(null);
        setContextFlowOperations(null);
        return;
      }

      const profileId = profileIdFromUrl || selectedJob.profileId || selectedJob.account?.profileId || null;
      const flowId = selectedJob.flowId || null;

      try {
        const [profileRes, profileAccessRes, flowAccessRes, flowOperationsRes] = await Promise.all([
          profileId ? api.get(`/profiles/${profileId}`).catch(() => null) : Promise.resolve(null),
          profileId ? api.get(`/profiles/${profileId}/access`).catch(() => null) : Promise.resolve(null),
          flowId ? api.get(`/flows/${flowId}/access`).catch(() => null) : Promise.resolve(null),
          flowId ? api.get(`/flows/${flowId}/operations`).catch(() => null) : Promise.resolve(null),
        ]);

        setContextProfile(profileRes?.data || null);
        setContextProfileAccess(profileAccessRes?.data || null);
        setContextFlowAccess(flowAccessRes?.data || null);
        setContextFlowOperations(flowOperationsRes?.data || null);
      } catch {
        setContextProfile(null);
        setContextProfileAccess(null);
        setContextFlowAccess(null);
        setContextFlowOperations(null);
      }
    };

    void loadContext();
  }, [showDetails, selectedJob, profileIdFromUrl]);

  const handleEnqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payloadObj = JSON.parse(payloadStr);
      await api.post('/automation/enqueue', {
        accountId,
        jobType,
        payload: payloadObj
      });
      toast.success('Job enqueued successfully');
      setShowEnqueue(false);
      fetchJobs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid JSON or Execution Failed');
    }
  };

  const handleVoiceToFlow = async () => {
    setIsGenerating(true);
    try {
      const { data } = await api.post('/flows/voice-to-flow', { transcript: voicePrompt });
      toast.success('AI generated a flow draft. Redirecting to the builder...');
      const payload = {
        name: `AI generated: ${voicePrompt.substring(0, 20)}...`,
        steps: data.generatedSteps || []
      };
      const flowRes = await api.post('/flows', payload);
      navigate(`/flows/builder/${flowRes.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate the flow draft with AI');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleJsonImport = async () => {
    try {
      const parsed = JSON.parse(importJson);
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        throw new Error('Invalid flow format: "steps" array is required');
      }

      // Normalization Logic: Map user format to V2 internal format
      const normalizeStep = (s: any, idx: number): any => {
        // Normalize type immediately to handle "Conditional" vs "conditional"
        const rawType = (s.type || 'wait').toLowerCase().trim().replace(/\s+/g, '_');

        // Flatten everything into a single level config
        const { type: _ignored, id, order, params, parameters, config: oldConfig, ...rest } = s;

        const config = {
          ...(oldConfig || {}),
          ...(params || {}),
          ...(parameters || {}),
          ...rest
        };

        // Specific field harmonizations
        if (rawType === 'navigate' && config.targetUrl && !config.url) config.url = config.targetUrl;
        if (rawType === 'type' && config.value && !config.text) config.text = config.value;
        if (rawType === 'wait' && config.ms && !config.duration) config.duration = config.ms;

        // Conditional Logic Harmonization (Nuclear & Case-Insensitive)
        if (rawType === 'conditional' && (config.condition || config.selector)) {
          const conditionText = config.condition || '';
          if (!config.selector) {
            // Extract #id or .class from "if element #id exists"
            const match = conditionText.match(/#[\w-]+|\.[\w-]+/);
            if (match) config.selector = match[0];
          }
        }

        return {
          id: id || `step_${idx}`,
          order: order !== undefined ? order : idx,
          type: rawType,
          config
        };
      };

      const normalizedSteps = parsed.steps.map((s: any, idx: number) => normalizeStep(s, idx));

      const payload = {
        name: parsed.flowName || parsed.name || `Imported Flow ${new Date().toLocaleDateString()}`,
        description: parsed.description || 'Imported from JSON',
        steps: normalizedSteps
      };

      const { data } = await api.post('/flows', payload);
      toast.success('Flow imported successfully!');
      setShowJsonImport(false);
      navigate(`/flows/builder/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Invalid JSON format');
    }
  };

  const getAnalysisTone = (errorClass?: string) => {
    if (errorClass === 'contract_violation' || errorClass === 'stage_desync' || errorClass === 'stalled_transition') {
      return 'text-red-300 bg-red-500/10 border-red-500/20';
    }
    if (errorClass === 'selector_timeout' || errorClass === 'value_mismatch' || errorClass === 'input_validation') {
      return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
    }
    return 'text-slate-300 bg-white/5 border-white/10';
  };

  const retrySelectedFlowRun = async () => {
    if (!selectedJob?.moduleType?.includes('V2')) return;
    try {
      toast.loading('Retrying flow run...', { id: 'retry-flow-run' });
      const { data } = await api.post(`/flows/runs/${selectedJob.id}/retry`);
      toast.success(data?.deduplicated ? 'Reusing active run' : 'Retry launched', { id: 'retry-flow-run' });
      await fetchJobs();
      if (data?.runId) {
        navigate(`/automation?runId=${encodeURIComponent(data.runId)}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to retry flow run', { id: 'retry-flow-run' });
    }
  };

  const failedRuns = jobs.filter((job) => job.status === 'failed');
  const runningRuns = jobs.filter((job) => job.status === 'running' || job.status === 'processing');
  const weakestRun = failedRuns[0] || jobs.find((job) => job.analysis?.errorClass || job.status === 'failed') || null;
  const automationGuidance: string[] = [];
  if (failedRuns.length > 0) automationGuidance.push(`${failedRuns.length} run(s) are failed. Start with the newest failure before enqueueing more work.`);
  if (runningRuns.length > 3) automationGuidance.push(`${runningRuns.length} runs are active right now. Let them settle before treating queue noise as a flow bug.`);
  if (weakestRun?.analysis?.errorClass) automationGuidance.push(`Top current error class is ${weakestRun.analysis.errorClass}. Use it to decide whether the issue is contractual, selector-related or operational.`);
  if (automationGuidance.length === 0) automationGuidance.push('Automation looks calm right now. Review the most recent successful run before promoting new changes.');

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Activity className="h-8 w-8 text-brand-400" />
            Automation Hub
          </h1>
          <p className="text-slate-400 font-medium mt-1">Design, execute and monitor browser automation workflows</p>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={() => navigate('/flows/builder/new')}
            className="btn-primary flex items-center gap-2 min-w-fit"
          >
            <Zap size={20} className="text-blue-200 group-hover:scale-110 transition-transform" />
            Create V2 Flow
          </button>
          <button
            onClick={() => setShowJsonImport(true)}
            className="btn-secondary flex items-center gap-2 min-w-fit"
          >
            <Database size={20} className="text-white/40 group-hover:scale-110 transition-transform" />
            Import JSON Flow
          </button>
          <button
            onClick={() => navigate('/tasks/builder/new')}
            className="btn-secondary flex items-center gap-2 min-w-fit"
          >
            <Boxes size={20} className="text-white/40 group-hover:scale-110 transition-transform" />
            New V1 Batch
          </button>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Automation Focus</p>
            <h2 className="text-2xl font-black text-white mt-2">What deserves attention first</h2>
            <p className="text-sm text-slate-400 mt-2">
              This turns the run list into a short operational read so you can decide whether to debug, retry or leave the system alone.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 px-4 py-3 min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommended Next Step</p>
            <p className="text-sm font-bold text-white mt-2">{automationGuidance[0]}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Runs</p>
            <p className="text-2xl font-black text-white mt-2">{jobs.length}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Running</p>
            <p className={`text-2xl font-black mt-2 ${runningRuns.length > 3 ? 'text-amber-400' : 'text-emerald-400'}`}>{runningRuns.length}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Failed</p>
            <p className={`text-2xl font-black mt-2 ${failedRuns.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{failedRuns.length}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top Error</p>
            <p className="text-sm font-black text-white mt-2 truncate">{weakestRun?.analysis?.errorClass || weakestRun?.error || 'none'}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Runbook Summary</p>
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
            {automationGuidance.map((item, index) => (
              <p key={`automation-guidance-${index}`} className="text-sm text-slate-300">
                {index + 1}. {item}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Permanent Manual Menu (Highest Priority) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-dark border-brand-500/30 p-8 hover:border-brand-500 transition-all cursor-pointer group" onClick={() => navigate('/flows/builder/new')}>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 rounded-2xl bg-brand-500/20 text-brand-400 group-hover:bg-brand-500 group-hover:text-white transition-all shadow-lg shadow-brand-500/10">
              <Zap size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white group-hover:text-brand-400 transition-colors uppercase italic tracking-tighter">Manual Builder</h2>
              <p className="text-slate-400 text-sm font-medium">Design a flow from scratch, step by step</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-6">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Best for advanced workflows</span>
            <span className="text-brand-400 text-xs font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">Open V2 Builder -&gt;</span>
          </div>
        </div>

        <div className="glass-dark border-white/5 p-8 hover:border-white/20 transition-all cursor-pointer group" onClick={() => navigate('/tasks/builder/new')}>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 rounded-2xl bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white transition-all">
              <Boxes size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-200 group-hover:text-white transition-colors uppercase tracking-tight">Batch Automation (V1)</h2>
              <p className="text-slate-500 text-sm">Run predefined tasks at scale</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-6">
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Legacy Support</span>
            <span className="text-slate-400 text-xs font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">Open V1 Builder -&gt;</span>
          </div>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-brand-400" /> Automation Templates
            </h2>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Ready to launch</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div key={template.id} className="glass-dark border-white/5 p-6 hover:border-brand-500/30 transition-all cursor-pointer group" onClick={() => navigate(`/flows/builder/${template.id}`)}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-brand-500/10 text-brand-400 group-hover:bg-brand-500 group-hover:text-white transition-all">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-brand-400 transition-colors uppercase tracking-tight">{template.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-bold tracking-widest uppercase">V2 Template</span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4 h-10">{template.description || 'Global automation template'}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{template.steps?.length || 0} steps</span>
                  <span className="text-brand-400 text-xs font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">Open template -&gt;</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="grid grid-cols-1 gap-8">
        <div className="glass-dark border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Terminal className="h-5 w-5 text-slate-500" /> Executive Logs
            </h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-600" />
                <input type="text" placeholder="Search logs..." className="bg-dark-950/50 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-400 w-48 focus:outline-none focus:ring-1 focus:ring-brand-500/50" />
              </div>
              <button className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-500 hover:text-white transition-all">
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="executive-table">
              <thead>
                <tr className="executive-table-header">
                  <th className="px-8 py-5">Current Status</th>
                  <th className="px-8 py-5">Automation Module</th>
                  <th className="px-8 py-5">Instance ID</th>
                  <th className="px-8 py-5">Assigned Persona</th>
                  <th className="px-8 py-5">Last Activity</th>
                  <th className="px-8 py-5 text-right pr-12">Execution Result</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-white/5">
                {jobs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <Database className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Awaiting first execution</p>
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr
                      key={job.instanceId}
                      className="executive-table-row cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedJob(job);
                        setShowDetails(true);
                      }}
                    >
                      <td className="px-8 py-6">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-white tracking-tight capitalize">{job.title}</span>
                          <span className="text-[10px] text-slate-500 font-medium">{job.moduleType} Worker</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="font-mono text-[10px] text-slate-400 px-2 py-1 rounded-lg bg-dark-950 border border-white/5 shadow-inner inline-block shrink-0" title={job.instanceId}>{job.instanceId.substring(0, 12)}...</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-dark-950 border border-white/5 flex items-center justify-center text-[10px] font-black text-brand-400">
                            {job.persona.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm text-slate-200 font-bold tracking-tight">
                              {job.persona}
                            </span>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {job.moduleType === 'V2 Flow' ? 'AI-Engine Managed' : 'Manual Identity'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-xs text-slate-400 font-medium">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-brand-500/50" />
                          {new Date(job.lastActivity).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right pr-12">
                        <div className="flex items-center justify-end gap-6">
                          <p className="text-xs font-mono text-slate-400 truncate max-w-[250px] bg-dark-950/50 px-3 py-1.5 rounded-lg border border-white/5">
                            {job.result}
                          </p>
                          <button className="text-slate-600 hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/5">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Voice-to-Flow (Experimental AI Section) at the very bottom */}
      <div className="glass-dark border-white/5 p-8 relative overflow-hidden group opacity-60 hover:opacity-90 transition-opacity mt-12">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Sparkles className="w-24 h-24 text-brand-400" />
        </div>
        <div className="relative z-10">
          <h2 className="text-lg font-bold text-slate-300 flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-brand-400" /> AI Flow Drafting (Experimental)
          </h2>
          <p className="text-slate-500 text-sm mb-6 max-w-2xl">
            Describe the automation you want to draft. This beta feature usually gives you a strong starting point, but it may still need manual refinement.
          </p>
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Example: 'Build a flow that opens a dashboard, applies filters, and exports results'..."
              className="bg-dark-800 border-white/5 rounded-xl px-4 py-3 text-slate-300 flex-1 focus:ring-1 focus:ring-brand-500/50 outline-none"
              value={voicePrompt}
              onChange={(e) => setVoicePrompt(e.target.value)}
            />
            <button
              onClick={handleVoiceToFlow}
              disabled={isGenerating || !voicePrompt}
              className="btn-secondary flex items-center justify-center gap-2 px-8 min-w-[150px]"
            >
              {isGenerating ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Zap size={18} />}
              {isGenerating ? 'Generating draft' : 'Generate Draft'}
            </button>
          </div>
        </div>
      </div>

      {/* JSON Import Modal */}
      {showJsonImport && (
        <div className="fixed inset-0 bg-dark-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-dark border-white/10 p-8 w-full max-w-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Import JSON Flow</h2>
                <p className="text-slate-500 text-sm font-medium">Paste a V2 flow JSON payload to load it directly into Camel</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-slate-800 flex items-center justify-center">
                <Database className="h-6 w-6 text-brand-400" />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">JSON Content</label>
                <textarea
                  className="input-field font-mono text-xs h-64 bg-dark-950/80 border-white/5 focus:border-brand-500/50 transition-all resize-none"
                  placeholder='{ "name": "V2 Flow", "steps": [...] }'
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={() => setShowJsonImport(false)} className="btn-secondary px-8 font-bold text-xs uppercase tracking-widest">Cancel</button>
                <button onClick={handleJsonImport} className="btn-primary px-10 font-black text-xs uppercase tracking-widest">Import Now</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enqueue Modal */}
      {showEnqueue && (
        <div className="fixed inset-0 bg-dark-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-dark border-white/10 p-8 w-full max-w-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Initiate Automation</h2>
                <p className="text-slate-500 text-sm font-medium">Select parameters for the new worker task</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-brand-gradient flex items-center justify-center">
                <Play className="h-6 w-6 text-white fill-white" />
              </div>
            </div>

            <form onSubmit={handleEnqueue} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Target Account</label>
                  <select
                    className="input-field appearance-none"
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    required
                  >
                    <option value="">Select identity...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Job Template</label>
                  <select
                    className="input-field appearance-none"
                    value={jobType}
                    onChange={e => setJobType(e.target.value)}
                  >
                    <option value="login_check">Standard Login Validation</option>
                    <option value="browser_action">Remote Interaction</option>
                    <option value="scrape">DMM Data Extraction</option>
                    <option value="session_maintenance">Cookie Heartbeat</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Configuration Payload (JSON)</label>
                <div className="relative group">
                  <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"></div>
                  <textarea
                    className="input-field font-mono text-xs h-40 bg-dark-950/80 border-white/5 group-focus-within:border-brand-500/50 transition-all resize-none"
                    value={payloadStr}
                    onChange={e => setPayloadStr(e.target.value)}
                  />
                  <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"></div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={() => setShowEnqueue(false)} className="btn-secondary px-8 font-bold text-xs uppercase tracking-widest">Abort</button>
                <button type="submit" className="btn-primary px-10 font-black text-xs uppercase tracking-widest">Launch execution</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Details Modal */}
      {showDetails && selectedJob && (
        <div className="fixed inset-0 bg-dark-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-dark border-white/10 p-8 w-full max-w-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase">{selectedJob.title}</h2>
                <p className="text-brand-400 text-xs font-bold tracking-widest uppercase mt-1">{selectedJob.moduleType} Details</p>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Guided Run Summary</p>
                <p className="text-sm font-bold text-white mt-2">
                  {selectedJob.title} is currently {selectedJob.status} and {selectedJob.moduleType.includes('V2') ? 'has step-level diagnostics available.' : 'is using the legacy V1 execution path.'}
                </p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <p className="text-sm text-slate-300">
                    1. {selectedJob.analysis?.failedStepId
                      ? `Start with step ${selectedJob.analysis.failedStepId}, because the analysis already identified it as the failing step.`
                      : selectedJob.status === 'failed'
                        ? 'Open the first failing trace block below before retrying this run.'
                        : 'Use the latest screenshot and trace to confirm that the run is progressing as expected.'}
                  </p>
                  <p className="text-sm text-slate-300">
                    2. {selectedJob.comparisonToPrevious?.contractChanged
                      ? 'The contract changed since the previous run, so compare behavior before assuming infrastructure drift.'
                      : selectedJob.comparisonToPrevious?.statusChanged
                        ? 'The result changed since the previous run, so compare the previous snapshot before editing the flow.'
                        : 'If nothing changed versus the previous run, treat this more like an operational issue than a design issue.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Status</p>
                  <StatusBadge status={selectedJob.status} />
                </div>
                <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Start Time</p>
                  <p className="text-sm text-slate-200 font-bold">{new Date(selectedJob.lastActivity).toLocaleString()}</p>
                </div>
              </div>

              {selectedJob.moduleType.includes('V2') && selectedJob.contract && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Contract Health</p>
                    <p className={`text-sm font-bold ${selectedJob.contract.valid ? 'text-emerald-300' : 'text-red-300'}`}>
                      {selectedJob.contract.valid ? 'Valid' : 'Invalid'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-2">Warnings: {selectedJob.contract.warnings?.length || 0} · Errors: {selectedJob.contract.errors?.length || 0}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Run Analysis</p>
                    <p className="text-sm text-slate-200 font-bold uppercase">{selectedJob.analysis?.errorClass || 'none'}</p>
                    {selectedJob.analysis?.failedStepId && (
                      <p className="text-[10px] text-red-300 mt-2">Failed Step: {selectedJob.analysis.failedStepId}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Previous Run Diff</p>
                    {selectedJob.comparisonToPrevious?.previousRunId ? (
                      <div className="space-y-1 text-[10px] text-slate-300">
                        <p>Previous: <span className="font-mono text-brand-300">{selectedJob.comparisonToPrevious.previousRunId.slice(0, 8)}</span></p>
                        <p>Contract Changed: <span className={selectedJob.comparisonToPrevious.contractChanged ? 'text-amber-300' : 'text-emerald-300'}>{selectedJob.comparisonToPrevious.contractChanged ? 'Yes' : 'No'}</span></p>
                        <p>Status Changed: {selectedJob.comparisonToPrevious.statusChanged ? 'Yes' : 'No'}</p>
                        <p>Error Class Changed: {selectedJob.comparisonToPrevious.errorClassChanged ? 'Yes' : 'No'}</p>
                        <p>Step Count Delta: {selectedJob.comparisonToPrevious.stepCountDelta}</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">No previous run to compare</p>
                    )}
                  </div>
                </div>
              )}

              {(contextProfile || contextFlowAccess) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {contextProfile && (
                    <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                      <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Preset Risk</p>
                      <p className={`text-sm font-bold ${(contextProfile.fingerprint?.validation?.score || 0) >= 85 ? 'text-emerald-300' : (contextProfile.fingerprint?.validation?.score || 0) >= 65 ? 'text-amber-300' : 'text-red-300'}`}>
                        Score {(contextProfile.fingerprint?.validation?.score || 0)}/100
                      </p>
                      <p className="text-[10px] text-slate-500 mt-2">
                        {contextProfile.name} · {contextProfile.fingerprint?.presetVersion || 'legacy'} · {(contextProfileAccess?.effectivePermissions || []).join(', ') || 'no profile grants'}
                      </p>
                      {contextProfile.fingerprint?.validation?.issues?.[0] && (
                        <p className="text-[10px] text-amber-300 mt-2">{contextProfile.fingerprint.validation.issues[0]}</p>
                      )}
                    </div>
                  )}
                  {contextFlowAccess && (
                    <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                      <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Flow Access</p>
                      <p className="text-sm font-bold text-white">
                        {(contextFlowAccess.effectivePermissions || []).join(', ') || 'none'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-2">
                        {(contextFlowAccess.grants || []).length} explicit grants on this flow
                      </p>
                    </div>
                  )}
                  {selectedJob.moduleType.includes('V2') && (
                    <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-inner">
                      <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Flow Ops</p>
                      <p className="text-sm font-bold text-white">
                        {contextFlowOperations?.summary?.totalRuns || 0} runs · {contextFlowOperations?.summary?.failed || 0} failed
                      </p>
                      <p className="text-[10px] text-slate-500 mt-2">
                        Running {contextFlowOperations?.summary?.running || 0} · Retryable {contextFlowOperations?.summary?.retryable || 0}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Live Action Preview */}
              {selectedJob.lastScreenshot && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-400 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                    Live Interaction Feed
                  </p>
                  <div className="relative group rounded-2xl overflow-hidden border border-brand-500/30 bg-dark-950 shadow-2xl shadow-brand-500/5">
                    <img
                      src={selectedJob.lastScreenshot}
                      alt="Live Browser View"
                      className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-dark-950 px-4 py-3 flex items-center justify-between">
                      <span className="text-[10px] text-white/50 font-mono italic">
                        Current Step: <span className="text-brand-400 font-bold uppercase">{selectedJob.liveStepId || 'Executing...'}</span>
                      </span>
                      <div className="flex gap-1">
                        <div className="h-1 w-1 rounded-full bg-brand-400/30" />
                        <div className="h-1 w-1 rounded-full bg-brand-400/50" />
                        <div className="h-1 w-1 rounded-full bg-brand-400/80" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Step Execution Trace</p>
                <div className="space-y-3">
                  {selectedJob.steps && selectedJob.steps.length > 0 ? (
                    selectedJob.steps.map((s: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl bg-dark-950/50 border border-white/5 flex items-start gap-4">
                        <div className={`mt-1 p-1.5 rounded-lg ${s.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : s.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-brand-500/10 text-brand-400'}`}>
                          {s.status === 'completed' ? <CheckCircle2 size={14} /> : s.status === 'failed' ? <XCircle size={14} /> : <Clock size={14} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-200 uppercase tracking-tight">{s.stepId}</p>
                            <span className="text-[10px] text-slate-500 font-mono italic">{s.status}</span>
                          </div>
                          {s.contract && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                                {s.contract.normalizedType} · {s.contract.controlKind}
                              </span>
                              {s.contract.expectedBeforeStage && (
                                <span className="text-[10px] px-2 py-1 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300">
                                  before: {s.contract.expectedBeforeStage}
                                </span>
                              )}
                              {s.contract.expectedAfterStage && (
                                <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                                  after: {s.contract.expectedAfterStage}
                                </span>
                              )}
                            </div>
                          )}
                          {s.analysis && (
                            <div className={`mt-2 rounded-lg border px-3 py-2 text-[10px] ${getAnalysisTone(s.analysis.errorClass)}`}>
                              <p className="font-bold uppercase tracking-widest">{s.analysis.errorClass || 'none'}</p>
                              <p className="mt-1">Contract: {s.analysis.contractStatus || 'unknown'} · Failed Condition: {s.analysis.failedCondition || 'none'}</p>
                            </div>
                          )}
                          {s.contract?.preconditions?.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-2">Pre: {s.contract.preconditions.join(' · ')}</p>
                          )}
                          {s.contract?.postconditions?.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">Post: {s.contract.postconditions.join(' · ')}</p>
                          )}
                          {s.error && <p className="text-[10px] text-red-400 mt-2 font-mono whitespace-pre-wrap bg-red-400/5 p-2 rounded-lg border border-red-400/10">{s.error}</p>}
                          {s.output && <pre className="text-[10px] text-brand-400 mt-2 font-mono bg-brand-400/5 p-2 rounded-lg border border-brand-400/10 overflow-x-auto">{JSON.stringify(s.output, null, 2)}</pre>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center bg-dark-950/20 rounded-xl border border-dashed border-white/5">
                      <Terminal className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                        {selectedJob.moduleType.includes('V2')
                          ? 'Starting flow execution... (Tracing steps)'
                          : 'No granular logs available for this V1 job'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {selectedJob.error && !selectedJob.steps?.some((s: any) => s.error) && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Primary Error</p>
                  <p className="text-xs text-red-400 font-mono bg-red-400/5 p-4 rounded-xl border border-red-400/10 whitespace-pre-wrap">{selectedJob.error}</p>
                </div>
              )}

              <div className="flex justify-end pt-6 border-t border-white/5">
                {selectedJob.moduleType.includes('V2') && selectedJob.status === 'failed' && (
                  <button onClick={retrySelectedFlowRun} className="btn-primary mr-3 px-8 font-bold text-xs uppercase tracking-widest">
                    Retry Run
                  </button>
                )}
                <button onClick={() => setShowDetails(false)} className="btn-secondary px-8 font-bold text-xs uppercase tracking-widest">Close Logs</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: any = {
    success: { icon: CheckCircle2, text: 'Completed', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' },
    failed: { icon: XCircle, text: 'Failed', color: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]' },
    running: { icon: Activity, text: 'Running', color: 'text-brand-400 bg-brand-500/10 border-brand-400/30 animate-pulse shadow-[0_0_15px_rgba(14,165,233,0.2)]' },
    processing: { icon: Activity, text: 'Running', color: 'text-brand-400 bg-brand-500/10 border-brand-400/30 animate-pulse shadow-[0_0_15px_rgba(14,165,233,0.2)]' },
    pending: { icon: Clock, text: 'In Queue', color: 'text-slate-400 bg-white/5 border-white/10' },
  };
  const { icon: Icon, text, color } = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-wider border transition-all duration-300 ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}
