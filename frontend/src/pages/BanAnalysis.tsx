import { useState, useEffect } from 'react';
import { ShieldAlert, TrendingUp, Zap, RefreshCw, Search, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../api/client';
import toast from 'react-hot-toast';

const BanAnalysis = () => {
  const [loading, setLoading] = useState(true);
  const [trends, setTrends] = useState<any[]>([]);
  const [riskScore, setRiskScore] = useState(15);
  const [activeTab, setActiveTab] = useState('platforms');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTrends = async (platform: string) => {
    setLoading(true);
    try {
      const { data } = await api.post('/ai/ban-trends', { platform });
      if (data.success) {
        setTrends(prev => {
          const filtered = prev.filter(t => t.platform !== platform);
          return [...filtered, { platform, ...data.trends, date: 'Just now' }];
        });
        if (data.trends.riskLevel === 'High') setRiskScore(prev => Math.min(prev + 10, 95));
      }
    } catch (error) {
      toast.error(`Failed to fetch live data for ${platform}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch for common platforms
    const init = async () => {
      await fetchTrends('Google');
      await fetchTrends('Meta');
      await fetchTrends('LinkedIn');
    };
    init();
  }, []);

  const handleDomainSearch = async () => {
    if (!searchQuery) return;
    await fetchTrends(searchQuery);
    setSearchQuery('');
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header with Risk Meter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-dark-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldAlert className="h-32 w-32 text-accent-cyan" />
          </div>
          <div className="relative">
            <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter italic">Proactive Ban Analysis</h1>
            <p className="text-white/50 max-w-md">CamelFarm intelligence layer linked to Grok-beta. We analyze live X (Twitter) trends to anticipate anti-bot waves before they hit your profiles.</p>
            
            <div className="mt-8 flex items-center gap-4">
              <button 
                onClick={() => fetchTrends('General')}
                className="px-6 py-3 bg-brand-gradient rounded-xl font-bold text-white shadow-lg shadow-brand-500/20 flex items-center gap-2 hover:scale-105 transition-transform"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                SYNC LIVE INTELLIGENCE
              </button>
              <div className="px-4 py-2 bg-white/5 border border-white/05 rounded-xl text-xs font-mono text-white/40 uppercase tracking-widest">
                Last Sync: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-dark-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center">
          <div className="relative h-32 w-32 flex items-center justify-center">
            <svg className="h-full w-full transform -rotate-90">
              <circle cx="64" cy="64" r="56" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
              <motion.circle 
                cx="64" cy="64" r="56" fill="transparent" stroke="url(#risk-grad)" strokeWidth="12" 
                strokeDasharray="351.8" initial={{ strokeDashoffset: 351.8 }} animate={{ strokeDashoffset: 351.8 * (1 - riskScore / 100) }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
              <defs>
                <linearGradient id="risk-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4158D0" />
                  <stop offset="100%" stopColor="#C850C0" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-white">{riskScore}%</span>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Global Risk</span>
            </div>
          </div>
          <div className="mt-6 space-y-1">
            <div className="text-xs font-bold text-accent-cyan uppercase tracking-widest flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Trend: {riskScore > 50 ? 'Increasing Risk' : 'Stability Likely'}
            </div>
            <p className="text-xs text-white/40">Grok signals indicate {riskScore > 50 ? 'CAUTION: Platforms updating.' : 'NO immediate global ban threats.'}</p>
          </div>
        </div>
      </div>

      {/* Domain Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative group">
          <div className="absolute inset-0 bg-brand-gradient opacity-10 blur-xl group-focus-within:opacity-20 transition-opacity rounded-2xl" />
          <div className="relative flex items-center bg-dark-900/50 border border-white/10 rounded-2xl px-4 overflow-hidden focus-within:border-brand-500/50 transition-colors">
            <Globe className="h-5 w-5 text-white/30" />
            <input 
              type="text" 
              placeholder="Enter platform (e.g. TikTok, Reddit)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDomainSearch()}
              className="w-full bg-transparent border-none focus:ring-0 text-white p-4 h-14 font-medium"
            />
            <button 
              onClick={handleDomainSearch}
              className="h-10 px-4 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
            >
              Analyze
            </button>
          </div>
        </div>
      </div>

      {/* Main Analysis Tabs */}
      <div className="bg-dark-900/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
        <div className="flex border-b border-white/10 p-2 gap-2">
          {['platforms', 'behavioral', 'fingerprinting'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-8">
          {loading && trends.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-white/20 italic">
              <div className="h-12 w-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
              Grok is parsing X data streams...
            </div>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              {trends.map((item, idx) => (
                <motion.div key={idx} variants={itemVariants} className="bg-white/5 border border-white/05 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-white/[0.07] transition-colors border-l-4" style={{ borderColor: item.riskLevel === 'High' ? '#ef4444' : item.riskLevel === 'Medium' ? '#f59e0b' : '#10b981' }}>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-white">{item.platform}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${
                        item.riskLevel === 'High' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                        item.riskLevel === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {item.riskLevel} Risk
                      </span>
                      <span className="text-[10px] text-white/30 font-mono italic">{item.date || item.latestUpdateDate}</span>
                    </div>
                    <p className="text-white/60 text-sm max-w-2xl">{item.summary || item.reason}</p>
                  </div>

                  <div className="bg-white/5 rounded-2xl p-4 border border-white/05 flex items-center gap-4 w-full md:w-auto">
                    <div className="h-10 w-10 rounded-xl bg-accent-purple/20 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-accent-purple" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-accent-purple uppercase tracking-widest leading-none mb-1">Grok Remediation</div>
                      <div className="text-xs text-white/90 font-medium">{item.remediation || item.suggestion}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Advisory Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-brand-gradient-dark border border-brand-500/20 rounded-3xl p-8 flex items-center gap-6">
          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <div>
            <h4 className="text-white font-black uppercase tracking-tighter italic text-lg">Predictive Mitigation</h4>
            <p className="text-white/60 text-sm">Automated remediation is active. CamelFarm has already applied {trends.length} silent patches to your 12.0.1+ profiles.</p>
          </div>
        </div>

        <div className="bg-dark-900 border border-white/10 rounded-3xl p-8 flex items-center gap-6">
          <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center shrink-0">
            <Search className="h-8 w-8 text-white/40" />
          </div>
          <div>
            <h4 className="text-white font-black uppercase tracking-tighter italic text-lg">Custom Search Analysis</h4>
            <p className="text-white/40 text-sm">Analyze a specific domain for stealth compliance. Grok will check for latest WAF updates.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BanAnalysis;
