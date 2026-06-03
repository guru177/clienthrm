// Head removed - use document.title instead
import axios from '@/lib/axios';
import { Mail, MessageSquare, CheckCircle2, Inbox } from 'lucide-react';
import { useState, useEffect } from 'react';

import ContactFormTable from '@/components/contact-forms/contact-form-table';
import { StatCard } from '@/components/stat-card';
import AppLayout from '@/layouts/app-layout';

export default function ContactFormsIndex() {
    const [refreshKey, setRefreshKey] = useState(0);
    const [stats, setStats] = useState({
        total: 0,
        new: 0,
        read: 0,
        replied: 0,
    });

    useEffect(() => {
        fetchStats();
    }, [refreshKey]);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/admin/contact-forms/stats');
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const breadcrumbs = [
        { label: 'Contact Forms', href: '/admin/contact-forms' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="flex flex-1 flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Contact Form Submissions
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage and respond to website contact form inquiries
                        </p>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Total Submissions"
                        value={stats.total}
                        description="All contact form submissions"
                        icon={MessageSquare}
                    />
                    <StatCard
                        title="New Messages"
                        value={stats.new}
                        description="Unread submissions"
                        icon={Inbox}
                        iconClassName="text-blue-500"
                    />
                    <StatCard
                        title="Read"
                        value={stats.read}
                        description="Viewed but not replied"
                        icon={Mail}
                        iconClassName="text-yellow-500"
                    />
                    <StatCard
                        title="Replied"
                        value={stats.replied}
                        description="Responded to"
                        icon={CheckCircle2}
                        iconClassName="text-green-500"
                    />
                </div>

                {/* Contact Forms Table */}
                <ContactFormTable
                    key={refreshKey}
                    onRefresh={() => setRefreshKey((prev) => prev + 1)}
                />
            </div>
        </AppLayout>
    );
}
