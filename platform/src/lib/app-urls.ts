/** Tenant HRM app origin (separate dev server). */
export function tenantAppUrl(): string {
    return (import.meta.env.VITE_TENANT_APP_URL || 'http://localhost:5174').replace(/\/$/, '');
}

/** First admin page after impersonation. */
export function defaultAdminRoute(hasPermission: (slug: string) => boolean): string {
    const routes: [string, string][] = [
        ['view-dashboard', '/admin/dashboard'],
        ['view-attendance', '/admin/attendance'],
        ['view-users', '/admin/users'],
        ['manage-leave-requests', '/admin/leave-requests/manage'],
        ['view-payroll', '/admin/payroll'],
    ];
    for (const [perm, path] of routes) {
        if (hasPermission(perm)) return path;
    }
    return '/unauthorized';
}

/** Redirect browser to tenant app with impersonation tokens. */
export function redirectToTenantImpersonation(params: {
    token: string;
    refreshToken?: string;
    orgSlug: string;
    orgName: string;
    next: string;
}) {
    const url = new URL('/auth/impersonate', tenantAppUrl());
    url.searchParams.set('token', params.token);
    if (params.refreshToken) {
        url.searchParams.set('refresh_token', params.refreshToken);
    }
    url.searchParams.set('org_slug', params.orgSlug);
    url.searchParams.set('org_name', params.orgName);
    url.searchParams.set('next', params.next);
    window.location.href = url.toString();
}
