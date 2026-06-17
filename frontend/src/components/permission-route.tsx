import { Navigate, type ReactNode } from 'react-router-dom';
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
    children,
}: {
    permission?: string;
    permissions?: string[];
    module?: string;
    children: ReactNode;
}) {
    const { user, loading, hasPermission, planModules } = useAuth();
    if (loading) return <PageLoader />;
    if (!user) return <Navigate to="/login" replace />;
    if (module && !isModuleAllowed(planModules, module)) {
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
