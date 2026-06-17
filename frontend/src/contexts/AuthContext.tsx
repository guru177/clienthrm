import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setToken, setRefreshToken, getRefreshToken, clearToken, isAuthenticated } from '@/lib/api';
import type { OrgPlanInfo } from '@/lib/plan-modules';

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
    plan: OrgPlanInfo | null;
    planModules: string[];
    settings: Record<string, string>;
    loading: boolean;
    login: (email: string, password: string, orgSlug?: string) => Promise<string[]>;
    logout: () => void;
    hasPermission: (slug: string) => boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    permissions: [],
    plan: null,
    planModules: [],
    settings: {},
    loading: true,
    login: async () => [],
    logout: () => {},
    hasPermission: () => false,
    refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [plan, setPlan] = useState<OrgPlanInfo | null>(null);
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
            const res = await apiGet<{ user: User; permissions: string[]; settings: Record<string, string>; plan?: OrgPlanInfo | null }>('/auth/me');
            setUser(res.data.user);
            setPermissions(res.data.permissions);
            setPlan(res.data.plan ?? null);
            setSettings(res.data.settings || {});
        } catch {
            clearToken();
            setUser(null);
            setPermissions([]);
            setPlan(null);
            setSettings({});
        } finally {
            setLoading(false);
        }
    }

    async function login(email: string, password: string, orgSlug?: string): Promise<string[]> {
        const payload: Record<string, string> = { email, password };
        if (orgSlug?.trim()) {
            payload.org_slug = orgSlug.trim();
        }
        const res = await apiPost<{ token: string; refresh_token?: string; user: User; permissions: string[]; settings: Record<string, string>; plan?: OrgPlanInfo | null }>(
            '/auth/login',
            payload,
        );
        setToken(res.data.token);
        if (res.data.refresh_token) {
            setRefreshToken(res.data.refresh_token);
        }
        setUser(res.data.user);
        setPermissions(res.data.permissions);
        setPlan(res.data.plan ?? null);
        setSettings(res.data.settings || {});
        return res.data.permissions;
    }

    async function logout() {
        const refresh = getRefreshToken();
        try {
            await apiPost('/auth/logout', { refresh_token: refresh });
        } catch {
            // proceed with client logout even if server revoke fails
        }
        clearToken();
        setUser(null);
        setPermissions([]);
        setPlan(null);
        setSettings({});
        window.location.href = '/login';
    }

    function hasPermission(slug: string): boolean {
        if (!slug) return true;
        if (permissions.includes('*')) return true;
        return permissions.includes(slug);
    }

    const planModules = plan?.modules ?? [];

    return (
        <AuthContext.Provider value={{ user, permissions, plan, planModules, settings, loading, login, logout, hasPermission, refreshUser: loadUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
