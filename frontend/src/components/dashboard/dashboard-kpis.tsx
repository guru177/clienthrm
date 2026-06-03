import {
    Building2,
    IndianRupee,
    TrendingUp,
    Users,
    UserCheck,
    Briefcase,
    Target,
    CheckCircle2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { StatCard } from '@/components/stat-card';
import axios from '@/lib/axios';
import { handleApiError } from '@/lib/toast';

interface DashboardStats {
    totalRevenue: number;
    revenueChange: number;
    totalContacts: number;
    contactsChange: number;
    totalCompanies: number;
    companiesChange: number;
    totalLeads: number;
    leadsChange: number;
    activeDeals: number;
    dealsChange: number;
    conversionRate: number;
    conversionChange: number;
    wonDeals: number;
    wonDealsChange: number;
    avgDealValue: number;
    avgDealChange: number;
}

export function DashboardKPIs() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/api/analytics/dashboard-stats');
            setStats(response.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !stats) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(8)].map((_, i) => (
                    <div
                        key={i}
                        className="h-32 animate-pulse rounded-lg bg-muted"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
                title="Total Revenue"
                value={`₹${stats.totalRevenue.toLocaleString()}`}
                icon={IndianRupee}
                iconClassName="text-green-600 dark:text-green-400"
                trend={{
                    value: stats.revenueChange,
                    label: 'from last month',
                    isPositive: stats.revenueChange >= 0,
                }}
            />
            <StatCard
                title="Active Deals"
                value={stats.activeDeals}
                icon={Briefcase}
                iconClassName="text-blue-600 dark:text-blue-400"
                trend={{
                    value: stats.dealsChange,
                    label: 'from last month',
                    isPositive: stats.dealsChange >= 0,
                }}
            />
            <StatCard
                title="Won Deals"
                value={stats.wonDeals}
                icon={CheckCircle2}
                iconClassName="text-emerald-600 dark:text-emerald-400"
                trend={{
                    value: stats.wonDealsChange,
                    label: 'from last month',
                    isPositive: stats.wonDealsChange >= 0,
                }}
            />
            <StatCard
                title="Avg Deal Value"
                value={`₹${stats.avgDealValue.toLocaleString()}`}
                icon={TrendingUp}
                iconClassName="text-purple-600 dark:text-purple-400"
                trend={{
                    value: stats.avgDealChange,
                    label: 'from last month',
                    isPositive: stats.avgDealChange >= 0,
                }}
            />
            <StatCard
                title="Total Contacts"
                value={stats.totalContacts}
                icon={Users}
                iconClassName="text-indigo-600 dark:text-indigo-400"
                trend={{
                    value: stats.contactsChange,
                    label: 'from last month',
                    isPositive: stats.contactsChange >= 0,
                }}
            />
            <StatCard
                title="Total Companies"
                value={stats.totalCompanies}
                icon={Building2}
                iconClassName="text-cyan-600 dark:text-cyan-400"
                trend={{
                    value: stats.companiesChange,
                    label: 'from last month',
                    isPositive: stats.companiesChange >= 0,
                }}
            />
            <StatCard
                title="Active Leads"
                value={stats.totalLeads}
                icon={Target}
                iconClassName="text-orange-600 dark:text-orange-400"
                trend={{
                    value: stats.leadsChange,
                    label: 'from last month',
                    isPositive: stats.leadsChange >= 0,
                }}
            />
            <StatCard
                title="Conversion Rate"
                value={`${stats.conversionRate}%`}
                icon={UserCheck}
                iconClassName="text-pink-600 dark:text-pink-400"
                trend={{
                    value: stats.conversionChange,
                    label: 'from last month',
                    isPositive: stats.conversionChange >= 0,
                }}
            />
        </div>
    );
}
