/** True when viewport matches the app mobile breakpoint (&lt; 768px). */
export function isMobileViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
}

const DESKTOP_ROUTES: [string, string][] = [
    ['view-dashboard', '/admin/dashboard'],
    ['view-attendance', '/admin/attendance'],
    ['view-chat', '/admin/chat'],
    ['view-users', '/admin/users'],
    ['view-leave-requests', '/admin/leave-requests'],
    ['manage-leave-requests', '/admin/leave-requests/manage'],
    ['view-payroll', '/admin/payroll'],
];

/** Mobile prefers daily employee destinations when permitted. */
const MOBILE_ROUTES: [string, string][] = [
    ['view-attendance', '/admin/attendance'],
    ['view-leave-requests', '/admin/leave-requests'],
    ['view-my-payslips', '/admin/my-payslips'],
    ['view-my-doctor-reports', '/admin/my-doctor-reports'],
    ['view-doctor-reports', '/admin/doctor-reports'],
    ['view-dashboard', '/admin/dashboard'],
    ['view-chat', '/admin/chat'],
    ['view-users', '/admin/users'],
    ['manage-leave-requests', '/admin/leave-requests/manage'],
    ['view-payroll', '/admin/payroll'],
];

export type DefaultRouteOptions = {
    /** Prefer clock/leave/payslips order (phone shell). */
    preferMobileHome?: boolean;
};

/** First admin page the user may access after login. */
export function defaultAdminRoute(
    hasPermission: (slug: string) => boolean,
    options?: DefaultRouteOptions,
): string {
    const preferMobile =
        options?.preferMobileHome ?? false;
    const routes = preferMobile ? MOBILE_ROUTES : DESKTOP_ROUTES;
    for (const [perm, path] of routes) {
        if (hasPermission(perm)) return path;
    }
    return '/unauthorized';
}

/** Convenience: use mobile preference when viewport is phone-sized. */
export function defaultAdminRouteForViewport(
    hasPermission: (slug: string) => boolean,
): string {
    return defaultAdminRoute(hasPermission, {
        preferMobileHome: isMobileViewport(),
    });
}
