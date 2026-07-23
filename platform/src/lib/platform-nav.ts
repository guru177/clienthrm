import {
    LayoutGrid,
    Users,
    CreditCard,
    Globe,
    Rocket,
    History,
    Megaphone,
    Shield,
    UserCog,
    Activity,
    Banknote,
    Ticket,
    ArrowUpCircle,
    type LucideIcon,
} from 'lucide-react';

export interface PlatformNavItem {
    title: string;
    href: string;
    icon: LucideIcon;
    description: string;
}

export const platformNavItems: PlatformNavItem[] = [
    {
        title: 'Dashboard',
        href: '/',
        icon: LayoutGrid,
        description: 'Platform overview and key metrics',
    },
    {
        title: 'Organizations',
        href: '/users',
        icon: Users,
        description: 'Manage organizations and tenant access',
    },
    {
        title: 'Subscription plan',
        href: '/subscription-plans',
        icon: CreditCard,
        description: 'Manage plans and tenant subscriptions',
    },
    {
        title: 'IP tracking',
        href: '/ip-tracking',
        icon: Globe,
        description: 'Track live company admin sessions and locations',
    },
    {
        title: 'Announcements',
        href: '/announcements',
        icon: Megaphone,
        description: 'Broadcast banners to all tenants or specific orgs',
    },
    {
        title: 'New release pages',
        href: '/releases',
        icon: Rocket,
        description: 'Publish release notes for tenant apps',
    },
    {
        title: 'Audit log',
        href: '/audit-log',
        icon: History,
        description: 'Every platform admin action recorded',
    },
    {
        title: 'Platform team',
        href: '/platform-team',
        icon: UserCog,
        description: 'Manage platform admin accounts and roles',
    },
    {
        title: 'Revenue',
        href: '/revenue',
        icon: Banknote,
        description: 'MRR, invoices, and pending collections',
    },
    {
        title: 'Upgrade requests',
        href: '/upgrade-requests',
        icon: ArrowUpCircle,
        description: 'Tenant plan change queue',
    },
    {
        title: 'Support inbox',
        href: '/support',
        icon: Ticket,
        description: 'Tickets from tenant admins',
    },
    {
        title: 'System health',
        href: '/system-health',
        icon: Activity,
        description: 'Backend status, database size and freshness',
    },
    {
        title: 'Account & 2FA',
        href: '/account',
        icon: Shield,
        description: 'Your profile, sessions, and two-factor authentication',
    },
];

export function platformNavMeta(pathname: string): PlatformNavItem {
    const exact = platformNavItems.find((item) => item.href === pathname);
    if (exact) return exact;

    const nested = platformNavItems.find(
        (item) => item.href !== '/' && pathname.startsWith(item.href),
    );
    return nested ?? platformNavItems[0];
}
