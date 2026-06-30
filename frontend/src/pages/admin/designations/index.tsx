// Head removed - use document.title instead
import axios from '@/lib/axios';
import { Plus, Users, Award, CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

import DesignationForm from '@/components/designations/designation-form';
import DesignationTable from '@/components/designations/designation-table';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Designations',
        href: '/admin/designations',
    },
];

interface Stats {
    total: number;
    active: number;
    inactive: number;
    with_users: number;
}

interface Designation {
    id: number;
    name: string;
    slug: string;
    description?: string;
    level?: number;
    is_active: boolean;
}

const statCards = [
    {
        label: 'Total Designations',
        key: 'total' as keyof Stats,
        icon: Award,
        iconBg: 'bg-gradient-to-br from-[#071b3a] to-[#0d4a8a]',
        valueColor: 'bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] bg-clip-text text-transparent',
        shadow: 'shadow-blue-500/20',
    },
    {
        label: 'Active Designations',
        key: 'active' as keyof Stats,
        icon: CheckCircle,
        iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-500',
        valueColor: 'bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent',
        shadow: 'shadow-emerald-500/20',
    },
    {
        label: 'Inactive Designations',
        key: 'inactive' as keyof Stats,
        icon: XCircle,
        iconBg: 'bg-gradient-to-br from-slate-400 to-slate-600',
        valueColor: 'bg-gradient-to-r from-slate-400 to-slate-600 bg-clip-text text-transparent',
        shadow: 'shadow-slate-500/20',
    },
    {
        label: 'With Users',
        key: 'with_users' as keyof Stats,
        icon: Users,
        iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
        valueColor: 'bg-gradient-to-r from-violet-500 to-purple-600 bg-clip-text text-transparent',
        shadow: 'shadow-violet-500/20',
    },
];

export default function DesignationsIndex() {
    const [stats, setStats] = useState<Stats>({
        total: 0,
        active: 0,
        inactive: 0,
        with_users: 0,
    });
    const [loadingStats, setLoadingStats] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        fetchStats();
    }, [refreshTrigger]);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/designations/stats');
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoadingStats(false);
        }
    };

    const handleCreate = () => {
        setEditingDesignation(null);
        setFormOpen(true);
    };

    const handleEdit = (designation: Designation) => {
        setEditingDesignation(designation);
        setFormOpen(true);
    };

    const handleFormSuccess = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="space-y-6">
                {/* Hero Header */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220] px-6 py-5 shadow-sm border border-white/60 dark:border-white/10">
                    {/* Decorative blob */}
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Award className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Designations
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Manage job titles and positions
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={handleCreate}
                            className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Add Designation
                        </Button>
                    </div>
                </div>

                {/* Stat Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {statCards.map(({ label, key, icon: Icon, iconBg, valueColor, shadow }) => (
                        <div
                            key={key}
                            className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/80 dark:border-white/10 shadow-[0_4px_24px_rgba(7,27,58,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] p-5 hover:-translate-y-0.5 transition-transform duration-200"
                        >
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
                            <div className="flex items-start justify-between mb-3">
                                <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">{label}</p>
                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg} shadow-md ${shadow}`}>
                                    <Icon className="h-4 w-4 text-white" />
                                </div>
                            </div>
                            <p className={`text-3xl font-bold ${valueColor}`}>
                                {loadingStats ? '–' : stats[key]}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Designations Table */}
                <DesignationTable
                    onEdit={handleEdit}
                    onRefresh={handleFormSuccess}
                    refreshTrigger={refreshTrigger}
                />

                {/* Designation Form Modal */}
                <DesignationForm
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    onSuccess={handleFormSuccess}
                    designation={editingDesignation}
                />
            </div>
        </AppLayout>
    );
}
