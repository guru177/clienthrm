import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { handleApiError } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { isModuleAllowed } from '@/lib/plan-modules';
import {
    Users,
    CheckCircle2,
    Clock,
    TargetIcon,
    DollarSign,
    Calendar,
    CalendarDays,
    ClipboardList,
    Receipt,
    ChevronRight,
    ArrowUpRight,
    ArrowDownRight,
    Sun,
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LabelList,
} from 'recharts';

import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { cn } from '@/lib/utils';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: '/admin/dashboard',
    },
];

interface HRDashboardData {
    metrics: {
        totalEmployees: number;
        attendancePercentage: number;
        attendanceCount: number;
        pendingRequests: number;
        activeProjects: number;
    };
    attendance: {
        leaveTypes: Record<string, number>;
        trends: Array<{ date: string; percentage: number; count: number }>;
        upcomingHolidays: Array<{ name: string; date: string; daysAway: number }>;
    };
    payroll: {
        currentMonth: number;
        previousMonth: number;
        change: number;
        byDepartment: Array<{
            department: string;
            totalCost: number;
            employees: number;
            average: number;
        }>;
    };
    operations: {
        taskProgress: { todo: number; in_progress: number; completed: number; on_hold: number };
        celebrations: Array<{ name: string; type: string; date: string; isSoon: boolean }>;
        recentWorkflows: Array<{
            id: string;
            process: string;
            status: string;
            step: string;
            timestamp: string;
        }>;
        recentEmployees: Array<{
            id: number;
            name: string;
            department: string;
            joinedAt: string;
        }>;
    };
}

const EMPTY_DASHBOARD_DATA: HRDashboardData = {
    metrics: {
        totalEmployees: 0,
        attendancePercentage: 0,
        attendanceCount: 0,
        pendingRequests: 0,
        activeProjects: 0,
    },
    attendance: {
        leaveTypes: {},
        trends: [],
        upcomingHolidays: [],
    },
    payroll: {
        currentMonth: 0,
        previousMonth: 0,
        change: 0,
        byDepartment: [],
    },
    operations: {
        taskProgress: {
            todo: 0,
            in_progress: 0,
            completed: 0,
            on_hold: 0,
        },
        celebrations: [],
        recentWorkflows: [],
        recentEmployees: [],
    },
};

type StatusKey = 'today' | 'attendance' | 'leave';

function formatInrCompact(amount: number): string {
    if (amount >= 1_000_000) return `₹${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
    return `₹${amount.toFixed(0)}`;
}

function firstNameFrom(name?: string | null): string {
    const trimmed = name?.trim();
    if (!trimmed) return 'there';
    return trimmed.split(/\s+/)[0] ?? 'there';
}

function decorativeSparkline(endValue: number, seed: number): Array<{ v: number }> {
    const base = Math.max(endValue, 1);
    const factors = [0.72, 0.85, 0.78, 0.92, 0.88, 0.95, 1];
    return factors.map((f, i) => ({
        v: Math.max(0, Math.round(base * f * (1 + ((seed + i) % 3) * 0.02))),
    }));
}

function payrollSparkline(previous: number, current: number): Array<{ v: number }> {
    const a = previous || 0;
    const b = current || 0;
    return [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({
        v: Math.round(a + (b - a) * t),
    }));
}

function DashCard({
    children,
    className = '',
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.04)]',
                'dark:border-white/10 dark:bg-slate-900/50 dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]',
                className,
            )}
        >
            {children}
        </div>
    );
}

function Sparkline({
    data,
    color,
}: {
    data: Array<{ v: number }>;
    color: string;
}) {
    if (!data.length) return null;
    return (
        <div className="h-10 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={1.5}
                        fill={`url(#spark-${color.replace('#', '')})`}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function MetricCard({
    label,
    value,
    unit,
    icon: Icon,
    change,
    accentBg,
    accentFg,
    iconBg,
    sparkData,
    sparkColor,
}: {
    label: string;
    value: number | string;
    unit?: string;
    icon: React.ComponentType<{ className?: string }>;
    change?: number;
    accentBg: string;
    accentFg: string;
    iconBg: string;
    sparkData: Array<{ v: number }>;
    sparkColor: string;
}) {
    const showChange = change !== undefined;
    const isPositive = (change ?? 0) >= 0;

    return (
        <div
            className={cn(
                'rounded-2xl border border-transparent p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-transform duration-200 hover:-translate-y-0.5',
                accentBg,
                'dark:border-white/10 dark:bg-slate-900/40',
            )}
        >
            <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
                <div
                    className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        iconBg,
                    )}
                >
                    <Icon className={cn('h-4 w-4', accentFg)} />
                </div>
            </div>
            <div className="mb-3 flex items-baseline gap-1">
                <p className={cn('text-3xl font-bold tracking-tight', accentFg)}>{value}</p>
                {unit && <span className={cn('text-lg font-semibold', accentFg)}>{unit}</span>}
            </div>
            <div className="flex items-end justify-between gap-2">
                {showChange ? (
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        {isPositive ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                            <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span>
                            {Math.abs(change ?? 0)}% from last month
                        </span>
                    </div>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                )}
                <Sparkline data={sparkData} color={sparkColor} />
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value?: number; name?: string; color?: string }>;
    label?: string;
}) {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg dark:border-white/10 dark:bg-slate-900/95">
                {label && <p className="mb-1 text-xs text-muted-foreground">{label}</p>}
                {payload.map((p, i) => (
                    <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
                        {typeof p.value === 'number' ? `${p.value}%` : p.value}
                    </p>
                ))}
            </div>
        );
    }
    return null;
}

export default function Dashboard() {
    const { user, hasPermission, planModules } = useAuth();
    const [hrData, setHrData] = useState<HRDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusKey, setStatusKey] = useState<StatusKey>('today');

    useEffect(() => {
        document.title = 'Dashboard — HRM Portal';
        apiGet<HRDashboardData>('/admin/dashboard/hr-data')
            .then((res) => setHrData(res.data))
            .catch((err) => handleApiError(err))
            .finally(() => setLoading(false));
    }, []);

    const data: HRDashboardData = {
        metrics: { ...EMPTY_DASHBOARD_DATA.metrics, ...(hrData?.metrics ?? {}) },
        attendance: { ...EMPTY_DASHBOARD_DATA.attendance, ...(hrData?.attendance ?? {}) },
        payroll: { ...EMPTY_DASHBOARD_DATA.payroll, ...(hrData?.payroll ?? {}) },
        operations: {
            ...EMPTY_DASHBOARD_DATA.operations,
            ...(hrData?.operations ?? {}),
            taskProgress: {
                ...EMPTY_DASHBOARD_DATA.operations.taskProgress,
                ...(hrData?.operations?.taskProgress ?? {}),
            },
            recentEmployees:
                hrData?.operations?.recentEmployees ??
                EMPTY_DASHBOARD_DATA.operations.recentEmployees,
        },
    };

    const attendanceSpark =
        data.attendance.trends.length > 0
            ? data.attendance.trends.map((t) => ({ v: t.percentage }))
            : decorativeSparkline(data.metrics.attendancePercentage, 1);

    const metricCards = [
        {
            label: 'Total Employees',
            value: data.metrics.totalEmployees,
            icon: Users,
            change: 0,
            accentBg: 'bg-[#EBF2FF]',
            accentFg: 'text-[#2D5BFF]',
            iconBg: 'bg-[#2D5BFF]/15',
            sparkData: decorativeSparkline(data.metrics.totalEmployees, 2),
            sparkColor: '#2D5BFF',
        },
        {
            label: "Today's Attendance",
            value: data.metrics.attendancePercentage,
            unit: '%',
            icon: CheckCircle2,
            change: 0,
            accentBg: 'bg-[#E6F7F0]',
            accentFg: 'text-[#00B388]',
            iconBg: 'bg-[#00B388]/15',
            sparkData: attendanceSpark,
            sparkColor: '#00B388',
        },
        {
            label: 'Pending Requests',
            value: data.metrics.pendingRequests,
            icon: Clock,
            change: 0,
            accentBg: 'bg-[#FFF3E6]',
            accentFg: 'text-[#FF9933]',
            iconBg: 'bg-[#FF9933]/15',
            sparkData: decorativeSparkline(data.metrics.pendingRequests, 3),
            sparkColor: '#FF9933',
        },
        {
            label: 'Active Projects',
            value: data.metrics.activeProjects,
            icon: TargetIcon,
            change: 0,
            accentBg: 'bg-[#F2EBFF]',
            accentFg: 'text-[#8A56FF]',
            iconBg: 'bg-[#8A56FF]/15',
            sparkData: decorativeSparkline(data.metrics.activeProjects, 4),
            sparkColor: '#8A56FF',
        },
        {
            label: 'Pending Payroll',
            value: formatInrCompact(data.payroll.currentMonth),
            icon: DollarSign,
            change: data.payroll.change,
            accentBg: 'bg-[#FFE6EB]',
            accentFg: 'text-[#FF3366]',
            iconBg: 'bg-[#FF3366]/15',
            sparkData: payrollSparkline(data.payroll.previousMonth, data.payroll.currentMonth),
            sparkColor: '#FF3366',
        },
    ];

    const statusItems: Array<{
        key: StatusKey;
        title: string;
        description: string;
        icon: React.ComponentType<{ className?: string }>;
    }> = [
        {
            key: 'today',
            title: 'Today',
            description: `${data.metrics.totalEmployees} employees · ${data.metrics.attendancePercentage}% present`,
            icon: Sun,
        },
        {
            key: 'attendance',
            title: 'Attendance',
            description: `${data.metrics.attendanceCount} checked in (${data.metrics.attendancePercentage}%)`,
            icon: CheckCircle2,
        },
        {
            key: 'leave',
            title: 'Leave Requests',
            description: `${data.metrics.pendingRequests} pending approval${data.metrics.pendingRequests === 1 ? '' : 's'}`,
            icon: ClipboardList,
        },
    ];

    const quickActions = [
        {
            title: 'Request Leave',
            description: 'Submit a new leave request',
            href: '/admin/leave-requests',
            icon: CalendarDays,
            visible:
                isModuleAllowed(planModules, 'leave') && hasPermission('view-leave-requests'),
        },
        {
            title: 'Log Attendance',
            description: 'Clock in or review your day',
            href: '/admin/my-attendance',
            icon: Clock,
            visible:
                isModuleAllowed(planModules, 'attendance') &&
                (hasPermission('view-my-attendance') ||
                    hasPermission('view-attendance') ||
                    hasPermission('manage-attendance')),
        },
        {
            title: 'View Paystub',
            description: 'Open your latest payslip',
            href: '/admin/my-payslips',
            icon: Receipt,
            visible:
                isModuleAllowed(planModules, 'my_payslips') && hasPermission('view-my-payslips'),
        },
    ].filter((a) => a.visible);

    const recentEmployees = data.operations.recentEmployees ?? [];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="flex h-full flex-1 flex-col gap-6 overflow-x-auto p-4 sm:gap-8 sm:p-6">
                {/* Welcome */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                        Welcome back, {firstNameFrom(user?.name)}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Here&apos;s what&apos;s happening across your workforce today.
                    </p>
                </div>

                {/* KPI cards */}
                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {metricCards.map((card) => (
                            <MetricCard key={card.label} {...card} />
                        ))}
                    </div>
                )}

                {/* Middle row */}
                {loading ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={i}
                                className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Status overview */}
                        <DashCard className="p-5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Today&apos;s Status Overview
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Snapshot of today’s activity
                            </p>
                            <div className="mt-4 space-y-2">
                                {statusItems.map((item) => {
                                    const Icon = item.icon;
                                    const active = statusKey === item.key;
                                    return (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => setStatusKey(item.key)}
                                            className={cn(
                                                'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                                                active
                                                    ? 'bg-[#EBF2FF] dark:bg-[#2D5BFF]/20'
                                                    : 'hover:bg-slate-50 dark:hover:bg-white/5',
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                                                    active
                                                        ? 'bg-[#2D5BFF]/15 text-[#2D5BFF]'
                                                        : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                    {item.title}
                                                </p>
                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </DashCard>

                        {/* Attendance trend */}
                        <DashCard className="p-5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Attendance Trend
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Last 7 days
                            </p>
                            <div className="mt-2 h-56 w-full">
                                {data.attendance.trends.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart
                                            data={data.attendance.trends}
                                            margin={{ top: 16, right: 8, left: -12, bottom: 0 }}
                                        >
                                            <defs>
                                                <linearGradient id="attArea" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#00B388" stopOpacity={0.35} />
                                                    <stop offset="100%" stopColor="#00B388" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="rgba(148,163,184,0.25)"
                                                vertical={false}
                                            />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fontSize: 11, fill: '#94a3b8' }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                tick={{ fontSize: 11, fill: '#94a3b8' }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Area
                                                type="monotone"
                                                dataKey="percentage"
                                                stroke="#00B388"
                                                strokeWidth={2}
                                                fill="url(#attArea)"
                                                name="Attendance %"
                                                dot={{ r: 3, fill: '#00B388', strokeWidth: 0 }}
                                                activeDot={{ r: 5 }}
                                            >
                                                <LabelList
                                                    dataKey="percentage"
                                                    position="top"
                                                    formatter={(v: number) => `${v}%`}
                                                    style={{ fontSize: 10, fill: '#64748b' }}
                                                />
                                            </Area>
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="flex h-full items-center justify-center text-sm text-slate-400">
                                        No attendance trend data
                                    </p>
                                )}
                            </div>
                        </DashCard>

                        {/* Quick actions */}
                        <DashCard className="p-5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Quick Actions
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Jump to common tasks
                            </p>
                            <div className="mt-4 space-y-2">
                                {quickActions.length > 0 ? (
                                    quickActions.map((action) => {
                                        const Icon = action.icon;
                                        return (
                                            <Link
                                                key={action.href}
                                                to={action.href}
                                                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 transition-colors hover:border-[#2D5BFF]/30 hover:bg-[#EBF2FF]/60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-[#2D5BFF]/15"
                                            >
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2D5BFF] shadow-sm dark:bg-slate-800">
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                        {action.title}
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                                        {action.description}
                                                    </p>
                                                </div>
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                            </Link>
                                        );
                                    })
                                ) : (
                                    <p className="py-6 text-center text-sm text-slate-400">
                                        No quick actions available
                                    </p>
                                )}
                            </div>
                        </DashCard>
                    </div>
                )}

                {/* Bottom row */}
                {loading ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {[...Array(2)].map((_, i) => (
                            <div
                                key={i}
                                className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {/* Holidays */}
                        <DashCard className="p-5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Upcoming Holidays
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Next events
                            </p>
                            <div className="mt-4">
                                {data.attendance.upcomingHolidays.length > 0 ? (
                                    data.attendance.upcomingHolidays.map((holiday, index) => (
                                        <div
                                            key={`${holiday.name}-${holiday.date}`}
                                            className={cn(
                                                'flex items-center justify-between gap-3 py-3',
                                                index < data.attendance.upcomingHolidays.length - 1 &&
                                                    'border-b border-dashed border-slate-200 dark:border-white/10',
                                            )}
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF2FF] text-[#2D5BFF] dark:bg-[#2D5BFF]/20">
                                                    <Calendar className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                        {holiday.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                                        {holiday.date}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                                {holiday.daysAway > 0
                                                    ? `${holiday.daysAway}d`
                                                    : 'Today'}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="py-8 text-center text-sm text-slate-400">
                                        No upcoming holidays
                                    </p>
                                )}
                            </div>
                        </DashCard>

                        {/* Recently joined employees */}
                        <DashCard className="p-5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Recently Joined Employees
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Latest hires and their department
                            </p>
                            <div className="mt-4">
                                {recentEmployees.length > 0 ? (
                                    recentEmployees.map((employee, index) => (
                                        <div
                                            key={employee.id}
                                            className={cn(
                                                'flex items-center justify-between gap-3 py-3',
                                                index < recentEmployees.length - 1 &&
                                                    'border-b border-dashed border-slate-200 dark:border-white/10',
                                            )}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EBF2FF] text-xs font-bold text-[#2D5BFF] dark:bg-[#2D5BFF]/20">
                                                    {(employee.name?.trim()?.charAt(0) || '?').toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                        {employee.name}
                                                    </p>
                                                    {employee.joinedAt ? (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                            Joined {employee.joinedAt}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <span className="max-w-[45%] truncate text-right text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                {employee.department || 'Unassigned'}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="py-12 text-center text-sm text-slate-400">
                                        No recent employees
                                    </p>
                                )}
                            </div>
                        </DashCard>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
