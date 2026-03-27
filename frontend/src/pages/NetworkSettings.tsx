import { useState, useEffect } from 'react';
import { Network, Database, Shield, Fingerprint, Plus, Trash2, Edit3, Check, X, Info, Globe, Cpu, Monitor } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function NetworkSettings() {
  const [activeTab, setActiveTab] = useState<'pools' | 'policies' | 'fingerprints'>('pools');
  const [loading, setLoading] = useState(false);
  const [objectStorage, setObjectStorage] = useState<any>(null);
  const [fingerprintMatrix, setFingerprintMatrix] = useState<any>(null);
  const [promotionBusyId, setPromotionBusyId] = useState<string | null>(null);
  const [runtimeCapacity, setRuntimeCapacity] = useState<any>(null);
  const [runtimeHardening, setRuntimeHardening] = useState<any>(null);
  const [infrastructureHealth, setInfrastructureHealth] = useState<any>(null);
  const [benchmarkSeries, setBenchmarkSeries] = useState<any>(null);
  const [longRunSoak, setLongRunSoak] = useState<any>(null);
  const [incidentNotificationSettings, setIncidentNotificationSettings] = useState<any>(null);
  const [sandboxAutomation, setSandboxAutomation] = useState<any>(null);
  const [sandboxRuntimeEmulation, setSandboxRuntimeEmulation] = useState<any>(null);
  const [savingSandboxAutomation, setSavingSandboxAutomation] = useState(false);
  const [savingSandboxRuntimeEmulation, setSavingSandboxRuntimeEmulation] = useState(false);
  const [issuingChallenge, setIssuingChallenge] = useState(false);
  const [resolvingChallengeId, setResolvingChallengeId] = useState<string | null>(null);
  const [selectorAssistResult, setSelectorAssistResult] = useState<any>(null);
  const [runningSelectorAssist, setRunningSelectorAssist] = useState(false);
  const [sandboxAdvisorInput, setSandboxAdvisorInput] = useState({
    stage: 'email',
    errorClass: 'selector_timeout',
    controlKind: 'input',
    selector: '#emailField',
    visibleControls: 'input[type="email"], button[type="submit"]',
    validationMessage: '',
  });
  const [sandboxAdvisorResult, setSandboxAdvisorResult] = useState<any>(null);
  const [runningSandboxAdvisor, setRunningSandboxAdvisor] = useState(false);
  const [sandboxLab, setSandboxLab] = useState<any>(null);
  const [networkMetadataCatalog, setNetworkMetadataCatalog] = useState<any>(null);
  const [networkPoolRecommendations, setNetworkPoolRecommendations] = useState<any>(null);
  const [proxyAdvisor, setProxyAdvisor] = useState<any>(null);
  const [networkStrategy, setNetworkStrategy] = useState<any>(null);
  const [poolSizingPlan, setPoolSizingPlan] = useState<any>(null);
  const [egressDependencyReport, setEgressDependencyReport] = useState<any>(null);
  const [egressLanePlanner, setEgressLanePlanner] = useState<any>(null);
  const [egressLanePolicy, setEgressLanePolicy] = useState<any>(null);
  const [selfHostedVpnBootstrap, setSelfHostedVpnBootstrap] = useState<any>(null);
  const [selfHostedImportPreview, setSelfHostedImportPreview] = useState<any>(null);
  const [selfHostedOnboardingChecklist, setSelfHostedOnboardingChecklist] = useState<any>(null);
  const [selfHostedTopologyPlan, setSelfHostedTopologyPlan] = useState<any>(null);
  const [previewingSelfHostedImport, setPreviewingSelfHostedImport] = useState(false);
  const [refreshingSelfHostedChecklist, setRefreshingSelfHostedChecklist] = useState(false);
  const [provisioningSelfHostedPools, setProvisioningSelfHostedPools] = useState(false);
  const [registeringSelfHostedExits, setRegisteringSelfHostedExits] = useState(false);
  const [aiRouter, setAiRouter] = useState<any>(null);
  const [savingAiRouter, setSavingAiRouter] = useState(false);
  const [savingSandboxScenario, setSavingSandboxScenario] = useState(false);
  const [runningSandboxSuite, setRunningSandboxSuite] = useState(false);
  const [networkRoutingPreview, setNetworkRoutingPreview] = useState<any>(null);
  const [resolvingNetworkPreview, setResolvingNetworkPreview] = useState(false);
  const [poolHealthBusyId, setPoolHealthBusyId] = useState<string | null>(null);
  const [poolHealthResults, setPoolHealthResults] = useState<Record<string, any>>({});
  const [testingStorage, setTestingStorage] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [savingIncidentSettings, setSavingIncidentSettings] = useState(false);
  const [storageForm, setStorageForm] = useState({
    provider: 'filesystem',
    bucket: '',
    region: 'eu-west-1',
    endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: true,
    keyPrefix: 'profiles',
  });
  const [data, setData] = useState<{ pools: any[], policies: any[], fingerprints: any[] }>({
    pools: [],
    policies: [],
    fingerprints: []
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [capacityForm, setCapacityForm] = useState({
    maxConcurrentProfiles: -1,
    rateLimitPerSeatPerMinute: 120,
    licenseKey: '',
    licenseEnforced: false,
    licenseActive: true,
    licenseExpiresAt: '',
  });
  const [sandboxForm, setSandboxForm] = useState({
    captchaProvider: 'manual',
    smsProvider: 'manual',
    allowManualResolution: true,
    stubAutoResolveMs: 750,
  });
  const [sandboxRuntimeForm, setSandboxRuntimeForm] = useState({
    enabled: true,
    allowedHosts: 'localhost,127.0.0.1',
    dynamicCanvasEvolution: true,
    emulateWebRTC: true,
    emulateAudio: true,
    emulateBattery: true,
    intervalMinMinutes: 3,
    intervalMaxMinutes: 8,
  });
  const [challengeForm, setChallengeForm] = useState({
    type: 'captcha',
    prompt: 'Resolve the sandbox challenge',
  });
  const [aiRouterForm, setAiRouterForm] = useState({
    preferredProvider: 'groq',
    fallbackProvider: 'ollama',
    softDailyRequestBudget: 500,
    softDailyTokenBudget: 500000,
    taskPreferences: {
      general: 'groq',
      doctor: 'groq',
      sandbox_advisor: 'groq',
      intent_flow: 'groq',
      batch_nightly: 'ollama',
    },
  });
  const [selectorAssistForm, setSelectorAssistForm] = useState({
    label: 'email',
    controlKind: 'input',
    localeHints: 'correo,email',
    snapshot: '<input id="emailField" aria-label="Email address" />',
  });
  const [sandboxScenarioForm, setSandboxScenarioForm] = useState({
    name: 'Email Step',
    version: 'v1',
    stage: 'email',
    controlKind: 'input',
    label: 'email',
    localeHints: 'correo,email',
    expectedSelectors: '#emailField,[aria-label="Email address"]',
    tags: 'signup',
    snapshot: '<div data-stage="email"><input id="emailField" aria-label="Email address" /></div>',
  });
  const [networkPreviewForm, setNetworkPreviewForm] = useState({
    profileId: '',
    proxyPoolId: '',
    country: '',
    city: '',
    platform: '',
    allowVpn: false,
    sticky: true,
  });
  const [selfHostedExitCsv, setSelfHostedExitCsv] = useState('');
  const [selfHostedImportFormat, setSelfHostedImportFormat] = useState<'csv' | 'json'>('csv');

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'fingerprints') return;
    refreshFingerprintInsights();
  }, [activeTab, data.fingerprints.length]);

  const refreshFingerprintInsights = async () => {
    try {
      const [{ data: presets }, { data: matrix }] = await Promise.all([
        api.get('/network/fingerprint-presets'),
        api.get('/network/fingerprint-presets/validation-matrix'),
      ]);
      setData((prev) => ({ ...prev, fingerprints: presets }));
      setFingerprintMatrix(matrix);
    } catch {
      setFingerprintMatrix(null);
    }
  };

  const refreshEgressViews = async () => {
    try {
      const [dependency, planner, policy, bootstrap, checklist, topology] = await Promise.all([
        api.get('/network/egress-dependency-report'),
        api.get('/network/egress-lane-planner'),
        api.get('/network/egress-lane-policy'),
        api.get('/network/self-hosted-vpn-bootstrap'),
        api.get('/network/self-hosted-vpn-bootstrap/onboarding-checklist'),
        api.get('/network/self-hosted-vpn-bootstrap/topology-plan'),
      ]);
      setEgressDependencyReport(dependency.data);
      setEgressLanePlanner(planner.data);
      setEgressLanePolicy(policy.data);
      setSelfHostedVpnBootstrap(bootstrap.data);
      setSelfHostedOnboardingChecklist(checklist.data);
      setSelfHostedTopologyPlan(topology.data);
      setSelfHostedExitCsv((prev) => (
        prev.trim().length > 0
          ? prev
          : (bootstrap.data?.registrationFormat?.exampleLines || []).join('\n')
      ));
    } catch {
      setEgressDependencyReport(null);
      setEgressLanePlanner(null);
      setEgressLanePolicy(null);
      setSelfHostedVpnBootstrap(null);
      setSelfHostedOnboardingChecklist(null);
      setSelfHostedTopologyPlan(null);
    }
  };

  useEffect(() => {
    api.get('/network/object-storage/status')
      .then(({ data }) => {
        setObjectStorage(data);
        setStorageForm({
          provider: data.provider || 'filesystem',
          bucket: data.bucket || '',
          region: data.region || 'eu-west-1',
          endpoint: data.endpoint || '',
          accessKeyId: '',
          secretAccessKey: '',
          forcePathStyle: data.forcePathStyle ?? true,
          keyPrefix: data.keyPrefix || 'profiles',
        });
      })
      .catch(() => setObjectStorage(null));
    api.get('/network/runtime-capacity')
      .then(({ data }) => {
        setRuntimeCapacity(data);
        setCapacityForm({
          maxConcurrentProfiles: data.maxConcurrentProfiles ?? -1,
          rateLimitPerSeatPerMinute: data.rateLimitPerSeatPerMinute ?? 120,
          licenseKey: data.licenseKey || '',
          licenseEnforced: !!data.licenseEnforced,
          licenseActive: data.licenseActive !== false,
          licenseExpiresAt: data.licenseExpiresAt || '',
        });
      })
      .catch(() => setRuntimeCapacity(null));
    api.get('/network/runtime-hardening')
      .then(({ data }) => setRuntimeHardening(data))
      .catch(() => setRuntimeHardening(null));
    api.get('/monitor/infrastructure')
      .then(({ data }) => setInfrastructureHealth(data))
      .catch(() => setInfrastructureHealth(null));
    api.get('/monitor/benchmark-series')
      .then(({ data }) => setBenchmarkSeries(data))
      .catch(() => setBenchmarkSeries(null));
    api.get('/monitor/long-run-soak')
      .then(({ data }) => setLongRunSoak(data))
      .catch(() => setLongRunSoak(null));
    api.get('/monitor/incidents/settings')
      .then(({ data }) => setIncidentNotificationSettings(data))
      .catch(() => setIncidentNotificationSettings(null));
    api.get('/network/sandbox-automation')
      .then(({ data }) => {
        setSandboxAutomation(data);
        setSandboxForm({
          captchaProvider: data.settings?.captchaProvider || 'manual',
          smsProvider: data.settings?.smsProvider || 'manual',
          allowManualResolution: data.settings?.allowManualResolution !== false,
          stubAutoResolveMs: data.settings?.stubAutoResolveMs || 750,
        });
      })
      .catch(() => setSandboxAutomation(null));
    api.get('/network/sandbox-runtime-emulation')
      .then(({ data }) => {
        setSandboxRuntimeEmulation(data);
        setSandboxRuntimeForm({
          enabled: data.enabled !== false,
          allowedHosts: Array.isArray(data.allowedHosts) ? data.allowedHosts.join(',') : 'localhost,127.0.0.1',
          dynamicCanvasEvolution: data.dynamicCanvasEvolution !== false,
          emulateWebRTC: data.emulateWebRTC !== false,
          emulateAudio: data.emulateAudio !== false,
          emulateBattery: data.emulateBattery !== false,
          intervalMinMinutes: data.intervalMinMinutes || 3,
          intervalMaxMinutes: data.intervalMaxMinutes || 8,
        });
      })
      .catch(() => setSandboxRuntimeEmulation(null));
    api.get('/network/sandbox-lab')
      .then(({ data }) => setSandboxLab(data))
      .catch(() => setSandboxLab(null));
    api.get('/network/metadata-catalog')
      .then(({ data }) => setNetworkMetadataCatalog(data))
      .catch(() => setNetworkMetadataCatalog(null));
    api.get('/network/proxy-advisor')
      .then(({ data }) => setProxyAdvisor(data))
      .catch(() => setProxyAdvisor(null));
    api.get('/network/strategy-wizard')
      .then(({ data }) => setNetworkStrategy(data))
      .catch(() => setNetworkStrategy(null));
    api.get('/network/pool-sizing-planner')
      .then(({ data }) => setPoolSizingPlan(data))
      .catch(() => setPoolSizingPlan(null));
    void refreshEgressViews();
    api.get('/monitor/ai-router')
      .then(({ data }) => {
        setAiRouter(data);
        setAiRouterForm({
          preferredProvider: data.settings?.preferredProvider || 'groq',
          fallbackProvider: data.settings?.fallbackProvider || 'ollama',
          softDailyRequestBudget: data.settings?.softDailyRequestBudget || 500,
          softDailyTokenBudget: data.settings?.softDailyTokenBudget || 500000,
          taskPreferences: {
            general: data.settings?.taskPreferences?.general?.[0] || 'groq',
            doctor: data.settings?.taskPreferences?.doctor?.[0] || 'groq',
            sandbox_advisor: data.settings?.taskPreferences?.sandbox_advisor?.[0] || 'groq',
            intent_flow: data.settings?.taskPreferences?.intent_flow?.[0] || 'groq',
            batch_nightly: data.settings?.taskPreferences?.batch_nightly?.[0] || 'ollama',
          },
        });
      })
      .catch(() => setAiRouter(null));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const endpoints: Record<string, string> = {
        pools: '/network/proxy-pools',
        policies: '/network/policies',
        fingerprints: '/network/fingerprint-presets'
      };
      const { data: result } = await api.get(endpoints[activeTab]);
      setData(prev => ({ ...prev, [activeTab]: result }));
    } catch (err) {
      toast.error('Failed to load network settings');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const endpoints: Record<string, string> = {
        pools: `/network/proxy-pools/${id}`,
        policies: `/network/policies/${id}`,
        fingerprints: `/network/fingerprint-presets/${id}`
      };
      await api.delete(endpoints[activeTab]);
      toast.success('Deleted successfully');
      fetchData();
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  const promotePreset = async (presetId: string, target: 'recommended' | 'default') => {
    setPromotionBusyId(`${presetId}:${target}`);
    try {
      const { data } = await api.post(`/network/fingerprint-presets/${presetId}/promote`, { target });
      toast.success(`Preset promoted as ${data?.record?.state || target}`);
      await refreshFingerprintInsights();
    } catch (err: any) {
      const reasons = err?.response?.data?.evaluation?.reasons;
      toast.error(
        Array.isArray(reasons) && reasons.length > 0
          ? reasons[0]
          : err?.response?.data?.error || 'Failed to promote preset'
      );
    } finally {
      setPromotionBusyId(null);
    }
  };

  const clearPresetPromotion = async (presetId: string) => {
    setPromotionBusyId(`${presetId}:clear`);
    try {
      await api.delete(`/network/fingerprint-presets/${presetId}/promote`);
      toast.success('Preset promotion cleared');
      await refreshFingerprintInsights();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to clear preset promotion');
    } finally {
      setPromotionBusyId(null);
    }
  };

  const testObjectStorage = async () => {
    setTestingStorage(true);
    try {
      const { data } = await api.post('/network/object-storage/test');
      if (data.ok) {
        toast.success('Object storage connection is healthy');
      } else {
        toast.error(data.reason || 'Object storage test failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Object storage test failed');
    } finally {
      setTestingStorage(false);
    }
  };

  const saveObjectStorage = async () => {
    setSavingStorage(true);
    try {
      const { data } = await api.put('/network/object-storage/config', storageForm);
      setObjectStorage(data);
      toast.success('Object storage configuration saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save object storage configuration');
    } finally {
      setSavingStorage(false);
    }
  };

  const saveRuntimeCapacity = async () => {
    setSavingCapacity(true);
    try {
      const { data } = await api.put('/network/runtime-capacity', {
        ...capacityForm,
        licenseKey: capacityForm.licenseKey || null,
        licenseExpiresAt: capacityForm.licenseExpiresAt || null,
      });
      setRuntimeCapacity(data);
      toast.success('Runtime capacity updated');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save runtime capacity');
    } finally {
      setSavingCapacity(false);
    }
  };

  const saveIncidentSettings = async () => {
    setSavingIncidentSettings(true);
    try {
      const { data } = await api.post('/monitor/incidents/settings', incidentNotificationSettings);
      setIncidentNotificationSettings(data);
      toast.success('Incident notification settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save incident notification settings');
    } finally {
      setSavingIncidentSettings(false);
    }
  };

  const saveAiRouter = async () => {
    setSavingAiRouter(true);
    try {
      const payload = {
        preferredProvider: aiRouterForm.preferredProvider,
        fallbackProvider: aiRouterForm.fallbackProvider,
        softDailyRequestBudget: Number(aiRouterForm.softDailyRequestBudget),
        softDailyTokenBudget: Number(aiRouterForm.softDailyTokenBudget),
        taskPreferences: {
          general: [aiRouterForm.taskPreferences.general, aiRouterForm.fallbackProvider].filter((value, index, arr) => arr.indexOf(value) === index),
          doctor: [aiRouterForm.taskPreferences.doctor, aiRouterForm.fallbackProvider].filter((value, index, arr) => arr.indexOf(value) === index),
          sandbox_advisor: [aiRouterForm.taskPreferences.sandbox_advisor, aiRouterForm.fallbackProvider].filter((value, index, arr) => arr.indexOf(value) === index),
          intent_flow: [aiRouterForm.taskPreferences.intent_flow, aiRouterForm.fallbackProvider].filter((value, index, arr) => arr.indexOf(value) === index),
          batch_nightly: [aiRouterForm.taskPreferences.batch_nightly, aiRouterForm.fallbackProvider].filter((value, index, arr) => arr.indexOf(value) === index),
        },
      };
      await api.post('/monitor/ai-router/settings', payload);
      const { data } = await api.get('/monitor/ai-router');
      setAiRouter(data);
      toast.success('AI router settings updated');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save AI router settings');
    } finally {
      setSavingAiRouter(false);
    }
  };

  const createSuggestedSelfHostedPools = async () => {
    setProvisioningSelfHostedPools(true);
    try {
      const { data } = await api.post('/network/self-hosted-vpn-bootstrap/pools');
      toast.success(data?.summary || 'Self-hosted VPN pools created');
      await refreshEgressViews();
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create self-hosted VPN pools');
    } finally {
      setProvisioningSelfHostedPools(false);
    }
  };

  const registerSelfHostedExits = async () => {
    const exits = (selfHostedImportPreview?.exits || []).filter((item: any) => item.name && item.host && Number(item.port) > 0 && item.group && item.cluster);

    if (!exits.length) {
      toast.error('Preview a valid self-hosted exit import before registering');
      return;
    }

    setRegisteringSelfHostedExits(true);
    try {
      const { data } = await api.post('/network/self-hosted-vpn-bootstrap/register-exits', { exits });
      toast.success(data?.summary || 'Self-hosted exits registered');
      await refreshEgressViews();
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to register self-hosted exits');
    } finally {
      setRegisteringSelfHostedExits(false);
    }
  };

  const previewSelfHostedImport = async () => {
    setPreviewingSelfHostedImport(true);
    try {
      const { data } = await api.post('/network/self-hosted-vpn-bootstrap/preview-import', {
        payload: selfHostedExitCsv,
        format: selfHostedImportFormat,
      });
      setSelfHostedImportPreview(data);
      if (data.valid) {
        toast.success(`Preview ready for ${data.exits?.length || 0} exit(s)`);
      } else {
        toast.error('No valid exits found in the import payload');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to preview self-hosted import');
    } finally {
      setPreviewingSelfHostedImport(false);
    }
  };

  const refreshSelfHostedChecklist = async (force = false) => {
    setRefreshingSelfHostedChecklist(true);
    try {
      const { data } = await api.get(`/network/self-hosted-vpn-bootstrap/onboarding-checklist${force ? '?force=true' : ''}`);
      setSelfHostedOnboardingChecklist(data);
      toast.success(force ? 'Self-hosted onboarding checklist refreshed with preflight' : 'Self-hosted onboarding checklist refreshed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to refresh self-hosted onboarding checklist');
    } finally {
      setRefreshingSelfHostedChecklist(false);
    }
  };

  const saveSandboxAutomation = async () => {
    setSavingSandboxAutomation(true);
    try {
      const { data } = await api.put('/network/sandbox-automation', sandboxForm);
      setSandboxAutomation((prev: any) => ({ ...(prev || {}), settings: data, recent: prev?.recent || [] }));
      toast.success('Sandbox automation updated');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save sandbox automation');
    } finally {
      setSavingSandboxAutomation(false);
    }
  };

  const saveSandboxRuntimeEmulation = async () => {
    setSavingSandboxRuntimeEmulation(true);
    try {
      const payload = {
        enabled: sandboxRuntimeForm.enabled,
        allowedHosts: sandboxRuntimeForm.allowedHosts.split(',').map((value) => value.trim()).filter(Boolean),
        dynamicCanvasEvolution: sandboxRuntimeForm.dynamicCanvasEvolution,
        emulateWebRTC: sandboxRuntimeForm.emulateWebRTC,
        emulateAudio: sandboxRuntimeForm.emulateAudio,
        emulateBattery: sandboxRuntimeForm.emulateBattery,
        intervalMinMinutes: sandboxRuntimeForm.intervalMinMinutes,
        intervalMaxMinutes: sandboxRuntimeForm.intervalMaxMinutes,
      };
      const { data } = await api.put('/network/sandbox-runtime-emulation', payload);
      setSandboxRuntimeEmulation(data);
      toast.success('Sandbox runtime emulation updated');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save sandbox runtime emulation');
    } finally {
      setSavingSandboxRuntimeEmulation(false);
    }
  };

  const issueSandboxChallenge = async () => {
    setIssuingChallenge(true);
    try {
      const { data } = await api.post('/network/sandbox-automation/challenges', challengeForm);
      setSandboxAutomation((prev: any) => ({
        ...(prev || {}),
        recent: [data, ...(prev?.recent || [])].slice(0, 10),
      }));
      toast.success(`Sandbox ${challengeForm.type} challenge issued`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to issue sandbox challenge');
    } finally {
      setIssuingChallenge(false);
    }
  };

  const resolveSandboxChallenge = async (challengeId: string) => {
    setResolvingChallengeId(challengeId);
    try {
      const { data } = await api.post(`/network/sandbox-automation/challenges/${challengeId}/resolve`, {
        resolution: { value: challengeForm.type === 'captcha' ? 'manual-ok' : '123456', mode: 'manual' },
      });
      setSandboxAutomation((prev: any) => ({
        ...(prev || {}),
        recent: (prev?.recent || []).map((item: any) => item.id === challengeId ? data : item),
      }));
      toast.success('Sandbox challenge resolved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to resolve sandbox challenge');
    } finally {
      setResolvingChallengeId(null);
    }
  };

  const runSelectorAssist = async () => {
    setRunningSelectorAssist(true);
    try {
      const { data } = await api.post('/network/selector-assist', {
        label: selectorAssistForm.label,
        controlKind: selectorAssistForm.controlKind,
        localeHints: selectorAssistForm.localeHints.split(',').map((value) => value.trim()).filter(Boolean),
        snapshot: selectorAssistForm.snapshot,
      });
      setSelectorAssistResult(data);
      toast.success('Selector assist completed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Selector assist failed');
    } finally {
      setRunningSelectorAssist(false);
    }
  };

  const runSandboxAdvisor = async () => {
    setRunningSandboxAdvisor(true);
    try {
      const { data } = await api.post('/ai/sandbox-advisor', {
        stage: sandboxAdvisorInput.stage,
        errorClass: sandboxAdvisorInput.errorClass,
        controlKind: sandboxAdvisorInput.controlKind,
        selector: sandboxAdvisorInput.selector,
        visibleControls: sandboxAdvisorInput.visibleControls.split(',').map((value) => value.trim()).filter(Boolean),
        validationMessage: sandboxAdvisorInput.validationMessage,
      });
      setSandboxAdvisorResult(data.result);
      toast.success('Sandbox advisor completed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Sandbox advisor failed');
    } finally {
      setRunningSandboxAdvisor(false);
    }
  };

  const saveSandboxScenario = async () => {
    setSavingSandboxScenario(true);
    try {
      await api.post('/network/sandbox-lab/scenarios', {
        name: sandboxScenarioForm.name,
        version: sandboxScenarioForm.version,
        stage: sandboxScenarioForm.stage,
        controlKind: sandboxScenarioForm.controlKind,
        label: sandboxScenarioForm.label,
        localeHints: sandboxScenarioForm.localeHints.split(',').map((value) => value.trim()).filter(Boolean),
        expectedSelectors: sandboxScenarioForm.expectedSelectors.split(',').map((value) => value.trim()).filter(Boolean),
        tags: sandboxScenarioForm.tags.split(',').map((value) => value.trim()).filter(Boolean),
        snapshot: sandboxScenarioForm.snapshot,
      });
      const { data } = await api.get('/network/sandbox-lab');
      setSandboxLab(data);
      toast.success('Sandbox scenario saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save sandbox scenario');
    } finally {
      setSavingSandboxScenario(false);
    }
  };

  const deleteSandboxScenario = async (scenarioId: string) => {
    try {
      await api.delete(`/network/sandbox-lab/scenarios/${scenarioId}`);
      const { data } = await api.get('/network/sandbox-lab');
      setSandboxLab(data);
      toast.success('Sandbox scenario deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete sandbox scenario');
    }
  };

  const runSandboxSuite = async () => {
    setRunningSandboxSuite(true);
    try {
      await api.post('/network/sandbox-lab/run');
      const { data } = await api.get('/network/sandbox-lab');
      setSandboxLab(data);
      toast.success('Sandbox regression suite executed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to run sandbox regression suite');
    } finally {
      setRunningSandboxSuite(false);
    }
  };

  const runPoolHealthCheck = async (poolId: string) => {
    setPoolHealthBusyId(poolId);
    try {
      const { data } = await api.post(`/network/proxy-pools/${poolId}/health-check`);
      setPoolHealthResults((prev) => ({ ...prev, [poolId]: data }));
      toast.success(`Health check completed for ${data.total} endpoints`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Health check failed');
    } finally {
      setPoolHealthBusyId(null);
    }
  };

  const resolveNetworkPreview = async () => {
    setResolvingNetworkPreview(true);
    try {
      const payload = {
        profileId: networkPreviewForm.profileId || undefined,
        proxyPoolId: networkPreviewForm.proxyPoolId || undefined,
        country: networkPreviewForm.country || undefined,
        city: networkPreviewForm.city || undefined,
        platform: networkPreviewForm.platform || undefined,
        allowVpn: networkPreviewForm.allowVpn,
        sticky: networkPreviewForm.sticky,
      };
      const [{ data }, { data: recommendations }] = await Promise.all([
        api.post('/network/proxy-routing/resolve', payload),
        api.post('/network/pool-recommendations', payload),
      ]);
      setNetworkRoutingPreview(data);
      setNetworkPoolRecommendations(recommendations);
      toast.success('Routing preview generated');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Routing preview failed');
    } finally {
      setResolvingNetworkPreview(false);
    }
  };

  const renderPools = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-400" /> Proxy Pools
          </h2>
          <p className="text-sm text-slate-500 font-medium">Manage groups of proxies for rotation and dedicated use.</p>
        </div>
        <button onClick={() => { setEditingItem({}); setIsModalOpen(true); }} className="btn-primary py-2 text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Pool
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {proxyAdvisor && (
          <div className="md:col-span-2 rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Proxy Advisor</h3>
                <p className="text-xs text-slate-500 mt-1">{proxyAdvisor.summary}</p>
              </div>
              <span className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                proxyAdvisor.mode === 'healthy_pool'
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : proxyAdvisor.mode === 'limited_pool'
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'bg-sky-500/10 text-sky-300'
              }`}>
                {proxyAdvisor.mode === 'healthy_pool' ? 'Healthy Pool' : proxyAdvisor.mode === 'limited_pool' ? 'Limited Pool' : 'Proxyless'}
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Works Without Proxies</p>
                <div className="mt-3 space-y-2">
                  {(proxyAdvisor.guidance?.availableWithoutProxies || []).map((item: string, index: number) => (
                    <p key={`proxy-ok-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gets Weaker Without Proxies</p>
                <div className="mt-3 space-y-2">
                  {(proxyAdvisor.guidance?.degradedWithoutProxies || []).map((item: string, index: number) => (
                    <p key={`proxy-risk-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Practical Next Step</p>
                <div className="mt-3 space-y-2">
                  {(proxyAdvisor.guidance?.recommendations || []).slice(0, 3).map((item: string, index: number) => (
                    <p key={`proxy-next-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-slate-500">
                  Target <span className="text-white">{proxyAdvisor.targetPool?.minimumHealthyEndpoints || 0}</span> healthy endpoints · sticky <span className="text-white">{proxyAdvisor.targetPool?.suggestedStickyStrategy || 'STICKY_PER_PROFILE'}</span>
                </p>
              </div>
            </div>
          </div>
        )}
        {networkStrategy && (
          <div className="md:col-span-2 rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Network Strategy Wizard</h3>
                <p className="text-xs text-slate-500 mt-1">{networkStrategy.recommendation}</p>
              </div>
              <span className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-brand-500/10 text-brand-300">
                {networkStrategy.scaleBand} scale
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
              {(networkStrategy.options || []).map((option: any) => (
                <div key={option.id} className="rounded-xl border border-white/5 bg-dark-900 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{option.label}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{option.summary}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      option.fit === 'good' ? 'text-emerald-400' : option.fit === 'acceptable' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {option.fit}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Strengths</p>
                    <div className="mt-2 space-y-1">
                      {(option.strengths || []).map((item: string, index: number) => (
                        <p key={`${option.id}-strength-${index}`} className="text-xs text-slate-300">{item}</p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Limits</p>
                    <div className="mt-2 space-y-1">
                      {(option.limits || []).map((item: string, index: number) => (
                        <p key={`${option.id}-limit-${index}`} className="text-xs text-slate-400">{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">VPN Guidance</p>
              <p className="text-sm text-white mt-2">{networkStrategy.vpnGuidance?.summary}</p>
              <div className="mt-3 space-y-1">
                {(networkStrategy.vpnGuidance?.bestUseCases || []).map((item: string, index: number) => (
                  <p key={`vpn-guidance-${index}`} className="text-xs text-slate-300">{item}</p>
                ))}
              </div>
            </div>
          </div>
        )}
        {poolSizingPlan && (
          <div className="md:col-span-2 rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Pool Sizing Planner</h3>
                <p className="text-xs text-slate-500 mt-1">{poolSizingPlan.recommendation}</p>
              </div>
              <span className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-300">
                {poolSizingPlan.suggestedArchitecture}
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Seats</p>
                <p className="text-2xl font-black text-white mt-2">{poolSizingPlan.seats}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Concurrent Profiles</p>
                <p className="text-2xl font-black text-white mt-2">{poolSizingPlan.concurrency}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Healthy Endpoints</p>
                <p className="text-2xl font-black text-white mt-2">{poolSizingPlan.targets?.recommendedHealthyEndpoints || 0}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reserve Endpoints</p>
                <p className="text-2xl font-black text-white mt-2">{poolSizingPlan.targets?.reserveEndpoints || 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hybrid Split</p>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  <p>Proxyless seats: {poolSizingPlan.hybridPlan?.proxylessSeats || 0}</p>
                  <p>VPN seats: {poolSizingPlan.hybridPlan?.vpnSeats || 0}</p>
                  <p>Proxy-backed seats: {poolSizingPlan.hybridPlan?.proxyBackedSeats || 0}</p>
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4 xl:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Practical Notes</p>
                <div className="mt-3 space-y-2">
                  {(poolSizingPlan.notes || []).map((item: string, index: number) => (
                    <p key={`pool-plan-note-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {egressDependencyReport && (
          <div className="md:col-span-2 rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Egress Dependency Report</h3>
                <p className="text-xs text-slate-500 mt-1">{egressDependencyReport.summary}</p>
              </div>
              <span className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                egressDependencyReport.commercialDependenceLevel === 'none'
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : egressDependencyReport.commercialDependenceLevel === 'low'
                    ? 'bg-sky-500/10 text-sky-300'
                    : egressDependencyReport.commercialDependenceLevel === 'medium'
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-red-500/10 text-red-300'
              }`}>
                {egressDependencyReport.commercialDependenceLevel} dependence
              </span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Proxyless Allocation</p>
                <p className="text-2xl font-black text-white mt-2">{egressDependencyReport.currentCapacity?.proxyless?.percentOfConcurrency || 0}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  About {egressDependencyReport.currentCapacity?.proxyless?.recommendedProfiles || 0} concurrent profiles can stay on local egress.
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Self-Hosted VPN Allocation</p>
                <p className="text-2xl font-black text-white mt-2">{egressDependencyReport.currentCapacity?.selfHostedVpn?.percentOfConcurrency || 0}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {egressDependencyReport.currentCapacity?.selfHostedVpn?.healthyExits || 0} healthy exits · {egressDependencyReport.currentCapacity?.selfHostedVpn?.managedProfileCapacity || 0} managed slots.
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Commercial Pool Need</p>
                <p className="text-2xl font-black text-white mt-2">{egressDependencyReport.currentCapacity?.commercialPool?.percentOfConcurrency || 0}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {egressDependencyReport.currentCapacity?.commercialPool?.healthyEndpoints || 0} healthy commercial endpoints available.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Strong Separation Breakpoint</p>
                <p className="text-sm font-bold text-white mt-2">{egressDependencyReport.strongSeparation?.currentCapacity || 0} concurrent profiles</p>
                <p className="text-[11px] text-slate-500 mt-2">{egressDependencyReport.strongSeparation?.note}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operating Policy</p>
                <div className="mt-3 space-y-2">
                  {Object.values(egressDependencyReport.policy || {}).map((item: any, index: number) => (
                    <p key={`egress-policy-${index}`} className="text-xs text-slate-300">{String(item)}</p>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommended Next Moves</p>
              <div className="mt-3 space-y-2">
                {(egressDependencyReport.recommendations || []).map((item: string, index: number) => (
                  <p key={`egress-rec-${index}`} className="text-xs text-slate-300">{item}</p>
                ))}
              </div>
            </div>
          </div>
        )}
        {egressLanePlanner && (
          <div className="md:col-span-2 rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Egress Lane Planner</h3>
                <p className="text-xs text-slate-500 mt-1">{egressLanePlanner.summary}</p>
              </div>
              <span className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-brand-500/10 text-brand-300">
                minimization {egressLanePlanner.minimizationScore || 0}
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Proxyless Lane</p>
                <p className="text-2xl font-black text-white mt-2">{egressLanePlanner.lanes?.proxyless?.targetProfiles || 0}</p>
                <p className="text-[11px] text-slate-500 mt-1">{egressLanePlanner.lanes?.proxyless?.targetPercent || 0}% of concurrency</p>
                <div className="mt-3 space-y-1">
                  {(egressLanePlanner.lanes?.proxyless?.bestFor || []).map((item: string, index: number) => (
                    <p key={`lane-proxyless-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4 xl:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Self-Hosted VPN Lanes</p>
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {(egressLanePlanner.lanes?.selfHostedVpn || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No self-hosted VPN lanes yet. Add at least two healthy exits to reduce commercial dependence with real lane assignment.</p>
                  ) : (
                    (egressLanePlanner.lanes?.selfHostedVpn || []).map((lane: any) => (
                      <div key={lane.laneId} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-white">{lane.label}</p>
                            <p className="text-[11px] text-slate-500 mt-1">{lane.healthyExits}/{lane.exits} healthy exits · target {lane.targetProfiles} profiles</p>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-sky-300">{lane.assignmentPolicy}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          {(lane.countries || []).slice(0, 4).join(', ') || 'No country metadata yet'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Commercial Overflow Lane</p>
                <p className="text-2xl font-black text-white mt-2">{egressLanePlanner.lanes?.commercialOverflow?.targetProfiles || 0}</p>
                <p className="text-[11px] text-slate-500 mt-1">{egressLanePlanner.lanes?.commercialOverflow?.targetPercent || 0}% of concurrency</p>
                <div className="mt-3 space-y-1">
                  {(egressLanePlanner.lanes?.commercialOverflow?.bestFor || []).map((item: string, index: number) => (
                    <p key={`lane-commercial-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Commercial Minimization Actions</p>
                <div className="mt-3 space-y-2">
                  {(egressLanePlanner.commercialMinimizationActions || []).map((item: string, index: number) => (
                    <p key={`lane-action-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
            </div>
            {egressLanePolicy && (
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Effective Lane Policy</p>
                    <p className="text-[11px] text-slate-500 mt-2">Source: {egressLanePolicy.source} · generated {new Date(egressLanePolicy.generatedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {(egressLanePolicy.rules || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No lane rules generated yet.</p>
                  ) : (
                    (egressLanePolicy.rules || []).map((rule: any) => (
                      <div key={rule.laneId} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                        <p className="text-sm font-bold text-white">{rule.label}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{rule.profileIds?.length || 0} profile(s)</p>
                        <p className="text-xs text-slate-300 mt-3">{rule.rationale}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {selfHostedVpnBootstrap && (
          <div className="md:col-span-2 rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Self-Hosted VPN Bootstrap Pack</h3>
                <p className="text-xs text-slate-500 mt-1">{selfHostedVpnBootstrap.summary}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-300">
                  need {selfHostedVpnBootstrap.stillNeeded || 0}
                </span>
                <button onClick={createSuggestedSelfHostedPools} disabled={provisioningSelfHostedPools} className="btn-secondary py-2 text-[10px] disabled:opacity-50">
                  {provisioningSelfHostedPools ? 'Creating pools...' : 'Create Suggested Pools'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Healthy Exits</p>
                <p className="text-2xl font-black text-white mt-2">{selfHostedVpnBootstrap.currentExits || 0}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommended Exits</p>
                <p className="text-2xl font-black text-white mt-2">{selfHostedVpnBootstrap.recommendedExitCount || 0}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Commercial Need</p>
                <p className="text-2xl font-black text-white mt-2">{selfHostedVpnBootstrap.minimizationContext?.commercialPercent || 0}%</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Suggested Geos</p>
                <p className="text-sm font-bold text-white mt-2">{(selfHostedVpnBootstrap.prioritizedGeos || []).join(', ') || 'No geo demand yet'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Execution Plan</p>
                <div className="mt-3 space-y-2">
                  {(selfHostedVpnBootstrap.executionPlan || []).map((item: string, index: number) => (
                    <p key={`vpn-bootstrap-step-${index}`} className="text-xs text-slate-300">{index + 1}. {item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Readiness Checks</p>
                <div className="mt-3 space-y-2">
                  {(selfHostedVpnBootstrap.readinessChecks || []).map((item: string, index: number) => (
                    <p key={`vpn-bootstrap-check-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Suggested Pools</p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {(selfHostedVpnBootstrap.poolBlueprints || []).map((pool: any) => (
                    <div key={pool.group} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                      <p className="text-sm font-bold text-white">{pool.name}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{pool.group} · geo {pool.intendedGeo || 'n/a'}</p>
                      <p className="text-xs text-slate-300 mt-3">{pool.useCase}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Deployment Artifacts</p>
                <div className="mt-3 space-y-2">
                  {(selfHostedVpnBootstrap.deploymentArtifacts || []).map((item: string) => (
                    <p key={item} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-white/5 bg-dark-950 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Registration Format</p>
                  <p className="text-[11px] text-slate-500 mt-2">{(selfHostedVpnBootstrap.registrationFormat?.fields || []).join(', ')}</p>
                </div>
              </div>
            </div>

            {selfHostedTopologyPlan && (
              <div className="rounded-xl border border-white/5 bg-dark-900 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Host Topology Plan</p>
                  <p className="text-xs text-slate-400 mt-2">{selfHostedTopologyPlan.summary}</p>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {(selfHostedTopologyPlan.hosts || []).map((host: any) => (
                    <div key={host.exit} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{host.exit}</p>
                          <p className="text-[11px] text-slate-500 mt-1">{host.hostname}</p>
                        </div>
                        <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-sky-500/10 text-sky-300">
                          {host.group}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-3">{host.role}</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-slate-400">
                        <p>geo {host.geo}</p>
                        <p>order {host.deploymentOrder}</p>
                        <p>{host.sizing?.vcpu} vCPU · {host.sizing?.memoryGb} GB</p>
                        <p>{host.capacity?.recommendedProfiles} profiles</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rollout Phases</p>
                    <div className="mt-3 space-y-2">
                      {(selfHostedTopologyPlan.rolloutPhases || []).map((item: string, index: number) => (
                        <p key={`topology-phase-${index}`} className="text-xs text-slate-300">{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-dark-950 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Host Guidance</p>
                    <div className="mt-3 space-y-2">
                      {(selfHostedTopologyPlan.guidance || []).map((item: string, index: number) => (
                        <p key={`topology-guidance-${index}`} className="text-xs text-slate-300">{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exit Templates</p>
              <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                {(selfHostedVpnBootstrap.templates || []).map((template: any) => (
                  <div key={template.name} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                    <p className="text-sm font-bold text-white">{template.name}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{template.provider} · {template.endpointType}</p>
                    <p className="text-xs text-slate-300 mt-3">{template.why}</p>
                    <p className="text-[11px] text-slate-500 mt-2">cluster {template.metadata?.cluster} · group {template.metadata?.group} · country {template.metadata?.country}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-dark-900 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Register Ready Exits</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Paste one exit per line after the VPN nodes exist. Format: name,host,port,country,city,group,cluster,protocol,username,password
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={selfHostedImportFormat} onChange={(e) => setSelfHostedImportFormat(e.target.value as 'csv' | 'json')} className="input-field bg-dark-950 text-[10px] py-2 min-w-[110px]">
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                  <button onClick={previewSelfHostedImport} disabled={previewingSelfHostedImport} className="btn-secondary py-2 text-[10px] disabled:opacity-50">
                    {previewingSelfHostedImport ? 'Previewing...' : 'Preview Import'}
                  </button>
                  <button onClick={registerSelfHostedExits} disabled={registeringSelfHostedExits} className="btn-primary py-2 text-[10px] disabled:opacity-50">
                    {registeringSelfHostedExits ? 'Registering...' : 'Register Exits'}
                  </button>
                </div>
              </div>
              <textarea
                value={selfHostedExitCsv}
                onChange={(e) => setSelfHostedExitCsv(e.target.value)}
                rows={Math.max(6, (selfHostedVpnBootstrap.registrationFormat?.exampleLines || []).length + 2)}
                className="input-field bg-dark-950 font-mono text-xs"
              />
              {selfHostedImportPreview && (
                <div className="rounded-xl border border-white/5 bg-dark-950 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Import Preview</p>
                      <p className="text-xs text-slate-400 mt-2">{selfHostedImportPreview.exits?.length || 0} parsed exit(s) · format {selfHostedImportPreview.detectedFormat}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${selfHostedImportPreview.valid ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {selfHostedImportPreview.valid ? 'valid' : 'review'}
                    </span>
                  </div>
                  {(selfHostedImportPreview.warnings || []).length > 0 && (
                    <div className="space-y-1">
                      {(selfHostedImportPreview.warnings || []).map((warning: string, index: number) => (
                        <p key={`selfhosted-import-warning-${index}`} className="text-xs text-amber-200">{warning}</p>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {(selfHostedImportPreview.exits || []).map((item: any, index: number) => (
                      <div key={`${item.name}-${index}`} className="rounded-xl border border-white/5 bg-dark-900 p-3">
                        <p className="text-sm font-bold text-white">{item.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{item.host}:{item.port}</p>
                        <p className="text-xs text-slate-300 mt-2">{item.group} · {item.cluster} · {item.country || 'no-country'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/5 bg-dark-900 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Onboarding Checklist</p>
                  <p className="text-xs text-slate-400 mt-2">{selfHostedOnboardingChecklist?.summary || 'No checklist data yet.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => refreshSelfHostedChecklist(false)} disabled={refreshingSelfHostedChecklist} className="btn-secondary py-2 text-[10px] disabled:opacity-50">
                    Refresh
                  </button>
                  <button onClick={() => refreshSelfHostedChecklist(true)} disabled={refreshingSelfHostedChecklist} className="btn-primary py-2 text-[10px] disabled:opacity-50">
                    {refreshingSelfHostedChecklist ? 'Checking...' : 'Run Preflight'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {(selfHostedOnboardingChecklist?.rows || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No self-hosted exits registered yet.</p>
                ) : (
                  (selfHostedOnboardingChecklist?.rows || []).map((row: any) => (
                    <div key={row.id} className="rounded-xl border border-white/5 bg-dark-950 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{row.name}</p>
                          <p className="text-[11px] text-slate-500 mt-1">{row.group} · {row.cluster} · {row.country || 'no-country'}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${row.ready ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                          {row.ready ? 'ready' : 'review'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        status {row.status} · latency {row.health?.latencyMs || 0}ms · {row.health?.error || 'healthy'}
                      </div>
                      <div className="space-y-1">
                        {(row.checks || []).map((check: any) => (
                          <p key={`${row.id}-${check.key}`} className={`text-xs ${check.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
                            {check.ok ? 'OK' : 'CHECK'} · {check.label}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {(selfHostedOnboardingChecklist?.recommendedActions || []).length > 0 && (
                <div className="space-y-1">
                  {(selfHostedOnboardingChecklist.recommendedActions || []).map((item: string, index: number) => (
                    <p key={`selfhosted-checklist-action-${index}`} className="text-xs text-slate-300">{item}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {data.pools.map(pool => (
          <div key={pool.id} className="glass-dark p-5 border border-white/5 rounded-2xl hover:border-brand-500/30 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-white text-lg">{pool.name}</h3>
                <p className="text-xs text-slate-500">{pool.description || 'No description'}</p>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(pool.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-950 p-3 rounded-xl border border-white/5">
                <p className="text-[10px] uppercase font-black text-slate-500 tracking-tighter mb-1">Rotation</p>
                <p className="text-sm font-bold text-brand-400">{pool.rotationStrategy}</p>
              </div>
              <div className="bg-dark-950 p-3 rounded-xl border border-white/5">
                <p className="text-[10px] uppercase font-black text-slate-500 tracking-tighter mb-1">Endpoints</p>
                <p className="text-sm font-bold text-white">{pool._count?.endpoints || 0}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setNetworkPreviewForm((prev) => ({ ...prev, proxyPoolId: pool.id }));
                  void resolveNetworkPreview();
                }}
                className="btn-secondary py-1 text-[10px]"
              >
                Preview Routing
              </button>
              <button
                onClick={() => runPoolHealthCheck(pool.id)}
                disabled={poolHealthBusyId === pool.id}
                className="btn-secondary py-1 text-[10px] disabled:opacity-50"
              >
                {poolHealthBusyId === pool.id ? 'Checking...' : 'Run Health Check'}
              </button>
            </div>
            {poolHealthResults[pool.id] && (
              <div className="mt-3 rounded-xl border border-white/5 bg-dark-950 p-3 text-[11px] text-slate-400">
                Healthy <span className="text-green-300 font-bold">{poolHealthResults[pool.id].healthy}</span> ·
                Degraded <span className="text-amber-300 font-bold">{poolHealthResults[pool.id].degraded}</span> ·
                Unhealthy <span className="text-red-300 font-bold">{poolHealthResults[pool.id].unhealthy}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Routing Preview</h3>
          <p className="text-xs text-slate-500 mt-1">Preview sticky session, geo targeting and blend/failover selection before launching a profile.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={networkPreviewForm.profileId} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, profileId: e.target.value }))} className="input-field bg-dark-900" placeholder="profile id (optional)" />
          <select value={networkPreviewForm.proxyPoolId} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, proxyPoolId: e.target.value }))} className="input-field bg-dark-900">
            <option value="">auto pool</option>
            {data.pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
          </select>
          <select value={networkPreviewForm.platform} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, platform: e.target.value }))} className="input-field bg-dark-900">
            <option value="">platform</option>
            {(networkMetadataCatalog?.platformProfiles || []).map((profile: any) => (
              <option key={profile.key} value={profile.platform}>{profile.label}</option>
            ))}
          </select>
          <select value={networkPreviewForm.country} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, country: e.target.value, city: '' }))} className="input-field bg-dark-900">
            <option value="">country</option>
            {(networkMetadataCatalog?.countries || []).map((country: any) => (
              <option key={country.country} value={country.country}>{country.label}</option>
            ))}
          </select>
          <select value={networkPreviewForm.city} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, city: e.target.value }))} className="input-field bg-dark-900">
            <option value="">city</option>
            {((networkMetadataCatalog?.countries || []).find((country: any) => country.country === networkPreviewForm.country)?.cities || []).map((city: string) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-dark-900 px-4">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              <input type="checkbox" checked={networkPreviewForm.sticky} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, sticky: e.target.checked }))} />
              sticky
            </label>
            <label className="text-xs text-slate-400 flex items-center gap-2">
              <input type="checkbox" checked={networkPreviewForm.allowVpn} onChange={(e) => setNetworkPreviewForm((prev) => ({ ...prev, allowVpn: e.target.checked }))} />
              allow VPN
            </label>
          </div>
        </div>
        <button onClick={resolveNetworkPreview} disabled={resolvingNetworkPreview} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
          <Check className="w-4 h-4" /> {resolvingNetworkPreview ? 'Resolving...' : 'Resolve Network Preview'}
        </button>
        {networkRoutingPreview && (
          <div className="rounded-xl border border-white/5 bg-dark-900 p-4 space-y-2">
            <p className="text-sm font-bold text-white">Source: {networkRoutingPreview.selection?.source || 'unknown'}</p>
            <p className="text-xs text-slate-400">
              Sticky: <span className="text-white">{String(networkRoutingPreview.selection?.sticky)}</span> · Pools: <span className="text-white">{(networkRoutingPreview.selection?.poolIds || []).length}</span>
            </p>
            <p className="text-xs text-slate-400">
              Endpoint: <span className="text-white">{networkRoutingPreview.endpoint?.host ? `${networkRoutingPreview.endpoint.host}:${networkRoutingPreview.endpoint.port}` : 'direct/no endpoint'}</span>
            </p>
            <p className="text-xs text-slate-400">
              Geo: <span className="text-white">{networkRoutingPreview.selection?.country || '-'}</span> / <span className="text-white">{networkRoutingPreview.selection?.city || '-'}</span>
            </p>
            <p className="text-xs text-slate-400">
              Endpoint type: <span className="text-white">{networkRoutingPreview.endpoint?.endpointType || networkRoutingPreview.proxy?.__session?.endpointType || '-'}</span> · Provider: <span className="text-white">{networkRoutingPreview.endpoint?.provider || '-'}</span>
            </p>
          </div>
        )}
        {networkPoolRecommendations?.platformProfile && (
          <div className="rounded-xl border border-white/5 bg-dark-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">{networkPoolRecommendations.platformProfile.label}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Preferred {(networkPoolRecommendations.platformProfile.preferredEndpointTypes || []).join(' / ')} · sticky {networkPoolRecommendations.platformProfile.stickyRecommended ? 'recommended' : 'optional'}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">{networkPoolRecommendations.platformProfile.geoSensitivity} geo</span>
            </div>
            <div className="space-y-3">
              {(networkPoolRecommendations.recommendations || []).length === 0 ? (
                <p className="text-xs text-slate-500">No compatible pool recommendation is available yet for this request.</p>
              ) : (
                (networkPoolRecommendations.recommendations || []).map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{item.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{item.type}</p>
                      </div>
                      <span className={`text-sm font-black ${item.score >= 70 ? 'text-emerald-400' : item.score >= 45 ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(item.reasons || []).map((reason: string, index: number) => (
                        <p key={`${item.id}-reason-${index}`} className="text-[11px] text-slate-400">{reason}</p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Practical Geo & VPN Metadata Catalog</h3>
          <p className="text-xs text-slate-500 mt-1">Country/city metadata, provider tags and a self-hosted VPN blueprint that Camel can route, fail over and observe correctly.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/5 p-4 bg-dark-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Common Geo Targets</p>
            <div className="mt-3 space-y-3 max-h-64 overflow-y-auto pr-1">
              {(networkMetadataCatalog?.countries || []).slice(0, 12).map((country: any) => (
                <div key={country.country}>
                  <p className="text-sm font-bold text-white">{country.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{country.region} · {(country.cities || []).slice(0, 3).join(', ')}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 p-4 bg-dark-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Provider Models</p>
            <div className="mt-3 space-y-3">
              {(networkMetadataCatalog?.providers || []).map((provider: any) => (
                <div key={provider.id}>
                  <p className="text-sm font-bold text-white">{provider.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{provider.endpointType} · {provider.operatorModel === 'self_hosted' ? 'self-hosted' : 'managed'}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 p-4 bg-dark-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Own VPN Blueprint</p>
            <div className="mt-3 space-y-3">
              {(networkMetadataCatalog?.vpnBlueprints || []).map((vpn: any) => (
                <div key={vpn.id}>
                  <p className="text-sm font-bold text-white">{vpn.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{vpn.endpointType} · {vpn.provider}</p>
                  <div className="mt-2 space-y-1">
                    {(vpn.notes || []).map((note: string, index: number) => (
                      <p key={`${vpn.id}-note-${index}`} className="text-[11px] text-slate-400">{note}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPolicies = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-400" /> Network Policies
          </h2>
          <p className="text-sm text-slate-500 font-medium">Define DNS, WebRTC, and Timezone behavior for groups of profiles.</p>
        </div>
        <button className="btn-primary py-2 text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Policy
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.policies.map(policy => (
          <div key={policy.id} className="glass-dark p-5 border border-white/5 rounded-2xl hover:border-brand-500/30 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-white text-lg">{policy.name}</h3>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(policy.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">WebRTC</span>
                <span className="text-brand-400 font-bold">{policy.webrtcPolicy}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Timezone</span>
                <span className="text-brand-400 font-bold">{policy.timezonePolicy}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">DNS Premium</span>
                <span className={`font-bold ${policy.dnsPrimary ? 'text-green-400' : 'text-slate-600'}`}>
                  {policy.dnsPrimary ? 'Active' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderFingerprints = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-brand-400" /> Fingerprint Presets
          </h2>
          <p className="text-sm text-slate-500 font-medium">Manage cross-platform fingerprint presets with consistency and validation feedback.</p>
        </div>
        <button className="btn-primary py-2 text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Preset
        </button>
      </div>

      {fingerprintMatrix?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-4">
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Average Score</p>
            <p className="text-2xl font-black text-white mt-2">{fingerprintMatrix.summary.averageScore}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hardening Avg</p>
            <p className="text-2xl font-black text-cyan-300 mt-2">{fingerprintMatrix.summary.averageHardeningScore || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Healthy</p>
            <p className="text-2xl font-black text-emerald-400 mt-2">{fingerprintMatrix.summary.healthy}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Warnings</p>
            <p className="text-2xl font-black text-amber-400 mt-2">{fingerprintMatrix.summary.warning}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Critical</p>
            <p className="text-2xl font-black text-red-400 mt-2">{fingerprintMatrix.summary.critical}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ready</p>
            <p className="text-2xl font-black text-emerald-300 mt-2">{fingerprintMatrix.summary.ready || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Review</p>
            <p className="text-2xl font-black text-amber-300 mt-2">{fingerprintMatrix.summary.review || 0}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hold</p>
            <p className="text-2xl font-black text-red-300 mt-2">{fingerprintMatrix.summary.hold || 0}</p>
          </div>
        </div>
      )}

      {(fingerprintMatrix?.rows || []).length > 0 && (
        <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Validation Matrix</h3>
            <p className="text-xs text-slate-500 mt-1">Weakest presets first, with live profile usage count and rollout guidance.</p>
          </div>
          <div className="divide-y divide-white/5">
            {fingerprintMatrix.rows.slice(0, 6).map((row: any) => (
              <div key={row.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white">{row.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {row.platform} · {row.browser} · {row.presetVersion} · {row.profileCount} profiles
                  </p>
                  <p className="text-[10px] uppercase tracking-widest mt-2">
                    {row.promotion ? (
                      <span className="text-fuchsia-400 font-black">Promoted: {row.promotion.state}</span>
                    ) : (
                      <span className="text-slate-600">Not promoted</span>
                    )}
                  </p>
                  <p className={`text-[10px] uppercase tracking-widest mt-2 font-black ${row.releaseReadiness === 'ready' ? 'text-emerald-300' : row.releaseReadiness === 'review' ? 'text-amber-300' : 'text-red-300'}`}>
                    {row.releaseReadiness}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2 max-w-[420px]">{row.recommendation}</p>
                  {row.blockingIssues?.length > 0 && (
                    <p className="text-[11px] text-red-300 mt-2 max-w-[420px]">
                      Blocking: {row.blockingIssues[0]}
                    </p>
                  )}
                </div>
                <div className="text-right min-w-[180px]">
                  <p className={`text-xl font-black ${row.severity === 'healthy' ? 'text-emerald-400' : row.severity === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                    {row.validationScore}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-widest">{row.issueCount} issues · hardening {row.hardeningScore}</p>
                  <p className="text-[11px] text-slate-600 mt-1 uppercase tracking-widest">{row.adjustmentCount} normalizations</p>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button
                      onClick={() => promotePreset(row.id, 'recommended')}
                      className="px-2 py-1 rounded bg-brand-500/10 text-brand-300 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all disabled:opacity-50"
                      disabled={!!promotionBusyId}
                    >
                      {promotionBusyId === `${row.id}:recommended` ? '...' : 'Rec'}
                    </button>
                    <button
                      onClick={() => promotePreset(row.id, 'default')}
                      className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all disabled:opacity-50"
                      disabled={!!promotionBusyId}
                    >
                      {promotionBusyId === `${row.id}:default` ? '...' : 'Default'}
                    </button>
                    <button
                      onClick={() => clearPresetPromotion(row.id)}
                      className="px-2 py-1 rounded bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                      disabled={!!promotionBusyId || !row.promotion}
                    >
                      {promotionBusyId === `${row.id}:clear` ? '...' : 'Clear'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.fingerprints.map(fp => (
          <div key={fp.id} className="glass-dark p-5 border border-white/5 rounded-2xl hover:border-brand-500/30 transition-all group">
            {(() => {
              const cfg = fp.config || {};
              const validation = cfg.validation || fp.validation;
              return (
                <>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-white text-md">{fp.name}</h3>
                <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded uppercase font-black">{fp.platform}</span>
              </div>
              {fp.tenantId === null ? (
                <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded border border-white/5 uppercase font-black tracking-widest">Global</span>
              ) : (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleDelete(fp.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
            
            <div className="space-y-3 mt-4">
               <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Monitor className="w-3 h-3 text-brand-500" /> {cfg.screenResolution || 'n/a'}
               </div>
               <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Cpu className="w-3 h-3 text-brand-500" /> {cfg.platformOS || 'n/a'}
               </div>
               <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                 <span className="text-slate-500">Preset</span>
                 <span className="text-brand-400 font-black">{cfg.presetVersion || 'legacy'}</span>
               </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <span className="text-slate-500">Validation</span>
                  <span className={`${(validation?.score || 0) >= 85 ? 'text-green-400' : (validation?.score || 0) >= 65 ? 'text-yellow-400' : 'text-red-400'} font-black`}>
                    {validation?.score || 0}/100
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <span className="text-slate-500">Promotion</span>
                  <span className={`${fp.promotion ? 'text-fuchsia-400' : 'text-slate-500'} font-black`}>
                    {fp.promotion?.state || 'none'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 font-mono truncate bg-dark-950 p-2 rounded border border-white/5">
                  {cfg.userAgent || 'No user agent configured'}
                </div>
                {validation?.issues?.length > 0 && (
                  <div className="text-[10px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                    {validation.issues[0]}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => promotePreset(fp.id, 'recommended')}
                    className="px-2 py-1 rounded bg-brand-500/10 text-brand-300 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all disabled:opacity-50"
                    disabled={!!promotionBusyId}
                  >
                    {promotionBusyId === `${fp.id}:recommended` ? '...' : 'Promote Rec'}
                  </button>
                  <button
                    onClick={() => promotePreset(fp.id, 'default')}
                    className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all disabled:opacity-50"
                    disabled={!!promotionBusyId}
                  >
                    {promotionBusyId === `${fp.id}:default` ? '...' : 'Promote Default'}
                  </button>
                  <button
                    onClick={() => clearPresetPromotion(fp.id)}
                    className="px-2 py-1 rounded bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                    disabled={!!promotionBusyId || !fp.promotion}
                  >
                    {promotionBusyId === `${fp.id}:clear` ? '...' : 'Clear'}
                  </button>
                </div>
             </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );

  const averageSoakScore = Math.round(((longRunSoak?.current || []).reduce((sum: number, item: any) => sum + (item.overallScore || 0), 0)) / Math.max((longRunSoak?.current || []).length, 1));
  const routingCoverageCount = (networkMetadataCatalog?.countries || []).length;
  const recommendedPool = (networkPoolRecommendations?.recommendations || [])[0] || null;
  const guidedSetupCards = [
    {
      title: 'Infrastructure',
      tone: infrastructureHealth?.components?.redis?.meetsMinimum ? 'emerald' : 'red',
      value: infrastructureHealth?.components?.redis?.version || 'offline',
      summary: infrastructureHealth?.userGuidance?.nextAction || 'Check Redis, benchmark history and long-run soak before trusting routing decisions.',
    },
    {
      title: 'Capacity',
      tone: (runtimeCapacity?.maxConcurrentProfiles ?? -1) === -1 ? 'emerald' : (runtimeCapacity?.maxConcurrentProfiles || 0) >= 10 ? 'emerald' : 'amber',
      value: (runtimeCapacity?.maxConcurrentProfiles ?? -1) === -1 ? 'Unlimited' : String(runtimeCapacity?.maxConcurrentProfiles || 0),
      summary: `Rate limit ${(runtimeCapacity?.rateLimitPerSeatPerMinute ?? 0)} per seat/min. ${runtimeCapacity?.licenseEnforced ? 'License enforcement is active.' : 'License enforcement is currently relaxed.'}`,
    },
    {
      title: 'Proxy Readiness',
      tone: proxyAdvisor?.mode === 'healthy_pool' ? 'emerald' : proxyAdvisor?.mode === 'limited_pool' ? 'amber' : 'red',
      value: proxyAdvisor?.mode === 'healthy_pool' ? 'Healthy Pool' : proxyAdvisor?.mode === 'limited_pool' ? 'Limited Pool' : 'Proxyless',
      summary: proxyAdvisor?.summary || 'Camel still works locally without proxies, but routing quality improves a lot once a healthy pool exists.',
    },
    {
      title: 'Routing Metadata',
      tone: routingCoverageCount >= 10 ? 'emerald' : routingCoverageCount >= 5 ? 'amber' : 'red',
      value: `${routingCoverageCount} countries`,
      summary: recommendedPool
        ? `Top recommendation for ${recommendedPool.platform || 'general'} traffic is ${recommendedPool.poolName} with score ${recommendedPool.score}.`
        : 'Add more geo-tagged endpoints to unlock better pool recommendations.',
    },
    {
      title: 'Sandbox Runtime',
      tone: sandboxRuntimeEmulation?.enabled ? 'emerald' : 'amber',
      value: sandboxRuntimeEmulation?.enabled ? 'Enabled' : 'Disabled',
      summary: sandboxRuntimeEmulation?.enabled
        ? `Local-only emulation is limited to ${(sandboxRuntimeEmulation?.allowedHosts || []).slice(0, 3).join(', ') || 'configured hosts'}.`
        : 'Use this only for internal hosts when you need reproducible sandbox behavior.',
    },
  ];

  const setupChecklist: string[] = [];
  if (!(infrastructureHealth?.components?.redis?.meetsMinimum)) setupChecklist.push('Upgrade or reconnect Redis before trusting queue and failover behavior.');
  if ((benchmarkSeries?.summary?.latestScore || 0) < 75) setupChecklist.push('Benchmark score is soft. Re-check preset stability before promoting defaults.');
  if (averageSoakScore < 75) setupChecklist.push('Long-run soak still needs work. Prefer modest concurrency until the soak score improves.');
  if (proxyAdvisor?.mode === 'proxyless') setupChecklist.push('Proxyless mode is fine for local and sandbox work, but network separation stays weak until you add a small healthy pool.');
  if (proxyAdvisor?.mode === 'limited_pool') setupChecklist.push(`Current pool is thin. Aim for about ${proxyAdvisor?.targetPool?.minimumHealthyEndpoints || 0} healthy endpoints before relying on stable multi-profile routing.`);
  if (!recommendedPool) setupChecklist.push('No strong pool recommendation yet. Add geo metadata or health-check more endpoints.');
  if (setupChecklist.length === 0) setupChecklist.push('Core network layer looks healthy. Focus next on operator workflows and preset quality.');

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <Network className="h-8 w-8 text-brand-400" />
          Network & Fingerprint Layer
        </h1>
        <p className="text-slate-400 font-medium">Advanced proxy, fingerprint, object storage and runtime capacity management.</p>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Guided Setup</p>
            <h2 className="text-2xl font-black text-white mt-2">What to fix first before going deeper</h2>
            <p className="text-sm text-slate-400 mt-2">
              This compresses the network layer into the few signals that most often decide whether Camel feels reliable or fragile in day-to-day use.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 px-4 py-3 min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recommended Next Step</p>
            <p className="text-sm font-bold text-white mt-2">{setupChecklist[0]}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
          {guidedSetupCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-white/5 bg-dark-950 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.title}</p>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  card.tone === 'emerald' ? 'text-emerald-400' : card.tone === 'amber' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {card.value}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">{card.summary}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Checklist</p>
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
            {setupChecklist.map((item, index) => (
              <p key={`setup-check-${index}`} className="text-sm text-slate-300">
                {index + 1}. {item}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-brand-400" /> AI Router Console
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Keep Groq for operator-facing speed, use Ollama as local fallback, and push nightly batch work away from paid headroom when it makes sense.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-950 px-4 py-3 min-w-[260px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nightly Recommendation</p>
            <p className="text-sm font-bold text-white mt-2">{aiRouter?.nightlyBatchRecommendation?.provider || 'ollama'}</p>
            <p className="text-[11px] text-slate-500 mt-2">{aiRouter?.nightlyBatchRecommendation?.reason || 'No nightly recommendation yet.'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Requests Today</p>
            <p className="text-2xl font-black text-white mt-2">{aiRouter?.today?.requests || 0}</p>
            <p className="text-[11px] text-slate-500 mt-1">Pressure {aiRouter?.budgetStatus?.requestPressure || 'low'}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tokens Today</p>
            <p className="text-2xl font-black text-white mt-2">{aiRouter?.today?.totalTokens || 0}</p>
            <p className="text-[11px] text-slate-500 mt-1">Pressure {aiRouter?.budgetStatus?.tokenPressure || 'low'}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Provider Mix</p>
            <p className="text-sm font-bold text-white mt-2">Groq {aiRouter?.today?.providerMix?.groq || 0}</p>
            <p className="text-[11px] text-slate-500 mt-1">Ollama {aiRouter?.today?.providerMix?.ollama || 0} · fallbacks {aiRouter?.today?.fallbacks || 0}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Self-Hosted VPN Exits</p>
            <p className="text-2xl font-black text-white mt-2">{egressDependencyReport?.currentCapacity?.selfHostedVpn?.healthyExits || 0}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {egressDependencyReport?.currentCapacity?.selfHostedVpn?.totalExits || 0} total exits · use several exits if you want your own egress layer to behave like a small pool.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Budget & Fallback</h3>
              <p className="text-xs text-slate-500 mt-1">Per-tenant soft budgets. Camel keeps Groq responsive and moves batch load to Ollama when pressure grows.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Preferred</span>
                <select value={aiRouterForm.preferredProvider} onChange={(e) => setAiRouterForm((prev) => ({ ...prev, preferredProvider: e.target.value }))} className="input-field bg-dark-900">
                  <option value="groq">Groq</option>
                  <option value="ollama">Ollama</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fallback</span>
                <select value={aiRouterForm.fallbackProvider} onChange={(e) => setAiRouterForm((prev) => ({ ...prev, fallbackProvider: e.target.value }))} className="input-field bg-dark-900">
                  <option value="ollama">Ollama</option>
                  <option value="groq">Groq</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Daily Request Budget</span>
                <input type="number" value={aiRouterForm.softDailyRequestBudget} onChange={(e) => setAiRouterForm((prev) => ({ ...prev, softDailyRequestBudget: Number(e.target.value) }))} className="input-field bg-dark-900" />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Daily Token Budget</span>
                <input type="number" value={aiRouterForm.softDailyTokenBudget} onChange={(e) => setAiRouterForm((prev) => ({ ...prev, softDailyTokenBudget: Number(e.target.value) }))} className="input-field bg-dark-900" />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Task Routing Policy</h3>
              <p className="text-xs text-slate-500 mt-1">Choose the first provider Camel should try for each task family.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['general', 'General'],
                ['doctor', 'Profile Doctor'],
                ['sandbox_advisor', 'Sandbox Advisor'],
                ['intent_flow', 'Intent Flow'],
                ['batch_nightly', 'Nightly Batch'],
              ].map(([key, label]) => (
                <label key={key} className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                  <select
                    value={(aiRouterForm.taskPreferences as any)[key]}
                    onChange={(e) => setAiRouterForm((prev) => ({
                      ...prev,
                      taskPreferences: {
                        ...prev.taskPreferences,
                        [key]: e.target.value,
                      },
                    }))}
                    className="input-field bg-dark-900"
                  >
                    <option value="groq">Groq first</option>
                    <option value="ollama">Ollama first</option>
                  </select>
                </label>
              ))}
            </div>
            <button onClick={saveAiRouter} disabled={savingAiRouter} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
              <Check className="w-4 h-4" /> {savingAiRouter ? 'Saving...' : 'Save AI Router'}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" /> Infrastructure Readiness
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Friendly snapshot of the underlying platform health so operators know what to fix first.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Redis</p>
              <p className={`text-2xl font-black mt-2 ${infrastructureHealth?.components?.redis?.meetsMinimum ? 'text-emerald-400' : 'text-red-400'}`}>
                {infrastructureHealth?.components?.redis?.version || 'offline'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{infrastructureHealth?.components?.redis?.detail || 'Redis status unavailable.'}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Benchmark Series</p>
              <p className="text-2xl font-black text-white mt-2">{benchmarkSeries?.summary?.latestScore || 0}</p>
              <p className="text-[11px] text-slate-500 mt-1">{benchmarkSeries?.summary?.trend || 'stable'} · {benchmarkSeries?.summary?.snapshots || 0} snapshots</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Long-Run Soak</p>
              <p className="text-2xl font-black text-white mt-2">
                {averageSoakScore}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{(longRunSoak?.current || []).map((item: any) => `${item.profile}:${item.status}`).join(' · ') || 'No long-run soak data yet.'}</p>
            </div>
          </div>
          {infrastructureHealth?.recommendations?.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Next Best Fix</p>
              <p className="text-sm text-white mt-2">{infrastructureHealth.userGuidance?.nextAction}</p>
              <p className="text-xs text-slate-300 mt-2">{infrastructureHealth.recommendations[0]}</p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-400" /> Object Storage
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {objectStorage?.configured
              ? `${objectStorage.provider.toUpperCase()} · bucket ${objectStorage.bucket} · ${objectStorage.region}`
              : 'Using filesystem fallback. Configure S3-compatible credentials to enable shared object storage.'}
          </p>
          <p className="text-[11px] text-slate-600 mt-2 font-mono">
            Prefix: {objectStorage?.keyPrefix || 'profiles'}
            {objectStorage?.endpoint ? ` · Endpoint: ${objectStorage.endpoint}` : ''}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            <select
              value={storageForm.provider}
              onChange={(e) => setStorageForm(prev => ({ ...prev, provider: e.target.value }))}
              className="input-field bg-dark-900"
            >
              <option value="filesystem">filesystem</option>
              <option value="s3">s3</option>
            </select>
            <input
              value={storageForm.bucket}
              onChange={(e) => setStorageForm(prev => ({ ...prev, bucket: e.target.value }))}
              placeholder="Bucket"
              className="input-field bg-dark-900"
            />
            <input
              value={storageForm.region}
              onChange={(e) => setStorageForm(prev => ({ ...prev, region: e.target.value }))}
              placeholder="Region"
              className="input-field bg-dark-900"
            />
            <input
              value={storageForm.endpoint}
              onChange={(e) => setStorageForm(prev => ({ ...prev, endpoint: e.target.value }))}
              placeholder="Endpoint (optional)"
              className="input-field bg-dark-900"
            />
            <input
              value={storageForm.accessKeyId}
              onChange={(e) => setStorageForm(prev => ({ ...prev, accessKeyId: e.target.value }))}
              placeholder="Access Key ID"
              className="input-field bg-dark-900"
            />
            <input
              value={storageForm.secretAccessKey}
              onChange={(e) => setStorageForm(prev => ({ ...prev, secretAccessKey: e.target.value }))}
              placeholder="Secret Access Key"
              className="input-field bg-dark-900"
            />
            <input
              value={storageForm.keyPrefix}
              onChange={(e) => setStorageForm(prev => ({ ...prev, keyPrefix: e.target.value }))}
              placeholder="Key Prefix"
              className="input-field bg-dark-900"
            />
            <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
              <input
                type="checkbox"
                checked={storageForm.forcePathStyle}
                onChange={(e) => setStorageForm(prev => ({ ...prev, forcePathStyle: e.target.checked }))}
              />
              Force Path Style
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={saveObjectStorage} disabled={savingStorage} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" /> {savingStorage ? 'Saving...' : 'Save Config'}
          </button>
          <button onClick={testObjectStorage} disabled={testingStorage} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" /> {testingStorage ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-400" /> Runtime Capacity & License
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Control per-tenant concurrent profile launches and rate budget by seat, with optional license enforcement.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            <input
              type="number"
              value={capacityForm.maxConcurrentProfiles}
              onChange={(e) => setCapacityForm(prev => ({ ...prev, maxConcurrentProfiles: Number(e.target.value) }))}
              placeholder="-1 = unlimited"
              className="input-field bg-dark-900"
            />
            <input
              type="number"
              value={capacityForm.rateLimitPerSeatPerMinute}
              onChange={(e) => setCapacityForm(prev => ({ ...prev, rateLimitPerSeatPerMinute: Number(e.target.value) }))}
              placeholder="Requests per seat per minute"
              className="input-field bg-dark-900"
            />
            <input
              value={capacityForm.licenseKey}
              onChange={(e) => setCapacityForm(prev => ({ ...prev, licenseKey: e.target.value }))}
              placeholder="License key"
              className="input-field bg-dark-900"
            />
            <input
              value={capacityForm.licenseExpiresAt}
              onChange={(e) => setCapacityForm(prev => ({ ...prev, licenseExpiresAt: e.target.value }))}
              placeholder="License expiry ISO timestamp"
              className="input-field bg-dark-900"
            />
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
              <input
                type="checkbox"
                checked={capacityForm.licenseEnforced}
                onChange={(e) => setCapacityForm(prev => ({ ...prev, licenseEnforced: e.target.checked }))}
              />
              Enforce License
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
              <input
                type="checkbox"
                checked={capacityForm.licenseActive}
                onChange={(e) => setCapacityForm(prev => ({ ...prev, licenseActive: e.target.checked }))}
              />
              License Active
            </label>
            <div className="px-3 py-2 rounded-xl border border-white/5 bg-dark-900 text-sm text-slate-400">
              Active Profiles: <span className="text-white font-bold">{runtimeCapacity?.activeConcurrentProfiles ?? 0}</span>
            </div>
            <div className="px-3 py-2 rounded-xl border border-white/5 bg-dark-900 text-sm text-slate-400">
              Budget: <span className="text-white font-bold">{runtimeCapacity?.effectiveRequestsPerMinute ?? 0}/min</span>
            </div>
            <div className={`px-3 py-2 rounded-xl border text-sm ${runtimeCapacity?.licenseValidNow ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
              License: <span className="font-bold">{runtimeCapacity?.licenseValidNow ? 'valid' : 'invalid'}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={saveRuntimeCapacity} disabled={savingCapacity} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" /> {savingCapacity ? 'Saving...' : 'Save Capacity'}
          </button>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" /> Incident Notifications
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Configure LiveOps incident digests, cooldown windows and optional Slack or Teams delivery.
          </p>
          {incidentNotificationSettings ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
                  <input
                    type="checkbox"
                    checked={!!incidentNotificationSettings.enabled}
                    onChange={(e) => setIncidentNotificationSettings((prev: any) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
                  <input
                    type="checkbox"
                    checked={!!incidentNotificationSettings.notifyWarnings}
                    onChange={(e) => setIncidentNotificationSettings((prev: any) => ({ ...prev, notifyWarnings: e.target.checked }))}
                  />
                  Include Warnings
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={incidentNotificationSettings.cooldownMinutes ?? 30}
                  onChange={(e) => setIncidentNotificationSettings((prev: any) => ({ ...prev, cooldownMinutes: Number(e.target.value || 30) }))}
                  placeholder="Cooldown minutes"
                  className="input-field bg-dark-900"
                />
                <div className="px-3 py-2 rounded-xl border border-white/5 bg-dark-900 text-sm text-slate-400">
                  Status: <span className={`font-bold ${incidentNotificationSettings.enabled ? 'text-emerald-300' : 'text-slate-300'}`}>{incidentNotificationSettings.enabled ? 'enabled' : 'disabled'}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <input
                  value={incidentNotificationSettings.slackWebhookUrl || ''}
                  onChange={(e) => setIncidentNotificationSettings((prev: any) => ({ ...prev, slackWebhookUrl: e.target.value }))}
                  placeholder="Slack webhook URL"
                  className="input-field bg-dark-900"
                />
                <input
                  value={incidentNotificationSettings.teamsWebhookUrl || ''}
                  onChange={(e) => setIncidentNotificationSettings((prev: any) => ({ ...prev, teamsWebhookUrl: e.target.value }))}
                  placeholder="Teams webhook URL"
                  className="input-field bg-dark-900"
                />
              </div>
            </>
          ) : (
            <div className="mt-4 text-sm text-slate-500">Incident notification settings unavailable.</div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={saveIncidentSettings} disabled={savingIncidentSettings || !incidentNotificationSettings} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" /> {savingIncidentSettings ? 'Saving...' : 'Save Notifications'}
          </button>
        </div>
      </div>

      {runtimeHardening && (
        <div className="glass-dark border border-white/5 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand-400" /> Runtime Hardening
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Guardrail posture for strict runtime, mutation policy, fingerprint validation and profile consistency.
              </p>
            </div>
            <div className={`px-4 py-2 rounded-xl border text-sm font-bold ${runtimeHardening.status === 'strong' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : runtimeHardening.status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
              Score {runtimeHardening.overallScore}
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-3">
              {(runtimeHardening.items || []).map((item: any) => (
                <div key={item.id} className="rounded-xl border border-white/5 bg-dark-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <span className={`text-sm font-black ${item.status === 'strong' ? 'text-emerald-400' : item.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>{item.score}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fingerprint Avg</p>
                  <p className="text-2xl font-black text-white mt-2">{runtimeHardening.fingerprint?.averageScore || 0}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-dark-900 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profile Validation Avg</p>
                  <p className="text-2xl font-black text-white mt-2">{runtimeHardening.profiles?.averageValidation || 0}</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Recommendations</p>
                <div className="mt-2 space-y-2">
                  {(runtimeHardening.recommendations || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No hardening recommendations right now.</p>
                  ) : (
                    (runtimeHardening.recommendations || []).map((item: string, index: number) => (
                      <p key={`runtime-hardening-${index}`} className="text-xs text-slate-300">{item}</p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="glass-dark border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-brand-400" /> Local Sandbox Runtime Emulation
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Safe local-only emulation for localhost/internal sandboxes. It never activates on unrelated public hosts.
            </p>
          </div>
          <button onClick={saveSandboxRuntimeEmulation} disabled={savingSandboxRuntimeEmulation} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" /> {savingSandboxRuntimeEmulation ? 'Saving...' : 'Save Runtime Emulation'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
            <input type="checkbox" checked={sandboxRuntimeForm.enabled} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, enabled: e.target.checked }))} />
            Enabled
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
            <input type="checkbox" checked={sandboxRuntimeForm.dynamicCanvasEvolution} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, dynamicCanvasEvolution: e.target.checked }))} />
            Dynamic Canvas
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
            <input type="checkbox" checked={sandboxRuntimeForm.emulateWebRTC} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, emulateWebRTC: e.target.checked }))} />
            WebRTC Emulation
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
            <input type="checkbox" checked={sandboxRuntimeForm.emulateBattery} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, emulateBattery: e.target.checked }))} />
            Battery Emulation
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={sandboxRuntimeForm.allowedHosts} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, allowedHosts: e.target.value }))} className="input-field bg-dark-900 md:col-span-2" placeholder="allowed hosts csv" />
          <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
            <input type="checkbox" checked={sandboxRuntimeForm.emulateAudio} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, emulateAudio: e.target.checked }))} />
            Audio Emulation
          </label>
          <input type="number" value={sandboxRuntimeForm.intervalMinMinutes} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, intervalMinMinutes: Number(e.target.value) }))} className="input-field bg-dark-900" placeholder="min minutes" />
          <input type="number" value={sandboxRuntimeForm.intervalMaxMinutes} onChange={(e) => setSandboxRuntimeForm(prev => ({ ...prev, intervalMaxMinutes: Number(e.target.value) }))} className="input-field bg-dark-900" placeholder="max minutes" />
          <div className="rounded-xl border border-white/5 bg-dark-900 px-4 py-3 text-xs text-slate-400">
            Current hosts: <span className="text-white">{Array.isArray(sandboxRuntimeEmulation?.allowedHosts) ? sandboxRuntimeEmulation.allowedHosts.join(', ') : 'localhost,127.0.0.1'}</span>
          </div>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-400" /> Sandbox Automation
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Safe manual or stub providers for captcha and SMS inside controlled sandboxes, plus selector assistance from your own snapshots.
            </p>
          </div>
          <button onClick={saveSandboxAutomation} disabled={savingSandboxAutomation} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" /> {savingSandboxAutomation ? 'Saving...' : 'Save Sandbox Config'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <select value={sandboxForm.captchaProvider} onChange={(e) => setSandboxForm(prev => ({ ...prev, captchaProvider: e.target.value }))} className="input-field bg-dark-900">
            <option value="disabled">captcha disabled</option>
            <option value="manual">captcha manual</option>
            <option value="stub_auto">captcha stub_auto</option>
          </select>
          <select value={sandboxForm.smsProvider} onChange={(e) => setSandboxForm(prev => ({ ...prev, smsProvider: e.target.value }))} className="input-field bg-dark-900">
            <option value="disabled">sms disabled</option>
            <option value="manual">sms manual</option>
            <option value="stub_auto">sms stub_auto</option>
          </select>
          <input type="number" value={sandboxForm.stubAutoResolveMs} onChange={(e) => setSandboxForm(prev => ({ ...prev, stubAutoResolveMs: Number(e.target.value) }))} className="input-field bg-dark-900" />
          <label className="flex items-center gap-3 text-sm text-slate-400 px-3 py-2 rounded-xl border border-white/5 bg-dark-900">
            <input type="checkbox" checked={sandboxForm.allowManualResolution} onChange={(e) => setSandboxForm(prev => ({ ...prev, allowManualResolution: e.target.checked }))} />
            Allow Manual Resolution
          </label>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Issue Sandbox Challenge</h3>
              <p className="text-xs text-slate-500 mt-1">Generate safe manual/stub captcha or SMS challenges for internal workflows.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={challengeForm.type} onChange={(e) => setChallengeForm(prev => ({ ...prev, type: e.target.value }))} className="input-field bg-dark-900">
                <option value="captcha">captcha</option>
                <option value="sms">sms</option>
              </select>
              <input value={challengeForm.prompt} onChange={(e) => setChallengeForm(prev => ({ ...prev, prompt: e.target.value }))} className="input-field bg-dark-900 md:col-span-2" />
            </div>
            <button onClick={issueSandboxChallenge} disabled={issuingChallenge} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
              <Plus className="w-4 h-4" /> {issuingChallenge ? 'Issuing...' : 'Issue Challenge'}
            </button>
            <div className="space-y-3">
              {(sandboxAutomation?.recent || []).slice(0, 5).map((challenge: any) => (
                <div key={challenge.id} className="rounded-xl border border-white/5 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{challenge.type} · {challenge.provider}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{challenge.prompt}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${challenge.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-400' : challenge.status === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700 text-slate-300'}`}>
                      {challenge.status}
                    </span>
                    {challenge.status === 'pending' && sandboxForm.allowManualResolution && (
                      <button onClick={() => resolveSandboxChallenge(challenge.id)} disabled={resolvingChallengeId === challenge.id} className="btn-primary py-1 text-[10px] disabled:opacity-50">
                        {resolvingChallengeId === challenge.id ? 'Resolving...' : 'Resolve'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Selector Assist</h3>
              <p className="text-xs text-slate-500 mt-1">Analyze your own sandbox snapshots and suggest alternative selectors by label and control kind.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={selectorAssistForm.label} onChange={(e) => setSelectorAssistForm(prev => ({ ...prev, label: e.target.value }))} className="input-field bg-dark-900" placeholder="Label" />
              <select value={selectorAssistForm.controlKind} onChange={(e) => setSelectorAssistForm(prev => ({ ...prev, controlKind: e.target.value }))} className="input-field bg-dark-900">
                <option value="input">input</option>
                <option value="select">select</option>
                <option value="combobox">combobox</option>
                <option value="button">button</option>
              </select>
              <input value={selectorAssistForm.localeHints} onChange={(e) => setSelectorAssistForm(prev => ({ ...prev, localeHints: e.target.value }))} className="input-field bg-dark-900" placeholder="locale hints" />
            </div>
            <textarea value={selectorAssistForm.snapshot} onChange={(e) => setSelectorAssistForm(prev => ({ ...prev, snapshot: e.target.value }))} rows={8} className="input-field bg-dark-900 font-mono text-xs" />
            <button onClick={runSelectorAssist} disabled={runningSelectorAssist} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
              <Check className="w-4 h-4" /> {runningSelectorAssist ? 'Analyzing...' : 'Run Selector Assist'}
            </button>
            {(selectorAssistResult?.suggestions || []).length > 0 && (
              <div className="space-y-2">
                {selectorAssistResult.suggestions.map((item: any) => (
                  <div key={`${item.source}-${item.selector}`} className="rounded-xl border border-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <code className="text-xs text-brand-300">{item.selector}</code>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest">{item.score}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{item.source} · {item.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-400" /> Sandbox AI Advisor
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Local heuristic or Groq-backed advice over internal telemetry only. No third-party bypass actions are returned.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={sandboxAdvisorInput.stage} onChange={(e) => setSandboxAdvisorInput(prev => ({ ...prev, stage: e.target.value }))} className="input-field bg-dark-900" placeholder="stage" />
          <input value={sandboxAdvisorInput.errorClass} onChange={(e) => setSandboxAdvisorInput(prev => ({ ...prev, errorClass: e.target.value }))} className="input-field bg-dark-900" placeholder="error class" />
          <input value={sandboxAdvisorInput.controlKind} onChange={(e) => setSandboxAdvisorInput(prev => ({ ...prev, controlKind: e.target.value }))} className="input-field bg-dark-900" placeholder="control kind" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={sandboxAdvisorInput.selector} onChange={(e) => setSandboxAdvisorInput(prev => ({ ...prev, selector: e.target.value }))} className="input-field bg-dark-900" placeholder="selector" />
          <input value={sandboxAdvisorInput.visibleControls} onChange={(e) => setSandboxAdvisorInput(prev => ({ ...prev, visibleControls: e.target.value }))} className="input-field bg-dark-900" placeholder="visible controls csv" />
        </div>
        <textarea value={sandboxAdvisorInput.validationMessage} onChange={(e) => setSandboxAdvisorInput(prev => ({ ...prev, validationMessage: e.target.value }))} rows={4} className="input-field bg-dark-900 text-xs" placeholder="validation message" />
        <button onClick={runSandboxAdvisor} disabled={runningSandboxAdvisor} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
          <Check className="w-4 h-4" /> {runningSandboxAdvisor ? 'Advising...' : 'Run Sandbox Advisor'}
        </button>
        {sandboxAdvisorResult && (
          <div className="rounded-xl border border-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-white">{sandboxAdvisorResult.summary}</p>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">{sandboxAdvisorResult.source}</span>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Recommendations</p>
              <div className="mt-2 space-y-2">
                {(sandboxAdvisorResult.recommendations || []).map((item: string, index: number) => (
                  <p key={`rec-${index}`} className="text-xs text-slate-300">{item}</p>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Safe Actions</p>
              <div className="mt-2 space-y-2">
                {(sandboxAdvisorResult.safeActions || []).map((item: string, index: number) => (
                  <p key={`safe-${index}`} className="text-xs text-brand-300">{item}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="glass-dark border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-brand-400" /> Sandbox Compatibility Lab
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Versioned internal form scenarios with snapshot-backed contract scoring, selector coverage and regression visibility.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-xl border border-white/5 bg-dark-900 text-sm text-slate-400">
              Avg Score: <span className="text-white font-bold">{sandboxLab?.summary?.averageScore ?? 0}</span>
            </div>
            <div className="px-3 py-2 rounded-xl border border-white/5 bg-dark-900 text-sm text-slate-400">
              Critical: <span className="text-red-300 font-bold">{sandboxLab?.summary?.critical ?? 0}</span>
            </div>
            <button onClick={runSandboxSuite} disabled={runningSandboxSuite} className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
              <Check className="w-4 h-4" /> {runningSandboxSuite ? 'Running...' : 'Run Regression Suite'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Scenario Editor</h3>
              <p className="text-xs text-slate-500 mt-1">Save a versioned sandbox snapshot with its expected contract.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={sandboxScenarioForm.name} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, name: e.target.value }))} className="input-field bg-dark-900" placeholder="name" />
              <input value={sandboxScenarioForm.version} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, version: e.target.value }))} className="input-field bg-dark-900" placeholder="version" />
              <input value={sandboxScenarioForm.stage} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, stage: e.target.value }))} className="input-field bg-dark-900" placeholder="stage" />
              <select value={sandboxScenarioForm.controlKind} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, controlKind: e.target.value }))} className="input-field bg-dark-900">
                <option value="input">input</option>
                <option value="select">select</option>
                <option value="combobox">combobox</option>
                <option value="button">button</option>
              </select>
              <input value={sandboxScenarioForm.label} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, label: e.target.value }))} className="input-field bg-dark-900" placeholder="label" />
              <input value={sandboxScenarioForm.localeHints} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, localeHints: e.target.value }))} className="input-field bg-dark-900" placeholder="locale hints" />
              <input value={sandboxScenarioForm.expectedSelectors} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, expectedSelectors: e.target.value }))} className="input-field bg-dark-900 md:col-span-2" placeholder="expected selectors csv" />
              <input value={sandboxScenarioForm.tags} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, tags: e.target.value }))} className="input-field bg-dark-900 md:col-span-2" placeholder="tags csv" />
            </div>
            <textarea value={sandboxScenarioForm.snapshot} onChange={(e) => setSandboxScenarioForm(prev => ({ ...prev, snapshot: e.target.value }))} rows={8} className="input-field bg-dark-900 font-mono text-xs" />
            <button onClick={saveSandboxScenario} disabled={savingSandboxScenario} className="btn-primary py-2 text-xs flex items-center gap-2 disabled:opacity-50">
              <Check className="w-4 h-4" /> {savingSandboxScenario ? 'Saving...' : 'Save Scenario'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Compatibility Results</h3>
              <p className="text-xs text-slate-500 mt-1">Weakest sandbox scenarios first, scored against current snapshots and expected selectors.</p>
            </div>
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {(sandboxLab?.rows || []).length === 0 ? (
                <div className="text-sm text-slate-500">No sandbox scenarios saved yet.</div>
              ) : (
                (sandboxLab?.rows || []).map((row: any) => (
                  <div key={row.scenarioId} className="rounded-xl border border-white/5 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{row.name}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{row.version} · {row.stage}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-black ${row.contractScore >= 80 ? 'text-emerald-400' : row.contractScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>{row.contractScore}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{row.status}</p>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Coverage {row.selectorCoverage}% {row.topSuggestion ? `· top ${row.topSuggestion}` : ''}
                    </div>
                    {(row.notes || []).length > 0 && (
                      <div className="space-y-1">
                        {row.notes.map((note: string, index: number) => (
                          <p key={`${row.scenarioId}-${index}`} className="text-xs text-slate-300">{note}</p>
                        ))}
                      </div>
                    )}
                    <button onClick={() => deleteSandboxScenario(row.scenarioId)} className="btn-secondary py-1 text-[10px]">
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-dark-950 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Regression History</h3>
            <p className="text-xs text-slate-500 mt-1">Recent suite executions with average score and critical count.</p>
          </div>
          <div className="space-y-3">
            {(sandboxLab?.history || []).length === 0 ? (
              <div className="text-sm text-slate-500">No regression suite runs recorded yet.</div>
            ) : (
              (sandboxLab?.history || []).map((run: any) => (
                <div key={run.id} className="rounded-xl border border-white/5 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-white">{new Date(run.createdAt).toLocaleString()}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {run.summary.total} scenarios · {run.summary.healthy} healthy · {run.summary.warning} warning · {run.summary.critical} critical
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black ${run.summary.averageScore >= 80 ? 'text-emerald-400' : run.summary.averageScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>
                      {run.summary.averageScore}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">avg score</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex border-b border-white/5 gap-8">
        {[
          { id: 'pools', label: 'Proxy Pools', icon: Database },
          { id: 'policies', label: 'Network Policies', icon: Shield },
          { id: 'fingerprints', label: 'Fingerprint Presets', icon: Fingerprint }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 pb-4 text-sm font-bold transition-all relative ${activeTab === tab.id ? 'text-brand-400' : 'text-slate-500 hover:text-white'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'pools' && renderPools()}
            {activeTab === 'policies' && renderPolicies()}
            {activeTab === 'fingerprints' && renderFingerprints()}
          </>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded-2xl flex gap-4">
        <Info className="w-6 h-6 text-brand-400 shrink-0" />
        <div>
          <h4 className="text-brand-400 font-bold uppercase tracking-widest text-xs mb-1">Enterprise Configuration</h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            Settings configured here can be applied at the Profile level or overridden during Task execution in the Task Builder. 
            <strong> Sticky IPs</strong> ensure a profile always uses the same proxy from a pool, while <strong>Round Robin</strong> alternates between available endpoints.
          </p>
        </div>
      </div>
    </div>
  );
}
