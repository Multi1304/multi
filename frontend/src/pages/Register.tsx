import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Loader2 } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Register() {
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/register', { tenantName, email, password, termsAccepted });
      setAuth(data.token, data.user, data.featureFlags);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-brand-500">
          <Zap className="h-12 w-12" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Create a new tenant
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-md p-3">
                <p className="text-sm text-red-500 text-center">{error}</p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-300">Tenant Name</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="input-field"
                  placeholder="My Company"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">Admin Email</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center mt-4">
              <input
                id="terms"
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="h-4 w-4 text-brand-500 bg-dark-900 border-dark-700 rounded focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-slate-400 cursor-pointer">
                I accept the <a href="#" className="text-brand-400 hover:text-brand-300">Terms of Service</a> & <a href="#" className="text-brand-400 hover:text-brand-300">AUP</a>
              </label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex justify-center py-3">
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Register'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-brand-500 hover:text-brand-400">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
