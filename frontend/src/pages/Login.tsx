import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Loader2 } from 'lucide-react';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload: Record<string, string> = { email, password };
      if (totpCode.trim()) {
        payload.totpCode = totpCode.trim();
      }
      const { data } = await api.post('/auth/login', payload);
      setAuth(data.token, data.user, data.featureFlags);
      navigate('/dashboard');
    } catch (err: any) {
      setMfaRequired(!!err.response?.data?.mfaRequired);
      setError(err.response?.data?.error || 'Failed to login');
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
          Sign in to your account
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
              <label className="block text-sm font-medium text-slate-300">Email address</label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@local"
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

            {mfaRequired && (
              <div>
                <label className="block text-sm font-medium text-slate-300">Authenticator Code</label>
                <div className="mt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required={mfaRequired}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input-field"
                    placeholder="123456"
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex justify-center py-3">
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              Don't have an account?{' '}
              <Link to="/register" className="font-medium text-brand-500 hover:text-brand-400">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
