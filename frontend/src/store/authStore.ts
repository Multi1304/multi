import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  termsAcceptedAt?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  featureFlags: string[];
  setAuth: (token: string, user: User, featureFlags?: string[]) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      featureFlags: [],
      setAuth: (token, user, featureFlags = []) => set({ token, user, featureFlags }),
      setToken: (token) => set({ token }),
      logout: () => set({ token: null, user: null, featureFlags: [] }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
