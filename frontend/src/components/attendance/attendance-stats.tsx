import { Clock, Users, TrendingUp, AlertCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AttendanceStatsProps {
    stats?: {
        total_days: number;
        present_days: number;
        absent_days: number;
        late_days: number;
        early_exit_days: number;
        total_hours: number;
    };
}

export default function AttendanceStats({ stats }: AttendanceStatsProps) {
    if (!stats) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">No data available</p>
                </CardContent>
            </Card>
        );
    }

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
            label: 'Absent',
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Card key={stat.label}>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium">
                                    {stat.label}
                                </CardTitle>
                                <div className={`p-2 rounded-lg ${stat.color}`}>
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
    );
}
