import axios from '@/lib/axios';
import { TENANT_MODULE_CATALOG } from '@/lib/tenant-module-catalog';

export interface Permission {
    id: number;
    name: string;
    slug: string;
    group?: string | null;
}

export interface PermissionModule {
    key: string;
    label: string;
    permissions: Permission[];
}

export interface PermissionsPayload {
    permissions: Permission[];
    modules: PermissionModule[];
}

function modulesFromPermissionGroups(permissions: Permission[]): PermissionModule[] {
    const byLabel = new Map<string, Permission[]>();
    for (const permission of permissions) {
        const label = permission.group || 'Other';
        const list = byLabel.get(label) ?? [];
        list.push(permission);
        byLabel.set(label, list);
    }
    return TENANT_MODULE_CATALOG.map(({ key, label }) => ({
        key,
        label,
        permissions: byLabel.get(label) ?? [],
    })).filter((module) => module.permissions.length > 0);
}

/** Sort modules in sidebar catalog order; do not invent modules outside the plan. */
export function mergePermissionModules(modules: PermissionModule[]): PermissionModule[] {
    const byKey = new Map<string, PermissionModule>();
    for (const module of modules) {
        if (module.key) byKey.set(module.key, module);
    }
    const ordered: PermissionModule[] = [];
    for (const { key } of TENANT_MODULE_CATALOG) {
        const existing = byKey.get(key);
        if (existing) ordered.push(existing);
    }
    for (const module of modules) {
        if (!ordered.some((m) => m.key === module.key)) {
            ordered.push(module);
        }
    }
    return ordered;
}

export function parsePermissionsPayload(data: unknown): PermissionsPayload {
    let permissions: Permission[] = [];
    let modules: PermissionModule[] = [];

    if (Array.isArray(data)) {
        permissions = data as Permission[];
        modules = modulesFromPermissionGroups(permissions);
    } else {
        const payload = data as Partial<PermissionsPayload>;
        permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
        modules =
            Array.isArray(payload.modules) && payload.modules.length > 0
                ? payload.modules
                : modulesFromPermissionGroups(permissions);
    }

    return {
        permissions,
        modules: mergePermissionModules(modules),
    };
}

export async function fetchPermissionsPayload(): Promise<PermissionsPayload> {
    const response = await axios.get('/admin/permissions');
    if (!response.data?.success) {
        return { permissions: [], modules: [] };
    }
    return parsePermissionsPayload(response.data.data);
}
