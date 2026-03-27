import React, { useEffect, useState } from 'react';
import { Plus, Fingerprint, Globe, Trash2, UserPlus, Zap as ZapIcon, Monitor, Smartphone, Glasses, ExternalLink, Database, RefreshCw, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import ProfilesManager from '../components/ProfilesManager';

interface ProfileStateSummary {
  profileId: string;
  localManifest?: any;
  cloudManifest?: any;
  runtimeLease?: {
    locked: boolean;
    owner: string | null;
    tokenPreview: string | null;
    acquiredAt: string | null;
    expiresInMs: number | null;
    expiresAt: string | null;
  };
  sessionSnapshot?: {
    updatedAt?: string;
    fingerprintSummary?: {
      userAgent?: string | null;
      language?: string | null;
      timezoneId?: string | null;
      screenResolution?: string | null;
    };
    sessionPersistence?: {
      cookies?: { count?: number; sampleDomains?: string[] };
      localStorage?: { origins?: number; itemCount?: number; sampleOrigins?: string[] };
      persistentStores?: {
        indexedDbFiles?: number;
        serviceWorkerFiles?: number;
        cacheStorageFiles?: number;
        localStorageFiles?: number;
        status?: string;
      };
      contextMode?: string;
      sticky?: boolean;
      country?: string | null;
      city?: string | null;
      endpointId?: string | null;
    };
    platformCompatibility?: {
      score?: number;
      status?: string;
      host?: { os?: string; arch?: string };
      target?: { os?: string; arch?: string };
      notes?: string[];
    };
    sandboxRuntime?: {
      enabled?: boolean;
      allowedHosts?: string[];
      dynamicCanvasEvolution?: boolean;
      emulateWebRTC?: boolean;
      emulateAudio?: boolean;
      emulateBattery?: boolean;
    };
  };
  diff?: {
    status: string;
    checksumMatch: boolean;
    versionDelta: number;
    localOnlyCount: number;
    cloudOnlyCount: number;
    changedCount: number;
    sampleLocalOnly: string[];
    sampleCloudOnly: string[];
    sampleChanged: string[];
  };
  activity?: Array<{
    id: string;
    at: string;
    action: string;
    actor: string;
    details?: Record<string, any>;
  }>;
  snapshots?: any[];
  encryption?: {
    enabled: boolean;
    version: string;
    algorithm: string;
    adminRecovery?: {
      enabled: boolean;
      legalHoldReady: boolean;
      requiresReason: boolean;
      lastRecoveryAt: string | null;
    };
  } | null;
  consistency?: {
    status?: string;
    stickyUntil?: string | null;
    driftCount?: number;
    endpointId?: string | null;
  } | null;
}

interface SnapshotDiffResult {
  snapshotId: string;
  target: 'live' | 'cloud';
  snapshotChecksum: string;
  targetChecksum: string | null;
  diff: {
    status: string;
    checksumMatch: boolean;
    versionDelta: number;
    localOnlyCount: number;
    cloudOnlyCount: number;
    changedCount: number;
    sampleLocalOnly: string[];
    sampleCloudOnly: string[];
    sampleChanged: string[];
  };
}

interface ResourceAccessSummary {
  resourceType: string;
  resourceId: string;
  effectivePermissions: string[];
  grants: Array<{
    id: string;
    permission: string;
    createdAt?: string;
    user?: {
      id: string;
      email: string;
      role: string;
    };
  }>;
}

interface ProfileOperationHistory {
  profileId: string;
  summary: {
    activeOperations: number;
    retryableOperations: number;
    conflictCount: number;
    hasBlockingConflict: boolean;
    lastFailure: BulkProfileOperation | null;
  };
  operations: BulkProfileOperation[];
}

interface BulkProfileOperation {
  id: string;
  type: string;
  status: string;
  totalTasks: number;
  completed: number;
  failed: number;
  createdAt: string;
  updatedAt: string;
  request?: {
    kind: 'profile_state' | 'profile_access';
    operation: 'snapshot' | 'sync' | 'pull' | 'grant' | 'revoke';
    profileIds: string[];
    targetUserId?: string | null;
    permission?: string | null;
  } | null;
  summary?: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  retriableProfileIds?: string[];
  failedResults?: Array<{
    profileId: string;
    ok: boolean;
    error?: string;
  }>;
  fatalError?: string | null;
}

interface ProfileDoctorSummary {
  healthScore: number;
  status: string;
  overlap: {
    sharedFingerprintCount: number;
    sharedProxyCount: number;
    sampleProfiles: Array<{ id: string; name: string }>;
  };
  recommendations: string[];
}

interface ProfileTimelineSummary {
  items: Array<{
    id: string;
    at: string;
    title: string;
    detail: string;
    severity: string;
  }>;
  heatmap: Array<{
    day: number;
    hour: number;
    count: number;
  }>;
}

interface ProfileReputationSummary {
  reputationScore: number;
  tier: string;
  ageDays: number;
  notes: string[];
}

interface PredictiveWarmupSummary {
  mode: string;
  riskBand?: string;
  idleHours: number;
  nextWindow: string;
  estimatedDurationMinutes?: number;
  readinessAfterWarmup?: number;
  autoQueueEligible?: boolean;
  reasons: string[];
  blockers?: string[];
  steps?: Array<{
    order: number;
    kind: string;
    label: string;
    durationMinutes: number;
  }>;
}

interface PredictiveWarmupQueueEntry {
  id: string;
  profileId: string;
  profileName: string;
  mode: string;
  status: string;
  riskBand: string;
  estimatedDurationMinutes: number;
  readinessAfterWarmup: number;
  feedback?: {
    outcome: string;
    deltaScore: number;
    recordedAt: string | null;
  };
}

interface PredictiveWarmupQueueSummary {
  settings?: {
    approvalsRequired: boolean;
    autoQueueEnabled: boolean;
  };
  summary?: {
    total: number;
    pendingApproval: number;
    queued: number;
    completed: number;
  };
  learning?: {
    completed: number;
    improved: number;
    worsened: number;
    averageDelta: number;
    recommendedMode: string;
  };
  items: PredictiveWarmupQueueEntry[];
}

interface ProfileQuarantineSummary {
  active: boolean;
  reason: string;
  createdAt: string;
  releasedAt: string | null;
}

interface ProfileDoctorAiSummary {
  source: string;
  severity?: string;
  confidence?: number;
  summary: string;
  rootCause: string;
  nextActions: string[];
  safeAutofix: string;
  launchRecommendation?: string;
  warmupRecommendation?: string;
  signals?: Array<{
    code: string;
    active: boolean;
    weight: number;
  }>;
  safeAutofixPlan?: {
    primaryAction: string;
    secondaryAction?: string;
    rationale?: string[];
  };
}

interface ProfileDecouplePlan {
  requiresApproval: boolean;
  routingAdvice: string;
  rationale: string[];
  fingerprintPatch?: {
    canvasSeed?: string;
    hardwareConcurrency?: number;
  };
}

export default function Profiles() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [profileState, setProfileState] = useState<ProfileStateSummary | null>(null);
  const [profileAccess, setProfileAccess] = useState<ResourceAccessSummary | null>(null);
  const [profileOperations, setProfileOperations] = useState<ProfileOperationHistory | null>(null);
  const [profileDoctor, setProfileDoctor] = useState<ProfileDoctorSummary | null>(null);
  const [profileTimeline, setProfileTimeline] = useState<ProfileTimelineSummary | null>(null);
  const [profileReputation, setProfileReputation] = useState<ProfileReputationSummary | null>(null);
  const [profileWarmup, setProfileWarmup] = useState<PredictiveWarmupSummary | null>(null);
  const [profileQuarantine, setProfileQuarantine] = useState<ProfileQuarantineSummary | null>(null);
  const [profileDoctorAi, setProfileDoctorAi] = useState<ProfileDoctorAiSummary | null>(null);
  const [profileDecouplePlan, setProfileDecouplePlan] = useState<ProfileDecouplePlan | null>(null);
  const [profileWarmupQueue, setProfileWarmupQueue] = useState<PredictiveWarmupQueueSummary | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [snapshotDiff, setSnapshotDiff] = useState<SnapshotDiffResult | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [shareTargetUserId, setShareTargetUserId] = useState('');
  const [sharePermission, setSharePermission] = useState('READ');
  const [bulkTargetUserId, setBulkTargetUserId] = useState('');
  const [bulkPermission, setBulkPermission] = useState('READ');
  const [bulkOperations, setBulkOperations] = useState<BulkProfileOperation[]>([]);

  const fetchProfiles = async (pageArg = page, searchArg = search) => {
    setLoading(true);
    try {
      const { data } = await api.get('/profiles', {
        params: {
          page: pageArg,
          pageSize,
          search: searchArg || undefined,
        }
      });
      setProfiles(data.items || []);
      setPagination({
        total: data.total || 0,
        totalPages: data.totalPages || 1,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileState = async (profileId: string) => {
    setLoadingState(true);
    try {
      const [{ data: state }, { data: snapshots }, { data: access }, { data: operations }, { data: doctor }, { data: timeline }, { data: reputation }, { data: warmup }, { data: quarantine }, { data: doctorAi }, { data: decouplePlan }, { data: warmupQueue }] = await Promise.all([
        api.get(`/profiles/${profileId}/state`),
        api.get(`/profiles/${profileId}/snapshots`),
        api.get(`/profiles/${profileId}/access`),
        api.get(`/profiles/${profileId}/operations`),
        api.get(`/profiles/${profileId}/doctor`),
        api.get(`/profiles/${profileId}/timeline`),
        api.get(`/profiles/${profileId}/reputation`),
        api.get(`/profiles/${profileId}/warmup-plan`),
        api.get(`/profiles/${profileId}/quarantine`).catch(() => ({ data: null })),
        api.get(`/profiles/${profileId}/doctor-ai`),
        api.get(`/profiles/${profileId}/decouple-plan`),
        api.get('/profiles/warmup/nightly').catch(() => ({ data: { items: [] } })),
      ]);
      setProfileState({
        ...state,
        snapshots,
      });
      setProfileAccess(access);
      setProfileOperations(operations);
      setProfileDoctor(doctor);
      setProfileTimeline(timeline);
      setProfileReputation(reputation);
      setProfileWarmup(warmup);
      setProfileQuarantine(quarantine);
      setProfileDoctorAi(doctorAi);
      setProfileDecouplePlan(decouplePlan);
      setProfileWarmupQueue(warmupQueue);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load profile state');
    } finally {
      setLoadingState(false);
    }
  };

  const fetchTeamUsers = async () => {
    try {
      const { data } = await api.get('/team');
      setTeamUsers(data || []);
    } catch {
      setTeamUsers([]);
    }
  };

  const fetchBulkOperations = async () => {
    try {
      const { data } = await api.get('/bulk/operations', {
        params: {
          type: 'profiles',
          limit: 10,
        }
      });
      setBulkOperations(Array.isArray(data) ? data : []);
    } catch {
      setBulkOperations([]);
    }
  };

  useEffect(() => {
    fetchProfiles(1, '');
    fetchTeamUsers();
    fetchBulkOperations();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      fetchProfiles(1, search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure? This will delete the profile and all associated accounts.')) return;
    try {
      await api.delete(`/profiles/${id}`);
      fetchProfiles();
    } catch {
      alert('Failed to delete');
    }
  };

  const toggleProfileSelection = (profileId: string) => {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId]
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = profiles.map((profile) => profile.id);
    const allSelected = visibleIds.every((id) => selectedProfileIds.includes(id));
    setSelectedProfileIds(allSelected ? [] : visibleIds);
  };

  const handleLaunch = async (id: string) => {
    try {
      toast.loading('Launching browser...', { id: 'launch' });
      await api.post(`/profiles/${id}/launch`);
      toast.success('Browser launched!', { id: 'launch' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to launch', { id: 'launch' });
    }
  };

  const handleSmartLaunch = async (id: string) => {
    try {
      toast.loading('Preparing smart launch...', { id: 'smart-launch' });
      const { data } = await api.post(`/profiles/${id}/smart-launch`);
      toast.success(data?.plan?.notes?.[0] || 'Smart launch ready', { id: 'smart-launch' });
      if (selectedProfile?.id === id) {
        await fetchProfileState(id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Smart launch failed', { id: 'smart-launch' });
    }
  };

  const quarantineProfile = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Quarantining profile...', { id: 'profile-quarantine' });
      await api.post(`/profiles/${selectedProfile.id}/quarantine`, {
        reason: 'Manual quarantine from profile operations panel',
      });
      toast.success('Profile quarantined', { id: 'profile-quarantine' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to quarantine profile', { id: 'profile-quarantine' });
    }
  };

  const releaseProfileQuarantine = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Releasing quarantine...', { id: 'profile-quarantine-release' });
      await api.post(`/profiles/${selectedProfile.id}/quarantine/release`, {
        reason: 'Manual release from profile operations panel',
      });
      toast.success('Profile quarantine released', { id: 'profile-quarantine-release' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to release quarantine', { id: 'profile-quarantine-release' });
    }
  };

  const applyDecouplePlan = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Applying decouple plan...', { id: 'profile-decouple' });
      await api.post(`/profiles/${selectedProfile.id}/decouple-apply`, {});
      toast.success('Decouple plan applied', { id: 'profile-decouple' });
      await fetchProfileState(selectedProfile.id);
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to apply decouple plan', { id: 'profile-decouple' });
    }
  };

  const queueWarmupPlan = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Queueing nightly warmup...', { id: 'profile-warmup-queue' });
      await api.post(`/profiles/${selectedProfile.id}/warmup/queue`, {});
      toast.success('Warmup plan added to the nightly queue', { id: 'profile-warmup-queue' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to queue warmup plan', { id: 'profile-warmup-queue' });
    }
  };

  const approveWarmupEntry = async (entryId: string) => {
    if (!selectedProfile) return;
    try {
      toast.loading('Approving warmup...', { id: 'profile-warmup-approve' });
      await api.post(`/profiles/${selectedProfile.id}/warmup/approve`, { entryId });
      toast.success('Warmup approved', { id: 'profile-warmup-approve' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve warmup', { id: 'profile-warmup-approve' });
    }
  };

  const recordWarmupFeedback = async (entryId: string, outcome: 'improved' | 'unchanged' | 'worsened', deltaScore: number) => {
    if (!selectedProfile) return;
    try {
      toast.loading('Recording warmup feedback...', { id: 'profile-warmup-feedback' });
      await api.post(`/profiles/${selectedProfile.id}/warmup/feedback`, {
        entryId,
        outcome,
        deltaScore,
        notes: 'Recorded from profile operations panel',
      });
      toast.success('Warmup feedback recorded', { id: 'profile-warmup-feedback' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record warmup feedback', { id: 'profile-warmup-feedback' });
    }
  };

  const openStatePanel = async (profile: any) => {
    setSelectedProfile(profile);
    setSnapshotDiff(null);
    setShareTargetUserId('');
    setSharePermission('READ');
    await fetchProfileState(profile.id);
  };

  const createSnapshot = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Creating snapshot...', { id: 'snapshot' });
      await api.post(`/profiles/${selectedProfile.id}/snapshots`);
      toast.success('Snapshot created', { id: 'snapshot' });
      await fetchProfileState(selectedProfile.id);
      await fetchBulkOperations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Snapshot failed', { id: 'snapshot' });
    }
  };

  const restoreSnapshot = async (snapshotId: string) => {
    if (!selectedProfile) return;
    if (!confirm(`Restore snapshot ${snapshotId}? The current live state will be backed up first.`)) return;
    try {
      toast.loading('Restoring snapshot...', { id: 'restore' });
      await api.post(`/profiles/${selectedProfile.id}/restore/${snapshotId}`);
      toast.success('Snapshot restored', { id: 'restore' });
      await fetchProfileState(selectedProfile.id);
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Restore failed', { id: 'restore' });
    }
  };

  const syncProfile = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Syncing profile state...', { id: 'sync' });
      await api.post(`/profiles/${selectedProfile.id}/sync`);
      toast.success('Profile state synced', { id: 'sync' });
      await fetchProfileState(selectedProfile.id);
      await fetchBulkOperations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Sync action failed', { id: 'sync' });
    }
  };

  const pullProfile = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Pulling profile from cloud...', { id: 'pull' });
      await api.post(`/profiles/${selectedProfile.id}/pull`);
      toast.success('Profile pulled from cloud', { id: 'pull' });
      await fetchProfileState(selectedProfile.id);
      await fetchBulkOperations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Pull action failed', { id: 'pull' });
    }
  };

  const releaseRuntimeLease = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Releasing runtime lease...', { id: 'lease-release' });
      await api.post(`/profiles/${selectedProfile.id}/runtime/release`, {
        reason: 'operator-release',
      });
      toast.success('Runtime lease released', { id: 'lease-release' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lease release failed', { id: 'lease-release' });
    }
  };

  const takeoverRuntimeLease = async () => {
    if (!selectedProfile) return;
    try {
      toast.loading('Taking over runtime lease...', { id: 'lease-takeover' });
      await api.post(`/profiles/${selectedProfile.id}/runtime/takeover`, {
        reason: 'operator-takeover',
      });
      toast.success('Runtime lease transferred', { id: 'lease-takeover' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lease takeover failed', { id: 'lease-takeover' });
    }
  };

  const inspectSnapshot = async (snapshotId: string, target: 'live' | 'cloud' = 'live') => {
    if (!selectedProfile) return;
    setLoadingDiff(true);
    try {
      const { data } = await api.get(`/profiles/${selectedProfile.id}/snapshots/${snapshotId}/diff`, {
        params: { target },
      });
      setSnapshotDiff(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Snapshot diff failed');
    } finally {
      setLoadingDiff(false);
    }
  };

  const grantProfileAccess = async () => {
    if (!selectedProfile || !shareTargetUserId) {
      toast.error('Select a teammate first');
      return;
    }
    try {
      toast.loading('Granting access...', { id: 'profile-share' });
      await api.post(`/profiles/${selectedProfile.id}/share`, {
        targetUserId: shareTargetUserId,
        permission: sharePermission,
      });
      toast.success('Profile access updated', { id: 'profile-share' });
      setShareTargetUserId('');
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to grant access', { id: 'profile-share' });
    }
  };

  const revokeProfileAccess = async (targetUserId: string) => {
    if (!selectedProfile) return;
    try {
      toast.loading('Revoking access...', { id: 'profile-revoke' });
      await api.delete(`/profiles/${selectedProfile.id}/share/${targetUserId}`);
      toast.success('Profile access revoked', { id: 'profile-revoke' });
      await fetchProfileState(selectedProfile.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to revoke access', { id: 'profile-revoke' });
    }
  };

  const runBulkStateAction = async (operation: 'snapshot' | 'sync' | 'pull') => {
    if (selectedProfileIds.length === 0) {
      toast.error('Select at least one profile');
      return;
    }
    try {
      toast.loading(`Running bulk ${operation}...`, { id: `bulk-${operation}` });
      const { data } = await api.post('/bulk/profiles/state', {
        profileIds: selectedProfileIds,
        operation,
      });
      toast.success(`${operation} completed: ${data.completed}/${data.total}`, { id: `bulk-${operation}` });
      if (selectedProfile?.id && selectedProfileIds.includes(selectedProfile.id)) {
        await fetchProfileState(selectedProfile.id);
      }
      await fetchBulkOperations();
      await fetchProfiles(page, search);
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Bulk ${operation} failed`, { id: `bulk-${operation}` });
    }
  };

  const runBulkAccessAction = async (action: 'grant' | 'revoke') => {
    if (selectedProfileIds.length === 0) {
      toast.error('Select at least one profile');
      return;
    }
    if (!bulkTargetUserId) {
      toast.error('Select a teammate first');
      return;
    }
    try {
      toast.loading(`Running bulk ${action}...`, { id: `bulk-${action}` });
      await api.post('/bulk/profiles/access', {
        profileIds: selectedProfileIds,
        targetUserId: bulkTargetUserId,
        permission: action === 'grant' ? bulkPermission : undefined,
        action,
      });
      toast.success(`Bulk ${action} completed`, { id: `bulk-${action}` });
      if (selectedProfile?.id && selectedProfileIds.includes(selectedProfile.id)) {
        await fetchProfileState(selectedProfile.id);
      }
      await fetchBulkOperations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Bulk ${action} failed`, { id: `bulk-${action}` });
    }
  };

  const retryFailedBulkOperation = async (operationId: string) => {
    try {
      toast.loading('Retrying failed profiles...', { id: `bulk-retry-${operationId}` });
      const { data } = await api.post(`/bulk/operations/${operationId}/retry-failed`);
      toast.success(`Retry completed: ${data.completed}/${data.total}`, { id: `bulk-retry-${operationId}` });
      await fetchBulkOperations();
      if (selectedProfile?.id) {
        await fetchProfileState(selectedProfile.id);
      }
      await fetchProfiles(page, search);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Retry failed', { id: `bulk-retry-${operationId}` });
    }
  };

  const retryFailedProfileOperation = async (operationId: string, profileId: string) => {
    try {
      toast.loading('Retrying this profile...', { id: `profile-retry-${operationId}-${profileId}` });
      const { data } = await api.post(`/bulk/operations/${operationId}/retry-profile/${profileId}`);
      toast.success(`Retry completed: ${data.completed}/${data.total}`, { id: `profile-retry-${operationId}-${profileId}` });
      await fetchBulkOperations();
      if (selectedProfile?.id === profileId) {
        await fetchProfileState(profileId);
      }
      await fetchProfiles(page, search);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Profile retry failed', { id: `profile-retry-${operationId}-${profileId}` });
    }
  };

  const syncTone = (() => {
    const status = profileState?.diff?.status;
    if (status === 'in_sync') return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
    if (status === 'local_ahead' || status === 'cloud_ahead' || status === 'diverged') return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
    return 'text-slate-400 border-white/10 bg-white/5';
  })();
  const riskyProfiles = profiles.filter((profile) => Number(profile.validationScore || 0) < 65).length;
  const profilesWithoutProxy = profiles.filter((profile) => !profile.proxyId && !profile.proxyPoolId && !profile.hasProxy).length;
  const selectedGuidance: string[] = [];
  if (profileState?.runtimeLease?.locked) selectedGuidance.push('This profile is locked. Release or take over the lease before making runtime-sensitive changes.');
  if ((profileState?.diff?.status || '') !== 'in_sync') selectedGuidance.push('Live and cloud state differ. Inspect the diff before assuming this profile can be reused elsewhere.');
  if ((profileState?.sessionSnapshot?.platformCompatibility?.score || 0) < 70) selectedGuidance.push('Host compatibility is weak for this target profile. Expect instability until platform expectations are aligned.');
  if ((profileState?.sessionSnapshot?.sessionPersistence?.cookies?.count || 0) === 0) selectedGuidance.push('No cookies were captured in the last snapshot. If this profile should persist a login, reopen it and save state again.');
  if ((profileState?.sessionSnapshot?.sandboxRuntime?.enabled ?? false) === false) selectedGuidance.push('Sandbox runtime emulation is disabled. That is fine for external browsing, but enable it for internal local sandbox work if needed.');
  if (selectedGuidance.length === 0 && selectedProfile) selectedGuidance.push('This profile looks healthy. Snapshot it now if you want a clean rollback point before larger edits.');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Browser Profiles</h1>
          <p className="text-slate-400">Manage isolated browser environments, snapshots, and sync state.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Create Profile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Healthy Profiles</p>
          <p className="text-2xl font-black text-emerald-400 mt-2">{Math.max(pagination.total - riskyProfiles, 0)}</p>
          <p className="text-[11px] text-slate-500 mt-2">Profiles currently above the main risk threshold.</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Risky Profiles</p>
          <p className="text-2xl font-black text-amber-400 mt-2">{riskyProfiles}</p>
          <p className="text-[11px] text-slate-500 mt-2">Profiles under score 65. Start your cleanup here.</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">No Proxy Binding</p>
          <p className="text-2xl font-black text-cyan-400 mt-2">{profilesWithoutProxy}</p>
          <p className="text-[11px] text-slate-500 mt-2">Profiles without a direct proxy or pool binding.</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Selection</p>
          <p className="text-2xl font-black text-white mt-2">{selectedProfileIds.length}</p>
          <p className="text-[11px] text-slate-500 mt-2">Use bulk actions only when the selected profiles share the same intent.</p>
        </div>
      </div>

      <div className="card flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div className="flex-1">
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Search Profiles</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, platform, locale..."
            className="input-field"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 min-w-[280px]">
          <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profiles</p>
            <p className="text-xl font-black text-white mt-1">{pagination.total}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Page</p>
            <p className="text-xl font-black text-white mt-1">{page}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pages</p>
            <p className="text-xl font-black text-white mt-1">{pagination.totalPages}</p>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bulk Operations</p>
            <p className="text-sm text-slate-400 mt-1">
              {selectedProfileIds.length} profiles selected
            </p>
          </div>
          <button onClick={toggleSelectAllVisible} className="btn-secondary text-xs">
            {profiles.length > 0 && profiles.every((profile) => selectedProfileIds.includes(profile.id)) ? 'Clear Visible Selection' : 'Select Visible Profiles'}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3">
          <select
            value={bulkTargetUserId}
            onChange={(e) => setBulkTargetUserId(e.target.value)}
            className="input-field"
          >
            <option value="">Select teammate for bulk grant/revoke</option>
            {teamUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email} · {user.role}
              </option>
            ))}
          </select>
          <select
            value={bulkPermission}
            onChange={(e) => setBulkPermission(e.target.value)}
            className="input-field min-w-[120px]"
          >
            <option value="READ">READ</option>
            <option value="WRITE">WRITE</option>
            <option value="EXECUTE">EXECUTE</option>
          </select>
          <button onClick={() => runBulkAccessAction('grant')} className="btn-primary text-xs">Bulk Grant</button>
          <button onClick={() => runBulkAccessAction('revoke')} className="btn-secondary text-xs">Bulk Revoke</button>
          <button onClick={() => runBulkStateAction('snapshot')} className="btn-secondary text-xs">Bulk Snapshot</button>
          <button onClick={() => runBulkStateAction('sync')} className="btn-secondary text-xs">Bulk Push Sync</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runBulkStateAction('pull')} className="btn-secondary text-xs">Bulk Pull Cloud</button>
          <button onClick={fetchBulkOperations} className="btn-secondary text-xs">Refresh Operations</button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Profile Operations</p>
            <p className="text-sm text-slate-400 mt-1">Persistent history for bulk profile actions, lock conflicts and failed-only retries.</p>
          </div>
        </div>
        <div className="space-y-3">
          {bulkOperations.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-dark-900/70 p-4 text-sm text-slate-500">
              No tracked profile operations yet.
            </div>
          ) : (
            bulkOperations.map((operation) => (
              <div key={operation.id} className="rounded-xl border border-white/5 bg-dark-900/70 p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {operation.request?.kind === 'profile_state' ? 'Profile State' : 'Profile Access'} · {operation.request?.operation || operation.type}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {new Date(operation.createdAt).toLocaleString()} · {operation.completed}/{operation.totalTasks} completed · {operation.failed} failed
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${
                      operation.status === 'completed'
                        ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                        : operation.status === 'completed_with_errors'
                          ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                          : 'text-red-400 border-red-500/20 bg-red-500/10'
                    }`}>
                      {operation.status}
                    </span>
                    {(operation.retriableProfileIds?.length || 0) > 0 && (
                      <button
                        onClick={() => retryFailedBulkOperation(operation.id)}
                        className="btn-secondary text-xs"
                      >
                        Retry Failed ({operation.retriableProfileIds?.length})
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg bg-dark-950 border border-white/5 p-3">
                    <p className="text-slate-500 uppercase tracking-widest font-black">Success Rate</p>
                    <p className="text-white font-bold mt-1">{operation.summary?.successRate ?? 0}%</p>
                  </div>
                  <div className="rounded-lg bg-dark-950 border border-white/5 p-3">
                    <p className="text-slate-500 uppercase tracking-widest font-black">Targets</p>
                    <p className="text-white font-bold mt-1">{operation.request?.profileIds?.length || operation.totalTasks}</p>
                  </div>
                  <div className="rounded-lg bg-dark-950 border border-white/5 p-3">
                    <p className="text-slate-500 uppercase tracking-widest font-black">Updated</p>
                    <p className="text-white font-bold mt-1">{new Date(operation.updatedAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="rounded-lg bg-dark-950 border border-white/5 p-3">
                    <p className="text-slate-500 uppercase tracking-widest font-black">Operation Id</p>
                    <p className="text-brand-400 font-mono mt-1 truncate">{operation.id.slice(0, 12)}</p>
                  </div>
                </div>
                {(operation.failedResults?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Failed Profiles</p>
                    <div className="space-y-2">
                      {operation.failedResults?.map((result) => (
                        <div key={`${operation.id}-${result.profileId}`} className="rounded-lg bg-red-500/5 border border-red-500/10 p-3 flex items-center justify-between gap-3">
                          <span className="text-sm text-white font-mono">{result.profileId.slice(0, 12)}</span>
                          <span className="text-xs text-red-300">{result.error || 'unknown_error'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {operation.fatalError && (
                  <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3 text-sm text-red-300">
                    {operation.fatalError}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading profiles...</div>
      ) : profiles.length === 0 ? (
        <div className="card text-center py-12">
          <Globe className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white">No profiles yet</h3>
          <p className="text-slate-400 mt-2">Create your first browser profile to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {profiles.map(profile => (
                <div key={profile.id} className="card hover:border-brand-500/50 transition-all duration-300 group relative overflow-hidden">
                  <label className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                    <input
                      type="checkbox"
                      checked={selectedProfileIds.includes(profile.id)}
                      onChange={() => toggleProfileSelection(profile.id)}
                    />
                    Select
                  </label>
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    {profile.platform === 'VISION_PRO' || profile.platform === 'OCULUS' ? <Glasses className="w-12 h-12" /> : profile.platform === 'MOBILE' ? <Smartphone className="w-12 h-12" /> : <Monitor className="w-12 h-12" />}
                  </div>
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="flex flex-col">
                      <h3 className="text-lg font-bold text-white truncate pr-4">{profile.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">
                          {profile.platform || 'DESKTOP'}
                        </span>
                        {profile.fingerprint?.presetVersion && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400">
                            {profile.fingerprint.presetVersion}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(profile.id)} className="text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-2 text-sm text-slate-400 relative z-10">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4" />
                      <span>{profile.fingerprint ? `Validated ${profile.fingerprint?.validation?.score || 0}/100` : 'Pending'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>{profile.proxyConfig ? 'Proxy Configured' : 'Direct Connection'}</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-dark-700 flex flex-wrap gap-2 relative z-10">
                    <Link
                      to={`/accounts?profileId=${profile.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-dark-700 text-slate-300 text-xs font-semibold hover:bg-dark-600 hover:text-white transition-all"
                    >
                      <UserPlus className="h-3 w-3" /> Add Account
                    </Link>
                    <Link
                      to={`/automation?profileId=${profile.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-brand-500/10 text-brand-400 text-xs font-semibold hover:bg-brand-500 hover:text-white transition-all"
                    >
                      <ZapIcon className="h-3 w-3" /> Automate
                    </Link>
                    <button
                      onClick={() => openStatePanel(profile)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 text-slate-300 text-xs font-semibold hover:bg-white/10 hover:text-white transition-all"
                    >
                      <Database className="h-4 w-4" /> State & Snapshots
                    </button>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => handleLaunch(profile.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand-500/20"
                      >
                        <ExternalLink className="h-4 w-4" /> Launch
                      </button>
                      <button
                        onClick={() => handleSmartLaunch(profile.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 text-xs font-bold uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all"
                      >
                        <ZapIcon className="h-4 w-4" /> Smart Launch
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between items-center text-[10px] text-slate-500 relative z-10">
                    <span>Created {new Date(profile.createdAt).toLocaleDateString()}</span>
                    <span>ID: {profile.id.slice(0, 8)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="card mt-6 flex items-center justify-between">
              <button
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  fetchProfiles(nextPage, search);
                }}
                disabled={page <= 1}
                className="btn-secondary disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-sm text-slate-400">Page {page} of {pagination.totalPages}</p>
              <button
                onClick={() => {
                  const nextPage = Math.min(pagination.totalPages, page + 1);
                  setPage(nextPage);
                  fetchProfiles(nextPage, search);
                }}
                disabled={page >= pagination.totalPages}
                className="btn-secondary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="card h-fit sticky top-6">
            {!selectedProfile ? (
              <div className="text-center py-16">
                <Database className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-white font-bold">Profile State Panel</h3>
                <p className="text-slate-500 text-sm mt-2">Select a profile to inspect sync manifests and snapshots.</p>
              </div>
            ) : loadingState ? (
              <div className="text-slate-400">Loading state...</div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedProfile.name}</h3>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">{selectedProfile.id}</p>
                  </div>
                  <button onClick={() => setSelectedProfile(null)} className="text-slate-500 hover:text-white">Close</button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Local Version</p>
                    <p className="text-xl font-black text-white mt-1">{profileState?.localManifest?.version || 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cloud Version</p>
                    <p className="text-xl font-black text-white mt-1">{profileState?.cloudManifest?.version || 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Checksum</p>
                    <p className="text-xs font-mono text-brand-400 mt-1 truncate">{profileState?.localManifest?.checksum || 'n/a'}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Files</p>
                    <p className="text-xl font-black text-white mt-1">{profileState?.localManifest?.fileCount || 0}</p>
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${
                  profileOperations?.summary?.hasBlockingConflict
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Operational State</p>
                      <p className="text-sm font-bold mt-1">
                        {profileOperations?.summary?.hasBlockingConflict ? 'Attention Needed' : 'Operationally Healthy'}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p>Active Ops: {profileOperations?.summary?.activeOperations || 0}</p>
                      <p>Retryable: {profileOperations?.summary?.retryableOperations || 0}</p>
                      <p>Conflicts: {profileOperations?.summary?.conflictCount || 0}</p>
                    </div>
                  </div>
                  {profileOperations?.summary?.lastFailure && (
                    <p className="text-[11px] mt-3 opacity-80">
                      Last failure: {profileOperations.summary.lastFailure.request?.operation || profileOperations.summary.lastFailure.type}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Runtime Lock</p>
                    <p className={`text-sm font-black mt-1 ${profileState?.runtimeLease?.locked ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {profileState?.runtimeLease?.locked ? 'Locked' : 'Available'}
                    </p>
                    {profileState?.runtimeLease?.owner && (
                      <p className="text-[11px] text-slate-500 mt-1">{profileState.runtimeLease.owner}</p>
                    )}
                    {profileState?.runtimeLease?.expiresAt && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Expires {new Date(profileState.runtimeLease.expiresAt).toLocaleString()}
                      </p>
                    )}
                    {profileState?.runtimeLease?.locked && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={releaseRuntimeLease} className="px-3 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                          Force Release
                        </button>
                        <button onClick={takeoverRuntimeLease} className="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all">
                          Take Over
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Last Session Snapshot</p>
                    <p className="text-sm font-black text-white mt-1">
                      {profileState?.sessionSnapshot?.updatedAt ? new Date(profileState.sessionSnapshot.updatedAt).toLocaleString() : 'n/a'}
                    </p>
                    {profileState?.sessionSnapshot?.sessionPersistence?.cookies?.count !== undefined && (
                      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                        <p>Cookies {profileState.sessionSnapshot.sessionPersistence.cookies.count}</p>
                        <p>LocalStorage origins {profileState.sessionSnapshot.sessionPersistence.localStorage?.origins || 0}</p>
                        <p>
                          IndexedDB {profileState.sessionSnapshot.sessionPersistence.persistentStores?.indexedDbFiles || 0} ·
                          SW {profileState.sessionSnapshot.sessionPersistence.persistentStores?.serviceWorkerFiles || 0} ·
                          Cache {profileState.sessionSnapshot.sessionPersistence.persistentStores?.cacheStorageFiles || 0}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Host Compatibility</p>
                    <p className={`text-sm font-black mt-1 ${profileState?.sessionSnapshot?.platformCompatibility?.status === 'strong' ? 'text-emerald-400' : profileState?.sessionSnapshot?.platformCompatibility?.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                      Score {profileState?.sessionSnapshot?.platformCompatibility?.score ?? 'n/a'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Host {profileState?.sessionSnapshot?.platformCompatibility?.host?.os || '-'} / {profileState?.sessionSnapshot?.platformCompatibility?.host?.arch || '-'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Target {profileState?.sessionSnapshot?.platformCompatibility?.target?.os || '-'} / {profileState?.sessionSnapshot?.platformCompatibility?.target?.arch || '-'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sandbox Runtime Emulation</p>
                    <p className="text-sm font-black text-white mt-1">
                      {profileState?.sessionSnapshot?.sandboxRuntime?.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Hosts {(profileState?.sessionSnapshot?.sandboxRuntime?.allowedHosts || []).slice(0, 3).join(', ') || 'none'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Canvas {profileState?.sessionSnapshot?.sandboxRuntime?.dynamicCanvasEvolution ? 'on' : 'off'} ·
                      WebRTC {profileState?.sessionSnapshot?.sandboxRuntime?.emulateWebRTC ? 'on' : 'off'} ·
                      Battery {profileState?.sessionSnapshot?.sandboxRuntime?.emulateBattery ? 'on' : 'off'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Guided Health Summary</p>
                      <p className="text-sm font-bold text-white mt-2">
                        {selectedProfile.name} is currently {(profileState?.diff?.status || 'unknown').replaceAll('_', ' ')} and {profileState?.runtimeLease?.locked ? 'has an active runtime lock.' : 'is available for direct maintenance.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-[320px]">
                      <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Lease</p>
                        <p className={`text-sm font-black mt-2 ${profileState?.runtimeLease?.locked ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {profileState?.runtimeLease?.locked ? 'Locked' : 'Free'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sync</p>
                        <p className={`text-sm font-black mt-2 ${profileState?.diff?.status === 'in_sync' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {(profileState?.diff?.status || 'unknown').replaceAll('_', ' ')}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cookies</p>
                        <p className="text-sm font-black text-white mt-2">{profileState?.sessionSnapshot?.sessionPersistence?.cookies?.count || 0}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Compatibility</p>
                        <p className={`text-sm font-black mt-2 ${(profileState?.sessionSnapshot?.platformCompatibility?.score || 0) >= 80 ? 'text-emerald-400' : (profileState?.sessionSnapshot?.platformCompatibility?.score || 0) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                          {profileState?.sessionSnapshot?.platformCompatibility?.score ?? 'n/a'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {selectedGuidance.map((item, index) => (
                      <p key={`selected-guidance-${index}`} className="text-sm text-slate-300">
                        {index + 1}. {item}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-dark-900/70 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Access Control</p>
                      <p className="text-sm font-bold text-white mt-1">
                        Effective: {(profileAccess?.effectivePermissions || []).join(', ') || 'none'}
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                      {profileAccess?.grants?.length || 0} grants
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                    <select
                      value={shareTargetUserId}
                      onChange={(e) => setShareTargetUserId(e.target.value)}
                      className="input-field"
                    >
                      <option value="">Select teammate</option>
                      {teamUsers
                        .filter((user) => user.id !== selectedProfile.userId)
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.email} · {user.role}
                          </option>
                        ))}
                    </select>
                    <select
                      value={sharePermission}
                      onChange={(e) => setSharePermission(e.target.value)}
                      className="input-field min-w-[110px]"
                    >
                      <option value="READ">READ</option>
                      <option value="WRITE">WRITE</option>
                      <option value="EXECUTE">EXECUTE</option>
                    </select>
                    <button onClick={grantProfileAccess} className="btn-primary text-xs px-4">
                      Share
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {(profileAccess?.grants || []).length === 0 ? (
                      <div className="text-sm text-slate-500">No explicit profile grants yet.</div>
                    ) : (
                      profileAccess?.grants?.map((grant) => (
                        <div key={grant.id} className="rounded-xl border border-white/5 bg-dark-950 p-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-white">{grant.user?.email || grant.user?.id}</p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {grant.permission} · {grant.user?.role || 'member'}
                            </p>
                          </div>
                          <button
                            onClick={() => revokeProfileAccess(grant.user?.id)}
                            className="px-3 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                          >
                            Revoke
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className={`rounded-xl border p-3 ${syncTone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest">Sync Status</p>
                      <p className="text-sm font-bold mt-1">{profileState?.diff?.status || 'unknown'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Version Delta</p>
                      <p className="text-sm font-bold mt-1">{profileState?.diff?.versionDelta ?? 0}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                    <div>
                      <p className="opacity-70">Changed</p>
                      <p className="font-bold mt-1">{profileState?.diff?.changedCount || 0}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Local Only</p>
                      <p className="font-bold mt-1">{profileState?.diff?.localOnlyCount || 0}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Cloud Only</p>
                      <p className="font-bold mt-1">{profileState?.diff?.cloudOnlyCount || 0}</p>
                    </div>
                  </div>
                  {((profileState?.diff?.sampleChanged?.length || 0) > 0 || (profileState?.diff?.sampleLocalOnly?.length || 0) > 0 || (profileState?.diff?.sampleCloudOnly?.length || 0) > 0) && (
                    <div className="mt-3 space-y-2 text-[11px]">
                      {(profileState?.diff?.sampleChanged || []).length > 0 && (
                        <div>
                          <p className="font-black uppercase tracking-widest opacity-70">Changed Samples</p>
                          <p className="font-mono mt-1 break-all">{profileState?.diff?.sampleChanged?.join(', ')}</p>
                        </div>
                      )}
                      {(profileState?.diff?.sampleLocalOnly || []).length > 0 && (
                        <div>
                          <p className="font-black uppercase tracking-widest opacity-70">Local Only Samples</p>
                          <p className="font-mono mt-1 break-all">{profileState?.diff?.sampleLocalOnly?.join(', ')}</p>
                        </div>
                      )}
                      {(profileState?.diff?.sampleCloudOnly || []).length > 0 && (
                        <div>
                          <p className="font-black uppercase tracking-widest opacity-70">Cloud Only Samples</p>
                          <p className="font-mono mt-1 break-all">{profileState?.diff?.sampleCloudOnly?.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Profile Doctor</p>
                    <p className="text-2xl font-black text-white mt-2">{profileDoctor?.healthScore ?? '--'}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{profileDoctor?.status || 'unknown'}</p>
                    <p className="text-[11px] text-slate-500 mt-2">{profileDoctor?.recommendations?.[0] || 'No recommendation yet.'}</p>
                  </div>
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">Zero-Knowledge V2</p>
                    <p className="text-sm font-bold text-white mt-2">{profileState?.encryption?.version || 'pending'}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{profileState?.encryption?.algorithm || 'n/a'}</p>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Recovery {profileState?.encryption?.adminRecovery?.enabled ? 'enabled' : 'disabled'} · legal hold {profileState?.encryption?.adminRecovery?.legalHoldReady ? 'ready' : 'off'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Consistency</p>
                    <p className="text-sm font-bold text-white mt-2">{profileState?.consistency?.status || 'inactive'}</p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Drifts {profileState?.consistency?.driftCount || 0} · endpoint {profileState?.consistency?.endpointId || 'n/a'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Sticky until {profileState?.consistency?.stickyUntil ? new Date(profileState.consistency.stickyUntil).toLocaleString() : 'not pinned yet'}
                    </p>
                  </div>
                </div>

                {profileDoctor && (
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Clone Safety</h4>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        FP {profileDoctor.overlap.sharedFingerprintCount} · Proxy {profileDoctor.overlap.sharedProxyCount}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-[11px]">
                      <p className="text-slate-400">{profileDoctor.recommendations?.[0]}</p>
                      {(profileDoctor.overlap.sampleProfiles || []).length > 0 && (
                        <p className="text-slate-500">
                          Related profiles: {profileDoctor.overlap.sampleProfiles.map((item) => item.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Profile Reputation</p>
                    <p className="text-2xl font-black text-white mt-2">{profileReputation?.reputationScore ?? '--'}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{profileReputation?.tier || 'unknown'}</p>
                    <p className="text-[11px] text-slate-500 mt-2">{profileReputation?.notes?.[0] || 'No reputation guidance yet.'}</p>
                  </div>
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Predictive Warmup</p>
                    <p className="text-sm font-bold text-white mt-2">{profileWarmup?.mode || 'unknown'}</p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Idle {profileWarmup?.idleHours ?? '--'}h · {profileWarmup?.riskBand || 'unknown'} risk
                    </p>
                    <p className="text-[11px] text-slate-500 mt-2">{profileWarmup?.nextWindow || 'No warmup window yet.'}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Duration {profileWarmup?.estimatedDurationMinutes ?? '--'} min · projected readiness {profileWarmup?.readinessAfterWarmup ?? '--'}
                    </p>
                    {profileWarmup?.autoQueueEligible && (
                      <p className="text-[11px] text-indigo-300 mt-2">Good nightly auto-queue candidate.</p>
                    )}
                  </div>
                  <div className={`rounded-xl border p-3 ${profileQuarantine?.active ? 'border-red-500/20 bg-red-500/5' : 'border-white/5 bg-dark-900/70'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${profileQuarantine?.active ? 'text-red-400' : 'text-slate-500'}`}>Quarantine</p>
                    <p className="text-sm font-bold text-white mt-2">{profileQuarantine?.active ? 'active' : 'clear'}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{profileQuarantine?.reason || 'No active quarantine.'}</p>
                    <p className="text-[11px] text-slate-500 mt-2">{profileQuarantine?.createdAt ? new Date(profileQuarantine.createdAt).toLocaleString() : 'No quarantine history yet.'}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Doctor AI</h4>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {profileDoctorAi?.source || 'heuristic'} · {profileDoctorAi?.severity || 'low'}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white mt-3">{profileDoctorAi?.summary || 'No AI summary yet.'}</p>
                  <p className="text-[11px] text-slate-400 mt-2">{profileDoctorAi?.rootCause || 'No root cause yet.'}</p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Confidence {typeof profileDoctorAi?.confidence === 'number' ? `${Math.round(profileDoctorAi.confidence * 100)}%` : '--'} · launch {profileDoctorAi?.launchRecommendation || 'unknown'} · warmup {profileDoctorAi?.warmupRecommendation || 'unknown'}
                  </p>
                  <div className="mt-3 space-y-1">
                    {(profileDoctorAi?.nextActions || []).slice(0, 3).map((item, index) => (
                      <p key={`doctor-ai-action-${index}`} className="text-[11px] text-slate-500">{index + 1}. {item}</p>
                    ))}
                  </div>
                  {profileDoctorAi?.safeAutofixPlan?.rationale?.length ? (
                    <div className="mt-3 rounded-xl border border-white/5 bg-dark-950 p-3 space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Safe Autofix · {profileDoctorAi.safeAutofixPlan.primaryAction}
                      </p>
                      {profileDoctorAi.safeAutofixPlan.rationale.slice(0, 2).map((item, index) => (
                        <p key={`doctor-ai-rationale-${index}`} className="text-[11px] text-slate-400">{item}</p>
                      ))}
                    </div>
                  ) : null}
                  {(profileDoctorAi?.signals || []).filter((item) => item.active).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profileDoctorAi?.signals?.filter((item) => item.active).slice(0, 4).map((item) => (
                        <span key={item.code} className="px-2 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 text-[10px] font-black uppercase tracking-widest text-amber-300">
                          {item.code.replace(/_/g, ' ')} · {item.weight}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Decouple Assistant</h4>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{profileDecouplePlan?.requiresApproval ? 'approval recommended' : 'ready'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">{profileDecouplePlan?.routingAdvice || 'No decouple guidance yet.'}</p>
                  {profileDecouplePlan?.fingerprintPatch && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      Canvas {profileDecouplePlan.fingerprintPatch.canvasSeed || 'n/a'} · HW {profileDecouplePlan.fingerprintPatch.hardwareConcurrency || 'n/a'}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={applyDecouplePlan} className="btn-secondary flex items-center gap-2 text-xs">
                      <RefreshCw className="h-4 w-4" /> Apply Decouple
                    </button>
                    {profileQuarantine?.active ? (
                      <button onClick={releaseProfileQuarantine} className="btn-secondary flex items-center gap-2 text-xs">
                        <ShieldCheck className="h-4 w-4" /> Release Quarantine
                      </button>
                    ) : (
                      <button onClick={quarantineProfile} className="btn-secondary flex items-center gap-2 text-xs">
                        <Trash2 className="h-4 w-4" /> Quarantine
                      </button>
                    )}
                  </div>
                </div>

                {profileWarmup?.steps?.length ? (
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Warmup Sequence</h4>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {profileWarmup.steps.length} steps
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {profileWarmup.steps.slice(0, 5).map((step) => (
                        <div key={`${step.kind}-${step.order}`} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-white">{step.order}. {step.label}</p>
                              <p className="text-[11px] text-slate-500 mt-1">{step.kind}</p>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{step.durationMinutes}m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(profileWarmup.blockers || []).length > 0 && (
                      <div className="mt-3 space-y-1">
                        {(profileWarmup.blockers || []).slice(0, 2).map((item, index) => (
                          <p key={`warmup-blocker-${index}`} className="text-[11px] text-amber-300">{item}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Nightly Warmup Queue</h4>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {profileWarmupQueue?.summary?.queued || 0} queued · {profileWarmupQueue?.summary?.pendingApproval || 0} pending
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">
                    {profileWarmupQueue?.settings?.approvalsRequired ? 'Approvals are required before nighttime execution.' : 'Approved warmups can execute automatically in the nightly window.'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Learning: {profileWarmupQueue?.learning?.completed || 0} completed · avg delta {profileWarmupQueue?.learning?.averageDelta || 0} · recommended mode {profileWarmupQueue?.learning?.recommendedMode || 'balanced'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={queueWarmupPlan} className="btn-secondary flex items-center gap-2 text-xs">
                      <History className="h-4 w-4" /> Queue Nightly Warmup
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(profileWarmupQueue?.items || [])
                      .filter((item) => item.profileId === selectedProfile?.id)
                      .slice(0, 3)
                      .map((item) => (
                        <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-white">{item.mode} · {item.status}</p>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {item.estimatedDurationMinutes} min · projected readiness {item.readinessAfterWarmup}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-1">
                                Feedback {item.feedback?.outcome || 'unknown'} · delta {item.feedback?.deltaScore || 0}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2">
                              {item.status === 'pending_approval' && (
                                <button onClick={() => approveWarmupEntry(item.id)} className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all">
                                  Approve
                                </button>
                              )}
                              {item.status === 'completed' && item.feedback?.outcome === 'unknown' && (
                                <button onClick={() => recordWarmupFeedback(item.id, 'improved', 6)} className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all">
                                  Mark Improved
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    {(profileWarmupQueue?.items || []).filter((item) => item.profileId === selectedProfile?.id).length === 0 && (
                      <p className="text-[11px] text-slate-500">This profile is not in the nightly warmup queue yet.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={createSnapshot} className="btn-primary flex items-center gap-2 text-xs">
                    <History className="h-4 w-4" /> Snapshot
                  </button>
                  <button onClick={syncProfile} className="btn-secondary flex items-center gap-2 text-xs">
                    <RefreshCw className="h-4 w-4" /> Push Sync
                  </button>
                  <button onClick={pullProfile} className="btn-secondary flex items-center gap-2 text-xs">
                    <RefreshCw className="h-4 w-4" /> Pull Cloud
                  </button>
                </div>

                {snapshotDiff && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Snapshot Diff</p>
                        <p className="text-sm font-bold text-white mt-1">{snapshotDiff.snapshotId} vs {snapshotDiff.target}</p>
                      </div>
                      <button onClick={() => setSnapshotDiff(null)} className="text-slate-500 hover:text-white text-xs">Close</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                      <div>
                        <p className="text-slate-400">Status</p>
                        <p className="text-white font-bold mt-1">{snapshotDiff.diff.status}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Changed</p>
                        <p className="text-white font-bold mt-1">{snapshotDiff.diff.changedCount}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Checksum Match</p>
                        <p className="text-white font-bold mt-1">{snapshotDiff.diff.checksumMatch ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-[11px]">
                      {(snapshotDiff.diff.sampleChanged || []).length > 0 && (
                        <div>
                          <p className="font-black uppercase tracking-widest text-slate-400">Changed Samples</p>
                          <p className="font-mono mt-1 break-all text-cyan-300">{snapshotDiff.diff.sampleChanged.join(', ')}</p>
                        </div>
                      )}
                      {(snapshotDiff.diff.sampleLocalOnly || []).length > 0 && (
                        <div>
                          <p className="font-black uppercase tracking-widest text-slate-400">Snapshot Only</p>
                          <p className="font-mono mt-1 break-all text-cyan-300">{snapshotDiff.diff.sampleLocalOnly.join(', ')}</p>
                        </div>
                      )}
                      {(snapshotDiff.diff.sampleCloudOnly || []).length > 0 && (
                        <div>
                          <p className="font-black uppercase tracking-widest text-slate-400">Target Only</p>
                          <p className="font-mono mt-1 break-all text-cyan-300">{snapshotDiff.diff.sampleCloudOnly.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Profile Timeline</h4>
                  <div className="rounded-xl border border-white/5 bg-dark-900/70 p-3 space-y-3">
                    {(profileTimeline?.heatmap || []).length > 0 && (
                      <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                        {profileTimeline?.heatmap?.slice(0, 24).map((cell) => (
                          <div key={`${cell.day}-${cell.hour}`} className="rounded-lg border border-white/5 bg-dark-950 p-2">
                            <p className="text-[10px] text-slate-500">D{cell.day} H{cell.hour}</p>
                            <p className="text-sm font-bold text-white mt-1">{cell.count}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {(profileTimeline?.items || []).length === 0 ? (
                        <div className="text-sm text-slate-500">No timeline items yet.</div>
                      ) : (
                        profileTimeline?.items?.slice(0, 10).map((item) => (
                          <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-white">{item.title}</p>
                                <p className="text-[11px] text-slate-500 mt-1">{new Date(item.at).toLocaleString()}</p>
                                <p className="text-[11px] text-slate-400 mt-2 break-all">{item.detail}</p>
                              </div>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${
                                item.severity === 'critical' ? 'text-red-400' : item.severity === 'warning' ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                {item.severity}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Recent Snapshots</h4>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {(profileState?.snapshots || []).length === 0 ? (
                      <div className="text-sm text-slate-500">No snapshots yet.</div>
                    ) : (
                      profileState?.snapshots?.map((snapshot: any) => (
                        <div key={snapshot.snapshotId} className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-white">{snapshot.trigger}</p>
                              <p className="text-[11px] text-slate-500 mt-1">{new Date(snapshot.createdAt).toLocaleString()}</p>
                              <p className="text-[10px] font-mono text-brand-400 mt-2">{snapshot.checksum?.slice(0, 16)}...</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => inspectSnapshot(snapshot.snapshotId, 'live')}
                                disabled={loadingDiff}
                                className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all disabled:opacity-40"
                              >
                                Inspect
                              </button>
                              <button
                                onClick={() => restoreSnapshot(snapshot.snapshotId)}
                                className="px-3 py-1 rounded-lg bg-brand-500/10 text-brand-400 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all"
                              >
                                Restore
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Profile Operations</h4>
                    <button onClick={() => selectedProfile && fetchProfileState(selectedProfile.id)} className="text-[10px] text-slate-400 hover:text-white uppercase tracking-widest">
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {(profileOperations?.operations || []).length === 0 ? (
                      <div className="text-sm text-slate-500">No operations recorded for this profile yet.</div>
                    ) : (
                      profileOperations?.operations?.map((operation) => (
                        <div key={operation.id} className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-white">
                                {operation.request?.kind === 'profile_state' ? 'State' : 'Access'} · {operation.request?.operation || operation.type}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {new Date(operation.createdAt).toLocaleString()} · {operation.completed}/{operation.totalTasks} completed
                              </p>
                              {operation.failedResults?.some((item) => item.profileId === selectedProfile.id) && (
                                <p className="text-[11px] text-red-300 mt-2">
                                  {(operation.failedResults.find((item) => item.profileId === selectedProfile.id)?.error) || 'failed'}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${
                                operation.status === 'completed'
                                  ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                                  : operation.status === 'completed_with_errors'
                                    ? 'text-amber-400 border-amber-500/20 bg-amber-500/10'
                                    : 'text-red-400 border-red-500/20 bg-red-500/10'
                              }`}>
                                {operation.status}
                              </span>
                              {operation.retriableProfileIds?.includes(selectedProfile.id) && (
                                <button
                                  onClick={() => retryFailedProfileOperation(operation.id, selectedProfile.id)}
                                  className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all"
                                >
                                  Retry This Profile
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Recent Activity</h4>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {(profileState?.activity || []).length === 0 ? (
                      <div className="text-sm text-slate-500">No profile-state activity yet.</div>
                    ) : (
                      profileState?.activity?.map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-white/5 bg-dark-900/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-white">{entry.action}</p>
                              <p className="text-[11px] text-slate-500 mt-1">{new Date(entry.at).toLocaleString()}</p>
                              <p className="text-[10px] text-brand-400 mt-2">{entry.actor}</p>
                              {entry.details && (
                                <p className="text-[11px] text-slate-400 mt-2 break-all">{JSON.stringify(entry.details)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <ProfilesManager
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchProfiles();
          }}
        />
      )}
    </div>
  );
}
