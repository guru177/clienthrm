import {
    AlertOctagon,
    AlertTriangle,
    Building2,
    CheckCircle,
    Info,
    Users,
    type LucideIcon,
} from 'lucide-react';

export interface OrgNotificationLike {
    title: string;
    body: string;
    severity: string;
    audience: string;
    target_name?: string | null;
    image_url?: string | null;
    created_by_name?: string | null;
    created_at?: string | null;
}

export const SEVERITY_CONFIG: Record<
    string,
    { label: string; icon: LucideIcon; badge: string; accent: string; dot: string }
> = {
    info: {
        label: 'Information',
        icon: Info,
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
        accent: 'border-l-blue-500',
        dot: 'bg-blue-500',
    },
    warning: {
        label: 'Important',
        icon: AlertTriangle,
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
        accent: 'border-l-amber-500',
        dot: 'bg-amber-500',
    },
    critical: {
        label: 'Critical',
        icon: AlertOctagon,
        badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
        accent: 'border-l-red-500',
        dot: 'bg-red-500',
    },
    success: {
        label: 'Update',
        icon: CheckCircle,
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
        accent: 'border-l-emerald-500',
        dot: 'bg-emerald-500',
    },
};

export function severityConfig(severity: string) {
    return SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
}

export function audienceSummary(n: Pick<OrgNotificationLike, 'audience' | 'target_name'>): string {
    if (n.audience === 'all') return 'All employees';
    if (n.target_name) {
        return n.audience === 'department'
            ? `Department · ${n.target_name}`
            : `Designation · ${n.target_name}`;
    }
    if (n.audience === 'department') return 'Specific department';
    return 'Specific designation';
}

export function audienceIcon(audience: string): LucideIcon {
    if (audience === 'all') return Users;
    if (audience === 'department') return Building2;
    return Users;
}
