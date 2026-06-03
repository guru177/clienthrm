import {
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DealsFunnelChartProps {
    data: Array<{
        name: string;
        value: number;
        count: number;
    }>;
}

const COLORS = [
    '#f59e0b',
    '#3b82f6',
    '#8b5cf6',
    '#10b981',
    '#ef4444',
];

export function DealsFunnelChart({ data }: DealsFunnelChartProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Deals by Stage</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({
                                cx,
                                cy,
                                midAngle,
                                innerRadius,
                                outerRadius,
                                percent,
                            }) => {
                                const radius =
                                    innerRadius +
                                    (outerRadius - innerRadius) * 0.5;
                                const x =
                                    cx + radius * Math.cos(-midAngle * Math.PI / 180);
                                const y =
                                    cy + radius * Math.sin(-midAngle * Math.PI / 180);

                                return (
                                    <text
                                        x={x}
                                        y={y}
                                        fill="white"
                                        textAnchor={x > cx ? 'start' : 'end'}
                                        dominantBaseline="central"
                                        className="text-xs font-medium"
                                    >
                                        {`${(percent * 100).toFixed(0)}%`}
                                    </text>
                                );
                            }}
                            outerRadius={100}
                            fill="hsl(var(--primary))"
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '6px',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                            formatter={(value: number, name, props) => [
                                `₹${value.toLocaleString()} (${props.payload.count} deals)`,
                                props.payload.name,
                            ]}
                        />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
