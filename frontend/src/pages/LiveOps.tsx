import { useEffect, useState } from 'react';
import { Activity, Server, Radio, Users, CheckCircle2, AlertCircle, Fingerprint, Monitor, ShieldCheck, RefreshCw, ArrowUpRight, ShieldAlert } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';
import { resolveBackendOrigin } from '../api/runtime';

export default function LiveOps() {
  const { token } = useAuthStore();
  const [dashboard, setDashboard] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [recordingReleaseGate, setRecordingReleaseGate] = useState(false);
  const [recordingSoakTest, setRecordingSoakTest] = useState(false);
  const [recordingWeeklyReport, setRecordingWeeklyReport] = useState(false);
  const [releaseGateForm, setReleaseGateForm] = useState({ releaseLabel: '', commitRef: '' });
  const [promotionActionKey, setPromotionActionKey] = useState<string | null>(null);
  const [incidentActionKey, setIncidentActionKey] = useState<string | null>(null);
  const [incidentDigestSending, setIncidentDigestSending] = useState(false);

  const refreshDashboard = async () => {
    const [{ data: dashboardData }, historyResponse, readinessResponse] = await Promise.all([
      api.get('/monitor/dashboard'),
      api.get('/monitor/history').catch(() => ({ data: null })),
      api.get('/monitor/readiness').catch(() => ({ data: null })),
    ]);
    setDashboard(dashboardData);
    setHistory(historyResponse.data);
    setReadiness(readinessResponse.data);
    if (dashboardData?.recentEvents) {
      setEvents(dashboardData.recentEvents);
    }
  };

  const recordReleaseGate = async () => {
    setRecordingReleaseGate(true);
    try {
      await api.post('/monitor/release-gates/record', {
        releaseLabel: releaseGateForm.releaseLabel || undefined,
        commitRef: releaseGateForm.commitRef || undefined,
      });
      await refreshDashboard();
      toast.success('Release gate snapshot recorded');
    } catch {
      toast.error('Failed to record release gate snapshot');
    } finally {
      setRecordingReleaseGate(false);
    }
  };

  const recordSoakTest = async () => {
    setRecordingSoakTest(true);
    try {
      await api.post('/monitor/soak-tests/record', {});
      await refreshDashboard();
      toast.success('Soak snapshot recorded');
    } catch {
      toast.error('Failed to record soak snapshot');
    } finally {
      setRecordingSoakTest(false);
    }
  };

  const recordWeeklyReport = async () => {
    setRecordingWeeklyReport(true);
    try {
      await api.post('/monitor/weekly-report/record', {});
      await refreshDashboard();
      toast.success('Weekly comparative report recorded');
    } catch {
      toast.error('Failed to record weekly comparative report');
    } finally {
      setRecordingWeeklyReport(false);
    }
  };

  const applyPromotionRecommendation = async (item: any) => {
    const key = `${item.resource}:${item.id}:${item.suggestedAction}`;
    setPromotionActionKey(key);
    try {
      await api.post('/monitor/promotion-advisor/apply', {
        resource: item.resource,
        resourceId: item.id,
        resourceName: item.name,
        action: item.suggestedAction,
        reasons: item.reasons || [],
        score: item.score || 0,
      });
      await refreshDashboard();
      toast.success(item.suggestedAction === 'review_current' ? 'Promotion review task created' : 'Promotion action applied');
    } catch {
      toast.error('Failed to apply promotion recommendation');
    } finally {
      setPromotionActionKey(null);
    }
  };

  const resolvePromotionTask = async (taskId: string, resolution: 'resolved' | 'dismissed') => {
    const key = `${taskId}:${resolution}`;
    setPromotionActionKey(key);
    try {
      await api.post(`/monitor/promotion-tasks/${taskId}/resolve`, { resolution });
      await refreshDashboard();
      toast.success(`Promotion task ${resolution}`);
    } catch {
      toast.error('Failed to resolve promotion task');
    } finally {
      setPromotionActionKey(null);
    }
  };

  const approvePromotionTask = async (taskId: string) => {
    const key = `${taskId}:approve`;
    setPromotionActionKey(key);
    try {
      await api.post(`/monitor/promotion-tasks/${taskId}/approve`, {});
      await refreshDashboard();
      toast.success('Promotion approved and applied');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to approve promotion task');
    } finally {
      setPromotionActionKey(null);
    }
  };

  const acknowledgeIncident = async (incidentId: string) => {
    const key = `${incidentId}:ack`;
    setIncidentActionKey(key);
    try {
      await api.post(`/monitor/incidents/${incidentId}/ack`, {});
      await refreshDashboard();
      toast.success('Incident acknowledged');
    } catch {
      toast.error('Failed to acknowledge incident');
    } finally {
      setIncidentActionKey(null);
    }
  };

  const resolveIncident = async (incidentId: string) => {
    const key = `${incidentId}:resolve`;
    setIncidentActionKey(key);
    try {
      await api.post(`/monitor/incidents/${incidentId}/resolve`, {});
      await refreshDashboard();
      toast.success('Incident resolved');
    } catch {
      toast.error('Failed to resolve incident');
    } finally {
      setIncidentActionKey(null);
    }
  };

  const remediateIncident = async (incidentId: string, actionId: string) => {
    const key = `${incidentId}:${actionId}`;
    setIncidentActionKey(key);
    try {
      const { data } = await api.post(`/monitor/incidents/${incidentId}/remediate`, { actionId });
      await refreshDashboard();
      toast.success(data?.queued ? 'Sensitive remediation queued for approval' : 'Incident remediation applied');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to apply remediation');
    } finally {
      setIncidentActionKey(null);
    }
  };

  const sendIncidentDigest = async () => {
    setIncidentDigestSending(true);
    try {
      const { data } = await api.post('/monitor/incidents/notify', {});
      await refreshDashboard();
      toast.success(`Incident digest processed: ${data?.sent || 0} sent`);
    } catch {
      toast.error('Failed to send incident digest');
    } finally {
      setIncidentDigestSending(false);
    }
  };

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    void refreshDashboard();

    const connectEventStream = async () => {
      try {
        const backendOrigin = await resolveBackendOrigin(true);
        if (cancelled) return;

        const url = `${backendOrigin}/api/monitor/stream?token=${token}`;
        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onopen = () => setConnected(true);

        eventSource.onerror = () => {
          setConnected(false);
          eventSource?.close();
          if (cancelled || reconnectTimer !== null) return;
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connectEventStream();
          }, 1500);
        };

        eventSource.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            setEvents(prev => [parsed, ...prev].slice(0, 50));
          } catch {
            // Drop malformed
          }
        };
      } catch {
        setConnected(false);
      }
    };

    void connectEventStream();

    return () => {
      cancelled = true;
      setConnected(false);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [token]);

  const openIncidents = dashboard?.incidentSummary?.open || 0;
  const criticalIncidents = dashboard?.incidentSummary?.critical || 0;
  const weakestProfile = (dashboard?.profileHealth?.weakest || [])[0] || null;
  const weakestFlow = (dashboard?.benchmarks || [])[0] || null;
  const weakestPreset = (dashboard?.presetBenchmarks || [])[0] || null;
  const securityPosture = dashboard?.securityPosture || null;
  const profileOperationsWithFailures = (dashboard?.recentProfileOperations || []).filter((operation: any) => operation.failed > 0).length;
  const operatorFocus = [
    {
      title: 'Release Readiness',
      tone: readiness?.status === 'ready' ? 'emerald' : readiness?.status === 'caution' ? 'amber' : 'red',
      value: readiness?.status || 'unknown',
      summary: readiness?.summary || 'No readiness summary available yet.',
      href: '#release-readiness',
      action: 'Inspect gates',
    },
    {
      title: 'Incidents',
      tone: criticalIncidents > 0 ? 'red' : openIncidents > 0 ? 'amber' : 'emerald',
      value: `${openIncidents} open`,
      summary: criticalIncidents > 0
        ? `${criticalIncidents} critical incident(s) need attention first.`
        : openIncidents > 0
          ? 'There are open incidents, but none are currently critical.'
          : 'No open incidents right now.',
      href: '#active-incidents',
      action: 'Open incidents',
    },
    {
      title: 'Weakest Flow',
      tone: (weakestFlow?.stabilityScore || 0) >= 75 ? 'emerald' : (weakestFlow?.stabilityScore || 0) >= 45 ? 'amber' : 'red',
      value: weakestFlow ? `${weakestFlow.stabilityScore}` : 'n/a',
      summary: weakestFlow
        ? `${weakestFlow.flowName} is the noisiest recent flow with top error ${weakestFlow.topErrorClass}.`
        : 'No flow benchmark data available yet.',
      href: '#flow-benchmarks',
      action: 'Review flow',
    },
    {
      title: 'Profile Risk',
      tone: (weakestProfile?.validationScore || 0) >= 85 ? 'emerald' : (weakestProfile?.validationScore || 0) >= 65 ? 'amber' : 'red',
      value: weakestProfile ? `${weakestProfile.validationScore}` : 'n/a',
      summary: weakestProfile
        ? `${weakestProfile.name} is currently the weakest profile and should be checked for drift or proxy issues.`
        : 'No profile health data available yet.',
      href: '#weakest-profiles',
      action: 'Open profile risk',
    },
  ];

  const nextActions: string[] = [];
  if (criticalIncidents > 0) nextActions.push('Resolve critical incidents before promoting flows or presets.');
  if ((readiness?.status || '') !== 'ready') nextActions.push('Keep new presets and flows in review until release readiness turns green.');
  if (profileOperationsWithFailures > 0) nextActions.push(`Retry ${profileOperationsWithFailures} recent profile operation batch(es) with partial failures.`);
  if (weakestPreset && weakestPreset.stabilityScore < 60) nextActions.push(`Re-evaluate preset ${weakestPreset.label} before leaving it recommended.`);
  if (securityPosture?.remoteExposureDetected && !securityPosture?.adminAllowlistConfigured) nextActions.push('Remote exposure is detected without an admin IP allowlist. Tighten ingress before trusting external access.');
  if ((securityPosture?.adminMfaCoverage || 100) < 100) nextActions.push('Finish MFA rollout for all admin accounts before widening access to sensitive panels.');
  if (nextActions.length === 0) nextActions.push('System looks stable. Focus on the lowest-scoring flow or preset before the next promotion.');
  const weeklyReport = dashboard?.weeklyReport?.current || null;
  const weeklyTrendTone =
    weeklyReport?.summary?.trend === 'improved'
      ? 'text-emerald-400'
      : weeklyReport?.summary?.trend === 'regressed'
        ? 'text-red-400'
        : 'text-amber-400';
  const weeklyReadinessTone =
    weeklyReport?.summary?.releaseReadiness === 'ready'
      ? 'text-emerald-400'
      : weeklyReport?.summary?.releaseReadiness === 'review'
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Radio className={`h-8 w-8 ${connected ? 'text-green-400 animate-pulse' : 'text-slate-500'}`} />
            Live Operations
          </h1>
          <p className="text-slate-400 font-medium">Real-time monitoring of system events and worker health</p>
        </div>
        <div className={`px-4 py-2 rounded-full border text-sm font-bold flex items-center gap-2 ${connected ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-slate-500'}`}></div>
          {connected ? 'SSE Connected' : 'Reconnecting...'}
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Operator Focus</p>
            <h2 className="text-2xl font-black text-white mt-2">What needs attention right now</h2>
            <p className="text-sm text-slate-400 mt-2">
              This strips the noise down to the four signals that most often decide whether Camel feels healthy or fragile in practice.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 px-4 py-3 min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommended Next Step</p>
            <p className="text-sm font-bold text-white mt-2">{nextActions[0]}</p>
            <p className="text-[11px] text-slate-500 mt-2">
              {connected ? 'Live event stream is connected.' : 'Event stream is reconnecting, so refresh if data feels stale.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
          {operatorFocus.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="rounded-2xl border border-white/5 bg-dark-950 p-4 hover:border-brand-500/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.title}</p>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  item.tone === 'emerald' ? 'text-emerald-400' : item.tone === 'amber' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {item.value}
                </span>
              </div>
              <p className="text-sm font-bold text-white mt-3">{item.action}</p>
              <p className="text-[11px] text-slate-500 mt-2">{item.summary}</p>
            </a>
          ))}
        </div>

      <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Runbook Summary</p>
        <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
          {nextActions.map((item, index) => (
            <p key={`next-action-${index}`} className="text-sm text-slate-300">
                {index + 1}. {item}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Security Posture</p>
            <h2 className="text-xl font-black text-white mt-2">Silent guardrails for external exposure</h2>
            <p className="text-sm text-slate-400 mt-2">
              This keeps the operator focused on the few security signals that can quietly turn a healthy Camel workspace into a risky one.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 px-4 py-3 min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Security Summary</p>
            <p className="text-sm font-bold text-white mt-2">{securityPosture?.summary || 'No security posture snapshot available yet.'}</p>
            <p className="text-[11px] text-slate-500 mt-2">
              {securityPosture?.warnings?.length || 0} warning(s) currently tracked
            </p>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exposure</p>
            <p className={`text-xl font-black mt-3 ${securityPosture?.remoteExposureDetected ? 'text-amber-400' : 'text-emerald-400'}`}>
              {securityPosture?.remoteExposureDetected ? 'Remote' : 'Local-only'}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              {securityPosture?.remoteExposureDetected
                ? 'Camel appears reachable beyond localhost. Keep ingress and admin surfaces tightly fenced.'
                : 'Camel is currently operating in a local-only posture.'}
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Admin Fence</p>
            <p className={`text-xl font-black mt-3 ${securityPosture?.adminAllowlistConfigured ? 'text-emerald-400' : 'text-red-400'}`}>
              {securityPosture?.adminAllowlistConfigured ? 'Allowlisted' : 'Open'}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              {securityPosture?.adminAllowlistConfigured
                ? 'Admin and sensitive surfaces already have an IP fence.'
                : 'Admin IP allowlist is not configured yet.'}
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Admin MFA</p>
            <p className={`text-xl font-black mt-3 ${(securityPosture?.adminMfaCoverage || 100) >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {securityPosture?.adminMfaCoverage ?? 0}%
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              {(securityPosture?.adminMfaCoverage || 100) >= 100
                ? 'All admin users currently have MFA enabled.'
                : 'At least one admin account still needs MFA enabled.'}
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">API Key Hygiene</p>
            <p className="text-xl font-black mt-3 text-white">
              {securityPosture?.apiKeys?.total ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              {securityPosture?.apiKeys?.expiringSoon ?? 0} expiring soon · {securityPosture?.apiKeys?.staleKeys ?? 0} stale
            </p>
          </div>
        </div>

        {(securityPosture?.warnings || []).length > 0 && (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Security Runbook</p>
              <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
                {(securityPosture?.warnings || []).map((warning: string, index: number) => (
                  <p key={`security-warning-${index}`} className="text-sm text-amber-50">
                    {index + 1}. {warning}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-dark border border-white/5 p-6 rounded-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Profiles & Accounts</p>
              <h2 className="text-3xl font-black text-white">{dashboard?.metrics?.totalProfiles || 0}</h2>
            </div>
          </div>
        </div>
        
        <div className="glass-dark border border-white/5 p-6 rounded-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Active Jobs</p>
              <h2 className="text-3xl font-black text-white">{dashboard?.metrics?.queueDepth?.active || events.filter(e => e.status === 'processing').length || 0}</h2>
            </div>
          </div>
        </div>

        <div className="glass-dark border border-white/5 p-6 rounded-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Server className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Online Workers</p>
              <h2 className="text-3xl font-black text-white">{dashboard?.metrics?.activeEdgeNodes || 0}</h2>
            </div>
          </div>
        </div>
        <div className="glass-dark border border-white/5 p-6 rounded-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Promotion Alerts</p>
              <h2 className="text-3xl font-black text-white">{dashboard?.promotionAlerts?.critical || 0}</h2>
            </div>
          </div>
        </div>
        <div className="glass-dark border border-white/5 p-6 rounded-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Incident Notify</p>
              <h2 className="text-3xl font-black text-white">{dashboard?.incidentNotifications?.sent || 0}</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Weekly Comparative Report</p>
            <h2 className="text-xl font-black text-white mt-2">Sustained evidence, not just today's telemetry</h2>
            <p className="text-sm text-slate-400 mt-2">
              This condenses the last 7 days against the previous 7 days so you can tell whether Camel is genuinely improving or just having a good hour.
            </p>
          </div>
          <button
            onClick={recordWeeklyReport}
            disabled={recordingWeeklyReport}
            className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" /> {recordingWeeklyReport ? 'Recording...' : 'Record Weekly Report'}
          </button>
        </div>
        {weeklyReport ? (
          <div className="p-4 grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Trend</p>
              <p className={`text-2xl font-black mt-2 ${weeklyTrendTone}`}>{weeklyReport.summary.trend}</p>
              <p className="text-[11px] text-slate-500 mt-2">Overall delta {weeklyReport.summary.overallDelta}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Readiness</p>
              <p className={`text-2xl font-black mt-2 ${weeklyReadinessTone}`}>{weeklyReport.summary.releaseReadiness}</p>
              <p className="text-[11px] text-slate-500 mt-2">Benchmark {weeklyReport.summary.benchmarkDelta} · gates {weeklyReport.summary.releaseGateDelta} · soak {weeklyReport.summary.soakDelta}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4 xl:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Weekly Guidance</p>
              <p className="text-sm font-bold text-white mt-2">{weeklyReport.recommendations?.[0] || 'No weekly recommendation available yet.'}</p>
              <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
                {(weeklyReport.highlights || []).slice(0, 2).map((item: string, index: number) => (
                  <p key={`weekly-highlight-${index}`} className="text-[11px] text-emerald-300">{item}</p>
                ))}
                {(weeklyReport.risks || []).slice(0, 2).map((item: string, index: number) => (
                  <p key={`weekly-risk-${index}`} className="text-[11px] text-amber-300">{item}</p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-500">No weekly comparative report recorded yet.</div>
        )}
      </div>

      {(dashboard?.incidentSummary?.open || 0) > 0 && (
        <div id="active-incidents" className="glass-dark border border-red-500/20 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-red-500/10 bg-red-500/5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400" />
                Active Incidents
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {dashboard?.incidentSummary?.critical || 0} critical, {dashboard?.incidentSummary?.high || 0} high, {dashboard?.incidentSummary?.warning || 0} warning
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Notifications sent {dashboard?.incidentNotifications?.sent || 0} · failed {dashboard?.incidentNotifications?.failed || 0}
              </p>
            </div>
            <button
              onClick={sendIncidentDigest}
              disabled={incidentDigestSending}
              className="px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all disabled:opacity-50"
            >
              {incidentDigestSending ? 'Sending...' : 'Send Digest'}
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {(dashboard?.incidents || []).slice(0, 6).map((incident: any) => (
              <div key={incident.id} className="p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      incident.severity === 'critical'
                        ? 'bg-red-500/10 text-red-300'
                        : incident.severity === 'high'
                        ? 'bg-amber-500/10 text-amber-300'
                        : 'bg-slate-500/10 text-slate-300'
                    }`}>
                      {incident.severity}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{incident.status}</span>
                  </div>
                  <p className="text-sm font-bold text-white mt-2">{incident.title}</p>
                  <p className="text-xs text-slate-400 mt-1">{incident.summary}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {incident.playbook?.nextBestAction || incident.evidence?.recommendation || incident.evidence?.failingItems?.[0] || ''}
                  </p>
                  <div className="mt-3 space-y-1">
                    {(incident.playbook?.steps || []).slice(0, 3).map((step: string, index: number) => (
                      <p key={`${incident.id}-step-${index}`} className="text-[11px] text-slate-500">Step {index + 1}: {step}</p>
                    ))}
                  </div>
                  {incident.correlation?.summary && (
                    <div className="mt-3 rounded-lg border border-white/5 bg-dark-950 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Correlation</p>
                      <p className="text-[11px] text-slate-400 mt-1">{incident.correlation.summary}</p>
                      {(incident.correlation?.runs || []).length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Runs</p>
                          {(incident.correlation.runs || []).slice(0, 3).map((run: any) => (
                            <a key={run.id} href={'/automation?runId=' + run.id} className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200">
                              <span>{run.flowName} - {run.status}{run.errorClass ? ` - ${run.errorClass}` : ''}</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      )}
                      {(incident.correlation?.profiles || []).length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profiles</p>
                          {(incident.correlation.profiles || []).slice(0, 3).map((profile: any) => (
                            <a key={profile.id} href={'/profiles?profileId=' + profile.id} className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200">
                              <span>{profile.name} - score {profile.validationScore}</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      )}
                      {(incident.correlation?.scenarios || []).length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sandbox</p>
                          {(incident.correlation.scenarios || []).slice(0, 3).map((scenario: any) => (
                            <a key={scenario.scenarioId} href={'/network?focus=sandbox-lab&scenarioId=' + scenario.scenarioId} className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200">
                              <span>{scenario.name} {scenario.version} - score {scenario.contractScore}</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      )}
                      {(incident.correlation?.tasks || []).length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tasks</p>
                          {(incident.correlation.tasks || []).slice(0, 3).map((task: any) => (
                            <a key={task.id} href={'/team?focus=promotion-approvals&taskId=' + task.id} className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200">
                              <span>{task.resourceName} - {task.status}</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-2 min-w-[220px]">
                  {(incident.playbook?.automatedActions || []).slice(0, 2).map((action: any) => (
                    <button
                      key={`${incident.id}:${action.id}`}
                      onClick={() => remediateIncident(incident.id, action.id)}
                      disabled={!!incidentActionKey}
                      className="px-3 py-2 rounded-lg bg-brand-500/10 text-brand-300 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      {incidentActionKey === `${incident.id}:${action.id}`
                        ? 'Applying...'
                        : action.requiresApprovalRole
                          ? `Queue ${action.label}`
                          : action.label}
                    </button>
                  ))}
                  {incident.status === 'open' && (
                    <button
                      onClick={() => acknowledgeIncident(incident.id)}
                      disabled={!!incidentActionKey}
                      className="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      {incidentActionKey === `${incident.id}:ack` ? 'Ack...' : 'Acknowledge'}
                    </button>
                  )}
                  {incident.status !== 'resolved' && (
                    <button
                      onClick={() => resolveIncident(incident.id)}
                      disabled={!!incidentActionKey}
                      className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      {incidentActionKey === `${incident.id}:resolve` ? 'Resolving...' : 'Resolve'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profile Cache Hit Rate</p>
          <h3 className="text-2xl font-black text-white mt-2">
            {Math.round(((dashboard?.metrics?.cache?.['profile:list']?.hitRate || 0) * 100))}%
          </h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Queue Waiting</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.metrics?.queueDepth?.waiting || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profiles Query Avg</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.metrics?.durations?.['profiles:list_query']?.avgMs || 0}ms</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profile Sync Uploads</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.platformMetrics?.counters?.['profile:upload'] || 0}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Memory Admission</p>
          <h3 className={`text-2xl font-black mt-2 ${dashboard?.metrics?.memoryAdmission?.admitted ? 'text-emerald-400' : 'text-red-400'}`}>
            {dashboard?.metrics?.memoryAdmission?.admitted ? 'admitted' : 'blocked'}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            RSS {dashboard?.metrics?.memoryAdmission?.rssMb || 0}MB / max {dashboard?.metrics?.memoryAdmission?.maxRssMb || 0}MB
          </p>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Inbox Verified</p>
          <h3 className="text-2xl font-black text-emerald-400 mt-2">{dashboard?.metrics?.inboxVerification?.verified || 0}</h3>
          <p className="text-xs text-slate-500 mt-2">Pending {dashboard?.metrics?.inboxVerification?.pending || 0} · Failed {dashboard?.metrics?.inboxVerification?.failed || 0}</p>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Sandbox Captcha</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.metrics?.sandboxAutomation?.captchaProvider || 'manual'}</h3>
          <p className="text-xs text-slate-500 mt-2">SMS {dashboard?.metrics?.sandboxAutomation?.smsProvider || 'manual'}</p>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Sandbox Manual</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.metrics?.sandboxAutomation?.allowManualResolution ? 'enabled' : 'disabled'}</h3>
          <p className="text-xs text-slate-500 mt-2">Stub {dashboard?.metrics?.sandboxAutomation?.stubAutoResolveMs || 0}ms</p>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Sandbox Lab Avg</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.metrics?.sandboxLab?.averageScore || 0}</h3>
          <p className="text-xs text-slate-500 mt-2">Critical {dashboard?.metrics?.sandboxLab?.critical || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl border border-white/5 bg-dark-900/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" /> Network Observability
              </h2>
              <p className="text-xs text-slate-500 mt-1">Health, failovers and automatic pool recommendations by platform and geo intent.</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Degraded Pools</p>
              <p className="text-2xl font-black text-white">{dashboard?.networkObservability?.summary?.degradedPools || 0}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Weakest Pools</p>
              <div className="mt-3 space-y-3">
                {(dashboard?.networkObservability?.degradedPools || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No degraded pools right now.</p>
                ) : (
                  (dashboard?.networkObservability?.degradedPools || []).map((pool: any) => (
                    <div key={pool.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{pool.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{pool.type} · {pool.rotationStrategy}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${pool.availabilityScore >= 75 ? 'text-emerald-400' : pool.availabilityScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>{pool.availabilityScore}</p>
                        <p className="text-[10px] text-slate-500">{pool.counts.active}/{pool.counts.total} active</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Failovers</p>
              <div className="mt-3 space-y-3">
                {(dashboard?.networkObservability?.failovers || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No failovers recorded yet.</p>
                ) : (
                  (dashboard?.networkObservability?.failovers || []).slice(0, 6).map((item: any, index: number) => (
                    <div key={`${item.profileId}-${item.endpointId}-${index}`} className="rounded-lg border border-white/5 p-3">
                      <p className="text-sm font-bold text-white">Profile {item.profileId}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Endpoint {item.endpointId}</p>
                      <p className="text-[11px] text-red-300 mt-1">{item.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profiles Most Affected</p>
              <div className="mt-3 space-y-3">
                {(dashboard?.networkObservability?.profileFailovers || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No profile-level failover pressure recorded.</p>
                ) : (
                  (dashboard?.networkObservability?.profileFailovers || []).slice(0, 6).map((item: any) => (
                    <div key={item.profileId} className="rounded-lg border border-white/5 p-3">
                      <p className="text-sm font-bold text-white">Profile {item.profileId}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{item.count} failover(s) · last {new Date(item.lastFailedAt).toLocaleString()}</p>
                      <p className="text-[11px] text-red-300 mt-1">{item.lastReason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Platform Risk Ranking</p>
              <div className="mt-3 space-y-3">
                {(dashboard?.networkObservability?.platformRiskRanking || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No platform risk data available.</p>
                ) : (
                  (dashboard?.networkObservability?.platformRiskRanking || []).map((bucket: any) => (
                    <div key={bucket.key} className="rounded-lg border border-white/5 p-3">
                      <p className="text-sm font-bold text-white">{bucket.label}</p>
                      {(bucket.riskyPools || []).length === 0 ? (
                        <p className="text-[11px] text-slate-500 mt-1">No risky pool currently identified.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {(bucket.riskyPools || []).map((pool: any) => (
                            <div key={pool.id} className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] text-white">{pool.name}</p>
                                <p className="text-[10px] text-slate-500">{pool.type} · load {pool.loadFactor}</p>
                              </div>
                              <span className={`text-[11px] font-black ${pool.availabilityScore >= 75 ? 'text-emerald-400' : pool.availabilityScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>{pool.availabilityScore}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-dark-900/70 p-5">
          <h2 className="text-lg font-black text-white">Recommended Pools</h2>
          <p className="text-xs text-slate-500 mt-1">Camel suggestions for common intents based on blend, geo fit and current health.</p>
          <p className="text-[11px] text-slate-500 mt-2">
            Average metadata coverage {dashboard?.networkObservability?.summary?.averageMetadataCoverage || 0}%
          </p>
          <div className="mt-4 space-y-4">
            {(dashboard?.networkObservability?.recommendationProfiles || []).map((bucket: any) => (
              <div key={bucket.key} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{bucket.label}</p>
                <p className="text-[10px] text-slate-600 mt-1">{bucket.platform}</p>
                <div className="mt-3 space-y-2">
                  {(bucket.items || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No recommendation available.</p>
                  ) : (
                    (bucket.items || []).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{item.name}</p>
                          <p className="text-[11px] text-slate-500 mt-1">{item.type}</p>
                        </div>
                        <span className={`text-sm font-black ${item.score >= 70 ? 'text-emerald-400' : item.score >= 45 ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
          {(dashboard?.networkObservability?.alerts || []).length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Network Alerts</p>
              <div className="mt-2 space-y-1">
                {(dashboard?.networkObservability?.alerts || []).slice(0, 4).map((alert: any, index: number) => (
                  <p key={`${alert.poolId}-${index}`} className={`text-[11px] ${alert.severity === 'critical' ? 'text-red-300' : 'text-amber-200'}`}>{alert.message}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profile Validation Avg</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.profileHealth?.averageValidation || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Healthy Profiles</p>
          <h3 className="text-2xl font-black text-emerald-400 mt-2">{dashboard?.profileHealth?.healthy || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Warnings</p>
          <h3 className="text-2xl font-black text-amber-400 mt-2">{dashboard?.profileHealth?.warning || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Critical Profiles</p>
          <h3 className="text-2xl font-black text-red-400 mt-2">{dashboard?.profileHealth?.critical || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profiles With Proxy</p>
          <h3 className="text-2xl font-black text-white mt-2">{dashboard?.profileHealth?.withProxy || 0}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profile Ops In Progress</p>
          <h3 className="text-2xl font-black text-cyan-400 mt-2">{dashboard?.profileOperationSummary?.processing || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profile Ops With Failures</p>
          <h3 className="text-2xl font-black text-amber-400 mt-2">{dashboard?.profileOperationSummary?.withFailures || 0}</h3>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Retryable Profiles</p>
          <h3 className="text-2xl font-black text-red-400 mt-2">{dashboard?.profileOperationSummary?.retryableProfiles || 0}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-fuchsia-400" /> Promotion Advisor
            </h2>
            <p className="text-xs text-slate-500 mt-1">Automatic guidance on what Camel should promote, keep or review based on release gates and sandbox health.</p>
          </div>
          <div className="p-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Candidates To Promote</p>
              <p className="text-2xl font-black text-emerald-400 mt-2">{dashboard?.promotionAdvisor?.summary?.promoteCount || 0}</p>
              <div className="mt-4 space-y-2">
                {(dashboard?.promotionAdvisor?.promote || []).slice(0, 4).map((item: any) => (
                  <div key={`promote-${item.resource}-${item.id}`} className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3">
                    <p className="text-sm font-bold text-white">{item.name}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{item.resource} · {item.suggestedAction.replace('_', ' ')}</p>
                    <p className="text-[11px] text-emerald-300 mt-1">Score {item.score}</p>
                    <button
                      onClick={() => applyPromotionRecommendation(item)}
                      disabled={!!promotionActionKey}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      {promotionActionKey === `${item.resource}:${item.id}:${item.suggestedAction}` ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                ))}
                {(dashboard?.promotionAdvisor?.promote || []).length === 0 && (
                  <p className="text-xs text-slate-500">No promotion candidates right now.</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Review Current Promotions</p>
              <p className="text-2xl font-black text-amber-400 mt-2">{dashboard?.promotionAdvisor?.summary?.reviewCount || 0}</p>
              <div className="mt-4 space-y-2">
                {(dashboard?.promotionAdvisor?.review || []).slice(0, 4).map((item: any) => (
                  <div key={`review-${item.resource}-${item.id}`} className="rounded-lg border border-amber-500/10 bg-amber-500/5 p-3">
                    <p className="text-sm font-bold text-white">{item.name}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{item.resource} · current {item.currentState || 'none'}</p>
                    <p className="text-[11px] text-amber-300 mt-1">{item.reasons?.[0] || 'Review promotion gate health.'}</p>
                    <button
                      onClick={() => applyPromotionRecommendation(item)}
                      disabled={!!promotionActionKey}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      {promotionActionKey === `${item.resource}:${item.id}:${item.suggestedAction}` ? 'Queueing...' : 'Queue Review'}
                    </button>
                  </div>
                ))}
                {(dashboard?.promotionAdvisor?.review || []).length === 0 && (
                  <p className="text-xs text-slate-500">No active promotions need review.</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Stable Retained</p>
              <p className="text-2xl font-black text-cyan-400 mt-2">{dashboard?.promotionAdvisor?.summary?.retainCount || 0}</p>
              <div className="mt-4 space-y-2">
                {(dashboard?.promotionAdvisor?.retain || []).slice(0, 4).map((item: any) => (
                  <div key={`retain-${item.resource}-${item.id}`} className="rounded-lg border border-cyan-500/10 bg-cyan-500/5 p-3">
                    <p className="text-sm font-bold text-white">{item.name}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{item.resource} · {item.currentState || 'not promoted'}</p>
                    <p className="text-[11px] text-cyan-300 mt-1">Score {item.score}</p>
                  </div>
                ))}
                {(dashboard?.promotionAdvisor?.retain || []).length === 0 && (
                  <p className="text-xs text-slate-500">No retained items to highlight.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Release Gates
              </h2>
              <p className="text-xs text-slate-500 mt-1">Persistent quality gates over flows, presets, profiles, sandbox lab and runtime headroom.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Current</p>
                <p className={`text-2xl font-black mt-1 ${dashboard?.metrics?.releaseGates?.status === 'pass' ? 'text-emerald-400' : dashboard?.metrics?.releaseGates?.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                  {dashboard?.metrics?.releaseGates?.overallScore || 0}
                </p>
              </div>
              <button onClick={recordReleaseGate} disabled={recordingReleaseGate} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
                <RefreshCw className="w-4 h-4" /> {recordingReleaseGate ? 'Recording...' : 'Record Snapshot'}
              </button>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              {(dashboard?.metrics?.releaseGates?.items || []).map((item: any) => (
                <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <span className={`text-sm font-black ${item.status === 'pass' ? 'text-emerald-400' : item.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Threshold {item.threshold} · {item.detail}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/5 bg-dark-950 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={releaseGateForm.releaseLabel} onChange={(e) => setReleaseGateForm((prev) => ({ ...prev, releaseLabel: e.target.value }))} className="input-field bg-dark-900" placeholder="release label" />
                  <input value={releaseGateForm.commitRef} onChange={(e) => setReleaseGateForm((prev) => ({ ...prev, commitRef: e.target.value }))} className="input-field bg-dark-900" placeholder="commit ref" />
                </div>
                <div className="text-[11px] text-slate-500">
                  Current metadata: {dashboard?.metrics?.releaseGates?.metadata?.releaseLabel || 'n/a'} · {dashboard?.metrics?.releaseGates?.metadata?.commitRef || 'n/a'} · preset {dashboard?.metrics?.releaseGates?.metadata?.dominantPresetVersion || 'n/a'}
                </div>
              </div>
              {dashboard?.releaseGateComparison && (
                <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">Comparison</p>
                    <span className={`text-sm font-black ${dashboard.releaseGateComparison.trend === 'improved' ? 'text-emerald-400' : dashboard.releaseGateComparison.trend === 'regressed' ? 'text-red-400' : 'text-amber-400'}`}>
                      {dashboard.releaseGateComparison.deltaOverallScore >= 0 ? '+' : ''}{dashboard.releaseGateComparison.deltaOverallScore}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(dashboard.releaseGateComparison.itemDeltas || []).slice(0, 6).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-300">{item.label}</span>
                        <span className={`${item.delta > 0 ? 'text-emerald-400' : item.delta < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {item.delta >= 0 ? '+' : ''}{item.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(dashboard?.releaseGateHistory || []).length === 0 ? (
                <div className="text-sm text-slate-500">No release gate history yet.</div>
              ) : (
                (dashboard?.releaseGateHistory || []).map((snapshot: any) => (
                  <div key={snapshot.id} className="rounded-xl border border-white/5 bg-dark-950 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{new Date(snapshot.createdAt).toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{snapshot.metadata?.releaseLabel || 'n/a'} · {snapshot.items?.filter((item: any) => item.status === 'fail').length || 0} fail · {snapshot.items?.filter((item: any) => item.status === 'warning').length || 0} warning</p>
                    </div>
                    <span className={`text-sm font-black ${snapshot.status === 'pass' ? 'text-emerald-400' : snapshot.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>{snapshot.overallScore}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" /> Soak & Scale Readiness
              </h2>
              <p className="text-xs text-slate-500 mt-1">Sustained-load snapshots and a scale-release verdict built from gates, runtime and recent benchmark evidence.</p>
            </div>
            <button onClick={recordSoakTest} disabled={recordingSoakTest} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> {recordingSoakTest ? 'Recording...' : 'Record Soak'}
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Soak</p>
                    <p className="text-sm font-bold text-white mt-1">{dashboard?.metrics?.soakTesting?.windowMinutes || 180} minute window</p>
                  </div>
                  <span className={`text-2xl font-black ${dashboard?.metrics?.soakTesting?.status === 'pass' ? 'text-emerald-400' : dashboard?.metrics?.soakTesting?.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                    {dashboard?.metrics?.soakTesting?.overallScore || 0}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Runs {dashboard?.metrics?.soakTesting?.metrics?.totalRuns || 0} · success {dashboard?.metrics?.soakTesting?.metrics?.successRate || 0}% · p95 {dashboard?.metrics?.soakTesting?.metrics?.p95DurationMs || 0}ms
                </p>
              </div>
              {(dashboard?.metrics?.soakTesting?.items || []).map((item: any) => (
                <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <span className={`text-sm font-black ${item.status === 'pass' ? 'text-emerald-400' : item.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scale Release</p>
                    <p className="text-sm font-bold text-white mt-1">{dashboard?.scaleRelease?.status || 'unknown'}</p>
                  </div>
                  <span className={`text-2xl font-black ${dashboard?.scaleRelease?.status === 'ready' ? 'text-emerald-400' : dashboard?.scaleRelease?.status === 'caution' ? 'text-amber-400' : 'text-red-400'}`}>
                    {dashboard?.scaleRelease?.score || 0}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Recommended concurrency cap {dashboard?.scaleRelease?.recommendedConcurrencyCap || 0}
                </p>
              </div>
              {(dashboard?.scaleRelease?.blockers || []).length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Blockers</p>
                  <div className="mt-2 space-y-1">
                    {(dashboard?.scaleRelease?.blockers || []).map((item: string, index: number) => (
                      <p key={`blocker-${index}`} className="text-[11px] text-red-200">{item}</p>
                    ))}
                  </div>
                </div>
              )}
              {(dashboard?.scaleRelease?.warnings || []).length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Warnings</p>
                  <div className="mt-2 space-y-1">
                    {(dashboard?.scaleRelease?.warnings || []).map((item: string, index: number) => (
                      <p key={`warning-${index}`} className="text-[11px] text-amber-200">{item}</p>
                    ))}
                  </div>
                </div>
              )}
              {(dashboard?.scaleRelease?.recommendations || []).length > 0 && (
                <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommendations</p>
                  <div className="mt-2 space-y-1">
                    {(dashboard?.scaleRelease?.recommendations || []).slice(0, 4).map((item: string, index: number) => (
                      <p key={`recommendation-${index}`} className="text-[11px] text-slate-400">{item}</p>
                    ))}
                  </div>
                </div>
              )}
              {(dashboard?.soakHistory || []).length > 0 && (
                <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Soak History</p>
                  <div className="mt-3 space-y-2">
                    {(dashboard?.soakHistory || []).slice(0, 5).map((snapshot: any) => (
                      <div key={snapshot.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-300">{new Date(snapshot.createdAt).toLocaleString()}</span>
                        <span className={`${snapshot.status === 'pass' ? 'text-emerald-400' : snapshot.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                          {snapshot.overallScore}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {dashboard?.promotionAdvisor?.review?.length > 0 && (
          <div className="lg:col-span-3 rounded-2xl border border-red-500/15 bg-red-500/5 p-5 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white">Operational Alert</p>
              <p className="text-xs text-slate-300 mt-1">
                Camel has {dashboard.promotionAdvisor.review.length} promoted resources that now violate or weaken current release gate expectations. Review them before marking this workspace as stable.
              </p>
            </div>
          </div>
        )}

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" /> Promotion Tasks
            </h2>
            <p className="text-xs text-slate-500 mt-1">Auditable promotion and review tasks created from release gate recommendations.</p>
          </div>
          <div className="p-4 space-y-3">
            {(dashboard?.promotionTasks || []).length === 0 ? (
              <p className="text-sm text-slate-500">No promotion tasks recorded yet.</p>
            ) : (
              (dashboard?.promotionTasks || []).map((task: any) => (
                <div key={task.id} className="rounded-xl border border-white/5 bg-dark-950 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{task.resourceName}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {task.resource} · {task.action.replace('_', ' ')} · {task.status}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">{task.note || task.reasons?.[0] || 'No note'}</p>
                  </div>
                  {task.status === 'pending_review' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => resolvePromotionTask(task.id, 'resolved')}
                        disabled={!!promotionActionKey}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        {promotionActionKey === `${task.id}:resolved` ? '...' : 'Resolve'}
                      </button>
                      <button
                        onClick={() => resolvePromotionTask(task.id, 'dismissed')}
                        disabled={!!promotionActionKey}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        {promotionActionKey === `${task.id}:dismissed` ? '...' : 'Dismiss'}
                      </button>
                    </div>
                  ) : task.status === 'pending_approval' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => approvePromotionTask(task.id)}
                        disabled={!!promotionActionKey}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        {promotionActionKey === `${task.id}:approve` ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => resolvePromotionTask(task.id, 'dismissed')}
                        disabled={!!promotionActionKey}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        {promotionActionKey === `${task.id}:dismissed` ? '...' : 'Reject'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{task.status}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-400" /> Runtime Hardening
            </h2>
            <p className="text-xs text-slate-500 mt-1">Current guardrail posture for runtime, fingerprint validation and profile consistency.</p>
          </div>
          <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              {(dashboard?.runtimeHardening?.items || []).map((item: any) => (
                <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <span className={`text-sm font-black ${item.status === 'strong' ? 'text-emerald-400' : item.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-white">Overall Hardening</p>
                <span className={`text-2xl font-black ${dashboard?.runtimeHardening?.status === 'strong' ? 'text-emerald-400' : dashboard?.runtimeHardening?.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                  {dashboard?.runtimeHardening?.overallScore || 0}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {(dashboard?.runtimeHardening?.recommendations || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No runtime hardening recommendations right now.</p>
                ) : (
                  (dashboard?.runtimeHardening?.recommendations || []).map((item: string, index: number) => (
                    <p key={`runtime-rec-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-cyan-400" /> Competitive Readiness
              </h2>
              <p className="text-xs text-slate-500 mt-1">{readiness?.note || 'Internal scorecard for the six main competitive gaps.'}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Overall</p>
              <p className="text-3xl font-black text-white mt-1">{readiness?.overall || 0}</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(readiness?.categories || []).map((item: any) => (
              <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${item.status === 'strong' ? 'bg-emerald-500/15 text-emerald-400' : item.status === 'emerging' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-2xl font-black text-white mt-3">{item.score}</p>
                <p className="text-[11px] text-slate-400 mt-3">{item.nextStep}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Monitor className="w-5 h-5 text-cyan-400" /> Sandbox Lab Regressions
            </h2>
            <p className="text-xs text-slate-500 mt-1">Weakest current scenarios and recent regression suite history.</p>
          </div>
          <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              {(dashboard?.sandboxLab?.rows || []).length === 0 ? (
                <div className="text-sm text-slate-500">No sandbox lab scenarios available.</div>
              ) : (
                (dashboard?.sandboxLab?.rows || []).map((row: any) => (
                  <div key={row.scenarioId} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-white">{row.name}</p>
                      <span className={`text-sm font-black ${row.contractScore >= 80 ? 'text-emerald-400' : row.contractScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>{row.contractScore}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{row.version} · {row.stage} · coverage {row.selectorCoverage}%</p>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-3">
              {(dashboard?.sandboxLab?.history || []).length === 0 ? (
                <div className="text-sm text-slate-500">No sandbox regression history yet.</div>
              ) : (
                (dashboard?.sandboxLab?.history || []).map((run: any) => (
                  <div key={run.id} className="rounded-xl border border-white/5 bg-dark-950 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{new Date(run.createdAt).toLocaleString()}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{run.summary.total} scenarios · {run.summary.critical} critical</p>
                    </div>
                    <span className={`text-sm font-black ${run.summary.averageScore >= 80 ? 'text-emerald-400' : run.summary.averageScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>{run.summary.averageScore}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div id="flow-benchmarks" className="lg:col-span-2 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-400" /> Flow Benchmarks
              </h2>
              <p className="text-xs text-slate-500 mt-1">Internal stability score for the most fragile recent flows.</p>
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {(dashboard?.benchmarks || []).length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No benchmark data available yet.</div>
            ) : (
              (dashboard?.benchmarks || []).map((row: any) => (
                <div key={row.flowId} className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{row.flowName}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {row.runs} runs · success {row.successRate}% · avg {row.avgDurationMs}ms
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${row.stabilityScore >= 75 ? 'text-emerald-400' : row.stabilityScore >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                      {row.stabilityScore}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-widest">
                      Top error: {row.topErrorClass}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div id="release-readiness" className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-brand-400" /> Preset Stability
            </h2>
            <p className="text-xs text-slate-500 mt-1">Recent stability by observed preset version.</p>
          </div>
          <div className="p-4 space-y-3">
            {(dashboard?.presetBenchmarks || []).length === 0 ? (
              <div className="text-sm text-slate-500 p-2">No preset benchmark data available.</div>
            ) : (
              (dashboard?.presetBenchmarks || []).map((row: any) => (
                <div key={row.key} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{row.label}</p>
                    <span className={`text-sm font-black ${row.stabilityScore >= 75 ? 'text-emerald-400' : row.stabilityScore >= 45 ? 'text-amber-400' : 'text-red-400'}`}>{row.stabilityScore}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{row.runs} runs · success {row.successRate}%</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" /> Audit Hotspots
            </h2>
            <p className="text-xs text-slate-500 mt-1">Most frequent actions in recent tenant audit activity.</p>
          </div>
          <div className="p-4 space-y-3">
            {(dashboard?.auditSummary || []).length === 0 ? (
              <div className="text-sm text-slate-500 p-2">No audit summary available.</div>
            ) : (
              (dashboard?.auditSummary || []).map((item: any) => (
                <div key={item.action} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.action}</p>
                    <span className="text-xs font-black text-red-300 bg-red-500/10 border border-red-500/10 rounded px-2 py-1">
                      {item._count?.action || 0}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div id="weakest-profiles" className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-400" /> Weakest Profiles
            </h2>
            <p className="text-xs text-slate-500 mt-1">Profiles with the lowest validation score, sorted from highest operational risk.</p>
          </div>
          <div className="divide-y divide-white/5">
            {(dashboard?.profileHealth?.weakest || []).length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No profile health data available yet.</div>
            ) : (
              (dashboard?.profileHealth?.weakest || []).map((profile: any) => (
                <div key={profile.id} className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{profile.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {profile.platform} · {profile.presetVersion} · {profile.hasProxy ? 'proxy attached' : 'direct'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${profile.validationScore >= 85 ? 'text-emerald-400' : profile.validationScore >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
                      {profile.validationScore}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-widest">{profile.severity}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" /> Profile Stability
            </h2>
            <p className="text-xs text-slate-500 mt-1">Recent run stability by observed profile assignment.</p>
          </div>
          <div className="divide-y divide-white/5">
            {(dashboard?.profileBenchmarks || []).length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No profile benchmark data available.</div>
            ) : (
              (dashboard?.profileBenchmarks || []).map((row: any) => (
                <div key={row.key} className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{row.label}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {row.runs} runs · success {row.successRate}% · avg {row.avgDurationMs}ms
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${row.stabilityScore >= 75 ? 'text-emerald-400' : row.stabilityScore >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                      {row.stabilityScore}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-widest">{row.topErrorClass}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-3 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" /> Recent Profile Operations
            </h2>
            <p className="text-xs text-slate-500 mt-1">Latest bulk state and access operations, including partial failures and retryable profiles.</p>
          </div>
          <div className="divide-y divide-white/5">
            {(dashboard?.recentProfileOperations || []).length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No recent profile operations yet.</div>
            ) : (
              (dashboard?.recentProfileOperations || []).map((operation: any) => (
                <div key={operation.id} className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {operation.request?.kind === 'profile_state' ? 'Profile State' : 'Profile Access'} · {operation.request?.operation || operation.type}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(operation.createdAt).toLocaleString()} · {operation.completed}/{operation.totalTasks} completed · {operation.failed} failed
                    </p>
                    {(operation.failedResults || []).length > 0 && (
                      <p className="text-xs text-red-300 mt-2">
                        Failed: {operation.failedResults.map((item: any) => item.profileId.slice(0, 8)).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
                      operation.status === 'completed'
                        ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                        : operation.status === 'completed_with_errors'
                          ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                          : 'text-red-400 border-red-500/20 bg-red-500/10'
                    }`}>
                      {operation.status}
                    </span>
                    <span className="text-xs text-slate-400">{operation.summary?.successRate ?? 0}% success</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Waiting Queue Trend</p>
          <div className="mt-4 flex items-end gap-1 h-24">
            {(history?.['queue:camelfarm-sessions:waiting'] || []).slice().reverse().map((point: any, index: number, arr: any[]) => (
              <div
                key={`waiting-${index}`}
                className="flex-1 bg-brand-500/60 rounded-t"
                style={{ height: `${Math.max(8, ((point.value || 0) / Math.max(...arr.map((p: any) => p.value || 1), 1)) * 100)}%` }}
                title={`${point.value} waiting`}
              />
            ))}
          </div>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Active Queue Trend</p>
          <div className="mt-4 flex items-end gap-1 h-24">
            {(history?.['queue:camelfarm-sessions:active'] || []).slice().reverse().map((point: any, index: number, arr: any[]) => (
              <div
                key={`active-${index}`}
                className="flex-1 bg-purple-500/60 rounded-t"
                style={{ height: `${Math.max(8, ((point.value || 0) / Math.max(...arr.map((p: any) => p.value || 1), 1)) * 100)}%` }}
                title={`${point.value} active`}
              />
            ))}
          </div>
        </div>
        <div className="glass-dark border border-white/5 p-5 rounded-2xl">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Profiles Query Latency Trend</p>
          <div className="mt-4 flex items-end gap-1 h-24">
            {(history?.['profiles:list_query:last_ms'] || []).slice().reverse().map((point: any, index: number, arr: any[]) => (
              <div
                key={`latency-${index}`}
                className="flex-1 bg-green-500/60 rounded-t"
                style={{ height: `${Math.max(8, ((point.value || 0) / Math.max(...arr.map((p: any) => p.value || 1), 1)) * 100)}%` }}
                title={`${point.value} ms`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-400" /> Event Timeline
            </h2>
          </div>
          <div className="p-0">
            {events.length === 0 ? (
              <div className="p-8 text-center text-slate-500">Waiting for live events...</div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                {events.map((ev, i) => (
                  <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors flex items-start gap-4">
                    <div className="pt-1">
                      {ev.status === 'success' || ev.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : ev.status === 'failed' || ev.status === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{ev.event || JSON.stringify(ev)}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(ev.time || Date.now()).toLocaleString()}</p>
                    </div>
                    {ev.status === 'processing' && (
                      <button 
                        onClick={() => api.post(`/automation/jobs/${ev.jobId}/cancel`).then(() => toast.success('Cancel request sent'))}
                        className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden h-fit">
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h2 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
              <Server className="w-5 h-5 text-purple-400" /> Worker Fleet
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {dashboard?.edgeNodes && dashboard.edgeNodes.length > 0 ? dashboard.edgeNodes.map((w: any, index: number) => (
              <div key={`${w.hostname}-${index}`} className="flex items-center justify-between border border-dark-700 bg-dark-950 p-4 rounded-xl">
                <div>
                  <h4 className="text-white font-bold">{w.hostname || 'Unnamed Worker'}</h4>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">{w.region} · CPU {w.cpu} · RAM {w.ram}</p>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-widest ${w.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500'}`}>
                  {w.status}
                </div>
              </div>
            )) : (
              <div className="text-center text-slate-500 p-4">No workers connected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

