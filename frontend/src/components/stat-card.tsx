import { type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon?: LucideIcon;
    iconClassName?: string;
    trend?: {
        value: number;
        label: string;
        isPositive?: boolean;
    };
    className?: string;
}

export function StatCard({
    title,
    value,
    description,
    icon: Icon,
    iconClassName,
    trend,
    className,
}: StatCardProps) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-2xl p-5',
                'bg-white/70 dark:bg-white/5',
                'backdrop-blur-md',
                'border border-white/80 dark:border-white/10',
                'shadow-[0_8px_32px_rgba(3,107,211,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
                'transition-all duration-300 hover:shadow-[0_12px_40px_rgba(3,107,211,0.15)] hover:-translate-y-0.5',
                className,
            )}
        >
            {/* Subtle top shimmer line */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent dark:via-blue-400/20" />

            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 dark:text-muted-foreground/60 mb-1">
                        {title}
                    </p>
                    <div className="text-3xl font-bold tracking-tight bg-gradient-to-br from-[#001f3f] to-[#036bd3] bg-clip-text text-transparent dark:from-white dark:to-blue-300">
                        {value}
                    </div>
                    {description && (
                        <p className="mt-1 text-xs text-muted-foreground/60 truncate">
                            {description}
                        </p>
                    )}
                </div>

                {Icon && (
                    <div className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/30',
                        'shadow-inner border border-blue-100/80 dark:border-blue-700/30',
                    )}>
                        <Icon className={cn('h-5 w-5 text-[#036bd3] dark:text-blue-300', iconClassName)} />
                    </div>
                )}
            </div>

            {trend && (
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                    <span className={cn(
                        'font-semibold',
                        trend.isPositive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-500 dark:text-red-400',
                    )}>
                        {trend.isPositive ? '▲' : '▼'} {Math.abs(trend.value)}%
                    </span>
                    <span className="text-muted-foreground/60">{trend.label}</span>
                </div>
            )}
        </div>
    );
}
