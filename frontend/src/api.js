import axios from 'axios';
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 15000,
});
let accessToken = null,
  csrfToken = null,
  refreshing = null;
export function setCredentials(auth) {
  accessToken = auth?.accessToken || null;
  csrfToken = auth?.csrfToken || null;
}
export async function restoreSession() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (!csrfToken) {
      const r = await http.post('/auth/csrf', {});
      csrfToken = r.data.data.csrfToken;
    }
    const r = await http.post('/auth/refresh', {}, { headers: { 'X-CSRF-Token': csrfToken } });
    setCredentials(r.data.data);
    return r.data.data.user;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  return config;
});
http.interceptors.response.use(
  (r) => r,
  async (error) => {
    const request = error.config;
    if (error.response?.status === 401 && !request?._retry && !request?.url?.startsWith('/auth/')) {
      request._retry = true;
      try {
        await restoreSession();
        return await http(request);
      } catch {
        setCredentials(null);
        window.dispatchEvent(new Event('cerebro:session-ended'));
      }
    }
    throw error;
  },
);
export const get = async (url, params) => (await http.get(url, { params })).data.data;
export const post = async (url, body = {}) => (await http.post(url, body)).data.data;
export const patch = async (url, body) => (await http.patch(url, body)).data.data;
export const message = (e) => {
  if (e.response?.status === 429) {
    const seconds = Number(e.response.headers?.['retry-after']);
    const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null;
    return minutes
      ? `Too many requests. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
      : 'Too many requests. Please wait a moment before trying again.';
  }
  return (
    e.response?.data?.error?.message ||
    'Could not reach the learning service. Check your connection and retry.'
  );
};
export const errorCode = (e) => e.response?.data?.error?.code;
export const newKey = () => crypto.randomUUID();
