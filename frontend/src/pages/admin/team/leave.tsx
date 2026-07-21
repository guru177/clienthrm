import { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import axios from '@/lib/axios';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface TeamLeaveRow {
    id: number;
    employee_name: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    days_count: number;
    status: string;
    reason?: string | null;
}

export default function TeamLeavePage() {
    const [rows, setRows] = useState<TeamLeaveRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/manager/leave-requests', {
                params: { status: 'pending' },
            });
            setRows(res.data.data ?? []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const decide = async (id: number, action: 'approve' | 'reject') => {
        setBusyId(id);
        try {
            const res = await axios.post(`/admin/manager/leave-requests/${id}/${action}`, {
                rejection_reason: action === 'reject' ? 'Rejected by manager' : undefined,
            });
            handleApiResponse(res);
            await load();
        } catch (error) {
            handleApiError(error);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <AppLayout breadcrumbs={[{ label: 'Team Leave' }]}>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <ClipboardCheck className="h-6 w-6" />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Team Leave</h1>
                            <p className="text-sm text-muted-foreground">
                                Approve or reject leave for your direct reports
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => void load()} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Dates</TableHead>
                                <TableHead>Days</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                        {loading ? 'Loading…' : 'No pending leave for your team.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">{row.employee_name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{row.leave_type}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {row.start_date} → {row.end_date}
                                        </TableCell>
                                        <TableCell>{row.days_count}</TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                            {row.reason || '—'}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button
                                                size="sm"
                                                disabled={busyId === row.id}
                                                onClick={() => void decide(row.id, 'approve')}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busyId === row.id}
                                                onClick={() => void decide(row.id, 'reject')}
                                            >
                                                Reject
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AppLayout>
    );
}
