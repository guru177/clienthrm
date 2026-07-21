import axios from '@/lib/axios';

export interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    users_count: number;
    permissions_count: number;
    permissions?: Permission[];
    created_at: string;
}

export interface Permission {
    id: number;
    name: string;
    slug: string;
    group?: string | null;
}

export function normalizeRole(
    raw: Partial<Role> & {
        usersCount?: number;
        permissionsCount?: number;
        users?: number;
        permissions?: Permission[] | number;
    },
): Role {
    const permissionsCount =
        raw.permissions_count ??
        raw.permissionsCount ??
        (Array.isArray(raw.permissions) ? raw.permissions.length : undefined);

    return {
        id: raw.id!,
        name: raw.name || '',
        slug: raw.slug || '',
        description: raw.description ?? null,
        users_count: Number(raw.users_count ?? raw.usersCount ?? raw.users ?? 0),
        permissions_count: Number(permissionsCount ?? 0),
        permissions: Array.isArray(raw.permissions) ? raw.permissions : undefined,
        created_at: raw.created_at || '',
    };
}

export async function fetchRolesList(): Promise<Role[]> {
    const response = await axios.get('/admin/roles', {
        headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.data?.success) {
        return [];
    }
    const rolesData = response.data.data;
    if (!Array.isArray(rolesData)) {
        return [];
    }
    return rolesData.map((role) => normalizeRole(role));
}
