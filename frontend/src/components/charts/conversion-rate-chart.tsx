import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ConversionRateChartProps {
    data: Array<{
        month: string;
        leadToContact: number;
        contactToDeal: number;
        dealToClosed: number;
    }>;
}

export function ConversionRateChart({ data }: ConversionRateChartProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Conversion Rates</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-muted"
                        />
                        <XAxis
                            dataKey="month"
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '6px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                            formatter={(value: number) => `${value}%`}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="leadToContact"
                            stroke="#f59e0b"
                            strokeWidth={3}
                            name="Lead → Contact"
                            dot={{ fill: '#f59e0b', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="contactToDeal"
                            stroke="#3b82f6"
                            strokeWidth={3}
                            name="Contact → Deal"
                            dot={{ fill: '#3b82f6', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="dealToClosed"
                            stroke="#10b981"
                            strokeWidth={3}
                            name="Deal → Closed"
                            dot={{ fill: '#10b981', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
