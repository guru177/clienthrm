// Head removed - use document.title instead
import axios from '@/lib/axios';
import { Users, Plus, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';

import ContactFormModal from '@/components/contacts/contact-form-modal';
import ContactTable from '@/components/contacts/contact-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';

export default function ContactsIndex() {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        leads: 0,
        customers: 0,
    });

    useEffect(() => {
        fetchStats();
    }, [refreshKey]);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/contacts/stats');
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const handleCreateNew = () => {
        setEditingContact(null);
        setIsFormModalOpen(true);
    };

    const handleEdit = (contact: any) => {
        setEditingContact(contact);
        setIsFormModalOpen(true);
    };

    const handleFormSuccess = () => {
        setIsFormModalOpen(false);
        setEditingContact(null);
        setRefreshKey((prev) => prev + 1);
    };

    const breadcrumbs = [
        // { label: 'Dashboard', href: '/dashboard' },
        { label: 'Contacts', href: '/admin/contacts' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="flex flex-1 flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Contacts
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your contacts and build relationships
                        </p>
                    </div>
                    <Button onClick={handleCreateNew}>
                        <Plus className="h-4 w-4" />
                        Add Contact
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Total Contacts"
                        value={stats.total}
                        description="All contacts in the system"
                        icon={Users}
                    />
                    <StatCard
                        title="Active"
                        value={stats.active}
                        description="Currently active"
                        icon={UserCheck}
                        iconClassName="text-green-500"
                    />
                    <StatCard
                        title="Leads"
                        value={stats.leads}
                        description="Potential customers"
                        icon={TrendingUp}
                        iconClassName="text-blue-500"
                    />
                    <StatCard
                        title="Customers"
                        value={stats.customers}
                        description="Converted customers"
                        icon={UserX}
                        iconClassName="text-purple-500"
                    />
                </div>

                {/* Contacts Table */}
                <ContactTable
                    key={refreshKey}
                    onEdit={handleEdit}
                    onRefresh={() => setRefreshKey((prev) => prev + 1)}
                />

                {/* Form Modal */}
                <ContactFormModal
                    open={isFormModalOpen}
                    onClose={() => {
                        setIsFormModalOpen(false);
                        setEditingContact(null);
                    }}
                    contact={editingContact}
                    onSuccess={handleFormSuccess}
                />
            </div>
        </AppLayout>
    );
}
