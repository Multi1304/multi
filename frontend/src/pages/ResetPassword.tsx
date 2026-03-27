import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast.error('Passwords do not match');
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      toast.success('Password successfully reset. You may now log in.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-black text-white">Invalid Reset Link</h1>
        <p className="text-slate-500 mt-2">No reset token was provided in the URL.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-2xl shadow-brand-500/20">
            <Lock className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-black text-white tracking-tighter uppercase uppercase">
          Reset Password
        </h2>
        <p className="mt-2 text-center text-sm font-medium text-slate-500">
          Enter a new secure password for your account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="glass-dark py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-white/10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                New Password
              </label>
              <div className="mb-4">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field w-full"
                  placeholder="********"
                  minLength={8}
                />
              </div>

              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                Confirm Password
              </label>
              <div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field w-full"
                  placeholder="********"
                  minLength={8}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-black text-white bg-brand-gradient hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-500/20 transition-all uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
