import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setToken, setRefreshToken, getRefreshToken, clearToken, isAuthenticated } from '@/lib/api';
import { navigateToLogin } from '@/lib/navigate-login';
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

interface BranchScope {
    all_centers: boolean;
    center_ids: number[];
}

interface AuthContextType {
    user: User | null;
    permissions: string[];
    plan: OrgPlanInfo | null;
    planModules: string[];
    settings: Record<string, string>;
    branchScope: BranchScope;
    loading: boolean;
    login: (email: string, password: string, orgSlug?: string) => Promise<LoginResult>;
    completeTwoFactorLogin: (preAuthToken: string, code?: string, recoveryCode?: string) => Promise<string[]>;
    logout: () => void;
    hasPermission: (slug: string) => boolean;
    /** True when actor may manage every branch (org admin). */
    canAccessAllCenters: () => boolean;
    /** True when actor may use a specific branch id. */
    canAccessCenter: (centerId: number) => boolean;
    refreshUser: () => Promise<void>;
}

export type LoginResult =
    | { kind: 'ok'; permissions: string[] }
    | { kind: 'requires2fa'; preAuthToken: string; email: string };

const emptyBranchScope: BranchScope = { all_centers: true, center_ids: [] };

const AuthContext = createContext<AuthContextType>({
    user: null,
    permissions: [],
    plan: null,
    planModules: [],
    settings: {},
    branchScope: emptyBranchScope,
    loading: true,
    login: async () => ({ kind: 'ok' as const, permissions: [] }),
    completeTwoFactorLogin: async () => [],
    logout: () => {},
    hasPermission: () => false,
    canAccessAllCenters: () => true,
    canAccessCenter: () => true,
    refreshUser: async () => {},
});

function normalizeBranchScope(raw: unknown): BranchScope {
    if (!raw || typeof raw !== 'object') return emptyBranchScope;
    const o = raw as Record<string, unknown>;
    const all = o.all_centers === true;
    const ids = Array.isArray(o.center_ids)
        ? o.center_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
    return { all_centers: all, center_ids: ids };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [plan, setPlan] = useState<OrgPlanInfo | null>(null);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [branchScope, setBranchScope] = useState<BranchScope>(emptyBranchScope);
    const [loading, setLoading] = useState(true);

    // Load user on mount if token exists
    useEffect(() => {
        if (isAuthenticated()) {
            loadUser();
        } else {
            setLoading(false);
        }
    }, []);

    function isAuthFailure(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unauthorized/i.test(msg)) return true;
        const status = /API error: (\d+)/i.exec(msg)?.[1];
        return status === '401' || status === '403';
    }

    async function loadUser() {
        const maxAttempts = 3;
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const res = await apiGet<{
                    user: User;
                    permissions: string[];
                    settings: Record<string, string>;
                    plan?: OrgPlanInfo | null;
                    branch_scope?: BranchScope;
                }>('/auth/me');
                setUser(res.data.user);
                setPermissions(res.data.permissions);
                setPlan(res.data.plan ?? null);
                setSettings(res.data.settings || {});
                setBranchScope(normalizeBranchScope(res.data.branch_scope));
                setLoading(false);
                return;
            } catch (err) {
                lastError = err;
                if (isAuthFailure(err)) break;
                if (attempt < maxAttempts) {
                    await new Promise((r) => setTimeout(r, 300 * attempt));
                }
            }
        }
        // Only drop the session on definitive auth failure. Transient errors
        // (timeouts, 5xx, 429) must not log the user out mid-navigation.
        if (isAuthFailure(lastError) || !isAuthenticated()) {
            clearToken();
            setUser(null);
            setPermissions([]);
            setPlan(null);
            setSettings({});
            setBranchScope(emptyBranchScope);
        }
        setLoading(false);
    }

    async function login(email: string, password: string, orgSlug?: string): Promise<LoginResult> {
        const payload: Record<string, string> = { email, password };
        if (orgSlug?.trim()) {
            payload.org_slug = orgSlug.trim();
        }
        const res = await apiPost<{
            token?: string;
            refresh_token?: string;
            user?: User;
            permissions?: string[];
            settings?: Record<string, string>;
            plan?: OrgPlanInfo | null;
            branch_scope?: BranchScope;
            requires_2fa?: boolean;
            pre_auth_token?: string;
        }>('/auth/login', payload);

        if (res.data.requires_2fa && res.data.pre_auth_token) {
            return {
                kind: 'requires2fa',
                preAuthToken: res.data.pre_auth_token,
                email: res.data.user?.email ?? email,
            };
        }

        if (!res.data.token || !res.data.user || !res.data.permissions) {
            throw new Error('Invalid login response');
        }

        setToken(res.data.token);
        if (res.data.refresh_token) {
            setRefreshToken(res.data.refresh_token);
        }
        setUser(res.data.user);
        setPermissions(res.data.permissions);
        setPlan(res.data.plan ?? null);
        setSettings(res.data.settings || {});
        setBranchScope(normalizeBranchScope(res.data.branch_scope));
        return { kind: 'ok', permissions: res.data.permissions };
    }

    async function completeTwoFactorLogin(
        preAuthToken: string,
        code?: string,
        recoveryCode?: string,
    ): Promise<string[]> {
        const payload: Record<string, string> = { pre_auth_token: preAuthToken };
        if (recoveryCode?.trim()) {
            payload.recovery_code = recoveryCode.trim();
        } else {
            payload.code = code ?? '';
        }
        const res = await apiPost<{
            token: string;
            refresh_token?: string;
            user: User;
            permissions: string[];
            settings: Record<string, string>;
            plan?: OrgPlanInfo | null;
            branch_scope?: BranchScope;
        }>('/auth/2fa/verify', payload);
        setToken(res.data.token);
        if (res.data.refresh_token) {
            setRefreshToken(res.data.refresh_token);
        }
        setUser(res.data.user);
        setPermissions(res.data.permissions);
        setPlan(res.data.plan ?? null);
        setSettings(res.data.settings || {});
        setBranchScope(normalizeBranchScope(res.data.branch_scope));
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
        setBranchScope(emptyBranchScope);
        navigateToLogin();
    }

    function hasPermission(slug: string): boolean {
        if (!slug) return true;
        if (permissions.includes('*')) return true;
        return permissions.includes(slug);
    }

    function canAccessAllCenters(): boolean {
        if (permissions.includes('*') || permissions.includes('access-all-centers')) return true;
        return branchScope.all_centers;
    }

    function canAccessCenter(centerId: number): boolean {
        if (canAccessAllCenters()) return true;
        return branchScope.center_ids.includes(centerId);
    }

    const planModules = plan?.modules ?? [];

    return (
        <AuthContext.Provider
            value={{
                user,
                permissions,
                plan,
                planModules,
                settings,
                branchScope,
                loading,
                login,
                completeTwoFactorLogin,
                logout,
                hasPermission,
                canAccessAllCenters,
                canAccessCenter,
                refreshUser: loadUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
