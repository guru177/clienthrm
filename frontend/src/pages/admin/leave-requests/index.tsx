import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { Calendar, Clock, FileText, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';

import LeaveRequestForm from '@/components/leave-requests/leave-request-form';
import LeaveRequestTable from '@/components/leave-requests/leave-request-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';

export default function LeaveRequestsPage() {
    const navigate = useNavigate();
    const { hasPermission } = usePermissions();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/leave-requests/stats');
            setStats(response.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestSubmitted = () => {
        setShowForm(false);
        setRefreshKey((prev) => prev + 1);
        loadStats();
    };

    const breadcrumbs = [
        { label: 'Attendance', href: '/admin/attendance' },
        { label: 'Leave Requests', href: '/admin/leave-requests' },
    ];

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                
                <div className="flex items-center justify-center min-h-96">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="min-w-0 max-w-full space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 break-words text-2xl font-bold tracking-tight sm:text-3xl">
                            <FileText className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" />
                            Leave Requests
                        </h1>
                        <p className="text-muted-foreground mt-1 break-words">
                            Submit and manage leave requests. For staff who don’t log in, HR can create and
                            approve leave here.
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                        {(hasPermission('manage-leave-requests')
                            || hasPermission('approve-leave-requests')
                            || hasPermission('reject-leave-requests')) && (
                            <Button
                                variant="outline"
                                className="min-h-11 w-full sm:w-auto"
                                onClick={() => navigate('/admin/leave-requests/manage')}
                            >
                                Manage Requests
                            </Button>
                        )}
                        {hasPermission('create-leave-requests') && (
                        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setShowForm(true)}>
                            <Plus className="h-4 w-4" />
                            New Leave Request
                        </Button>
                        )}
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.total_requests || 0}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Pending</CardTitle>
                            <Clock className="h-4 w-4 text-orange-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.pending || 0}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Approved</CardTitle>
                            <Calendar className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.approved || 0}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Leave Days Used</CardTitle>
                            <Calendar className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats?.total_leave_days || 0}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Requests Table */}
                <LeaveRequestTable
                    key={refreshKey}
                    onRefresh={() => {
                        setRefreshKey((prev) => prev + 1);
                        loadStats();
                    }}
                />
            </div>

            {/* New Request Dialog */}
            {hasPermission('create-leave-requests') && (
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>New Leave Request</DialogTitle>
                        <DialogDescription>
                            Fill in the details below to submit a leave request
                        </DialogDescription>
                    </DialogHeader>
                    <LeaveRequestForm
                        onSuccess={handleRequestSubmitted}
                        onCancel={() => setShowForm(false)}
                    />
                </DialogContent>
            </Dialog>
            )}
        </AppLayout>
    );
}
