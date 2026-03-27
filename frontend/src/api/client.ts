import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { getFallbackApiBaseUrl, resolveApiBaseUrl } from './runtime';

const defaultBaseURL = getFallbackApiBaseUrl();

export const api = axios.create({
  baseURL: defaultBaseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach access token
api.interceptors.request.use(
  async (config) => {
    const resolvedBaseURL = await resolveApiBaseUrl();
    api.defaults.baseURL = resolvedBaseURL;
    config.baseURL = resolvedBaseURL;

    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Track if we're currently refreshing to avoid infinite loops
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor — handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response && originalRequest && !originalRequest._portRetry) {
      originalRequest._portRetry = true;
      const recoveredBaseURL = await resolveApiBaseUrl(true);
      api.defaults.baseURL = recoveredBaseURL;
      originalRequest.baseURL = recoveredBaseURL;
      return api(originalRequest);
    }

    // If 401 and we haven't tried refreshing yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === '/auth/refresh') {
        // If the refresh itself fails, log out
        useAuthStore.getState().logout();
        toast.error('Session expired. Please log in again.');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const resolvedBaseURL = await resolveApiBaseUrl();
        api.defaults.baseURL = resolvedBaseURL;
        const { data } = await axios.post(
          `${resolvedBaseURL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        useAuthStore.getState().setToken(data.token);

        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        processQueue(null, data.token);

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        useAuthStore.getState().logout();
        toast.error('Session expired. Please log in again.');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status >= 500) {
      toast.error('Internal Server Error. The backend might be synchronizing.');
    } else if (error.response?.status === 429) {
      toast.error('Too many requests. Please slow down.');
    } else if (error.response?.data?.error && error.response?.status !== 401) {
      toast.error(error.response.data.error);
    }

    return Promise.reject(error);
  }
);

export default api;
