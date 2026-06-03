import { IndianRupee, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import axios from '@/lib/axios';
import { handleApiError } from '@/lib/toast';

interface TopPerformer {
    id: number;
    name: string;
    initials: string;
    deals_closed: number;
    total_value: number;
    conversion_rate: number;
}

export function TopPerformers() {
    const [performers, setPerformers] = useState<TopPerformer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPerformers();
    }, []);

    const fetchPerformers = async () => {
        try {
            const response = await axios.get('/api/analytics/top-performers');
            setPerformers(response.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Top Performers</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="h-16 animate-pulse rounded bg-muted"
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
                <CardTitle>Top Performers</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {performers.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground">
                            No data available
                        </p>
                    ) : (
                        performers.map((performer, index) => (
                            <div
                                key={performer.id}
                                className="flex items-center gap-4"
                            >
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                    #{index + 1}
                                </div>
                                <Avatar className="h-9 w-9">
                                    <AvatarFallback>
                                        {performer.initials}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-none">
                                        {performer.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {performer.deals_closed} deals closed •{' '}
                                        {performer.conversion_rate}% conversion
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
                                    <IndianRupee className="h-4 w-4" />
                                    {(performer.total_value / 1000).toFixed(0)}k
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
