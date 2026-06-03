// Head removed - use document.title instead
import axios from '@/lib/axios';
import { Target, Plus, Sparkles, UserCheck, Phone } from 'lucide-react';
import { useState, useEffect } from 'react';

import LeadFormModal from '@/components/leads/lead-form-modal';
import LeadTable from '@/components/leads/lead-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';

export default function LeadsIndex() {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingLead, setEditingLead] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [stats, setStats] = useState({
        total: 0,
        new: 0,
        qualified: 0,
        contacted: 0,
    });

    useEffect(() => {
        fetchStats();
    }, [refreshKey]);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/leads/stats');
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const handleCreateNew = () => {
        setEditingLead(null);
        setIsFormModalOpen(true);
    };

    const handleEdit = (lead: any) => {
        setEditingLead(lead);
        setIsFormModalOpen(true);
    };

    const handleFormSuccess = () => {
        setIsFormModalOpen(false);
        setEditingLead(null);
        setRefreshKey((prev) => prev + 1);
    };

    const breadcrumbs = [
        // { label: 'Dashboard', href: '/dashboard' },
        { label: 'Leads', href: '/admin/leads' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="flex flex-1 flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Leads
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage and track your sales leads
                        </p>
                    </div>
                    <Button onClick={handleCreateNew}>
                        <Plus className="h-4 w-4" />
                        Add Lead
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Total Leads"
                        value={stats.total}
                        description="All leads in the system"
                        icon={Target}
                    />
                    <StatCard
                        title="New"
                        value={stats.new}
                        description="Recently added"
                        icon={Sparkles}
                        iconClassName="text-blue-500"
                    />
                    <StatCard
                        title="Qualified"
                        value={stats.qualified}
                        description="Ready to convert"
                        icon={UserCheck}
                        iconClassName="text-green-500"
                    />
                    <StatCard
                        title="Contacted"
                        value={stats.contacted}
                        description="In progress"
                        icon={Phone}
                        iconClassName="text-orange-500"
                    />
                </div>

                {/* Leads Table */}
                <LeadTable
                    key={refreshKey}
                    onEdit={handleEdit}
                    onRefresh={() => setRefreshKey((prev) => prev + 1)}
                />

                {/* Form Modal */}
                <LeadFormModal
                    open={isFormModalOpen}
                    onClose={() => {
                        setIsFormModalOpen(false);
                        setEditingLead(null);
                    }}
                    lead={editingLead}
                    onSuccess={handleFormSuccess}
                />
            </div>
        </AppLayout>
    );
}
