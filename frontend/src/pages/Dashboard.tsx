import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { LayoutDashboard, Users, Zap, CheckCircle, XCircle, Clock, RefreshCcw, TrendingUp, Shield } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [ops, setOps] = useState<any>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const [statsRes, jobsRes, monitorRes] = await Promise.all([
        api.get('/billing/usage'),
        api.get('/automation/jobs?limit=5'),
        api.get('/monitor/dashboard').catch(() => ({ data: null }))
      ]);
      setStats(statsRes.data);
      setRecentJobs(jobsRes.data.data || []);
      setOps(monitorRes.data || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  const openIncidents = ops?.incidentSummary?.open || 0;
  const criticalIncidents = ops?.incidentSummary?.critical || 0;
  const releaseStatus = ops?.scaleRelease?.status || 'unknown';
  const topPromotionCandidate = ops?.promotionAdvisor?.promote?.[0] || null;
  const topPromotionReview = ops?.promotionAdvisor?.review?.[0] || null;
  const weakestProfile = ops?.profileHealth?.weakest?.[0] || null;
  const weeklyReport = ops?.weeklyReport?.current || null;
  const securityPosture = ops?.securityPosture || null;
  const notifications = ops?.notifications || [];
  const accountHealth = ops?.accountHealth || null;
  const profileActivity = ops?.profileActivity || [];
  const profileReputation = ops?.profileReputation || null;
  const nightlyWarmups = ops?.nightlyWarmups || [];
  const nightlyWarmupQueue = ops?.nightlyWarmupQueue || null;
  const quarantineSummary = ops?.quarantineSummary || null;
  const kubernetesReadiness = ops?.kubernetesReadiness || null;
  const aiRouter = ops?.aiRouter || null;
  const vpnCluster = ops?.networkObservability?.vpnCluster || null;
  const averageSoakScore = Math.round(((ops?.longRunSoak || []).reduce((sum: number, item: any) => sum + (item.overallScore || 0), 0)) / Math.max((ops?.longRunSoak || []).length, 1));
  const dashboardBrief: string[] = [];
  if (criticalIncidents > 0) dashboardBrief.push('Critical incidents are open. Stabilize the workspace before promoting anything.');
  if (releaseStatus !== 'ready') dashboardBrief.push('Release readiness is not green yet. Keep new flows and presets under review.');
  if ((ops?.promotionAdvisor?.summary?.reviewCount || 0) > 0) dashboardBrief.push(`${ops?.promotionAdvisor?.summary?.reviewCount || 0} promoted resource(s) are now under pressure and should be reviewed.`);
  if ((ops?.metrics?.releaseGates?.overallScore || 0) < 75) dashboardBrief.push('Release gates are softer than ideal. Check benchmark and soak signals before trusting defaults.');
  if (weeklyReport?.summary?.trend === 'regressed') dashboardBrief.push('The weekly comparative report is regressing. Treat short-term green signals with caution until the next report improves.');
  if (weeklyReport?.summary?.releaseReadiness === 'hold') dashboardBrief.push('Weekly readiness is on hold. Delay default promotions and keep rollback paths clear.');
  if (securityPosture?.remoteExposureDetected && !securityPosture?.adminAllowlistConfigured) dashboardBrief.push('Camel looks remotely reachable without an admin IP allowlist. Fix ingress before trusting the panel outside localhost.');
  if ((securityPosture?.adminMfaCoverage || 100) < 100) dashboardBrief.push('Some admin accounts still lack MFA. Close that gap before widening exposure.');
  if (dashboardBrief.length === 0) dashboardBrief.push('Workspace looks healthy. Focus on the best promotion candidate or the weakest profile before the next release change.');

  const priorityCards = [
    {
      title: 'Workspace Readiness',
      tone: releaseStatus === 'ready' ? 'emerald' : releaseStatus === 'caution' ? 'amber' : 'red',
      value: releaseStatus,
      summary: ops?.infrastructureHealth?.userGuidance?.summary || 'No readiness summary available yet.',
      href: '/liveops',
      action: 'Open LiveOps',
    },
    {
      title: 'Incidents',
      tone: criticalIncidents > 0 ? 'red' : openIncidents > 0 ? 'amber' : 'emerald',
      value: `${openIncidents} open`,
      summary: criticalIncidents > 0
        ? `${criticalIncidents} critical incident(s) need immediate response.`
        : openIncidents > 0
          ? 'There are open incidents, but none are currently critical.'
          : 'No open incidents right now.',
      href: '/liveops',
      action: 'Review incidents',
    },
    {
      title: 'Promotion Focus',
      tone: topPromotionReview ? 'amber' : topPromotionCandidate ? 'emerald' : 'slate',
      value: topPromotionReview ? 'review' : topPromotionCandidate ? 'promote' : 'hold',
      summary: topPromotionReview
        ? `${topPromotionReview.name} should be reviewed before remaining promoted.`
        : topPromotionCandidate
          ? `${topPromotionCandidate.name} is the strongest current promotion candidate.`
          : 'No obvious promotion candidate right now.',
      href: '/liveops',
      action: 'Check promotions',
    },
    {
      title: 'Weakest Profile',
      tone: (weakestProfile?.validationScore || 0) >= 85 ? 'emerald' : (weakestProfile?.validationScore || 0) >= 65 ? 'amber' : 'red',
      value: weakestProfile ? `${weakestProfile.validationScore}` : 'n/a',
      summary: weakestProfile
        ? `${weakestProfile.name} is currently the weakest profile in the workspace.`
        : 'No profile health data available yet.',
      href: '/profiles',
      action: 'Inspect profile',
    },
    {
      title: 'Weekly Trend',
      tone: weeklyReport?.summary?.trend === 'improved' ? 'emerald' : weeklyReport?.summary?.trend === 'regressed' ? 'red' : 'amber',
      value: weeklyReport?.summary?.trend || 'pending',
      summary: weeklyReport
        ? `Weekly readiness is ${weeklyReport.summary.releaseReadiness} with overall delta ${weeklyReport.summary.overallDelta}.`
        : 'No weekly comparative report available yet.',
      href: '/liveops',
      action: 'Review weekly report',
    },
    {
      title: 'Security Posture',
      tone: securityPosture?.remoteExposureDetected && !securityPosture?.adminAllowlistConfigured
        ? 'red'
        : (securityPosture?.adminMfaCoverage || 100) < 100
          ? 'amber'
          : 'emerald',
      value: securityPosture?.remoteExposureDetected ? 'remote' : 'local',
      summary: securityPosture?.summary || 'No security posture summary available yet.',
      href: '/security',
      action: 'Review security',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Command Center</h1>
          <p className="text-slate-400 font-medium">Real-time overview of your automation workspace</p>
        </div>
        <button 
          onClick={() => { setLoading(true); fetchDashboard(); }} 
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all text-sm font-bold"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Sync Data
        </button>
      </div>

      <div className="glass-dark border-white/5 p-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Operational Brief</p>
            <h2 className="text-2xl font-black text-white mt-2">What matters most right now</h2>
            <p className="text-sm text-slate-400 mt-2">
              This is the fastest way to understand whether Camel is stable, what is at risk, and what the operator should do next.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 px-4 py-3 min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommended Next Step</p>
            <p className="text-sm font-bold text-white mt-2">{dashboardBrief[0]}</p>
            <p className="text-[11px] text-slate-500 mt-2">
              Release gates {ops?.metrics?.releaseGates?.overallScore || 0} · soak {averageSoakScore || 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 mt-6">
          {priorityCards.map((item) => (
            <a key={item.title} href={item.href} className="rounded-2xl border border-white/5 bg-dark-950 p-4 hover:border-brand-500/30 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.title}</p>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  item.tone === 'emerald' ? 'text-emerald-400' : item.tone === 'amber' ? 'text-amber-400' : item.tone === 'red' ? 'text-red-400' : 'text-slate-400'
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
            {dashboardBrief.map((item, index) => (
              <p key={`dashboard-brief-${index}`} className="text-sm text-slate-300">
                {index + 1}. {item}
              </p>
            ))}
          </div>
        </div>
        {weeklyReport && (
          <div className="mt-5 rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Weekly Comparative Snapshot</p>
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div>
                <p className="text-sm font-bold text-white">Trend: {weeklyReport.summary.trend}</p>
                <p className="text-[11px] text-slate-500 mt-1">Benchmark {weeklyReport.summary.benchmarkDelta} · gates {weeklyReport.summary.releaseGateDelta} · soak {weeklyReport.summary.soakDelta}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-white">Readiness: {weeklyReport.summary.releaseReadiness}</p>
                <p className="text-[11px] text-slate-500 mt-1">{weeklyReport.highlights?.[0] || weeklyReport.risks?.[0] || 'No weekly highlight available yet.'}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-white">Next move</p>
                <p className="text-[11px] text-slate-500 mt-1">{weeklyReport.recommendations?.[0] || 'No weekly action recommended yet.'}</p>
              </div>
            </div>
          </div>
        )}
        <div className="mt-5 rounded-2xl border border-white/5 bg-dark-950 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">AI Router & Self-Hosted Egress</p>
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div>
              <p className="text-sm font-bold text-white">AI mix</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Groq {aiRouter?.today?.providerMix?.groq || 0} · Ollama {aiRouter?.today?.providerMix?.ollama || 0} · fallbacks {aiRouter?.today?.fallbacks || 0}
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-white">AI pressure</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Requests {aiRouter?.budgetStatus?.requestPressure || 'n/a'} · tokens {aiRouter?.budgetStatus?.tokenPressure || 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-white">VPN exits</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {vpnCluster?.healthyExitCount || 0} healthy of {vpnCluster?.exitCount || 0} self-hosted VPN exits
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            {vpnCluster?.note || 'No self-hosted VPN cluster summary available yet.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Active Profiles" 
          value={stats?.usage?.profiles} 
          limit={stats?.limits?.maxProfiles} 
          icon={TrendingUp} 
          color="brand" 
        />
        <StatCard 
          title="Total Accounts" 
          value={stats?.usage?.accounts} 
          limit={stats?.limits?.maxAccounts} 
          icon={Shield} 
          color="purple" 
        />
        <StatCard 
          title="Jobs Today" 
          value={stats?.usage?.jobsToday} 
          limit={stats?.limits?.jobsPerDay} 
          icon={Zap} 
          color="orange" 
        />
        <StatCard 
          title="Team Seats" 
          value={stats?.usage?.seats} 
          limit={stats?.limits?.maxSeats} 
          icon={Users} 
          color="green" 
        />
      </div>

      {ops && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="glass-dark border-white/5 p-6 lg:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Guided Workspace Readiness</p>
            <p className={`text-2xl font-black mt-2 ${
              ops?.scaleRelease?.status === 'ready'
                ? 'text-emerald-400'
                : ops?.scaleRelease?.status === 'caution'
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}>
              {ops?.scaleRelease?.status || 'unknown'}
            </p>
            <p className="text-sm text-slate-400 mt-3">
              {ops?.infrastructureHealth?.userGuidance?.summary || 'Workspace guidance unavailable.'}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Next: {ops?.infrastructureHealth?.userGuidance?.nextAction || ops?.scaleRelease?.recommendations?.[0] || 'No immediate action.'}
            </p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Active Incidents</p>
            <p className={`text-2xl font-black mt-2 ${(ops?.incidentSummary?.critical || 0) > 0 ? 'text-red-400' : (ops?.incidentSummary?.open || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {ops?.incidentSummary?.open || 0}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Critical {ops?.incidentSummary?.critical || 0} · Ack {ops?.incidentSummary?.acknowledged || 0}
            </p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Release Gates</p>
            <p className={`text-2xl font-black mt-2 ${ops?.metrics?.releaseGates?.status === 'pass' ? 'text-emerald-400' : ops?.metrics?.releaseGates?.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
              {ops?.metrics?.releaseGates?.overallScore || 0}
            </p>
            <p className="text-xs text-slate-500 mt-2">{ops?.metrics?.releaseGates?.status || 'unknown'}</p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Promote Candidates</p>
            <p className="text-2xl font-black text-emerald-400 mt-2">{ops?.promotionAdvisor?.summary?.promoteCount || 0}</p>
            <p className="text-xs text-slate-500 mt-2">Items ready for recommended/default</p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Review Promotions</p>
            <p className="text-2xl font-black text-amber-400 mt-2">{ops?.promotionAdvisor?.summary?.reviewCount || 0}</p>
            <p className="text-xs text-slate-500 mt-2">Promoted resources under pressure</p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Runtime Hardening</p>
            <p className={`text-2xl font-black mt-2 ${ops?.runtimeHardening?.status === 'strong' ? 'text-emerald-400' : ops?.runtimeHardening?.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
              {ops?.runtimeHardening?.overallScore || 0}
            </p>
            <p className="text-xs text-slate-500 mt-2">{ops?.runtimeHardening?.status || 'unknown'}</p>
          </div>
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Infrastructure</p>
            <p className={`text-2xl font-black mt-2 ${
              ops?.infrastructureHealth?.status === 'healthy'
                ? 'text-emerald-400'
                : ops?.infrastructureHealth?.status === 'warning'
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}>
              {ops?.infrastructureHealth?.overallScore || 0}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Redis {ops?.infrastructureHealth?.components?.redis?.version || 'unreachable'} · {ops?.infrastructureHealth?.components?.redis?.meetsMinimum ? 'ready' : 'upgrade needed'}
            </p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Benchmark Series</p>
            <p className="text-2xl font-black text-white mt-2">{ops?.benchmarkSeries?.summary?.latestScore || 0}</p>
            <p className="text-xs text-slate-500 mt-2">
              {ops?.benchmarkSeries?.summary?.trend || 'stable'} · {ops?.benchmarkSeries?.summary?.snapshots || 0} snapshots
            </p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Long-Run Soak</p>
            <p className="text-2xl font-black text-white mt-2">
              {Math.round(((ops?.longRunSoak || []).reduce((sum: number, item: any) => sum + (item.overallScore || 0), 0)) / Math.max((ops?.longRunSoak || []).length, 1))}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {(ops?.longRunSoak || []).map((item: any) => `${item.profile}:${item.status}`).join(' · ') || 'No soak profiles'}
            </p>
          </div>
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="glass-dark border-white/5 p-6 xl:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profile Activity Heatmap</p>
            <div className="mt-4 space-y-3">
              {(profileActivity || []).length === 0 ? (
                <p className="text-sm text-slate-500">No profile activity insight yet.</p>
              ) : (
                profileActivity.map((profile: any) => (
                  <div key={profile.profileId} className="rounded-2xl border border-white/5 bg-dark-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-white">{profile.name}</p>
                      <p className="text-[11px] text-slate-500">{profile.lastActivityAt ? new Date(profile.lastActivityAt).toLocaleString() : 'no activity yet'}</p>
                    </div>
                    <div className="grid grid-cols-6 md:grid-cols-12 gap-2 mt-3">
                      {(profile.heatmap || []).slice(0, 12).map((cell: any) => (
                        <div key={`${profile.profileId}-${cell.day}-${cell.hour}`} className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                          <p className="text-[9px] text-slate-500">D{cell.day} H{cell.hour}</p>
                          <p className="text-sm font-bold text-white mt-1">{cell.count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Account Health</p>
            <p className="text-2xl font-black text-white mt-2">{accountHealth?.averageScore || 0}</p>
            <p className="text-xs text-slate-500 mt-2">Average health score across tracked accounts</p>
            <div className="mt-4 space-y-2">
              {(accountHealth?.weakest || []).slice(0, 5).map((account: any) => (
                <div key={account.id} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{account.username}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{account.inboxStatus} · {account.verified ? 'verified' : 'unverified'}</p>
                    </div>
                    <span className="text-sm font-black text-amber-400">{account.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">High-Value Profiles</p>
            <p className="text-2xl font-black text-white mt-2">{profileReputation?.averageScore || 0}</p>
            <p className="text-xs text-slate-500 mt-2">Average profile reputation across the tenant</p>
            <div className="mt-4 space-y-2">
              {(profileReputation?.top || []).slice(0, 5).map((profile: any) => (
                <div key={profile.profileId} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{profile.name}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{profile.tier}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-400">{profile.reputationScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nightly Warmup Queue</p>
            <p className="text-2xl font-black text-white mt-2">{nightlyWarmups.length}</p>
            <p className="text-xs text-slate-500 mt-2">Profiles that should be warmed before the next heavy run</p>
            <p className="text-[11px] text-slate-500 mt-2">
              {nightlyWarmupQueue?.summary?.pendingApproval || 0} pending approval · {nightlyWarmupQueue?.learning?.averageDelta || 0} avg delta
            </p>
            <div className="mt-4 space-y-2">
              {nightlyWarmups.slice(0, 5).map((plan: any) => (
                <div key={plan.profileId} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                  <p className="text-sm font-bold text-white">{plan.profileName || plan.profileId}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{plan.mode} · {plan.nextWindow}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {plan.estimatedDurationMinutes || '--'} min · projected readiness {plan.readinessAfterWarmup || '--'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cluster Readiness</p>
            <p className={`text-2xl font-black mt-2 ${
              kubernetesReadiness?.status === 'ready' ? 'text-emerald-400' : kubernetesReadiness?.status === 'caution' ? 'text-amber-400' : 'text-red-400'
            }`}>
              {kubernetesReadiness?.status || 'unknown'}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {kubernetesReadiness?.manifestCount || 0} manifests · quarantined {quarantineSummary?.activeCount || 0}
            </p>
            <p className="text-[11px] text-slate-500 mt-4">{kubernetesReadiness?.blockers?.[0] || 'Cluster baseline looks healthy enough for the next step.'}</p>
          </div>
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Positive Warmup Learning</p>
            <p className="text-sm text-slate-400 mt-2">Profiles whose last warmup feedback is improving readiness.</p>
            <div className="mt-4 space-y-2">
              {(profileReputation?.improving || []).length === 0 ? (
                <p className="text-sm text-slate-500">No positive warmup learners yet.</p>
              ) : (
                (profileReputation?.improving || []).slice(0, 4).map((profile: any) => (
                  <div key={`improving-${profile.profileId}`} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{profile.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          last {profile.warmupLearning?.lastMode || 'n/a'} · outcome {profile.warmupLearning?.lastOutcome || 'unknown'}
                        </p>
                      </div>
                      <span className="text-sm font-black text-emerald-400">{profile.warmupLearning?.averageDelta || 0}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Degraded Warmup Learning</p>
            <p className="text-sm text-slate-400 mt-2">Profiles whose warmup feedback suggests launch plans should stay conservative.</p>
            <div className="mt-4 space-y-2">
              {(profileReputation?.degrading || []).length === 0 ? (
                <p className="text-sm text-slate-500">No degraded warmup learners right now.</p>
              ) : (
                (profileReputation?.degrading || []).slice(0, 4).map((profile: any) => (
                  <div key={`degrading-${profile.profileId}`} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{profile.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          last {profile.warmupLearning?.lastMode || 'n/a'} · outcome {profile.warmupLearning?.lastOutcome || 'unknown'}
                        </p>
                      </div>
                      <span className="text-sm font-black text-red-400">{profile.warmupLearning?.averageDelta || 0}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {ops && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Promotion Tasks</p>
            <p className="text-2xl font-black text-white mt-2">{ops?.promotionTasks?.length || 0}</p>
            <p className="text-xs text-slate-500 mt-2">
              Pending {(ops?.promotionTasks || []).filter((task: any) => task.status === 'pending_review').length} · Applied {(ops?.promotionTasks || []).filter((task: any) => task.status === 'applied').length}
            </p>
          </div>
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Next Best Action</p>
            <p className="text-sm font-bold text-white mt-2">
              {ops?.incidentSummary?.critical > 0
                ? (ops?.incidents?.[0]?.title || 'Resolve critical incidents')
                : ops?.promotionAdvisor?.promote?.[0]?.name || ops?.promotionAdvisor?.review?.[0]?.name || 'No urgent recommendation'}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {ops?.incidentSummary?.critical > 0
                ? (ops?.incidents?.[0]?.summary || 'Workspace needs incident response before promotion decisions.')
                : ops?.promotionAdvisor?.promote?.[0]?.reasons?.[0] || ops?.promotionAdvisor?.review?.[0]?.reasons?.[0] || 'Workspace is stable enough to hold current promotion state.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand-400" /> Recent Activity
            </h2>
            <a href="/automation" className="text-xs font-bold text-brand-400 hover:underline">View All</a>
          </div>
          
          <div className="glass-dark overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                    <th className="px-6 py-4">Job Type</th>
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="text-sm border-t border-white/5">
                  {loading && recentJobs.length === 0 ? (
                    [1, 2, 3].map(i => (
                      <tr key={i} className="animate-pulse border-b border-white/5">
                        <td colSpan={4} className="h-16 bg-white/5"></td>
                      </tr>
                    ))
                  ) : recentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-medium italic">
                        No recent automation activity found
                      </td>
                    </tr>
                  ) : (
                    recentJobs.map((job) => (
                      <tr key={job.id} className="border-b border-white/5 group hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-bold text-white capitalize">{job.type.replace('_', ' ')}</td>
                        <td className="px-6 py-4 font-mono text-slate-500 text-[10px] break-all max-w-[120px]">{job.id}</td>
                        <td className="px-6 py-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-6 py-4 text-right text-slate-400 font-medium">
                          {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-dark border-white/5 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">In-App Notifications</p>
            <div className="mt-4 space-y-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">No app notifications right now.</p>
              ) : (
                notifications.slice(0, 5).map((notification: any) => (
                  <div key={notification.id} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{notification.title}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{notification.body}</p>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${
                        notification.severity === 'critical' ? 'text-red-400' : notification.severity === 'warning' ? 'text-amber-400' : 'text-cyan-400'
                      }`}>
                        {notification.severity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <h2 className="text-xl font-bold text-white px-2">System Status</h2>
          <div className="glass-dark p-6 space-y-6">
            <StatusIcon label="Automation API" status="online" />
            <StatusIcon label="Worker Cluster" status={(ops?.scaleRelease?.status === 'blocked' ? 'offline' : 'online')} />
            <StatusIcon label="Redis Queue" status={(ops?.infrastructureHealth?.components?.redis?.meetsMinimum ? 'online' : 'offline')} />
            <StatusIcon label="PostgreSQL DB" status="online" />
            
            <div className="pt-4 border-t border-white/5">
              {ops?.promotionAdvisor?.review?.length > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Needs Review</p>
                  <p className="text-sm font-bold text-white mt-1">
                    {ops.promotionAdvisor.review[0].name}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {ops.promotionAdvisor.review[0].reasons?.[0] || 'Promotion should be reviewed.'}
                  </p>
                </div>
              )}
              {(ops?.incidentSummary?.open || 0) > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Incident Center</p>
                  <p className="text-sm font-bold text-white mt-1">
                    {ops?.incidents?.[0]?.title || 'Operational incident detected'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {ops?.incidents?.[0]?.summary || 'LiveOps has active incidents to review.'}
                  </p>
                </div>
              )}
              <div className="p-4 rounded-xl bg-brand-gradient text-white">
                <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-80">Workspace Plan</p>
                <p className="text-lg font-black uppercase tracking-tighter capitalize">{stats?.plan || 'Free'} Edition</p>
                <a href="/billing" className="mt-3 block text-center py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-all text-xs font-bold">Manage Subscription</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, limit, icon: Icon, color }: any) {
  const colors: any = {
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
  };

  const isUnlimited = typeof limit === 'number' && limit < 0;
  const percent = limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;

  return (
    <div className="glass-dark border-white/5 p-6 group hover:translate-y-[-4px] transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${colors[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-black text-white">{value ?? '-'}</p>
          {isUnlimited && <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mt-1">Unlimited</p>}
        </div>
      </div>
      {limit > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-slate-500">Utilization</span>
            <span className={percent > 90 ? 'text-red-400' : 'text-slate-400'}>{percent}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${percent > 90 ? 'bg-red-500' : 'bg-brand-500'}`} 
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: any = {
    success: { icon: CheckCircle, text: 'Success', color: 'text-emerald-400' },
    failed: { icon: XCircle, text: 'Failed', color: 'text-red-400' },
    processing: { icon: Clock, text: 'Processing', color: 'text-brand-400 animate-pulse' },
    pending: { icon: Clock, text: 'Pending', color: 'text-slate-500' },
  };
  const { icon: Icon, text, color } = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold text-xs ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

function StatusIcon({ label, status }: { label: string; status: 'online' | 'offline' }) {
  return (
    <div className="flex items-center justify-between group">
      <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{status}</span>
        <div className={`h-2.5 w-2.5 rounded-full ${status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-red-500'}`} />
      </div>
    </div>
  );
}
