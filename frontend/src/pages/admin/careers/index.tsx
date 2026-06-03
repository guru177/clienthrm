// Head removed - use document.title instead
import axios from '@/lib/axios';
import { Plus, Briefcase, CheckCircle, XCircle, Users } from 'lucide-react';
import { useState, useEffect } from 'react';

import CareerForm from '@/components/careers/career-form';
import CareerTable from '@/components/careers/career-table';

import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Careers',
        href: '/admin/careers',
    },
];

interface Stats {
    total: number;
    active: number;
    inactive: number;
    total_applications: number;
}

interface Career {
    id: number;
    title: string;
    slug: string;
    location: string;
    job_type: string;
    experience_required: string | null;
    description: string;
    requirements: string[] | null;
    responsibilities: string[] | null;
    salary_range: string | null;
    is_active: boolean;
    posted_at: string | null;
    applications_count?: number;
    created_at: string;
    updated_at: string;
}

export default function CareersIndex() {
    const [stats, setStats] = useState<Stats>({
        total: 0,
        active: 0,
        inactive: 0,
        total_applications: 0,
    });
    const [loadingStats, setLoadingStats] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editingCareer, setEditingCareer] = useState<Career | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        fetchStats();
    }, [refreshTrigger]);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/careers/stats');
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
        setEditingCareer(null);
        setFormOpen(true);
    };

    const handleEdit = (career: Career) => {
        setEditingCareer(career);
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
                    <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 opacity-20">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#071b3a" d="M44.7,-76.4C58.4,-69.7,70.3,-58.6,77.9,-44.9C85.5,-31.2,88.7,-15.6,87.4,-0.8C86,14,80,28,72.1,40.5C64.2,53,54.2,64,42.1,71.3C30,78.6,15,82.3,0.1,82.1C-14.8,81.9,-29.6,77.8,-42.7,70.5C-55.8,63.2,-67.3,52.7,-74.5,39.5C-81.7,26.3,-84.7,10.5,-83.1,-4.9C-81.6,-20.3,-75.5,-35.2,-66.3,-47.4C-57.1,-59.6,-44.8,-69.1,-31.6,-76.1C-18.4,-83.1,-4.6,-87.6,8.2,-86.2C21,-84.8,31,-83.1,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                    </div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#071b3a]/15 dark:bg-white/10 border border-[#071b3a]/20 dark:border-white/10 shadow-inner">
                                <Briefcase className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Job Postings
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Manage career opportunities
                                </p>
                            </div>
                        </div>
                        <Button onClick={handleCreate} className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2 z-10">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Job Posting
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Total Job Postings"
                        value={loadingStats ? '-' : stats.total}
                        icon={Briefcase}
                    />
                    <StatCard
                        title="Active Postings"
                        value={loadingStats ? '-' : stats.active}
                        icon={CheckCircle}
                        trend={{ value: 0, label: 'Active', isPositive: true }}
                    />
                    <StatCard
                        title="Inactive Postings"
                        value={loadingStats ? '-' : stats.inactive}
                        icon={XCircle}
                        trend={{ value: 0, label: 'Inactive', isPositive: false }}
                    />
                    <StatCard
                        title="Total Applications"
                        value={loadingStats ? '-' : stats.total_applications}
                        icon={Users}
                    />
                </div>

                {/* Careers Table */}
                <Card className="glass-card">
                <CareerTable
                    onEdit={handleEdit}
                    onRefresh={handleFormSuccess}
                    reloadTrigger={refreshTrigger}
                />
                </Card>

                {/* Career Form Modal */}
                <CareerForm
                    open={formOpen}
                    onClose={() => setFormOpen(false)}
                    onSuccess={handleFormSuccess}
                    career={editingCareer}
                />
            </div>
        </AppLayout>
    );
}
