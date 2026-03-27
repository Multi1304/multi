import React, { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, ShieldCheck, CheckCircle2, Zap } from 'lucide-react';
import api from '../api/client';
import { toast } from 'react-hot-toast';

export default function Billing() {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/billing').then(res => {
      setInfo(res.data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      toast.error('Failed to load billing information');
    });
  }, []);

  const handleCheckout = async (plan: string) => {
    try {
      const { data } = await api.post('/billing/checkout', { plan });
      window.location.href = data.url;
    } catch {
      toast.error('Checkout failed. Please try again.');
    }
  };

  const handlePortal = async () => {
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.url;
    } catch {
      toast.error('Failed to open billing portal');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const currentPlan = info?.tenant?.plan || 'free';

  const plans = [
    { id: 'free', name: 'Identity Starter', price: '$0', profiles: 'Unlimited Profiles', jobs: '10 Jobs/day', color: 'slate' },
    { id: 'pro', name: 'Professional', price: '$49', profiles: 'Unlimited Profiles', jobs: '5,000 Jobs/day', color: 'brand', popular: true },
    { id: 'enterprise', name: 'Enterprise Hub', price: '$199', profiles: 'Unlimited Profiles', jobs: '50,000 Jobs/day', color: 'purple' },
    { id: 'ultra', name: 'Ultra Deluxe', price: '$499', profiles: 'Unlimited Profiles', jobs: 'Unlimited', color: 'pink' },
  ];

  return (
    <div className="space-y-10 animate-fade-in max-w-7xl mx-auto pb-10">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold text-white mb-2">Manage Your Workspace</h1>
        <p className="text-slate-400 text-lg">Scalable automation plans for every stage of your business</p>
      </div>

      <div className="glass-dark p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 blur-3xl -mr-32 -mt-32 rounded-full group-hover:bg-brand-500/20 transition-all duration-700"></div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Zap className="h-8 w-8 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white uppercase tracking-tight">
                  {plans.find(p => p.id === currentPlan)?.name || currentPlan}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                  {info?.subscription?.status || 'Active'}
                </span>
              </div>
              <p className="text-slate-400 text-sm">
                Status: <span className="text-slate-200">Active</span>
              </p>
            </div>
          </div>
          <button onClick={handlePortal} className="btn-secondary bg-white/5 border-white/10 hover:bg-white/10 flex items-center gap-2 px-6 py-3">
            <ExternalLink className="h-4 w-4" /> Subscription Portal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.id;
          return (
            <div key={plan.id} className={`glass flex flex-col p-6 transition-all duration-300 hover:scale-[1.02] relative ${isCurrent ? 'ring-2 ring-brand-500 bg-brand-500/5' : 'hover:border-white/20'}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-brand-500 text-[10px] font-bold text-white uppercase tracking-wider shadow-lg shadow-brand-500/50">Most Popular</div>
              )}
              <h3 className="text-slate-400 font-medium mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                <span className="text-slate-500 text-sm">/mo</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" /> {plan.profiles}
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" /> {plan.jobs}
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" /> API Access
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" /> Multi-proxy Support
                </li>
              </ul>

              {isCurrent ? (
                <div className="w-full text-center py-3 rounded-xl bg-white/5 text-slate-400 font-bold text-sm">
                  Active Plan
                </div>
              ) : (
                <button 
                  onClick={() => handleCheckout(plan.id)} 
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${plan.color === 'brand' ? 'btn-primary' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  Upgrade Now
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
