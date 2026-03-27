import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Zap, Users, Activity, Bell, LockKeyhole, Fingerprint, Undo2, PlayCircle, RefreshCw, Download, Clock3 } from 'lucide-react';
import { exportSecurityReport, getSecurityReport, getTenantSecurityPolicy, recordSecurityPostureSnapshot, resolveDestructiveAction, rotateApiKeyFromSecurity, rotateWebhookSecretFromSecurity, updateTenantSecurityPolicy, type SecurityDestructiveAction, type SecurityReport, type TenantSecurityPolicy } from '../api/security';
import toast from 'react-hot-toast';

const SecurityDashboard: React.FC = () => {
  const [data, setData] = useState<SecurityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);
  const [rotatingWebhookId, setRotatingWebhookId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<TenantSecurityPolicy | null>(null);
  const [savingPolicyKey, setSavingPolicyKey] = useState<string | null>(null);
  const [recordingSnapshot, setRecordingSnapshot] = useState(false);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const report = await getSecurityReport();
        setData(report);
        const nextPolicy = await getTenantSecurityPolicy();
        setPolicy(nextPolicy);
      } catch (err) {
        toast.error('Failed to load security overview');
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
    const interval = setInterval(fetchOverview, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-brand-500/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const overview = data.overview;
  const scoreColor = overview.status === 'CRITICAL' ? 'text-red-500' : overview.status === 'WARNING' ? 'text-yellow-500' : 'text-green-500';
  const scoreBg = overview.status === 'CRITICAL' ? 'bg-red-500/10' : overview.status === 'WARNING' ? 'bg-yellow-500/10' : 'bg-green-500/10';
  const posture = data.posture;
  const pendingDestructive = data.destructiveActions.filter((task) => task.status === 'pending');
  const brokenIntegrity = data.auditIntegrity.broken;

  const refreshReport = async () => {
    const report = await getSecurityReport();
    setData(report);
    const nextPolicy = await getTenantSecurityPolicy();
    setPolicy(nextPolicy);
  };

  const handleDestructiveAction = async (taskId: string, action: 'cancel' | 'execute_now') => {
    try {
      setMutatingTaskId(taskId);
      await resolveDestructiveAction(taskId, action);
      toast.success(action === 'cancel' ? 'Delayed action cancelled' : 'Delayed action executed');
      await refreshReport();
    } catch (err) {
      toast.error('Failed to update delayed action');
    } finally {
      setMutatingTaskId(null);
    }
  };

  const handleRotateKey = async (keyId: string, graceMinutes: number) => {
    try {
      setRotatingKeyId(keyId);
      const result = await rotateApiKeyFromSecurity(keyId, graceMinutes);
      toast.success(`API key rotated. New key: ${result.rawKey.slice(0, 18)}...`);
      await refreshReport();
    } catch (err) {
      toast.error('Failed to rotate API key');
    } finally {
      setRotatingKeyId(null);
    }
  };

  const handleRotateWebhook = async (webhookId: string) => {
    try {
      setRotatingWebhookId(webhookId);
      const result = await rotateWebhookSecretFromSecurity(webhookId);
      toast.success(`Webhook secret rotated. New secret: ${result.secret.slice(0, 18)}...`);
      await refreshReport();
    } catch (err) {
      toast.error('Failed to rotate webhook secret');
    } finally {
      setRotatingWebhookId(null);
    }
  };

  const handlePolicyToggle = async (key: keyof TenantSecurityPolicy, value: boolean) => {
    try {
      setSavingPolicyKey(key);
      const next = await updateTenantSecurityPolicy({ [key]: value } as any);
      setPolicy(next);
      toast.success('Security policy updated');
      await refreshReport();
    } catch (err) {
      toast.error('Failed to update tenant security policy');
    } finally {
      setSavingPolicyKey(null);
    }
  };

  const handleReportScheduleUpdate = async (
    key: keyof TenantSecurityPolicy['reportSchedule'],
    value: boolean | number
  ) => {
    try {
      setSavingPolicyKey(`reportSchedule.${key}`);
      const next = await updateTenantSecurityPolicy({
        reportSchedule: {
          ...(policy?.reportSchedule || {}),
          [key]: value,
        },
      } as any);
      setPolicy(next);
      toast.success('Report schedule updated');
      await refreshReport();
    } catch (err) {
      toast.error('Failed to update report schedule');
    } finally {
      setSavingPolicyKey(null);
    }
  };

  const handleRolePolicyToggle = async (
    role: keyof TenantSecurityPolicy['rolePolicies'],
    capability: keyof TenantSecurityPolicy['rolePolicies']['ADMIN'],
    value: boolean
  ) => {
    try {
      setSavingPolicyKey(`rolePolicies.${role}.${capability}`);
      const next = await updateTenantSecurityPolicy({
        rolePolicies: {
          ...(policy?.rolePolicies || {}),
          [role]: {
            ...(policy?.rolePolicies?.[role] || {}),
            [capability]: value,
          },
        },
      } as any);
      setPolicy(next);
      toast.success(`${role} capability updated`);
      await refreshReport();
    } catch (err) {
      toast.error('Failed to update role capability');
    } finally {
      setSavingPolicyKey(null);
    }
  };

  const handleExportReport = async () => {
    try {
      const exported = await exportSecurityReport();
      await navigator.clipboard.writeText(JSON.stringify(exported, null, 2));
      toast.success('Security posture export copied to clipboard');
    } catch (err) {
      toast.error('Failed to export security posture report');
    }
  };

  const handleRecordSnapshot = async () => {
    try {
      setRecordingSnapshot(true);
      await recordSecurityPostureSnapshot();
      toast.success('Security posture snapshot recorded');
      await refreshReport();
    } catch (err) {
      toast.error('Failed to record security posture snapshot');
    } finally {
      setRecordingSnapshot(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <Shield className="w-10 h-10 text-brand-500" />
            Security Cockpit
          </h1>
          <p className="text-slate-400 mt-2 font-medium">Enterprise risk monitoring and evasion signals.</p>
        </div>
        <div className={`px-4 py-2 rounded-2xl border border-white/5 ${scoreBg} flex items-center gap-3 backdrop-blur-md`}>
           <div className={`w-3 h-3 rounded-full animate-pulse shadow-lg ${overview.status === 'CRITICAL' ? 'bg-red-500 shadow-red-500/50' : overview.status === 'WARNING' ? 'bg-yellow-500 shadow-yellow-500/50' : 'bg-green-500 shadow-green-500/50'}`} />
           <span className={`font-bold tracking-wider text-xs uppercase ${scoreColor}`}>Status: {overview.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Score Card */}
        <div className="card lg:col-span-1 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl group-hover:bg-brand-500/20 transition-all duration-700" />
          <div className="text-center relative z-10">
            <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.2em] mb-4">Enterprise Risk Score</p>
            <div className="relative inline-flex items-center justify-center">
               <svg className="w-48 h-48 transform -rotate-90">
                 <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-dark-800" />
                 <circle
                   cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" 
                   strokeDasharray={2 * Math.PI * 88}
                   strokeDashoffset={2 * Math.PI * 88 * (1 - overview.riskScore / 100)}
                   className={`${scoreColor} transition-all duration-1000 ease-out`}
                   strokeLinecap="round"
                 />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <span className={`text-6xl font-black ${scoreColor}`}>{overview.riskScore}</span>
                 <span className="text-slate-500 font-bold text-xs uppercase">/ 100</span>
               </div>
            </div>
            <p className="mt-6 text-sm text-slate-400 font-medium max-w-[200px]">Aggregated score based on last 24h activity and evasion signals.</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
           <StatCard 
             title="Evasion Signals" 
             value={overview.stats.evasionFailures} 
             icon={Zap} 
             color="text-amber-400" 
             bgColor="bg-amber-400/10" 
             description="Blocked WAF transitions & reputation leaks"
           />
           <StatCard 
             title="Critical Changes" 
             value={overview.stats.criticalActions} 
             icon={AlertTriangle} 
             color="text-rose-400" 
             bgColor="bg-rose-400/10" 
             description="Deletions & user state modifications"
           />
           <StatCard 
             title="Active Webhooks" 
             value={overview.stats.activeWebhooks} 
             icon={Bell} 
             color="text-indigo-400" 
             bgColor="bg-indigo-400/10" 
             description="Connected external security systems"
           />
           <StatCard 
             title="Resource Shares" 
             value={overview.stats.totalAcls} 
             icon={Users} 
             color="text-emerald-400" 
             bgColor="bg-emerald-400/10" 
             description="Active granular access control entries"
           />
           <StatCard 
             title="MFA Coverage" 
             value={overview.stats.mfaCoverage || 0} 
             icon={Shield} 
             color="text-cyan-400" 
             bgColor="bg-cyan-400/10" 
             description="Percent of workspace users protected by authenticator MFA"
           />
        </div>
      </div>

      {posture && (
        <div className="card border-white/5 bg-dark-900/40">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h3 className="font-black text-white text-lg tracking-tight uppercase">Security Posture</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Exposure</p>
              <p className={`text-lg font-black mt-2 ${posture.remoteExposureDetected ? 'text-amber-400' : 'text-emerald-400'}`}>
                {posture.remoteExposureDetected ? 'Remote' : 'Local Only'}
              </p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Admin Fence</p>
              <p className={`text-lg font-black mt-2 ${posture.adminAllowlistConfigured ? 'text-emerald-400' : 'text-red-400'}`}>
                {posture.adminAllowlistConfigured ? 'Configured' : 'Missing'}
              </p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">API Key Hygiene</p>
              <p className="text-lg font-black text-white mt-2">
                {posture.apiKeys.expiringSoon} soon
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{posture.apiKeys.staleKeys} stale</p>
            </div>
            <div className="rounded-xl bg-dark-950 border border-white/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Summary</p>
              <p className="text-sm font-bold text-white mt-2">{posture.summary}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Tenant Posture Report</h3>
          <button
            onClick={handleExportReport}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-brand-300"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={handleRecordSnapshot}
            disabled={recordingSnapshot}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300 disabled:opacity-50"
          >
            <Clock3 className="w-3.5 h-3.5" />
            Snapshot
          </button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/5 bg-dark-950 p-4 xl:col-span-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Report Status</p>
            <p className={`text-lg font-black mt-2 ${
              data.postureReport.status === 'critical'
                ? 'text-red-400'
                : data.postureReport.status === 'needs_attention'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            }`}>
              {data.postureReport.status.replace('_', ' ')}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">Generated {new Date(data.postureReport.generatedAt).toLocaleString()}</p>
            <div className="mt-4 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-3 text-sm text-slate-200">
              {data.guardrails.summary}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-950 p-4 xl:col-span-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black mb-3">Priorities</p>
            <div className="space-y-2">
              {data.postureReport.priorities.length === 0 ? (
                <p className="text-sm text-emerald-300 font-medium">No urgent posture priorities right now.</p>
              ) : (
                data.postureReport.priorities.map((priority, index) => (
                  <div key={`${index}-${priority}`} className="rounded-lg border border-white/5 bg-dark-900 px-3 py-2 text-sm text-slate-200">
                    {priority}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-950 p-4 xl:col-span-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black mb-3">Workspace Recommendations</p>
            <div className="space-y-2">
              {data.postureReport.workspaceRecommendations.map((item, index) => (
                <div key={`${index}-${item}`} className="rounded-lg border border-white/5 bg-dark-900 px-3 py-2 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-brand-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Tenant Security Policy</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PolicyToggle
            title="Sensitive MFA"
            detail="Require MFA before sensitive changes."
            enabled={policy?.requireSensitiveMfa ?? false}
            busy={savingPolicyKey === 'requireSensitiveMfa'}
            onToggle={(next) => handlePolicyToggle('requireSensitiveMfa', next)}
          />
          <PolicyToggle
            title="Enhanced Monitoring"
            detail="Keep elevated monitoring active after suspicious signals."
            enabled={policy?.enhancedMonitoring ?? false}
            busy={savingPolicyKey === 'enhancedMonitoring'}
            onToggle={(next) => handlePolicyToggle('enhancedMonitoring', next)}
          />
          <PolicyToggle
            title="Auto Guardrails"
            detail="Allow Camel to apply silent non-destructive protections automatically."
            enabled={policy?.autoApplyGuardrails ?? true}
            busy={savingPolicyKey === 'autoApplyGuardrails'}
            onToggle={(next) => handlePolicyToggle('autoApplyGuardrails', next)}
          />
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <PolicyToggle
            title="Scheduled Reports"
            detail="Record posture snapshots automatically for this tenant."
            enabled={policy?.reportSchedule.enabled ?? true}
            busy={savingPolicyKey === 'reportSchedule.enabled'}
            onToggle={(next) => handleReportScheduleUpdate('enabled', next)}
          />
          <RangePolicyCard
            title="Interval Hours"
            detail="How often Camel records posture snapshots for this tenant."
            value={policy?.reportSchedule.intervalHours ?? 24}
            busy={savingPolicyKey === 'reportSchedule.intervalHours'}
            onChange={(next) => handleReportScheduleUpdate('intervalHours', next)}
            min={1}
            max={168}
            step={1}
          />
          <RangePolicyCard
            title="Retention"
            detail="How many tenant posture snapshots Camel keeps available."
            value={policy?.reportSchedule.retainSnapshots ?? 14}
            busy={savingPolicyKey === 'reportSchedule.retainSnapshots'}
            onChange={(next) => handleReportScheduleUpdate('retainSnapshots', next)}
            min={3}
            max={90}
            step={1}
          />
          <PolicyToggle
            title="Auto Export Tag"
            detail="Mark scheduled posture snapshots as export-ready guidance."
            enabled={policy?.reportSchedule.autoExport ?? false}
            busy={savingPolicyKey === 'reportSchedule.autoExport'}
            onToggle={(next) => handleReportScheduleUpdate('autoExport', next)}
          />
        </div>
      </div>

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-5 h-5 text-cyan-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Role Capability Matrix</h3>
        </div>
        <div className="space-y-4">
          {(['ADMIN', 'MANAGER', 'AUDITOR', 'OPERATOR'] as const).map((role) => (
            <div key={role} className="rounded-xl border border-white/5 bg-dark-950 p-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-sm font-bold text-white">{role}</p>
                  <p className="text-[11px] text-slate-500">Silent role guardrails for sensitive security actions.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {(['exportReports', 'rotateSecrets', 'executeDestructiveActions', 'manageSecurityPolicy'] as const).map((capability) => (
                  <PolicyToggle
                    key={`${role}-${capability}`}
                    title={humanizeCapability(capability)}
                    detail={role === 'ADMIN' ? 'Fixed superuser baseline' : 'Capability policy'}
                    enabled={policy?.rolePolicies?.[role]?.[capability] ?? false}
                    busy={role === 'ADMIN' || savingPolicyKey === `rolePolicies.${role}.${capability}`}
                    onToggle={(next) => handleRolePolicyToggle(role, capability, next)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-6">
          <Clock3 className="w-5 h-5 text-amber-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Tenant Posture History</h3>
        </div>
        <div className="space-y-3">
          {(data.postureHistory || []).length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4 text-sm text-slate-400">
              No posture snapshots stored yet for this tenant.
            </div>
          ) : (
            data.postureHistory.map((snapshot) => (
              <div key={snapshot.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {snapshot.status.replace('_', ' ')} · {snapshot.reason}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">{new Date(snapshot.generatedAt).toLocaleString()}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{snapshot.summary}</p>
                    {snapshot.priorities.length > 0 ? (
                      <p className="text-[11px] text-amber-300 mt-2">{snapshot.priorities[0]}</p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-right">
                    <MiniMetric label="Audit" value={String(snapshot.brokenAuditEntries)} tone={snapshot.brokenAuditEntries > 0 ? 'warn' : 'ok'} />
                    <MiniMetric label="Honey" value={String(snapshot.honeyEvents)} tone={snapshot.honeyEvents > 0 ? 'warn' : 'neutral'} />
                    <MiniMetric label="Destructive" value={String(snapshot.pendingDestructiveActions)} tone={snapshot.pendingDestructiveActions > 0 ? 'warn' : 'neutral'} />
                    <MiniMetric label="Exposure" value={snapshot.remoteExposureDetected ? 'Remote' : 'Local'} tone={snapshot.remoteExposureDetected ? 'warn' : 'ok'} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="card border-white/5 bg-dark-900/40">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-black text-white text-lg tracking-tight uppercase">Compliance Report</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <MiniMetric
              label="Score"
              value={String(data.complianceReport.score)}
              tone={data.complianceReport.score >= 85 ? 'ok' : data.complianceReport.score >= 60 ? 'warn' : 'warn'}
            />
            <MiniMetric
              label="Status"
              value={data.complianceReport.status.replace('_', ' ')}
              tone={data.complianceReport.status === 'aligned' ? 'ok' : 'warn'}
            />
            <MiniMetric
              label="Blockers"
              value={String(data.complianceReport.blockers.length)}
              tone={data.complianceReport.blockers.length > 0 ? 'warn' : 'ok'}
            />
          </div>
          <div className="space-y-3">
            {data.complianceReport.controls.map((control) => (
              <div key={control.key} className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{control.title}</p>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                    control.status === 'pass'
                      ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10'
                      : control.status === 'warn'
                        ? 'text-amber-300 border-amber-500/20 bg-amber-500/10'
                        : 'text-red-300 border-red-500/20 bg-red-500/10'
                  }`}>
                    {control.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">{control.evidence}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card border-white/5 bg-dark-900/40">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h3 className="font-black text-white text-lg tracking-tight uppercase">Deployment Readiness</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <MiniMetric
              label="Status"
              value={data.deploymentReadiness.status}
              tone={data.deploymentReadiness.status === 'ready' ? 'ok' : 'warn'}
            />
            <MiniMetric
              label="Blockers"
              value={String(data.deploymentReadiness.blockers.length)}
              tone={data.deploymentReadiness.blockers.length > 0 ? 'warn' : 'ok'}
            />
            <MiniMetric
              label="Warnings"
              value={String(data.deploymentReadiness.warnings.length)}
              tone={data.deploymentReadiness.warnings.length > 0 ? 'warn' : 'neutral'}
            />
          </div>
          <div className="space-y-3 mb-4">
            {data.deploymentReadiness.checks.map((check) => (
              <div key={check.key} className="rounded-xl border border-white/5 bg-dark-950 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{check.title}</p>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                    check.status === 'pass'
                      ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10'
                      : check.status === 'warn'
                        ? 'text-amber-300 border-amber-500/20 bg-amber-500/10'
                        : 'text-red-300 border-red-500/20 bg-red-500/10'
                  }`}>
                    {check.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">{check.detail}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Recommended Next Steps</p>
            <div className="mt-3 space-y-2">
              {data.deploymentReadiness.recommendations.length === 0 ? (
                <p className="text-sm text-emerald-300 font-medium">Camel is in a good position to move beyond localhost.</p>
              ) : (
                data.deploymentReadiness.recommendations.map((item, index) => (
                  <div key={`${index}-${item}`} className="rounded-lg border border-white/5 bg-dark-900 px-3 py-2 text-sm text-slate-200">
                    {item}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="card bg-dark-900/40 border-brand-500/10">
          <div className="flex items-center gap-3 mb-6">
            <Fingerprint className="w-5 h-5 text-brand-400" />
            <h3 className="font-black text-white text-lg tracking-tight uppercase">Audit Integrity</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <MiniMetric label="Status" value={data.auditIntegrity.status} tone={brokenIntegrity > 0 ? 'warn' : 'ok'} />
            <MiniMetric label="Verified" value={`${data.auditIntegrity.valid}/${data.auditIntegrity.total}`} tone="neutral" />
            <MiniMetric label="Broken" value={String(brokenIntegrity)} tone={brokenIntegrity > 0 ? 'warn' : 'ok'} />
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Evidence Signature</p>
            <p className="mt-2 text-xs font-mono text-slate-300 break-all">{data.auditIntegrity.exportSignature}</p>
            {data.auditIntegrity.brokenEntries.length > 0 ? (
              <div className="mt-4 space-y-2">
                {data.auditIntegrity.brokenEntries.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs">
                    <span className="text-slate-200 font-medium">{entry.action}</span>
                    <span className="text-red-300 font-mono">{entry.id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-emerald-300 font-medium">Audit chain verified with no broken entries in the current evidence window.</p>
            )}
          </div>
        </div>

        <div className="card glass-dark relative overflow-hidden">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <h3 className="font-black text-white text-lg tracking-tight uppercase flex items-center gap-2 mb-2">
                <LockKeyhole className="w-5 h-5 text-emerald-500" />
                Delayed Destructive Actions
              </h3>
              <p className="text-sm text-slate-400 mb-6">Undo-friendly tasks that keep Camel safe from rushed or malicious destructive changes.</p>

              {pendingDestructive.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300 font-medium">
                  No pending destructive actions. The guardrail queue is currently clear.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingDestructive.slice(0, 5).map((task) => (
                    <DelayedTaskRow
                      key={task.id}
                      task={task}
                      busy={mutatingTaskId === task.id}
                      onCancel={() => handleDestructiveAction(task.id, 'cancel')}
                      onExecute={() => handleDestructiveAction(task.id, 'execute_now')}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <QuickGuard
                title="Honey Trips"
                value={data.honeyEvents.length}
                detail={data.honeyEvents[0] ? `${data.honeyEvents[0].method} ${data.honeyEvents[0].path}` : 'No trap hits detected'}
              />
              <QuickGuard
                title="Sensitive MFA"
                value={posture?.requireSensitiveMfa ? 'On' : 'Ready'}
                detail={posture?.requireSensitiveMfa ? 'Sensitive actions are gated.' : 'Turn on when exposing outside localhost.'}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-6">
          <RefreshCw className="w-5 h-5 text-cyan-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Guided API Key Rotation</h3>
        </div>
        <div className="space-y-3">
          {data.postureReport.apiKeyRotationCandidates.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-sm text-emerald-300 font-medium">
              No API keys currently require guided rotation.
            </div>
          ) : (
            data.postureReport.apiKeyRotationCandidates.map((candidate) => (
              <div key={`${candidate.id}-${candidate.reason}`} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{candidate.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{candidate.prefix}</p>
                    <p className="text-[11px] text-slate-500 mt-2">{candidate.summary}</p>
                  </div>
                  <button
                    onClick={() => handleRotateKey(candidate.id, candidate.graceMinutes)}
                    disabled={rotatingKeyId === candidate.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rotate
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-indigo-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Webhook Secret Rotation</h3>
        </div>
        <div className="space-y-3">
          {data.postureReport.webhookRotationCandidates.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-sm text-emerald-300 font-medium">
              No active webhook secrets currently require guided rotation.
            </div>
          ) : (
            data.postureReport.webhookRotationCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{candidate.url}</p>
                    <p className="text-xs text-slate-400 mt-1">{candidate.events.join(', ') || 'No events declared'}</p>
                    <p className="text-[11px] text-slate-500 mt-2">{candidate.summary}</p>
                  </div>
                  <button
                    onClick={() => handleRotateWebhook(candidate.id)}
                    disabled={rotatingWebhookId === candidate.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-indigo-300 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rotate
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card border-white/5 bg-dark-900/40">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-5 h-5 text-amber-400" />
          <h3 className="font-black text-white text-lg tracking-tight uppercase">Honey & Canary Signals</h3>
        </div>
        <div className="space-y-3 font-mono text-xs">
          {data.honeyEvents.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4 text-sm text-slate-400">
              No honey endpoint hits recorded. Canary guardrails are quiet.
            </div>
          ) : (
            data.honeyEvents.slice(0, 6).map((event) => (
              <EventItem
                key={`${event.trapId}-${event.trippedAt}`}
                time={new Date(event.trippedAt).toLocaleTimeString()}
                event={`${event.method} ${event.path}`}
                status={event.trapId}
                severity="HIGH"
                meta={event.ipAddress || 'unknown-ip'}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: number; icon: any; color: string; bgColor: string; description: string }> = ({ 
  title, value, icon: Icon, color, bgColor, description 
}) => (
  <div className="card hover:border-white/10 transition-all duration-300 group">
    <div className="flex items-start justify-between">
      <div className={`${bgColor} p-3 rounded-2xl group-hover:scale-110 transition-transform duration-500 border border-white/5`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      {(color === 'text-rose-400' || color === 'text-amber-400') && value > 0 && (
        <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
      )}
    </div>
    <div className="mt-6">
      <p className="text-4xl font-black text-white mb-1 tracking-tight">{value}</p>
      <p className="text-slate-200 font-bold text-sm tracking-tight">{title}</p>
      <p className="text-slate-500 text-xs mt-2 leading-relaxed">{description}</p>
    </div>
  </div>
);

const MiniMetric: React.FC<{ label: string; value: string; tone: 'ok' | 'warn' | 'neutral' }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4">
    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{label}</p>
    <p className={`mt-2 text-lg font-black ${tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-white'}`}>{value}</p>
  </div>
);

const QuickGuard: React.FC<{ title: string; value: string | number; detail: string }> = ({ title, value, detail }) => (
  <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4">
    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{title}</p>
    <p className="text-lg font-black text-white mt-2">{value}</p>
    <p className="text-[11px] text-slate-500 mt-1">{detail}</p>
  </div>
);

const PolicyToggle: React.FC<{
  title: string;
  detail: string;
  enabled: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}> = ({ title, detail, enabled, busy, onToggle }) => (
  <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-slate-500 mt-1">{detail}</p>
      </div>
      <button
        onClick={() => onToggle(!enabled)}
        disabled={busy}
        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border ${
          enabled
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            : 'bg-dark-900 text-slate-400 border-white/10'
        } disabled:opacity-50`}
      >
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  </div>
);

const RangePolicyCard: React.FC<{
  title: string;
  detail: string;
  value: number;
  busy: boolean;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
}> = ({ title, detail, value, busy, onChange, min, max, step }) => (
  <div className="rounded-xl border border-white/5 bg-dark-950 px-4 py-4">
    <p className="text-sm font-bold text-white">{title}</p>
    <p className="text-[11px] text-slate-500 mt-1">{detail}</p>
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={busy || value <= min}
        className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 disabled:opacity-40"
      >
        -
      </button>
      <div className="min-w-[64px] text-center text-lg font-black text-white">{value}</div>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={busy || value >= max}
        className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 disabled:opacity-40"
      >
        +
      </button>
    </div>
  </div>
);

function humanizeCapability(capability: string) {
  return capability
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase());
}

const DelayedTaskRow: React.FC<{
  task: SecurityDestructiveAction;
  busy: boolean;
  onCancel: () => void;
  onExecute: () => void;
}> = ({ task, busy, onCancel, onExecute }) => (
  <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-white">{task.action}</p>
        <p className="text-xs text-slate-400 mt-1">{task.resource}</p>
        <p className="text-[11px] text-slate-500 mt-2">Runs at {new Date(task.executeAt).toLocaleString()}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-300 disabled:opacity-50"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Cancel
        </button>
        <button
          onClick={onExecute}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-brand-300 disabled:opacity-50"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Execute
        </button>
      </div>
    </div>
  </div>
);

const EventItem: React.FC<{ time: string; event: string; status: string; severity: string; meta?: string }> = ({ time, event, status, severity, meta }) => (
  <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded-lg transition-colors cursor-default">
    <div className="flex items-center gap-4">
      <span className="text-slate-600 font-bold">{time}</span>
      <div>
        <span className="text-slate-300">{event}</span>
        {meta ? <p className="text-[10px] text-slate-500 mt-1">{meta}</p> : null}
      </div>
    </div>
    <div className="flex items-center gap-3">
       <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded border ${
         severity === 'HIGH' ? 'text-red-400 border-red-500/30 bg-red-500/5' : 
         severity === 'MEDIUM' ? 'text-amber-400 border-amber-500/30 bg-amber-500/5' : 
         'text-slate-500 border-white/10'
       }`}>{severity}</span>
       <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wide">{status}</span>
    </div>
  </div>
);

export default SecurityDashboard;
