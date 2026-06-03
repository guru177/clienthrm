import { Activity, TrendingDown, TrendingUp, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import axios from '@/lib/axios';
import { handleApiError } from '@/lib/toast';

interface RecentActivity {
    id: number;
    user_name: string;
    user_initials: string;
    action: string;
    type: 'deal' | 'lead' | 'contact' | 'company';
    timestamp: string;
}

export function RecentActivities() {
    const [activities, setActivities] = useState<RecentActivity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActivities();
    }, []);

    const fetchActivities = async () => {
        try {
            const response = await axios.get('/api/analytics/recent-activities');
            setActivities(response.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'deal':
                return <TrendingUp className="h-4 w-4 text-green-600" />;
            case 'lead':
                return <TrendingDown className="h-4 w-4 text-blue-600" />;
            default:
                return <Activity className="h-4 w-4 text-muted-foreground" />;
        }
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Activities</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="h-12 animate-pulse rounded bg-muted"
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Activities</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {activities.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground">
                            No recent activities
                        </p>
                    ) : (
                        activities.map((activity) => (
                            <div
                                key={activity.id}
                                className="flex items-center gap-4"
                            >
                                <Avatar className="h-9 w-9">
                                    <AvatarFallback>
                                        {activity.user_initials}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        {activity.user_name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {activity.action}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {getActivityIcon(activity.type)}
                                    <div className="text-xs text-muted-foreground">
                                        {activity.timestamp}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
