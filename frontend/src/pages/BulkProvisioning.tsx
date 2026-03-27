import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download, Copy, RefreshCw } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function BulkProvisioning() {
  const [step, setStep] = useState(1);
  const [csvContent, setCsvContent] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Simulation of CSV parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      
      // Super naive CSV parser for preview purposes
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      const data = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
          name: parts[0]?.trim() || 'Untitled',
          proxyType: parts[1]?.trim() || 'none',
        };
      });
      setParsedData(data.filter(d => d.name !== 'Untitled'));
      toast.success(`Loaded ${data.length} rows`);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = 'Profile Name,Proxy Type,Proxy Host,Proxy Port,Proxy Username,Proxy Password\nProfile 1,http,192.168.1.1,8080,user,pass\nProfile 2,none,,,,';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multilogin_profiles_template.csv';
    a.click();
  };

  const handleValidate = async () => {
    setLoading(true);
    try {
      const profiles = parsedData.map(p => ({
        name: p.name,
        proxy: { type: p.proxyType === 'none' ? 'none' : 'http' }
      }));

      const { data } = await api.post('/bulk/validate', { profiles });
      setValidationResult(data);
      toast.success('Validation passed');
      setStep(3);
    } catch (err: any) {
      toast.error('Validation failed based on schema rules');
      setValidationResult({ valid: false, error: err.response?.data?.error });
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    try {
      const profiles = parsedData.map(p => ({
        name: p.name,
        proxy: { type: p.proxyType === 'none' ? 'none' : 'http' }
      }));
      
      const { data } = await api.post('/bulk/profiles', { profiles });
      setOperationId(data.operationId);
      toast.success('Bulk operation started');
      setStep(4);
      pollOperation(data.operationId);
    } catch (err: any) {
      toast.error('Failed to start bulk provisioning');
    } finally {
      setLoading(false);
    }
  };

  const pollOperation = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/bulk/operations/${id}`);
        setOperationStatus(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <Copy className="h-8 w-8 text-brand-400" />
          Bulk Provisioning
        </h1>
        <p className="text-slate-400 font-medium">Create and configure thousands of profiles at once</p>
      </div>

      <div className="flex items-center gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`flex-1 h-2 rounded-full transition-colors ${step >= i ? 'bg-brand-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-dark-800'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="glass-dark border border-white/5 shadow-2xl p-12 text-center rounded-2xl">
          <Upload className="mx-auto h-16 w-16 text-slate-500 mb-6" />
          <h2 className="text-xl font-bold text-white mb-2">Upload CSV Data</h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">Upload a CSV file containing profile configurations. Download our template to ensure correct formatting.</p>
          
          <div className="flex justify-center gap-4">
            <button onClick={downloadTemplate} className="btn-secondary px-6 flex items-center gap-2">
              <Download className="w-4 h-4" /> Template
            </button>
            <label className="btn-primary cursor-pointer px-8 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Select CSV File</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="glass-dark border border-white/5 rounded-2xl overflow-hidden">
             <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <h3 className="font-bold text-white">Previewing {parsedData.length} Profiles</h3>
                <button 
                  onClick={handleValidate} 
                  disabled={loading || parsedData.length === 0}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />} Validate Schema
                </button>
             </div>
             <div className="p-6 overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-white/10 text-xs font-black uppercase tracking-widest text-slate-500">
                     <th className="py-3 font-semibold">Profile Name</th>
                     <th className="py-3 font-semibold">Proxy Mode</th>
                     <th className="py-3 font-semibold">Status</th>
                   </tr>
                 </thead>
                 <tbody className="text-sm divide-y divide-white/5">
                   {parsedData.slice(0, 5).map((row, idx) => (
                     <tr key={idx} className="hover:bg-white/[0.02]">
                       <td className="py-3 px-2 text-white font-medium">{row.name}</td>
                       <td className="py-3 px-2 text-slate-300">
                         <span className={`px-2 py-1 rounded text-xs ${row.proxyType === 'none' ? 'bg-dark-700 text-slate-400' : 'bg-brand-500/20 text-brand-300'}`}>
                           {row.proxyType.toUpperCase()}
                         </span>
                       </td>
                       <td className="py-3 px-2 text-slate-400 text-xs italic">Pending Validation</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               {parsedData.length > 5 && (
                 <div className="text-center pt-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-t border-white/5 mt-2">
                   + {parsedData.length - 5} More Rows
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl text-center">
           <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
           <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-widest">Validation Successful</h2>
           <p className="text-slate-400 mb-8">{parsedData.length} profiles are ready to be created into your workspace.</p>
           
           <div className="flex justify-center gap-4">
             <button onClick={() => setStep(1)} className="btn-secondary px-8">Cancel</button>
             <button onClick={handleExecute} disabled={loading} className="btn-primary px-10 flex items-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Execute Upload
             </button>
           </div>
        </div>
      )}

      {step === 4 && (
        <div className="glass-dark border border-white/5 p-8 rounded-2xl text-center">
           {operationStatus?.status === 'completed' ? (
             <CheckCircle2 className="w-16 h-16 text-brand-400 mx-auto mb-4" />
           ) : operationStatus?.status === 'failed' ? (
             <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
           ) : (
             <RefreshCw className="w-16 h-16 text-slate-400 mx-auto mb-4 animate-spin" />
           )}
           
           <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-widest">
             {operationStatus?.status === 'completed' ? 'Operation Finished' : operationStatus?.status === 'failed' ? 'Operation Failed' : 'Deploying Profiles...'}
           </h2>
           <p className="text-slate-400 mb-8">
             {operationStatus ? `${operationStatus.completed} Created, ${operationStatus.failed} Failed out of ${operationStatus.total} Expected` : 'Connecting to background worker...'}
           </p>

           <div className="w-full bg-dark-800 rounded-full h-4 mb-4 overflow-hidden shadow-inner">
             <div 
               className="bg-brand-500 h-4 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]" 
               style={{ width: `${operationStatus ? (operationStatus.completed + operationStatus.failed) / operationStatus.total * 100 : 0}%` }}
             ></div>
           </div>

           {operationStatus?.status === 'completed' && (
             <button onClick={() => { setStep(1); setCsvContent(''); setParsedData([]); }} className="btn-primary mt-4">Create More</button>
           )}
        </div>
      )}
    </div>
  );
}
