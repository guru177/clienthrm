// Head removed - use document.title instead
import axios from '@/lib/axios';
import { Building2, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

import CompanyFormModal from '@/components/companies/company-form-modal';
import CompanyTable from '@/components/companies/company-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';

export default function CompaniesIndex() {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        inactive: 0,
    });

    useEffect(() => {
        fetchStats();
    }, [refreshKey]);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/companies/stats');
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const handleCreateNew = () => {
        setEditingCompany(null);
        setIsFormModalOpen(true);
    };

    const handleEdit = (company: any) => {
        setEditingCompany(company);
        setIsFormModalOpen(true);
    };

    const handleFormSuccess = () => {
        setIsFormModalOpen(false);
        setEditingCompany(null);
        setRefreshKey((prev) => prev + 1);
    };

    const breadcrumbs = [
        // { label: 'Dashboard', href: '/dashboard' },
        { label: 'Companies', href: '/admin/companies' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="flex flex-1 flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Companies
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your company accounts and relationships
                        </p>
                    </div>
                    <Button onClick={handleCreateNew}>
                        <Plus className="h-4 w-4" />
                        Add Company
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard
                        title="Total Companies"
                        value={stats.total}
                        description="All companies in the system"
                        icon={Building2}
                    />
                    <StatCard
                        title="Active Companies"
                        value={stats.active}
                        description="Currently active"
                        icon={CheckCircle2}
                        iconClassName="text-green-500"
                    />
                    <StatCard
                        title="Inactive Companies"
                        value={stats.inactive}
                        description="Currently inactive"
                        icon={XCircle}
                        iconClassName="text-red-500"
                    />
                </div>

                {/* Companies Table */}
                <CompanyTable
                    key={refreshKey}
                    onEdit={handleEdit}
                    onRefresh={() => setRefreshKey((prev) => prev + 1)}
                />

                {/* Form Modal */}
                <CompanyFormModal
                    open={isFormModalOpen}
                    onClose={() => {
                        setIsFormModalOpen(false);
                        setEditingCompany(null);
                    }}
                    company={editingCompany}
                    onSuccess={handleFormSuccess}
                />
            </div>
        </AppLayout>
    );
}
