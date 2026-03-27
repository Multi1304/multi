import React, { useEffect, useState } from 'react';
import { Settings, Shield, HardDrive, Save, X, Globe, Info, Zap, Cpu } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface ProfilesManagerProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProfilesManager({ onClose, onSuccess }: ProfilesManagerProps) {
  const [profileName, setProfileName] = useState('');
  const [platform, setPlatform] = useState('DESKTOP');
  const [hardwareConcurrency, setHardwareConcurrency] = useState(8);
  const [canvasSeed, setCanvasSeed] = useState<string | number>(Math.floor(Math.random() * 1000000));
  const [webglVendor, setWebglVendor] = useState('Google Inc.');
  const [webglRenderer, setWebglRenderer] = useState('ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)');
  const [proxy, setProxy] = useState('');
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [humanMode, setHumanMode] = useState(true);
  const [productionMode, setProductionMode] = useState(true);
  const [prioritizeEthernet, setPrioritizeEthernet] = useState(true);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data } = await api.get('/templates/list');
        setTemplates(data);
      } catch {
        console.error('Failed to load templates');
      }
    };
    fetchTemplates();
  }, []);

  const handleLoadTemplate = async (plat: string) => {
    if (!plat) return;
    setSelectedTemplate(plat);
    try {
      const { data } = await api.get(`/templates/${plat}`);
      setProfileName(`${data.name} - ${new Date().toLocaleTimeString()}`);
      setHardwareConcurrency(data.hwConcurrency || 8);
      setCanvasSeed(data.canvasSeed);
      setWebglVendor(data.webglVendor || 'Google Inc.');
      setWebglRenderer(data.webglRenderer || '');
      setProxy(data.proxies || '');
      setTimezone(data.timezone || 'Europe/Madrid');
      toast.success(`Plantilla ${plat} cargada con exito`);
    } catch {
      toast.error('Error al cargar la plantilla');
    }
  };

  const handleSaveCustomTemplate = async () => {
    if (!profileName) {
      toast.error('Por favor, indica un nombre para la plantilla');
      return;
    }

    setLoading(true);
    try {
      await api.post('/templates/custom', {
        name: `${profileName} (Custom)`,
        platform,
        config: {
          hardwareConcurrency,
          canvasSeed,
          webglVendor,
          webglRenderer,
          proxy,
          timezone,
          humanMode,
          productionMode,
          prioritizeEthernet,
        }
      });
      toast.success('Plantilla personalizada guardada en la base de datos');
    } catch {
      toast.error('Error al guardar plantilla personalizada');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = useAuthStore.getState().token;
      await api.post('/profiles', {
        name: profileName,
        platform,
        config: {
          hardwareConcurrency,
          canvasSeed,
          webglVendor,
          webglRenderer,
          proxy,
          productionMode,
          runtimeEnvironment: productionMode ? 'production' : 'sandbox',
        }
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to create advanced profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-dark-900/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-dark-700 flex justify-between items-center bg-dark-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-500" />
              Advanced Profile Manager
            </h2>
            <p className="text-sm text-slate-400 mt-1">Configure fingerprint hints, rendering parameters, and runtime behavior for advanced profiles.</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-dark-900/50">
          <form id="profileForm" onSubmit={handleSubmit} className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4 text-brand-500" /> Platform Templates
                </h3>
                <div className="flex items-center gap-2 group relative">
                  <Info className="w-4 h-4 text-slate-500 cursor-help" />
                  <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-dark-800 border border-brand-500/30 rounded-xl text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                    Plantillas reutilizables con user agents, canvas noise y valores WebGL preconfigurados para acelerar pruebas y perfiles base.
                  </div>
                </div>
              </div>

              <div className="bg-brand-500/5 p-4 rounded-xl border border-brand-500/10 space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Cargar Plantilla por Plataforma</label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => handleLoadTemplate(e.target.value)}
                      className="input-field bg-dark-900 border-brand-500/20 text-brand-400 font-bold"
                    >
                      <option value="">Selecciona una plataforma...</option>
                      {templates.map((t) => (
                        <option key={t} value={t}>{t.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col justify-end">
                    <button
                      type="button"
                      onClick={handleSaveCustomTemplate}
                      className="btn-secondary h-[42px] gap-2 border-brand-500/20 text-brand-400 hover:bg-brand-500/10"
                    >
                      <Save className="w-4 h-4" /> Guardar como Personalizada
                    </button>
                  </div>
                </div>
                <div className="bg-brand-500/10 p-3 rounded-lg border border-brand-500/20 flex items-start gap-3">
                  <Zap className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-brand-200 font-medium leading-relaxed">
                    <span className="font-bold text-white block mb-1">Plantillas operativas:</span>
                    Estas plantillas aplican valores preconfigurados y variantes heuristicas para reducir configuracion manual, pero siguen necesitando validacion real por plataforma y flujo.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-500" /> Identity & Engine
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Profile Name</label>
                  <input required type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} className="input-field" placeholder="e.g. Scraper Node A" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Platform Engine</label>
                  <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input-field bg-dark-800">
                    <option value="DESKTOP">Desktop (Windows/Mac/Linux)</option>
                    <option value="MOBILE">Mobile First (iOS/Android)</option>
                    <option value="VISION_PRO">Apple Vision Pro (VR/AR)</option>
                    <option value="OCULUS">Meta Quest (VR/AR)</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Globe className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Network Interface Preference</h4>
                    <p className="text-[10px] text-blue-400">Intenta priorizar una interfaz fisica cuando este disponible.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={prioritizeEthernet} onChange={(e) => setPrioritizeEthernet(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400">
                Si el host expone una interfaz fisica utilizable, el runtime intenta usarla como afinidad de red. Es una optimizacion best-effort, no una garantia de binding profundo.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-500" /> Hardware & Rendering Hints
              </h3>
              <div className="grid grid-cols-2 gap-4 bg-dark-800/50 p-4 rounded-xl border border-white/5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                    CPU Cores <Cpu className="w-3 h-3" />
                  </label>
                  <input type="number" min="2" max="32" value={hardwareConcurrency} onChange={(e) => setHardwareConcurrency(parseInt(e.target.value, 10))} className="input-field bg-dark-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Canvas Noise Seed</label>
                  <div className="flex gap-2">
                    <input type="text" value={canvasSeed} onChange={(e) => setCanvasSeed(e.target.value)} className="input-field bg-dark-900 font-mono text-sm" />
                    <button type="button" onClick={() => setCanvasSeed(`0x${Math.floor(Math.random() * 0xFFFFFF).toString(16)}_seed`)} className="btn-secondary px-3">Mix</button>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">WebGL Vendor</label>
                  <input type="text" value={webglVendor} onChange={(e) => setWebglVendor(e.target.value)} className="input-field bg-dark-900 font-mono text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">WebGL Renderer</label>
                  <input type="text" value={webglRenderer} onChange={(e) => setWebglRenderer(e.target.value)} className="input-field bg-dark-900 font-mono text-sm" />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-500" /> Proxy & Runtime Behavior
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Proxy Node URI / Pool</label>
                  <input type="text" value={proxy} onChange={(e) => setProxy(e.target.value)} className="input-field bg-dark-800" placeholder="socks5://127.0.0.1:9050 or Pool: residenciales_tier1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Timezone Override</label>
                    <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input-field bg-dark-800 font-mono" />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input type="checkbox" checked={humanMode} onChange={(e) => setHumanMode(e.target.checked)} className="sr-only peer" />
                        <div className="w-10 h-5 bg-dark-700 rounded-full peer peer-checked:bg-brand-500 transition-all"></div>
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-all"></div>
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase group-hover:text-white transition-colors">Human-like Heuristics</span>
                    </label>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-widest">Production Mode</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Enabled by default. Uses production-grade session persistence and runtime adapters for owned or allowlisted environments.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={productionMode} onChange={(e) => setProductionMode(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>
            </section>
          </form>
        </div>

        <div className="p-4 border-t border-dark-700 bg-dark-800 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">Discard</button>
          <button type="submit" form="profileForm" disabled={loading} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {loading ? 'Compiling Profile...' : 'Finalize Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
