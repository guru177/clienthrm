// Head removed - use document.title instead
import axios from '@/lib/axios';
import { FileText, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import AdminLeaveRequestTable from '@/components/leave-requests/admin-leave-request-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';

interface BranchOption {
    id: number;
    name: string;
}

export default function ManageLeaveRequestsPage() {
    const { canAccessAllCenters, branchScope, canAccessCenter } = useAuth();
    const allCenters = canAccessAllCenters();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [branchId, setBranchId] = useState('all');

    useEffect(() => {
        if (allCenters) return;
        const ids = branchScope.center_ids;
        if (ids.length === 0) return;
        setBranchId((prev) => {
            if (prev !== 'all' && ids.includes(Number(prev))) return prev;
            return String(ids[0]);
        });
    }, [allCenters, branchScope.center_ids]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get('/admin/settings/centers', {
                    params: { compact: 1 },
                });
                if (cancelled) return;
                const list = res.data?.data ?? res.data ?? [];
                setBranches(
                    (Array.isArray(list) ? list : [])
                        .map((c: { id: number; name: string }) => ({
                            id: Number(c.id),
                            name: c.name,
                        }))
                        .filter((c: BranchOption) => allCenters || canAccessCenter(c.id)),
                );
            } catch {
                setBranches([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [allCenters, canAccessCenter]);

    useEffect(() => {
        void loadStats();
    }, [branchId]);

    const loadStats = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/leave-requests/manage/stats', {
                params: {
                    center_id: branchId !== 'all' ? Number(branchId) : undefined,
                },
            });
            setStats(response.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const breadcrumbs = [
        { label: 'Leave Requests', href: '/admin/leave-requests' },
        { label: 'Manage Leave Requests', href: '/admin/leave-requests/manage' },
    ];

    if (loading && !stats) {
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
                                <FileText className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Manage Leave Requests
                                </h1>
                                <p className="text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Review, approve, reject, or cancel leave requests
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-3 z-10">
                            <div className="space-y-1 min-w-[160px]">
                                <Label className="text-xs text-[#1e3a5f]/70 dark:text-blue-200/70">
                                    Branch
                                </Label>
                                <Select
                                    value={branchId}
                                    onValueChange={setBranchId}
                                    disabled={!allCenters && branches.length <= 1}
                                >
                                    <SelectTrigger className="w-[180px] bg-white/80 dark:bg-black/30">
                                        <SelectValue
                                            placeholder={allCenters ? 'All branches' : 'Your branch'}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allCenters && (
                                            <SelectItem value="all">All branches</SelectItem>
                                        )}
                                        {branches.map((b) => (
                                            <SelectItem key={b.id} value={String(b.id)}>
                                                {b.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button
                                onClick={() => loadStats()}
                                className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2"
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh Stats
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Total Requests"
                        value={stats?.total ?? stats?.total_requests ?? 0}
                        icon={FileText}
                        iconClassName="text-blue-500"
                    />
                    <StatCard
                        title="Pending"
                        value={stats?.pending || 0}
                        icon={Clock}
                        iconClassName="text-orange-500"
                    />
                    <StatCard
                        title="Approved"
                        value={stats?.approved || 0}
                        icon={CheckCircle2}
                        iconClassName="text-green-500"
                    />
                    <StatCard
                        title="Rejected"
                        value={stats?.rejected || 0}
                        icon={XCircle}
                        iconClassName="text-red-500"
                    />
                </div>

                {/* Requests Table */}
                <AdminLeaveRequestTable
                    key={`${refreshKey}-${branchId}`}
                    branchId={branchId}
                    onRefresh={() => {
                        setRefreshKey((prev) => prev + 1);
                        void loadStats();
                    }}
                />
            </div>
        </AppLayout>
    );
}
