import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, Server, Key, Flag, Zap, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'workspace', label: 'Workspace Setup' },
  { id: 'security', label: 'Security & Ops' },
  { id: 'complete', label: 'Ready to Go' }
];

export default function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Form State
  const [workspaceName, setWorkspaceName] = useState('My First Workspace');
  const [plan, setPlan] = useState('PRO');

  const handleNext = async () => {
    if (currentStep === STEPS.length - 1) {
      setLoading(true);
      // Simulate API call for finalizing onboarding setup
      setTimeout(() => {
        toast.success('Onboarding complete! Welcome to Multilogin Ultra Deluxe.');
        navigate('/dashboard');
      }, 1500);
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const currentStepData = STEPS[currentStep];

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ornaments */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-2xl z-10">
        
        {/* Progress Tracker */}
        <div className="mb-12 relative flex items-center justify-between before:absolute before:inset-0 before:top-1/2 before:-translate-y-1/2 before:h-0.5 before:bg-dark-800 before:-z-10">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep;
            return (
              <div key={step.id} className="flex flex-col items-center gap-3 bg-dark-950 px-2 relative z-10">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors font-bold text-sm ${
                  isCompleted 
                    ? 'bg-brand-500 border-brand-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                    : isCurrent
                      ? 'bg-dark-900 border-brand-500 text-brand-400'
                      : 'bg-dark-900 border-dark-700 text-slate-600'
                }`}>
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${isCurrent ? 'text-white' : isCompleted ? 'text-brand-400' : 'text-slate-600'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Form Container */}
        <div className="glass-dark border border-white/10 p-8 md:p-12 rounded-3xl shadow-2xl animate-fade-in relative overflow-hidden">
            {currentStepData.id === 'welcome' && (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-brand-gradient rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-brand-500/20 mb-8">
                  <Zap className="h-10 w-10 text-white fill-white" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">Welcome to Ultra Deluxe</h1>
                <p className="text-slate-400 text-lg max-w-md mx-auto">
                  You are about to experience the industry's most advanced multi-session automation engine. Let's get your environment configured.
                </p>
              </div>
            )}

            {currentStepData.id === 'workspace' && (
              <div className="space-y-8 animate-slide-up">
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white mb-2">Configure Workspace</h2>
                  <p className="text-slate-400">Establish your operational boundary.</p>
                </div>

                <div className="space-y-6 max-w-md mx-auto">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Workspace Name</label>
                    <input 
                      type="text" 
                      value={workspaceName}
                      onChange={e => setWorkspaceName(e.target.value)}
                      className="w-full bg-dark-900 border border-dark-700 text-white focus:border-brand-500 rounded-xl px-4 py-4 outline-none transition-colors text-lg font-bold" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Intended Usage Plan</label>
                    <div className="grid grid-cols-2 gap-4">
                      {['PRO', 'ULTRA'].map(p => (
                        <button 
                          key={p}
                          onClick={() => setPlan(p)}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            plan === p 
                              ? 'border-brand-500 bg-brand-500/10' 
                              : 'border-dark-800 bg-dark-900 hover:border-dark-600'
                          }`}
                        >
                          <div className={`text-sm font-black mb-1 flex items-center justify-between ${plan === p ? 'text-brand-400' : 'text-slate-400'}`}>
                             {p}
                             {plan === p && <CheckCircle2 className="w-4 h-4" />}
                          </div>
                          <div className="text-xs text-slate-500">{p === 'PRO' ? 'Unlimited Profiles, Accounts & Seats' : 'Unlimited Scale'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStepData.id === 'security' && (
              <div className="space-y-8 animate-slide-up">
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white mb-2">Security & Isolation</h2>
                  <p className="text-slate-400">By default, V1 applies extreme isolation parameters.</p>
                </div>

                <div className="space-y-4 max-w-md mx-auto">
                  <div className="p-4 bg-dark-900 rounded-xl border border-dark-800 flex items-start gap-4">
                    <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400 mt-1"><Server className="w-5 h-5" /></div>
                    <div>
                      <h4 className="text-white font-bold">Encrypted Storage</h4>
                      <p className="text-xs text-slate-400 mt-1 pb-1">All cookies and proxy credentials are encrypted at rest using AES-256-GCM.</p>
                    </div>
                  </div>
                  <div className="p-4 bg-dark-900 rounded-xl border border-dark-800 flex items-start gap-4">
                    <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400 mt-1"><Flag className="w-5 h-5" /></div>
                    <div>
                      <h4 className="text-white font-bold">Hardware Fingerprinting</h4>
                      <p className="text-xs text-slate-400 mt-1 pb-1">WebRTC, Canvas, WebGL spoofing is automatically injected into all profiles.</p>
                    </div>
                  </div>
                  <div className="p-4 bg-dark-900 rounded-xl border border-dark-800 flex items-start gap-4">
                    <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400 mt-1"><Key className="w-5 h-5" /></div>
                    <div>
                      <h4 className="text-white font-bold">API Key Access</h4>
                      <p className="text-xs text-slate-400 mt-1 pb-1">Generate automation keys later in Settings.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStepData.id === 'complete' && (
              <div className="text-center space-y-6 animate-slide-up">
                <div className="w-24 h-24 bg-green-500/10 rounded-full mx-auto flex items-center justify-center mb-4">
                  <ShieldCheck className="h-12 w-12 text-green-400" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">Setup Finalized</h1>
                <p className="text-slate-400 text-base max-w-sm mx-auto p-4 bg-dark-900 border border-dark-800 rounded-xl">
                  Your tenant <strong>{workspaceName}</strong> ({plan}) is provisioned and securely isolated from other workspaces.
                </p>
              </div>
            )}

            {/* Action Bar */}
            <div className="mt-12 pt-8 border-t border-white/5 flex justify-between items-center bg-dark-950/20 rounded-b-3xl">
              {currentStep > 0 && currentStep !== STEPS.length - 1 ? (
                <button 
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Back
                </button>
              ) : <div />}
              
              <button 
                onClick={handleNext}
                disabled={loading || (currentStep === 1 && !workspaceName.trim())}
                className="btn-primary ml-auto py-3 px-8 text-base shadow-lg shadow-brand-500/20 group uppercase tracking-wider relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                {loading ? <Loader2 className="w-5 h-5 animate-spin relative z-10" /> : (
                   <div className="flex items-center gap-2 relative z-10">
                     {currentStep === STEPS.length - 1 ? 'Launch Dashboard' : 'Continue'} 
                     <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                   </div>
                )}
              </button>
            </div>
        </div>
        
      </div>
    </div>
  );
}
