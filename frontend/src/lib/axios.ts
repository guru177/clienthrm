/**
 * Axios instance pre-configured with JWT auth for the Rust backend.
 *
 * BaseURL = '/api' ensures all component calls like axios.get('/admin/users')
 * become '/api/admin/users', which Vite proxies to the Rust backend.
 */
import axiosLib from 'axios';

const axios = axiosLib.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

// ── Request interceptor: inject JWT token ───────────────────────────────────
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('hrm_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response interceptor: handle 401 → redirect to login ────────────────────
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('hrm_token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    },
);

export default axios;
