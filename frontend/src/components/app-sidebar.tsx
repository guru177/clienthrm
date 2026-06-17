import { Link, useLocation } from 'react-router-dom';
import {
    Award, BarChart3, Bell, Briefcase, Building, CalendarCheck, ClipboardList, Clock,
    DollarSign, FileText, Fingerprint, Folder, IndianRupee, LayoutGrid, LifeBuoy, MapPin, TrendingUp, Users, UsersRound,
    Wallet, Workflow, Calendar, FileCheck, ClipboardCheck, Settings, MessagesSquare, Receipt,
} from 'lucide-react';

import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { type NavGroup, type NavItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { isModuleAllowed } from '@/lib/plan-modules';
import { defaultAdminRoute } from '@/lib/default-route';
import AppLogo from './app-logo';

type NavItemWithPerm = NavItem & { permission?: string; permissions?: string[]; module?: string };
type NavGroupWithPerm = Omit<NavGroup, 'items'> & { items: NavItemWithPerm[]; module?: string; permission?: string; permissions?: string[] };
type NavEntry = NavItemWithPerm | NavGroupWithPerm;

const mainNavItems: NavEntry[] = [
    { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutGrid, permission: 'view-dashboard', module: 'dashboard' },
    { title: 'Users & Roles', href: '/admin/users', icon: Users, permission: 'view-users', module: 'users' },
    { title: 'Centers', href: '/admin/centers', icon: MapPin, permission: 'manage-settings', module: 'centers' },
    { title: 'Departments', href: '/admin/departments', icon: Building, permission: 'view-departments', module: 'departments' },
    { title: 'Designations', href: '/admin/designations', icon: Award, permission: 'view-designations', module: 'designations' },
    { title: 'Job Postings', href: '/admin/careers', icon: Briefcase, permission: 'view-jobs', module: 'careers' },
    { title: 'Applications', href: '/admin/job-applications', icon: FileCheck, permission: 'view-jobs', module: 'job_applications' },
    { title: 'Team Chat', href: '/admin/chat', icon: MessagesSquare, permission: 'view-chat', module: 'chat' },
    { title: 'Attendance', href: '/admin/attendance', icon: CalendarCheck, permission: 'view-attendance', module: 'attendance' },
    {
        title: 'Shifts', icon: Clock, permission: 'view-attendance', module: 'shifts', items: [
            { title: 'Templates & Assign', href: '/admin/shifts', icon: Clock, permission: 'view-attendance', module: 'shifts' },
            { title: 'Shift Roster', href: '/admin/shifts/roster', icon: UsersRound, permission: 'view-attendance', module: 'shifts' },
            { title: 'Daily Schedule', href: '/admin/shifts/daily', icon: Calendar, permission: 'view-attendance', module: 'shifts' },
        ],
    },
    { title: 'Biometric Devices', href: '/admin/biometric', icon: Fingerprint, permission: 'view-attendance', module: 'biometric' },
    { title: 'Leave Requests', href: '/admin/leave-requests', icon: FileCheck, permission: 'view-leave-requests', module: 'leave' },
    { title: 'Manage Leave', href: '/admin/leave-requests/manage', icon: ClipboardCheck, permissions: ['manage-leave-requests', 'approve-leave-requests', 'reject-leave-requests'], module: 'leave_manage' },
    { title: 'Holidays', href: '/admin/holidays', icon: Calendar, permission: 'view-holidays', module: 'holidays' },
    {
        title: 'Salaries', icon: Wallet, module: 'payroll', items: [
            { title: 'Salary Components', href: '/admin/salaries/components', icon: DollarSign, permission: 'view-payroll', module: 'payroll' },
            { title: 'Employees', href: '/admin/salaries/employees', icon: UsersRound, permission: 'view-payroll', module: 'payroll' },
            { title: 'Payroll', href: '/admin/payroll', icon: IndianRupee, permission: 'view-payroll', module: 'payroll' },
        ],
    },
    { title: 'My Payslips', href: '/admin/my-payslips', icon: Receipt, permission: 'view-my-payslips', module: 'my_payslips' },
    { title: 'Workflows', href: '/admin/workflows', icon: Workflow, permission: 'view-workflows', module: 'workflows' },
    { title: 'Tasks & Activities', href: '/admin/tasks', icon: ClipboardList, permission: 'view-tasks', module: 'tasks' },
    { title: 'Projects', href: '/admin/projects', icon: Folder, permission: 'view-projects', module: 'projects' },
    { title: 'Reports', href: '/admin/reports', icon: BarChart3, permission: 'view-reports', module: 'reports' },
    { title: 'Subscription', href: '/admin/subscription', icon: TrendingUp, permission: 'manage-subscription', module: 'subscription' },
    { title: 'Notifications', href: '/admin/notifications', icon: Bell, permission: 'manage-org-notifications', module: 'notifications' },
    { title: 'Support', href: '/admin/support', icon: LifeBuoy, permission: 'view-support', module: 'support' },
    { title: 'App Settings', href: '/admin/settings/app', icon: Settings, permission: 'manage-settings', module: 'settings' },
];

function hasPermissionCheck(permissions: string[], slug: string | undefined, slugs?: string[]): boolean {
    if (slugs && slugs.length > 0) {
        return slugs.some((s) => hasPermissionCheck(permissions, s));
    }
    if (!slug) return true;
    if (permissions.includes('*')) return true;
    return permissions.includes(slug);
}

function filterNav(
    items: NavEntry[],
    permissions: string[],
    planModules: string[],
): NavEntry[] {
    return items.reduce<NavEntry[]>((acc, item) => {
        const canAccess = (module?: string, permission?: string, perms?: string[]) => {
            if (!isModuleAllowed(planModules, module)) return false;
            return hasPermissionCheck(permissions, permission, perms);
        };
        if ('items' in item) {
            const group = item as NavGroupWithPerm;
            const visibleChildren = group.items.filter((child) =>
                canAccess(child.module, child.permission, child.permissions),
            );
            if (visibleChildren.length > 0 && canAccess(group.module, group.permission, group.permissions)) {
                acc.push({ ...group, items: visibleChildren });
            }
        } else {
            const navItem = item as NavItemWithPerm;
            if (canAccess(navItem.module, navItem.permission, navItem.permissions)) {
                acc.push(item);
            }
        }
        return acc;
    }, []);
}

export function AppSidebar() {
    const { permissions, planModules, hasPermission } = useAuth();
    const filteredMain = filterNav(mainNavItems, permissions, planModules);
    const homeHref = defaultAdminRoute(hasPermission);

    const navItems: NavEntry[] = filteredMain;

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link to={homeHref}>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navItems as (NavItem | NavGroup)[]} />
            </SidebarContent>
            <SidebarFooter>
                <NavFooter items={[]} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
