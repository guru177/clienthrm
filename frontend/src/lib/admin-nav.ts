import {
    BarChart3, Bell, Building, CalendarCheck, ClipboardList, Clock,
    DollarSign, FileText, Fingerprint, Folder, IndianRupee, LayoutGrid, LifeBuoy, LocateFixed, MapPin, Network, Package, ShoppingCart, TrendingUp, Users, UsersRound,
    Wallet, Workflow, Calendar, FileCheck, ClipboardCheck, Settings, MessagesSquare, Receipt, UserCheck, Wrench, User,
    type LucideIcon,
} from 'lucide-react';

import { isModuleAllowed } from '@/lib/plan-modules';
import { type NavGroup, type NavItem } from '@/types';

export type NavItemWithPerm = NavItem & {
    permission?: string;
    permissions?: string[];
    module?: string;
};

export type NavGroupWithPerm = Omit<NavGroup, 'items'> & {
    items: NavItemWithPerm[];
    module?: string;
    permission?: string;
    permissions?: string[];
};

export type NavEntry = NavItemWithPerm | NavGroupWithPerm;

export type MobileTabCandidate = {
    id: string;
    title: string;
    href: string;
    icon: LucideIcon;
    permission?: string;
    permissions?: string[];
    module?: string;
};

export const mainNavItems: NavEntry[] = [
    { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutGrid, permission: 'view-dashboard', module: 'dashboard' },
    { title: 'Org Chart', href: '/admin/org-chart', icon: Network, permission: 'view-users', module: 'users' },
    {
        title: 'Organization', icon: Building, items: [
            { title: 'Branches', href: '/admin/centers', icon: MapPin, permission: 'manage-settings', module: 'centers' },
            {
                title: 'People',
                href: '/admin/users',
                icon: Users,
                permissions: [
                    'view-users',
                    'view-departments',
                    'view-designations',
                    'create-roles',
                    'edit-roles',
                ],
            },
        ],
    },
    {
        title: 'Shifts', icon: Clock, permission: 'view-attendance', module: 'shifts', items: [
            { title: 'Templates & Assign', href: '/admin/shifts', icon: Clock, permission: 'view-attendance', module: 'shifts' },
            { title: 'Shift Roster', href: '/admin/shifts/roster', icon: UsersRound, permission: 'view-attendance', module: 'shifts' },
            { title: 'Daily Schedule', href: '/admin/shifts/daily', icon: Calendar, permission: 'view-attendance', module: 'shifts' },
        ],
    },
    {
        title: 'Attendance & Leave', icon: CalendarCheck, items: [
            { title: 'Attendance', href: '/admin/manual-attendance', icon: UserCheck, permissions: ['mark-attendance', 'manage-attendance'], module: 'manual_attendance' },
            { title: 'Location based attendance', href: '/admin/attendance', icon: CalendarCheck, permissions: ['clock-inout', 'view-attendance', 'manage-attendance'], module: 'attendance' },
            { title: 'Live Locations', href: '/admin/live-locations', icon: LocateFixed, permission: 'view-attendance', module: 'attendance' },
            { title: 'Biometric Devices', href: '/admin/biometric', icon: Fingerprint, permission: 'view-attendance', module: 'biometric' },
            { title: 'My Attendance', href: '/admin/my-attendance', icon: Calendar, permissions: ['view-my-attendance', 'view-attendance', 'manage-attendance'], module: 'attendance' },
            { title: 'Leave Requests', href: '/admin/leave-requests', icon: FileCheck, permission: 'view-leave-requests', module: 'leave' },
            { title: 'Manage Leave', href: '/admin/leave-requests/manage', icon: ClipboardCheck, permissions: ['manage-leave-requests', 'approve-leave-requests', 'reject-leave-requests'], module: 'leave_manage' },
            { title: 'Holidays', href: '/admin/holidays', icon: Calendar, permission: 'view-holidays', module: 'holidays' },
        ],
    },
    {
        title: 'Salaries', icon: Wallet, module: 'payroll', items: [
            { title: 'Salary Components', href: '/admin/salaries/components', icon: DollarSign, permission: 'view-payroll', module: 'payroll' },
            { title: 'Employees', href: '/admin/salaries/employees', icon: UsersRound, permission: 'view-payroll', module: 'payroll' },
            { title: 'Payroll', href: '/admin/payroll', icon: IndianRupee, permission: 'view-payroll', module: 'payroll' },
            { title: 'My Payslips', href: '/admin/my-payslips', icon: Receipt, permission: 'view-my-payslips', module: 'my_payslips' },
        ],
    },
    {
        title: 'People Ops', icon: UsersRound, items: [
            { title: 'Team Chat', href: '/admin/chat', icon: MessagesSquare, permission: 'view-chat', module: 'chat' },
            { title: 'Doctor Reports', href: '/admin/doctor-reports', icon: FileText, permission: 'view-doctor-reports', module: 'doctor_reports' },
            { title: 'My Doctor Reports', href: '/admin/my-doctor-reports', icon: ClipboardList, permission: 'view-my-doctor-reports', module: 'my_doctor_reports' },
            { title: 'Grocery Benefits', href: '/admin/grocery-benefits', icon: ShoppingCart, permission: 'view-grocery-benefits', module: 'grocery_benefits' },
            { title: 'My Grocery Benefits', href: '/admin/my-grocery-benefits', icon: Package, permission: 'view-my-grocery-benefits', module: 'my_grocery_benefits' },
            { title: 'Assets & Maintenance', href: '/admin/assets', icon: Wrench, permission: 'view-assets', module: 'assets' },
            { title: 'My Assets', href: '/admin/my-assets', icon: User, permission: 'view-my-assets', module: 'my_assets' },
        ],
    },
    {
        title: 'Work', icon: Folder, items: [
            { title: 'Workflows', href: '/admin/workflows', icon: Workflow, permission: 'view-workflows', module: 'workflows' },
            { title: 'Tasks & Activities', href: '/admin/tasks', icon: ClipboardList, permission: 'view-tasks', module: 'tasks' },
            { title: 'Projects', href: '/admin/projects', icon: Folder, permission: 'view-projects', module: 'projects' },
            { title: 'Reports', href: '/admin/reports', icon: BarChart3, permission: 'view-reports', module: 'reports' },
        ],
    },
    {
        title: 'Account', icon: Settings, items: [
            { title: 'Subscription', href: '/admin/subscription', icon: TrendingUp, permission: 'manage-subscription', module: 'subscription' },
            { title: 'Notifications', href: '/admin/notifications', icon: Bell, permission: 'manage-org-notifications', module: 'notifications' },
            { title: 'Support', href: '/admin/support', icon: LifeBuoy, permission: 'view-support', module: 'support' },
            { title: 'App Settings', href: '/admin/settings/app', icon: Settings, permission: 'manage-settings', module: 'settings' },
            { title: 'Integrations', href: '/admin/settings/integrations', icon: Workflow, permission: 'manage-settings', module: 'settings' },
        ],
    },
];

/** Priority order for mobile bottom tabs (max 4 + More). */
export const mobileTabCandidates: MobileTabCandidate[] = [
    { id: 'home', title: 'Home', href: '/admin/dashboard', icon: LayoutGrid, permission: 'view-dashboard', module: 'dashboard' },
    { id: 'leave', title: 'Leave', href: '/admin/leave-requests', icon: FileCheck, permission: 'view-leave-requests', module: 'leave' },
    { id: 'payslips', title: 'Payslips', href: '/admin/my-payslips', icon: Receipt, permission: 'view-my-payslips', module: 'my_payslips' },
    { id: 'clock', title: 'Clock', href: '/admin/attendance', icon: CalendarCheck, permissions: ['clock-inout', 'view-attendance', 'manage-attendance'], module: 'attendance' },
    { id: 'myDoctor', title: 'Doctor', href: '/admin/my-doctor-reports', icon: ClipboardList, permission: 'view-my-doctor-reports', module: 'my_doctor_reports' },
    { id: 'doctor', title: 'Reports', href: '/admin/doctor-reports', icon: FileText, permission: 'view-doctor-reports', module: 'doctor_reports' },
    { id: 'chat', title: 'Chat', href: '/admin/chat', icon: MessagesSquare, permission: 'view-chat', module: 'chat' },
    { id: 'assets', title: 'Assets', href: '/admin/my-assets', icon: User, permission: 'view-my-assets', module: 'my_assets' },
];

export function hasPermissionCheck(
    permissions: string[],
    slug: string | undefined,
    slugs?: string[],
): boolean {
    if (slugs && slugs.length > 0) {
        return slugs.some((s) => hasPermissionCheck(permissions, s));
    }
    if (!slug) return true;
    if (permissions.includes('*')) return true;
    return permissions.includes(slug);
}

export function canAccessNavItem(
    permissions: string[],
    planModules: string[],
    module?: string,
    permission?: string,
    perms?: string[],
): boolean {
    if (!isModuleAllowed(planModules, module)) return false;
    return hasPermissionCheck(permissions, permission, perms);
}

export function filterNav(
    items: NavEntry[],
    permissions: string[],
    planModules: string[],
): NavEntry[] {
    return items.reduce<NavEntry[]>((acc, item) => {
        if ('items' in item) {
            const group = item as NavGroupWithPerm;
            const visibleChildren = group.items.filter((child) =>
                canAccessNavItem(
                    permissions,
                    planModules,
                    child.module,
                    child.permission,
                    child.permissions,
                ),
            );
            if (
                visibleChildren.length > 0 &&
                canAccessNavItem(
                    permissions,
                    planModules,
                    group.module,
                    group.permission,
                    group.permissions,
                )
            ) {
                acc.push({ ...group, items: visibleChildren });
            }
        } else {
            const navItem = item as NavItemWithPerm;
            if (
                canAccessNavItem(
                    permissions,
                    planModules,
                    navItem.module,
                    navItem.permission,
                    navItem.permissions,
                )
            ) {
                acc.push(item);
            }
        }
        return acc;
    }, []);
}

export function flattenNavLinks(entries: NavEntry[]): NavItemWithPerm[] {
    const links: NavItemWithPerm[] = [];
    for (const entry of entries) {
        if ('items' in entry) {
            links.push(...entry.items);
        } else {
            links.push(entry);
        }
    }
    return links;
}

export function resolveMobileTabs(
    permissions: string[],
    planModules: string[],
    maxTabs = 4,
): { tabs: MobileTabCandidate[]; tabHrefs: Set<string> } {
    let tabs = mobileTabCandidates
        .filter((tab) =>
            canAccessNavItem(
                permissions,
                planModules,
                tab.module,
                tab.permission,
                tab.permissions,
            ),
        )
        .slice(0, maxTabs);

    // Sales/doctor-only (etc.): fall back to first allowed sidebar links.
    if (tabs.length === 0) {
        const links = flattenNavLinks(filterNav(mainNavItems, permissions, planModules));
        tabs = links.slice(0, maxTabs).map((link, index) => ({
            id: `fallback-${index}`,
            title: link.title,
            href: link.href,
            icon: link.icon ?? LayoutGrid,
            permission: link.permission,
            permissions: link.permissions,
            module: link.module,
        }));
    }

    return {
        tabs,
        tabHrefs: new Set(tabs.map((t) => t.href)),
    };
}
