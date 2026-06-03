import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setToken, clearToken, isAuthenticated } from '@/lib/api';

interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    photo?: string;
    phone?: string;
    department_id?: number;
    designation_id?: number;
    employee_id?: string;
    employment_type?: string;
    status?: string;
    is_super_admin: boolean;
    email_verified_at?: string;
    roles?: Array<{ id: number; name: string; slug: string; description?: string }>;
    [key: string]: any;
}

interface AuthContextType {
    user: User | null;
    permissions: string[];
    settings: Record<string, string>;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    hasPermission: (slug: string) => boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    permissions: [],
    settings: {},
    loading: true,
    login: async () => {},
    logout: () => {},
    hasPermission: () => false,
    refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    // Load user on mount if token exists
    useEffect(() => {
        if (isAuthenticated()) {
            loadUser();
        } else {
            setLoading(false);
        }
    }, []);

    async function loadUser() {
        try {
            const res = await apiGet<{ user: User; permissions: string[]; settings: Record<string, string> }>('/auth/me');
            setUser(res.data.user);
            setPermissions(res.data.permissions);
            setSettings(res.data.settings || {});
        } catch {
            clearToken();
            setUser(null);
            setPermissions([]);
            setSettings({});
        } finally {
            setLoading(false);
        }
    }

    async function login(email: string, password: string) {
        const res = await apiPost<{ token: string; user: User; permissions: string[]; settings: Record<string, string> }>(
            '/auth/login',
            { email, password },
        );
        setToken(res.data.token);
        setUser(res.data.user);
        setPermissions(res.data.permissions);
        setSettings(res.data.settings || {});
    }

    function logout() {
        clearToken();
        setUser(null);
        setPermissions([]);
        setSettings({});
        window.location.href = '/login';
    }

    function hasPermission(slug: string): boolean {
        if (!slug) return true;
        if (permissions.includes('*')) return true;
        return permissions.includes(slug);
    }

    return (
        <AuthContext.Provider value={{ user, permissions, settings, loading, login, logout, hasPermission, refreshUser: loadUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
