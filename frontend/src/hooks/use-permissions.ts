import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to check user permissions — adapted from Inertia to AuthContext.
 */
export function usePermissions() {
    const { user, permissions, hasPermission: contextHasPerm } = useAuth();
    const roles = user?.roles || [];

    const hasPermission = (slug: string): boolean => contextHasPerm(slug);

    const hasRole = (roleSlug: string): boolean => {
        if (!user) return false;
        return roles.some((role) => role.slug === roleSlug);
    };

    const can = (action: string, resource: string): boolean => {
        return hasPermission(`${action}-${resource}`);
    };

    const require = (permissionSlug: string) => {
        if (!hasPermission(permissionSlug)) {
            throw new Error(`User does not have permission: ${permissionSlug}`);
        }
    };

    const getAllPermissions = (): string[] => {
        return permissions;
    };

    return {
        user,
        roles,
        hasPermission,
        hasRole,
        can,
        require,
        getAllPermissions,
        isAuthenticated: !!user,
        isSuperAdmin: hasRole('admin') || permissions.includes('*'),
    };
}
