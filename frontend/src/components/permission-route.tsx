import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isModuleAllowed } from '@/lib/plan-modules';

function PageLoader() {
    return (
        <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}

/** Redirects to /unauthorized when the user lacks permission or plan module access. */
export function PermissionRoute({
    permission,
    permissions,
    module,
    modules,
    children,
}: {
    permission?: string;
    permissions?: string[];
    module?: string;
    modules?: string[];
    children: ReactNode;
}) {
    const { user, loading, hasPermission, planModules } = useAuth();
    if (loading) return <PageLoader />;
    if (!user) return <Navigate to="/login" replace />;
    const moduleAllowed = module
        ? isModuleAllowed(planModules, module)
        : modules && modules.length > 0
          ? modules.some((m) => isModuleAllowed(planModules, m))
          : true;
    if (!moduleAllowed) {
        return <Navigate to="/unauthorized" replace />;
    }
    const allowed = permission
        ? hasPermission(permission)
        : permissions && permissions.length > 0
          ? permissions.some((p) => hasPermission(p))
          : true;
    if (!allowed) {
        return <Navigate to="/unauthorized" replace />;
    }
    return <>{children}</>;
}
