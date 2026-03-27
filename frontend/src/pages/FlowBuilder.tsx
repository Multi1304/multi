import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  Connection,
  Edge,
} from '@xyflow/react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Handle, Position } from '@xyflow/react';
import {
  Globe,
  MousePointer2,
  Keyboard,
  Clock,
  Camera,
  Zap,
  Info,
  Save,
  Play,
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles
} from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

const STEP_LIBRARY = [
  { type: 'navigate', label: 'Navigate', icon: Globe, description: 'Go to a URL' },
  { type: 'click', label: 'Click', icon: MousePointer2, description: 'Click an element' },
  { type: 'type', label: 'Type', icon: Keyboard, description: 'Enter text' },
  { type: 'wait', label: 'Wait', icon: Clock, description: 'Pause execution' },
  { type: 'screenshot', label: 'Screenshot', icon: Camera, description: 'Capture page' },
  { type: 'prompt', label: 'Smart Prompt', icon: Sparkles, description: 'AI-generated content' },
  { type: 'waitForSelector', label: 'Wait For Element', icon: Clock, description: 'Wait for visibility' },
  { type: 'conditional', label: 'Conditional', icon: Zap, description: 'If element exists...' },
  { type: 'select', label: 'Select Option', icon: MousePointer2, description: 'Choose from dropdown' },
];

const nodeTypes = {
  customTask: ({ data, selected }: any) => {
    const Icon = data.icon || Zap;
    return (
      <div className={`
        px-4 py-3 rounded-xl border-2 transition-all duration-300 w-48 shadow-lg
        ${data.type === 'prompt' ? 'border-accent-purple bg-accent-purple/10 shadow-accent-purple/20' : selected ? 'border-brand-500 bg-brand-500/10 shadow-brand-500/20' : 'border-white/10 bg-dark-850 shadow-black/40'}
      `}>
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-blue-500 border-none" />
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${selected ? 'bg-blue-500 text-white' : 'bg-white/5 text-blue-400'}`}>
            <Icon size={18} />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/40 mb-0.5">{data.type}</p>
            <p className="text-sm font-semibold truncate text-white/90">{data.label}</p>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-500 border-none" />
      </div>
    );
  }
};

const initialNodes = [
  {
    id: 'start',
    position: { x: 250, y: 50 },
    data: {
      label: 'Start Flow',
      type: 'start',
      icon: Zap,
      url: '',
      selector: '',
      text: '',
      duration: 1000
    },
    type: 'customTask'
  },
];

const initialEdges: Edge[] = [];

export default function FlowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [loading, setLoading] = useState(true);
  const [flowName, setFlowName] = useState('New Flow');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [contractReport, setContractReport] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [flowAccess, setFlowAccess] = useState<any>(null);
  const [flowOperations, setFlowOperations] = useState<any>(null);
  const [flowPromotion, setFlowPromotion] = useState<any>(null);
  const [promotionBusy, setPromotionBusy] = useState<string | null>(null);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [shareTargetUserId, setShareTargetUserId] = useState('');
  const [sharePermission, setSharePermission] = useState('READ');

  useEffect(() => {
    if (id !== 'new') {
      fetchFlow();
    } else {
      setLoading(false);
    }
    fetchTeamUsers();
  }, [id]);

  const fetchTeamUsers = async () => {
    try {
      const { data } = await api.get('/team');
      setTeamUsers(data || []);
    } catch {
      setTeamUsers([]);
    }
  };

  const fetchFlowAccess = async (flowId: string) => {
    try {
      const { data } = await api.get(`/flows/${flowId}/access`);
      setFlowAccess(data);
    } catch {
      setFlowAccess(null);
    }
  };

  const fetchFlowOperations = async (flowId: string) => {
    try {
      const { data } = await api.get(`/flows/${flowId}/operations`);
      setFlowOperations(data);
    } catch {
      setFlowOperations(null);
    }
  };

  const fetchFlow = async () => {
    try {
      const { data } = await api.get(`/flows/${id}`);
      setFlowName(data.name);
      setContractReport(data.contract || null);
      setFlowPromotion(data.promotion || null);
      await fetchFlowAccess(data.id);
      await fetchFlowOperations(data.id);

      // Helper for robust type/params mapping
      const normalizeStep = (step: any) => {
        let type = (step.type || 'wait').toLowerCase().replace(/\s+/g, '_');
        const typeMap: Record<string, string> = {
          'smart_prompt': 'prompt',
          'wait_for_element': 'waitForSelector',
          'select_option': 'select',
          'navigate': 'navigate',
          'type': 'type',
          'click': 'click',
          'wait': 'wait',
          'screenshot': 'screenshot',
          'conditional': 'conditional'
        };
        const normalizedType = typeMap[type] || type;
        const config = {
          ...(step.config || {}),
          ...(step.params || {}),
          ...(step.parameters || {}),
          // Deep recovery: if config contains params/parameters, flatten them
          ...(step.config?.params || {}),
          ...(step.config?.parameters || {})
        };

        // UI-Level Harmonization & Case Normalization
        if (normalizedType === 'conditional' && (config.condition || config.selector)) {
          if (!config.selector && config.condition) {
            const match = config.condition.match(/#[\w-]+|\.[\w-]+/);
            if (match) config.selector = match[0];
          }
        }

        return { normalizedType, config };
      };

      if (data.steps && data.steps.length > 0) {
        const mappedNodes = data.steps.map((step: any, idx: number) => {
          const { normalizedType, config } = normalizeStep(step);
          const libraryItem = STEP_LIBRARY.find(s => s.type === normalizedType);

          return {
            id: step.id || `node_${idx}_${Date.now()}`,
            position: { x: 250, y: 100 + idx * 150 },
            data: {
              ...config,
              // Super-Harmonization: ensure UI keys are always present
              url: config.url || config.targetUrl || config.href || '',
              selector: config.selector || config.id || config.css || '',
              text: config.text || config.prompt || config.value || '',
              prompt: config.prompt || config.text || '',
              type: normalizedType,
              label: config.label || libraryItem?.label || normalizedType,
              icon: libraryItem?.icon || Zap
            },
            type: 'customTask'
          };
        });
        setNodes(mappedNodes);

        const mappedEdges = data.steps.slice(0, -1).map((_: any, idx: number) => ({
          id: `e${idx}-${idx + 1}`,
          source: mappedNodes[idx].id,
          target: mappedNodes[idx + 1].id,
          animated: true,
          style: { stroke: '#3b82f6' }
        }));
        setEdges(mappedEdges);
      }
    } catch (error) {
      toast.error('Failed to load flow');
    } finally {
      setLoading(false);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const buildFlowPayload = () => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const outgoing = new Map<string, string[]>();
    const indegree = new Map<string, number>();

    nodes.forEach((node) => {
      outgoing.set(node.id, []);
      indegree.set(node.id, 0);
    });

    edges.forEach((edge) => {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;
      outgoing.get(edge.source)?.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    });

    const queue = nodes
      .filter((node) => (indegree.get(node.id) || 0) === 0)
      .sort((a, b) => a.position.y - b.position.y);

    const ordered: any[] = [];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current.id)) continue;
      seen.add(current.id);
      ordered.push(current);

      const nextNodes = (outgoing.get(current.id) || [])
        .map((targetId) => nodeMap.get(targetId))
        .filter(Boolean)
        .sort((a: any, b: any) => a.position.y - b.position.y);

      nextNodes.forEach((nextNode: any) => {
        indegree.set(nextNode.id, (indegree.get(nextNode.id) || 0) - 1);
        if ((indegree.get(nextNode.id) || 0) <= 0) {
          queue.push(nextNode);
          queue.sort((a, b) => a.position.y - b.position.y);
        }
      });
    }

    const sortedNodes = [
      ...ordered,
      ...nodes
        .filter((node) => !seen.has(node.id))
        .sort((a, b) => a.position.y - b.position.y)
    ];

    const steps = sortedNodes.map((node, index) => ({
      order: index,
      type: node.data.type || 'action',
      config: {
        ...node.data,
        label: undefined,
        icon: undefined
      }
    }));

    return {
      name: flowName,
      steps
    };
  };

  const validateFlow = async (payloadOverride?: any, variables?: Record<string, any>) => {
    const payload = payloadOverride || buildFlowPayload();
    setValidating(true);
    try {
      const requestBody = variables !== undefined
        ? { steps: payload.steps, variables }
        : { steps: payload.steps };
      const { data } = await api.post('/flows/validate', requestBody);
      setContractReport(data);
      return data;
    } catch (error: any) {
      const report = error?.response?.data;
      if (report?.steps || report?.errors) {
        setContractReport(report);
        return report;
      }
      throw error;
    } finally {
      setValidating(false);
    }
  };

  const saveFlow = async () => {
    try {
      const payload = buildFlowPayload();
      const contract = await validateFlow(payload);
      if (!contract?.valid) {
        toast.error('Fix the flow contract errors before saving');
        return;
      }

      if (id === 'new') {
        const { data } = await api.post('/flows', payload);
        setContractReport(data.contract || contract);
        await fetchFlowAccess(data.id);
        navigate(`/flows/builder/${data.id}`);
        toast.success('Flow created');
      } else {
        const { data } = await api.patch(`/flows/${id}`, payload);
        setContractReport(data.contract || contract);
        await fetchFlowAccess(data.id);
        toast.success('Flow updated');
      }
    } catch (error) {
      toast.error('Failed to save flow');
    }
  };

  const shareFlow = async () => {
    if (id === 'new') return toast.error('Save the flow before sharing it');
    if (!shareTargetUserId) return toast.error('Select a teammate first');
    try {
      toast.loading('Granting flow access...', { id: 'flow-share' });
      await api.post(`/flows/${id}/share`, {
        targetUserId: shareTargetUserId,
        permission: sharePermission,
      });
      toast.success('Flow access updated', { id: 'flow-share' });
      setShareTargetUserId('');
      await fetchFlowAccess(String(id));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to share flow', { id: 'flow-share' });
    }
  };

  const revokeFlowAccess = async (targetUserId?: string) => {
    if (!targetUserId || id === 'new') return;
    try {
      toast.loading('Revoking flow access...', { id: 'flow-revoke' });
      await api.delete(`/flows/${id}/share/${targetUserId}`);
      toast.success('Flow access revoked', { id: 'flow-revoke' });
      await fetchFlowAccess(String(id));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to revoke flow access', { id: 'flow-revoke' });
    }
  };

  const retryFlowRun = async (runId: string) => {
    try {
      toast.loading('Retrying flow run...', { id: `retry-run-${runId}` });
      const { data } = await api.post(`/flows/runs/${runId}/retry`);
      toast.success(data?.deduplicated ? 'Reusing active run' : 'Retry launched', { id: `retry-run-${runId}` });
      if (data?.runId) {
        navigate(`/automation?runId=${encodeURIComponent(data.runId)}`);
        return;
      }
      await fetchFlowOperations(String(id));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to retry flow run', { id: `retry-run-${runId}` });
    }
  };

  const promoteFlow = async (target: 'recommended' | 'default') => {
    if (id === 'new') return toast.error('Save the flow before promoting it');
    try {
      setPromotionBusy(target);
      toast.loading(`Promoting flow as ${target}...`, { id: 'flow-promotion' });
      const { data } = await api.post(`/flows/${id}/promote`, { target });
      setFlowPromotion(data.record || null);
      const reasons = data?.evaluation?.reasons || [];
      if (reasons.length > 0) {
        toast.success(`Flow promoted with ${data.evaluation.score}% score`, { id: 'flow-promotion' });
      } else {
        toast.success(`Flow promoted as ${target}`, { id: 'flow-promotion' });
      }
    } catch (error: any) {
      const reasons = error?.response?.data?.evaluation?.reasons;
      toast.error(
        Array.isArray(reasons) && reasons.length > 0
          ? reasons[0]
          : error?.response?.data?.error || 'Failed to promote flow',
        { id: 'flow-promotion' }
      );
    } finally {
      setPromotionBusy(null);
    }
  };

  const clearFlowPromotion = async () => {
    if (id === 'new') return;
    try {
      setPromotionBusy('clear');
      toast.loading('Clearing flow promotion...', { id: 'flow-promotion-clear' });
      await api.delete(`/flows/${id}/promote`);
      setFlowPromotion(null);
      toast.success('Flow promotion cleared', { id: 'flow-promotion-clear' });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to clear flow promotion', { id: 'flow-promotion-clear' });
    } finally {
      setPromotionBusy(null);
    }
  };

  const runFlow = async () => {
    if (id === 'new') return toast.error('Save flow first');
    try {
      const contract = await validateFlow();
      if (!contract?.valid) {
        toast.error('Flow contract invalid. Review the contract panel first.');
        return;
      }
      toast.loading('Triggering flow...', { id: 'run' });
      const { data } = await api.post(`/flows/${id}/run`);
      const runId = data?.runId;

      if (data?.deduplicated && runId) {
        toast.success('Reusing active flow run', { id: 'run' });
        navigate(`/automation?runId=${encodeURIComponent(runId)}`);
        return;
      }

      if (runId) {
        toast.success('Flow triggered successfully', { id: 'run' });
        navigate(`/automation?runId=${encodeURIComponent(runId)}`);
        return;
      }

      toast.success('Flow triggered successfully', { id: 'run' });
      navigate('/automation');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Trigger failed', { id: 'run' });
    }
  };
  const onNodeClick = (_: any, node: any) => {
    setSelectedNode(node);
  };

  const updateNodeData = (newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          // Harmonize updates: if 'url' changes, also update 'targetUrl' for consistency
          const harmonizedData = { ...newData };
          if (newData.url) harmonizedData.targetUrl = newData.url;
          if (newData.text) harmonizedData.prompt = newData.text;
          if (newData.selector) harmonizedData.css = newData.selector;

          return { ...node, data: { ...node.data, ...harmonizedData } };
        }
        return node;
      })
    );
    setSelectedNode((prev: any) => {
      if (!prev) return prev;
      const harmonizedData = { ...newData };
      if (newData.url) harmonizedData.targetUrl = newData.url;
      if (newData.text) harmonizedData.prompt = newData.text;
      if (newData.selector) harmonizedData.css = newData.selector;
      return { ...prev, data: { ...prev.data, ...harmonizedData } };
    });
  };

  const addNode = (type: string, position?: { x: number, y: number }) => {
    const step = STEP_LIBRARY.find(s => s.type === type);
    const id = `node_${Date.now()}`;
    const newNode: any = {
      id,
      position: position || { x: 250, y: (nodes[nodes.length - 1]?.position?.y || 50) + 100 },
      data: {
        label: step?.label || 'New Step',
        type: type,
        icon: step?.icon,
        url: '',
        selector: '',
        text: '',
        duration: 1000
      },
      type: 'customTask',
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onDragStart = (event: any, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = useCallback(
    (event: any) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = { x: event.clientX - 250, y: event.clientY - 100 };
      addNode(type, position);
    },
    [nodes]
  );

  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const contractErrors = contractReport?.errors || [];
  const contractWarnings = contractReport?.warnings || [];
  const flowRunSummary = flowOperations?.summary || {};
  const builderGuidance: string[] = [];
  if (id === 'new') builderGuidance.push('Save the flow once the contract is valid so Camel can track runs, access and promotion state.');
  if (contractReport && !contractReport.valid) builderGuidance.push(contractErrors[0] || 'The contract is invalid. Fix the blocking error before running or promoting this flow.');
  if (contractReport?.valid && contractWarnings.length > 0) builderGuidance.push(contractWarnings[0]);
  if ((flowRunSummary.retryable || 0) > 0) builderGuidance.push(`${flowRunSummary.retryable} run(s) are retryable. Review the latest failure before redesigning the flow.`);
  if (flowPromotion?.state === 'default' && (flowRunSummary.failed || 0) > 0) builderGuidance.push('This flow is promoted but still failing. Consider moving it back to review if stability drops.');
  if (builderGuidance.length === 0) builderGuidance.push('This flow looks healthy. Validate, save and run it once before promoting it.');

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0c] text-white">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0f0f12]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/automation')} className="p-2 hover:bg-white/5 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="bg-transparent border-none text-xl font-bold focus:ring-0 w-64 uppercase tracking-tight"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => addNode('navigate')}
            className="btn-secondary flex items-center gap-2"
          >
            <Plus size={18} /> Add Step
          </button>
          <button
            onClick={() => promoteFlow('recommended')}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            disabled={id === 'new' || !!promotionBusy}
          >
            <Sparkles size={18} /> {promotionBusy === 'recommended' ? 'Promoting...' : 'Recommend'}
          </button>
          <button
            onClick={() => promoteFlow('default')}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            disabled={id === 'new' || !!promotionBusy}
          >
            <Zap size={18} /> {promotionBusy === 'default' ? 'Promoting...' : 'Set Default'}
          </button>
          <button
            onClick={clearFlowPromotion}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            disabled={id === 'new' || !!promotionBusy || !flowPromotion}
          >
            <Trash2 size={18} /> {promotionBusy === 'clear' ? 'Clearing...' : 'Clear Promotion'}
          </button>
          <button
            onClick={async () => {
              try {
                const report = await validateFlow();
                toast[report?.valid ? 'success' : 'error'](report?.valid ? 'Flow contract looks healthy' : 'Flow contract has errors');
              } catch {
                toast.error('Failed to validate flow');
              }
            }}
            className="btn-secondary flex items-center gap-2"
            disabled={validating}
          >
            <Info size={18} /> {validating ? 'Validating...' : 'Validate'}
          </button>
          <button onClick={saveFlow} className="btn-primary flex items-center gap-2">
            <Save size={18} /> Save
          </button>
          <button onClick={runFlow} className="btn-primary !bg-accent-green flex items-center gap-2 shadow-accent-green/20 disabled:opacity-50" disabled={id === 'new'}>
            <Play size={18} /> Run
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-white/5 bg-[#0d0d10]">
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Builder Guidance</p>
            <p className="text-sm font-bold text-white mt-2">
              {flowName || 'Untitled flow'} has {nodes.length} step{nodes.length === 1 ? '' : 's'} and is {contractReport ? (contractReport.valid ? 'ready to validate and run.' : 'currently blocked by contract issues.') : 'not validated yet.'}
            </p>
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
              {builderGuidance.map((item, index) => (
                <p key={`builder-guidance-${index}`} className="text-sm text-slate-300">
                  {index + 1}. {item}
                </p>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/5 bg-[#131318] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Contract</p>
              <p className={`text-sm font-black mt-2 ${contractReport?.valid ? 'text-emerald-400' : contractReport ? 'text-red-400' : 'text-amber-400'}`}>
                {contractReport ? (contractReport.valid ? 'Valid' : 'Invalid') : 'Pending'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-[#131318] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Warnings</p>
              <p className="text-sm font-black text-white mt-2">{contractWarnings.length}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-[#131318] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Runs</p>
              <p className="text-sm font-black text-white mt-2">{flowRunSummary.totalRuns || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-[#131318] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Retryable</p>
              <p className={`text-sm font-black mt-2 ${(flowRunSummary.retryable || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {flowRunSummary.retryable || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Builder Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Step Library Palette */}
        <aside className="w-64 border-r border-white/10 bg-[#0f0f12] p-6 overflow-y-auto">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-lg font-bold">Step Library</h2>
            <div className="group relative">
              <Info size={14} className="text-white/20 hover:text-white cursor-help" />
              <div className="absolute left-full ml-2 top-0 w-48 p-2 bg-dark-800 border border-white/10 rounded-lg text-[10px] text-white/60 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl">
                Drag and drop steps onto the canvas to build your automation flow.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {STEP_LIBRARY.map((step) => (
              <div
                key={step.type}
                draggable
                onDragStart={(e) => onDragStart(e, step.type)}
                className="flex items-start gap-4 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all cursor-grab active:cursor-grabbing group"
              >
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <step.icon size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/90">{step.label}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-tight">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas Area */}
        <div className="flex-1 relative bg-[#0a0a0c]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
          >
            <Controls />
            <MiniMap className="!bg-[#1a1a20] !border-white/10" />
            <Background gap={25} size={1} color="#222" />
            <Panel position="top-right" className="bg-[#1a1a20]/80 backdrop-blur-md p-4 border border-white/10 rounded-xl shadow-2xl max-w-xs">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2 text-blue-400">
                <Zap size={14} /> Quick Guide
              </h3>
              <ul className="space-y-2 text-[11px] text-white/60">
                <li>• Drag nodes to arrange the story of the flow, then validate to confirm the real execution contract.</li>
                <li>• Connect dots only when the step order should be explicit. The builder still sorts disconnected nodes safely when saving.</li>
                <li>• If the flow was already working and only recent runs fail, inspect retries and the contract panel before redesigning everything.</li>
              </ul>
            </Panel>
            <Panel position="top-left" className="bg-[#1a1a20]/85 backdrop-blur-md p-4 border border-white/10 rounded-xl shadow-2xl max-w-sm">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2 text-emerald-400">
                <Info size={14} /> Flow Contract
              </h3>
              <div className="space-y-2 text-[11px] text-white/70">
                <p>Status: <span className={contractReport?.valid ? 'text-emerald-300' : 'text-red-300'}>{contractReport ? (contractReport.valid ? 'Valid' : 'Invalid') : 'Not validated'}</span></p>
                <p>States: {contractReport?.states?.length || 0}</p>
                <p>Warnings: {contractReport?.warnings?.length || 0}</p>
                <p>Errors: {contractReport?.errors?.length || 0}</p>
                {contractReport?.errors?.slice(0, 2)?.map((error: string, index: number) => (
                  <p key={`contract-error-${index}`} className="text-red-300">{error}</p>
                ))}
                {contractReport?.warnings?.slice(0, 2)?.map((warning: string, index: number) => (
                  <p key={`contract-warning-${index}`} className="text-amber-300">{warning}</p>
                ))}
              </div>
              {id !== 'new' && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-fuchsia-400">Promotion</h4>
                  {flowPromotion ? (
                    <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 p-3">
                      <p className="text-[11px] font-bold text-white">{flowPromotion.state}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Score {flowPromotion.score ?? 0} · {flowPromotion.promotedBy ? `by ${flowPromotion.promotedBy}` : 'manual'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {flowPromotion.promotedAt ? new Date(flowPromotion.promotedAt).toLocaleString() : 'No timestamp'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">This flow is not promoted yet.</p>
                  )}
                </div>
              )}
              {id !== 'new' && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-cyan-400">Flow Operations</h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70">
                    <p>Total Runs: <span className="text-white">{flowOperations?.summary?.totalRuns || 0}</span></p>
                    <p>Running: <span className="text-cyan-300">{flowOperations?.summary?.running || 0}</span></p>
                    <p>Failed: <span className="text-red-300">{flowOperations?.summary?.failed || 0}</span></p>
                    <p>Retryable: <span className="text-amber-300">{flowOperations?.summary?.retryable || 0}</span></p>
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {(flowOperations?.runs || []).length === 0 ? (
                      <p className="text-[11px] text-slate-500">No runs recorded for this flow yet.</p>
                    ) : (
                      flowOperations.runs.slice(0, 5).map((run: any) => (
                        <div key={run.id} className="rounded-lg border border-white/10 bg-dark-950 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold text-white">{run.id.slice(0, 8)} · {run.status}</p>
                              <p className="text-[10px] text-slate-500 mt-1">
                                {new Date(run.createdAt).toLocaleString()} · {run.analysis?.errorClass || 'none'}
                              </p>
                            </div>
                            {run.status === 'failed' && (
                              <button
                                onClick={() => retryFlowRun(run.id)}
                                className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {id !== 'new' && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-brand-400">Flow Access</h4>
                  <p className="text-[11px] text-white/60">
                    Effective: {(flowAccess?.effectivePermissions || []).join(', ') || 'none'}
                  </p>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                    <select
                      value={shareTargetUserId}
                      onChange={(e) => setShareTargetUserId(e.target.value)}
                      className="bg-dark-950 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-slate-200"
                    >
                      <option value="">Select teammate</option>
                      {teamUsers.map((user: any) => (
                        <option key={user.id} value={user.id}>
                          {user.email} · {user.role}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sharePermission}
                      onChange={(e) => setSharePermission(e.target.value)}
                      className="bg-dark-950 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-slate-200"
                    >
                      <option value="READ">READ</option>
                      <option value="WRITE">WRITE</option>
                      <option value="EXECUTE">EXECUTE</option>
                    </select>
                    <button onClick={shareFlow} className="px-3 py-2 rounded-lg bg-brand-500/10 text-brand-300 text-[11px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all">
                      Share
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {(flowAccess?.grants || []).length === 0 ? (
                      <p className="text-[11px] text-slate-500">No explicit flow grants.</p>
                    ) : (
                      flowAccess.grants.map((grant: any) => (
                        <div key={grant.id} className="rounded-lg border border-white/10 bg-dark-950 p-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold text-white">{grant.user?.email || grant.user?.id}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{grant.permission} · {grant.user?.role || 'member'}</p>
                          </div>
                          <button
                            onClick={() => revokeFlowAccess(grant.user?.id)}
                            className="px-2 py-1 rounded bg-red-500/10 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                          >
                            Revoke
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </ReactFlow>
        </div>

        {/* Side Panel for Config */}
        {selectedNode && (
          <aside className="w-80 border-l border-white/10 bg-[#0f0f12] p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Step Config</h2>
              <button onClick={() => setSelectedNode(null)} className="text-white/40 hover:text-white p-1 hover:bg-white/5 rounded">✕</button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Step Name</label>
                <input
                  type="text"
                  value={selectedNode.data.label}
                  onChange={(e) => updateNodeData({ label: e.target.value })}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Platform Action</label>
                <select
                  value={selectedNode.data.type || 'navigate'}
                  onChange={(e) => updateNodeData({ type: e.target.value })}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                >
                  <option value="navigate">Navigate</option>
                  <option value="click">Click</option>
                  <option value="type">Type</option>
                  <option value="wait">Wait</option>
                  <option value="screenshot">Screenshot</option>
                  <option value="prompt">Smart Prompt (AI)</option>
                  <option value="waitForSelector">Wait For Element</option>
                  <option value="conditional">Conditional Logic</option>
                  <option value="select">Select Option</option>
                </select>
              </div>

              {selectedNode.data.type === 'navigate' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Target URL</label>
                  <input
                    type="text"
                    placeholder="https://example.com"
                    value={selectedNode.data.url || selectedNode.data.targetUrl || selectedNode.data.href || ''}
                    onChange={(e) => updateNodeData({ url: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                  />
                </div>
              )}

              {['click', 'type', 'waitForSelector', 'select'].includes(selectedNode.data.type) && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Element Selector</label>
                  <input
                    type="text"
                    placeholder="button#submit | .login-btn"
                    value={selectedNode.data.selector || selectedNode.data.id || selectedNode.data.css || ''}
                    onChange={(e) => updateNodeData({ selector: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                  />
                </div>
              )}

              {selectedNode.data.type === 'select' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Option Value</label>
                  <input
                    type="text"
                    placeholder="Value to select"
                    value={selectedNode.data.value || selectedNode.data.optionValue || ''}
                    onChange={(e) => updateNodeData({ value: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                  />
                </div>
              )}

              {selectedNode.data.type === 'conditional' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Logical Condition</label>
                  <input
                    type="text"
                    placeholder="e.g. if element #recaptcha exists"
                    value={selectedNode.data.condition || ''}
                    onChange={(e) => updateNodeData({ condition: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200 mb-4"
                  />
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Fallback Selector (Optional)</label>
                  <input
                    type="text"
                    placeholder="button#submit | .login-btn"
                    value={selectedNode.data.selector || selectedNode.data.id || selectedNode.data.css || ''}
                    onChange={(e) => updateNodeData({ selector: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                  />
                  <p className="mt-4 text-[10px] text-brand-400 font-bold uppercase italic">Advanced Conditional Logic Enabled</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">If the selector above exists, Camel runs the steps defined in `trueSteps`; otherwise it runs `falseSteps`. Edit the JSON directly for more advanced branching.</p>
                </div>
              )}

              {['type', 'prompt'].includes(selectedNode.data.type) && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Input Content</label>
                  <textarea
                    value={selectedNode.data.text || selectedNode.data.prompt || selectedNode.data.value || ''}
                    onChange={(e) => updateNodeData({ text: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all min-h-[100px] resize-none text-slate-200"
                    placeholder={selectedNode.data.type === 'prompt' ? "Enter instructions for AI (for example: 'Generate a short positive comment about Camel')" : "Type message here..."}
                  />
                </div>
              )}

              {selectedNode.data.type === 'prompt' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-4">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">AI Engine</label>
                  <select
                    value={selectedNode.data.engine || 'gpt-4'}
                    onChange={(e) => updateNodeData({ engine: e.target.value })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent-purple/50 outline-none transition-all text-slate-200"
                  >
                    <option value="gpt-4">GPT-4 Turbo</option>
                    <option value="claude-3">Claude 3 Opus</option>
                    <option value="grok-1">Grok-1</option>
                  </select>
                  <p className="mt-2 text-[10px] text-purple-400 font-medium italic">AI uses the current profile context to personalize the output.</p>
                </div>
              )}

              {selectedNode.data.type === 'wait' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Delay (ms)</label>
                  <input
                    type="number"
                    value={selectedNode.data.duration || 1000}
                    step={100}
                    onChange={(e) => updateNodeData({ duration: parseInt(e.target.value) })}
                    className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/50 outline-none transition-all text-slate-200"
                  />
                </div>
              )}
            </div>

            <div className="mt-10 pt-6 border-t border-white/5">
              <button
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                  setSelectedNode(null);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all text-xs font-bold uppercase tracking-widest border border-red-500/20 shadow-lg shadow-red-500/5 group"
              >
                <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Delete Step
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
