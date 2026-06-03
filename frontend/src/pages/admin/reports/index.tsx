import axios from '@/lib/axios';
import {
    BarChart3,
    TrendingUp,
    Users,
    Building2,
    Target,
    FileText,
    Receipt,
    CheckCircle2,
    DollarSign,
    Activity,
} from 'lucide-react';
import { useEffect, useState } from 'react';
// Head removed - use document.title instead

import AppLayout from '@/layouts/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { handleApiError } from '@/lib/toast';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Stats {
    leads: {
        total: number;
        new_this_month: number;
        converted: number;
        conversion_rate: number;
    };
    contacts: {
        total: number;
        new_this_month: number;
        active: number;
    };
    companies: {
        total: number;
        new_this_month: number;
        active: number;
    };
    deals: {
        total: number;
        total_value: number;
        won: number;
        won_value: number;
        lost: number;
        in_progress: number;
        win_rate: number;
    };
    invoices: {
        total: number;
        total_amount: number;
        paid: number;
        paid_amount: number;
        pending: number;
        pending_amount: number;
        overdue: number;
        overdue_amount: number;
    };
    tasks: {
        total: number;
        completed: number;
        in_progress: number;
        overdue: number;
    };
    users: {
        total: number;
        active: number;
        new_this_month: number;
    };
}

interface TrendData {
    month: string;
    leads: number;
    contacts: number;
    deals: number;
    revenue: number;
}

interface PipelineData {
    stage: string;
    count: number;
    total_value: number;
}

interface LeadSourceData {
    source: string;
    count: number;
}

export default function ReportsIndex() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);
    const [trends, setTrends] = useState<TrendData[]>([]);
    const [pipeline, setPipeline] = useState<PipelineData[]>([]);
    const [leadSources, setLeadSources] = useState<LeadSourceData[]>([]);
    const [trendPeriod, setTrendPeriod] = useState('6');

    const breadcrumbs = [
        { label: 'Reports', href: '/admin/reports' },
    ];

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        fetchTrends();
    }, [trendPeriod]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [statsRes, pipelineRes, sourcesRes] = await Promise.all([
                axios.get('/admin/reports/stats'),
                axios.get('/admin/reports/pipeline'),
                axios.get('/admin/reports/lead-sources'),
            ]);

            setStats(statsRes.data.data);
            setPipeline(pipelineRes.data.data);
            setLeadSources(sourcesRes.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTrends = async () => {
        try {
            const response = await axios.get('/admin/reports/trends', {
                params: { months: trendPeriod },
            });
            setTrends(response.data.data);
        } catch (error) {
            handleApiError(error);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-32" />
                        ))}
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    {/* decorative blob */}
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <BarChart3 className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Reports & Analytics
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    View key metrics and performance indicators
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lead Statistics */}
                <div>
                    <h2 className="mb-4 text-xl font-semibold">Lead Performance</h2>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                                <Target className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats?.leads.total || 0}</div>
                                <p className="text-xs text-muted-foreground">
                                    +{stats?.leads.new_this_month || 0} this month
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Converted Leads
                                </CardTitle>
                                <CheckCircle2 className="size-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.leads.converted || 0}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Conversion rate: {stats?.leads.conversion_rate || 0}%
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                                <Users className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.contacts.total || 0}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    +{stats?.contacts.new_this_month || 0} this month
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Total Companies
                                </CardTitle>
                                <Building2 className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.companies.total || 0}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {stats?.companies.active || 0} active
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Sales & Revenue Statistics */}
                <div>
                    <h2 className="mb-4 text-xl font-semibold">Sales & Revenue</h2>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
                                <FileText className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats?.deals.total || 0}</div>
                                <p className="text-xs text-muted-foreground">
                                    Win rate: {stats?.deals.win_rate || 0}%
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Deals Value</CardTitle>
                                <DollarSign className="size-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatCurrency(stats?.deals.total_value || 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Won: {formatCurrency(stats?.deals.won_value || 0)}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Total Invoices
                                </CardTitle>
                                <Receipt className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.invoices.total || 0}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Paid: {stats?.invoices.paid || 0}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                                <TrendingUp className="size-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatCurrency(stats?.invoices.paid_amount || 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Pending: {formatCurrency(stats?.invoices.pending_amount || 0)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Pipeline & Lead Sources */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    {/* Sales Pipeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Sales Pipeline</CardTitle>
                            <CardDescription>Deal distribution by stage</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {pipeline.map((item) => (
                                    <div key={item.stage} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="capitalize font-medium">
                                                {item.stage}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {item.count} deals •{' '}
                                                {formatCurrency(item.total_value)}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{
                                                    width: `${(item.count / (stats?.deals.total || 1)) * 100}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Lead Sources */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Lead Sources</CardTitle>
                            <CardDescription>Where your leads come from</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {leadSources.slice(0, 5).map((item) => (
                                    <div key={item.source} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="capitalize font-medium">
                                                {item.source}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {item.count} leads
                                            </span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-600"
                                                style={{
                                                    width: `${(item.count / (stats?.leads.total || 1)) * 100}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Monthly Trends */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Monthly Trends</CardTitle>
                                <CardDescription>
                                    Track your CRM performance over time
                                </CardDescription>
                            </div>
                            <Select value={trendPeriod} onValueChange={setTrendPeriod}>
                                <SelectTrigger className="w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3">3 Months</SelectItem>
                                    <SelectItem value="6">6 Months</SelectItem>
                                    <SelectItem value="12">12 Months</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                                <div>Month</div>
                                <div className="text-right">Leads</div>
                                <div className="text-right">Contacts</div>
                                <div className="text-right">Deals</div>
                                <div className="text-right">Revenue</div>
                            </div>
                            {trends.map((trend) => (
                                <div
                                    key={trend.month}
                                    className="grid grid-cols-5 gap-2 text-sm items-center"
                                >
                                    <div className="font-medium">{trend.month}</div>
                                    <div className="text-right">{trend.leads}</div>
                                    <div className="text-right">{trend.contacts}</div>
                                    <div className="text-right">{trend.deals}</div>
                                    <div className="text-right">
                                        {formatCurrency(trend.revenue)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Task & Team Stats */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Task Overview</CardTitle>
                            <CardDescription>Current task status</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Total Tasks</span>
                                    <span className="text-2xl font-bold">
                                        {stats?.tasks.total || 0}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Completed</span>
                                        <span className="text-green-600">
                                            {stats?.tasks.completed || 0}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>In Progress</span>
                                        <span className="text-blue-600">
                                            {stats?.tasks.in_progress || 0}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>Overdue</span>
                                        <span className="text-red-600">
                                            {stats?.tasks.overdue || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Team Overview</CardTitle>
                            <CardDescription>User statistics</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Total Users</span>
                                    <span className="text-2xl font-bold">
                                        {stats?.users.total || 0}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Active Users</span>
                                        <span className="text-green-600">
                                            {stats?.users.active || 0}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>New This Month</span>
                                        <span className="text-blue-600">
                                            {stats?.users.new_this_month || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
