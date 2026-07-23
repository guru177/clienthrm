import axios from '@/lib/axios';
import { RefreshCw, Trash2, Calendar, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { fetchLeaveTypeOptions, labelForLeaveType, type LeaveTypeOption } from '@/lib/leave-types';

interface LeaveRequestTableProps {
    onRefresh?: () => void;
    onCreateClick?: () => void;
}

export default function LeaveRequestTable({ onRefresh, onCreateClick }: LeaveRequestTableProps) {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [total, setTotal] = useState(0);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [leaveTypeOptions, setLeaveTypeOptions] = useState<LeaveTypeOption[]>([]);

    useEffect(() => {
        void fetchLeaveTypeOptions().then(setLeaveTypeOptions).catch(() => setLeaveTypeOptions([]));
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [statusFilter, currentPage, perPage]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/leave-requests/list', {
                params: {
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    page: currentPage,
                    per_page: perPage,
                },
            });

            if (response.data.success) {
                setRequests(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
                setCurrentPage((Array.isArray(response.data.data) ? 1 : response.data.data?.current_page) || 1);
                setLastPage((Array.isArray(response.data.data) ? 1 : response.data.data?.last_page) || 1);
                setTotal((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total) || 0);
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;

        setDeleting(true);
        try {
            const response = await axios.delete(`/admin/leave-requests/${deleteId}`);
            handleApiResponse(response);
            setDeleteId(null);
            fetchRequests();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, any> = {
            pending: { variant: 'secondary', label: 'Pending' },
            approved: { variant: 'success', label: 'Approved' },
            rejected: { variant: 'destructive', label: 'Rejected' },
        };
        const config = variants[status] || variants.pending;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const getLeaveTypeLabel = (type: string) => labelForLeaveType(leaveTypeOptions, type);

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle>My Leave Requests</CardTitle>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => {
                                    setStatusFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-full sm:w-[140px]">
                                    <SelectValue placeholder="All Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={fetchRequests}
                                disabled={loading}
                            >
                                <RefreshCw
                                    className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                                />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Mobile card list */}
                    <div className="space-y-3 md:hidden" data-testid="leave-mobile-cards">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-10 text-center">
                                <p className="text-muted-foreground">No leave requests found</p>
                                {onCreateClick && (
                                    <Button onClick={onCreateClick}>New Leave Request</Button>
                                )}
                            </div>
                        ) : (
                            requests.map((request) => (
                                <div
                                    key={request.id}
                                    className="rounded-xl border p-4 space-y-2"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-medium">
                                                {getLeaveTypeLabel(request.leave_type)}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(request.start_date).toLocaleDateString()} –{' '}
                                                {new Date(request.end_date).toLocaleDateString()}
                                            </p>
                                        </div>
                                        {getStatusBadge(request.status)}
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {request.days_count} days
                                        </span>
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3.5 w-3.5" />
                                            {new Date(request.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {request.status === 'pending' && (
                                        <Button
                                            variant="outline"
                                            className="min-h-11 w-full"
                                            onClick={() => setDeleteId(request.id)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                                            Cancel request
                                        </Button>
                                    )}
                                    {request.status === 'approved' && (
                                        <Button
                                            variant="outline"
                                            className="min-h-11 w-full"
                                            onClick={() => setDeleteId(request.id)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                                            Cancel leave
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="hidden rounded-md border md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Leave Type</TableHead>
                                    <TableHead>Start Date</TableHead>
                                    <TableHead>End Date</TableHead>
                                    <TableHead>Days</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    <TableHead className="w-[70px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <div className="flex items-center justify-center">
                                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : requests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-10 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <p className="text-muted-foreground">No leave requests found</p>
                                                {onCreateClick && (
                                                    <Button onClick={onCreateClick}>New Leave Request</Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    requests.map((request) => (
                                        <TableRow key={request.id}>
                                            <TableCell className="font-medium">
                                                {getLeaveTypeLabel(request.leave_type)}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(request.start_date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(request.end_date).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>{request.days_count} days</TableCell>
                                            <TableCell>{getStatusBadge(request.status)}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(request.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                {(request.status === 'pending' ||
                                                    request.status === 'approved') && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDeleteId(request.id)}
                                                        title="Cancel leave"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-600" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {!loading && requests.length > 0 && (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                Showing {requests.length} of {total} results
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                >
                                    First
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <span className="text-sm whitespace-nowrap">
                                    Page {currentPage} of {lastPage}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                    disabled={currentPage === lastPage}
                                >
                                    Next
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(lastPage)}
                                    disabled={currentPage === lastPage}
                                >
                                    Last
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteId !== null}
                onOpenChange={(open) => !open && setDeleteId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Leave Request</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to cancel this leave request? Approved leave
                            covered by a generated payslip cannot be cancelled until payroll is
                            unlocked.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Keep request</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {deleting ? 'Cancelling...' : 'Cancel request'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
