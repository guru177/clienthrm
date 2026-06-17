import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
    clearPlatformToken,
    isPlatformAuthenticated,
    platformGet,
    platformPost,
    setPlatformToken,
} from '@/lib/platform-api';

export interface PlatformAdmin {
    id: number;
    name: string;
    email: string;
    role?: string;
    is_active?: boolean;
    totp_enabled?: boolean;
    last_login_at?: string | null;
}

export type LoginResult =
    | { kind: 'logged_in' }
    | { kind: 'requires_2fa'; pre_auth_token: string; admin: PlatformAdmin };

interface PlatformAuthContextType {
    admin: PlatformAdmin | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<LoginResult>;
    verifyTwoFactor: (preAuthToken: string, code: string) => Promise<void>;
    logout: () => void;
    refreshAdmin: () => Promise<void>;
    hasRole: (min: 'owner' | 'admin' | 'support' | 'read_only') => boolean;
}

const ROLE_RANK: Record<string, number> = {
    owner: 4,
    admin: 3,
    support: 2,
    read_only: 1,
};

const PlatformAuthContext = createContext<PlatformAuthContextType>({
    admin: null,
    loading: true,
    login: async () => ({ kind: 'logged_in' }),
    verifyTwoFactor: async () => {},
    logout: () => {},
    refreshAdmin: async () => {},
    hasRole: () => false,
});

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isPlatformAuthenticated()) {
            loadAdmin();
        } else {
            setLoading(false);
        }
    }, []);

    async function loadAdmin() {
        try {
            const res = await platformGet<PlatformAdmin>('/auth/me');
            setAdmin(res.data);
        } catch {
            clearPlatformToken();
            setAdmin(null);
        } finally {
            setLoading(false);
        }
    }

    async function login(email: string, password: string): Promise<LoginResult> {
        const res = await platformPost<{
            token?: string;
            admin: PlatformAdmin;
            requires_2fa?: boolean;
            pre_auth_token?: string;
        }>('/auth/login', { email, password });

        if (res.data.requires_2fa && res.data.pre_auth_token) {
            return {
                kind: 'requires_2fa',
                pre_auth_token: res.data.pre_auth_token,
                admin: res.data.admin,
            };
        }

        if (!res.data.token) {
            throw new Error('Login response missing token');
        }
        setPlatformToken(res.data.token);
        setAdmin(res.data.admin);
        return { kind: 'logged_in' };
    }

    async function verifyTwoFactor(preAuthToken: string, code: string) {
        const res = await platformPost<{ token: string; admin: PlatformAdmin }>(
            '/auth/2fa/verify',
            { pre_auth_token: preAuthToken, code },
        );
        setPlatformToken(res.data.token);
        setAdmin(res.data.admin);
    }

    function logout() {
        platformPost('/auth/logout', {}).catch(() => {});
        clearPlatformToken();
        setAdmin(null);
        window.location.href = '/login';
    }

    function hasRole(min: 'owner' | 'admin' | 'support' | 'read_only'): boolean {
        if (!admin) return false;
        const role = admin.role ?? 'admin';
        return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 0);
    }

    return (
        <PlatformAuthContext.Provider
            value={{
                admin,
                loading,
                login,
                verifyTwoFactor,
                logout,
                refreshAdmin: loadAdmin,
                hasRole,
            }}
        >
            {children}
        </PlatformAuthContext.Provider>
    );
}

export function usePlatformAuth() {
    return useContext(PlatformAuthContext);
}
