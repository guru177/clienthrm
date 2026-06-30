import { Clock, Users, TrendingUp, AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceStatsData } from '@/hooks/use-attendance-stats';

interface AttendanceStatsProps {
    stats?: AttendanceStatsData | null;
    loading?: boolean;
    /** e.g. "App attendance", "Biometric attendance" */
    title?: string;
    /** Override scope label; defaults from stats.scope */
    scopeLabel?: string;
}

const SOURCE_LABELS: Record<string, string> = {
    all: 'All sources',
    app: 'App / face clock-in',
    biometric: 'Biometric device',
    manual: 'Manual HR entry',
};

export default function AttendanceStats({
    stats,
    loading = false,
    title = 'Attendance statistics',
    scopeLabel,
}: AttendanceStatsProps) {
    if (loading) {
        return (
            <Card>
                <CardContent className="flex min-h-[120px] items-center justify-center pt-6">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </CardContent>
            </Card>
        );
    }

    if (!stats) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">No data available</p>
                </CardContent>
            </Card>
        );
    }

    const isSelf = stats.scope === 'self';
    const resolvedScope =
        scopeLabel ?? (isSelf ? 'My attendance (this month)' : 'Organization-wide (this month)');
    const sourceKey = stats.source ?? 'all';

    const statCards = [
        {
            label: 'Total Days',
            value: stats.total_days ?? 0,
            icon: Users,
            color: 'bg-blue-100 text-blue-600',
        },
        {
            label: 'Present',
            value: stats.present_days ?? 0,
            icon: TrendingUp,
            color: 'bg-green-100 text-green-600',
        },
        {
            label: isSelf ? 'Absent (month)' : 'Absent today',
            value: stats.absent_days ?? 0,
            icon: AlertCircle,
            color: 'bg-red-100 text-red-600',
        },
        {
            label: 'Late Days',
            value: stats.late_days ?? 0,
            icon: Clock,
            color: 'bg-orange-100 text-orange-600',
        },
        {
            label: 'Early Exits',
            value: stats.early_exit_days ?? 0,
            icon: Clock,
            color: 'bg-purple-100 text-purple-600',
        },
        {
            label: 'Total Hours',
            value: `${stats.total_hours ?? 0}h`,
            icon: Clock,
            color: 'bg-indigo-100 text-indigo-600',
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{title}</h2>
                <Badge variant={isSelf ? 'secondary' : 'default'}>{resolvedScope}</Badge>
                {sourceKey !== 'all' && (
                    <Badge variant="outline">{SOURCE_LABELS[sourceKey] ?? sourceKey}</Badge>
                )}
            </div>

            {!isSelf && stats.by_source && sourceKey === 'all' && (
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>By source:</span>
                    <Badge variant="outline">App {stats.by_source.app}</Badge>
                    <Badge variant="outline">Biometric {stats.by_source.biometric}</Badge>
                    <Badge variant="outline">Manual {stats.by_source.manual}</Badge>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {statCards.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                                    <div className={`rounded-lg p-2 ${stat.color}`}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stat.value}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
