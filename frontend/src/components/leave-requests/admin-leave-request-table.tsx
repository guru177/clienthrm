import axios from '@/lib/axios';
import { usePermissions } from '@/hooks/use-permissions';
import { RefreshCw, Check, X, Search, MoreVertical, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { fetchLeaveTypeOptions, labelForLeaveType, type LeaveTypeOption } from '@/lib/leave-types';

interface AdminLeaveRequestTableProps {
    onRefresh?: () => void;
}

export default function AdminLeaveRequestTable({ onRefresh }: AdminLeaveRequestTableProps) {
    const { hasPermission } = usePermissions();
    const canApprove =
        hasPermission('approve-leave-requests') || hasPermission('manage-leave-requests');
    const canReject =
        hasPermission('reject-leave-requests') || hasPermission('manage-leave-requests');
    const canManageRemarks = hasPermission('manage-leave-requests');
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [total, setTotal] = useState(0);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [rejectId, setRejectId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [rejecting, setRejecting] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
    const [remarks, setRemarks] = useState('');
    const [updatingRemarks, setUpdatingRemarks] = useState(false);
    const [leaveTypeOptions, setLeaveTypeOptions] = useState<LeaveTypeOption[]>([]);

    useEffect(() => {
        void fetchLeaveTypeOptions().then(setLeaveTypeOptions).catch(() => setLeaveTypeOptions([]));
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [statusFilter, typeFilter, search, currentPage, perPage, sortBy, sortOrder]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/leave-requests/manage/list', {
                params: {
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    leave_type: typeFilter !== 'all' ? typeFilter : undefined,
                    search: search || undefined,
                    page: currentPage,
                    per_page: perPage,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                },
            });

            if (response.data.success) {
                setRequests(Array.isArray(response.data.data) ? response.data.data : (response.data.data?.data || []));
                setCurrentPage((Array.isArray(response.data.data) ? 1 : response.data.data?.current_page) || 1);
                setLastPage((Array.isArray(response.data.data) ? 1 : response.data.data?.last_page) || 1);
                setTotal((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.total) || 0);
                setFrom((Array.isArray(response.data.data) ? 1 : response.data.data?.from) || 0);
                setTo((Array.isArray(response.data.data) ? response.data.data.length : response.data.data?.to) || 0);
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const approveRequest = async (id: number) => {
        setProcessingId(id);
        try {
            const response = await axios.post(`/admin/leave-requests/${id}/approve`, {
                remarks: remarks || undefined,
            });
            handleApiResponse(response);
            fetchRequests();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setProcessingId(null);
        }
    };

    const rejectRequest = async () => {
        if (!rejectId) return;
        setRejecting(true);
        try {
            const response = await axios.post(`/admin/leave-requests/${rejectId}/reject`, {
                rejection_reason: rejectionReason || remarks,
                remarks: remarks || undefined,
            });
            handleApiResponse(response);
            setRejectId(null);
            setRejectionReason('');
            setRemarks('');
            fetchRequests();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setRejecting(false);
        }
    };

    const updateRemarks = async () => {
        if (!selectedRequest) return;
        setUpdatingRemarks(true);
        try {
            const response = await axios.put(`/admin/leave-requests/${selectedRequest.id}/remarks`, {
                remarks: remarks || null,
            });
            handleApiResponse(response);
            setSelectedRequest(response.data.data);
            fetchRequests();
            onRefresh?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setUpdatingRemarks(false);
        }
    };

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
        setCurrentPage(1);
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, any> = {
            pending: { variant: 'secondary', label: 'Pending', className: '' },
            approved: { variant: 'outline', label: 'Approved', className: 'border-green-500 text-green-700 dark:text-green-400' },
            rejected: { variant: 'destructive', label: 'Rejected', className: '' },
        };
        const config = variants[status] || variants.pending;
        return (
            <Badge variant={config.variant} className={config.className}>
                {config.label}
            </Badge>
        );
    };

    const getLeaveTypeLabel = (type: string) => labelForLeaveType(leaveTypeOptions, type);

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle>All Leave Requests</CardTitle>
                        <div className="flex flex-wrap gap-2 items-center">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name or email"
                                    className="pl-8 w-56"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => {
                                    setStatusFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                value={typeFilter}
                                onValueChange={(value) => {
                                    setTypeFilter(value);
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="Leave Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    {leaveTypeOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={perPage.toString()}
                                onValueChange={(value) => {
                                    setPerPage(parseInt(value));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-[100px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="15">15</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={fetchRequests} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('id')}
                                    >
                                        <div className="flex items-center gap-1">
                                            ID
                                            {sortBy === 'id' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('user_name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            User
                                            {sortBy === 'user_name' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead>Leave Type</TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('start_date')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Start Date
                                            {sortBy === 'start_date' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('end_date')}
                                    >
                                        <div className="flex items-center gap-1">
                                            End Date
                                            {sortBy === 'end_date' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('days_count')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Days
                                            {sortBy === 'days_count' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Status
                                            {sortBy === 'status' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="hover:bg-muted/50 cursor-pointer select-none"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Submitted
                                            {sortBy === 'created_at' && (
                                                <span className="text-xs">{sortOrder === 'asc' ? '↑' : 'â†“'}</span>
                                            )}
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-[160px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8">
                                            <div className="flex items-center justify-center">
                                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : requests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No leave requests found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    requests.map((request) => (
                                        <TableRow key={request.id}>
                                            <TableCell className="font-mono text-sm">#{request.id}</TableCell>
                                            <TableCell className="font-medium">
                                                {request.user?.name}
                                                <div className="text-xs text-muted-foreground">{request.user?.email}</div>
                                            </TableCell>
                                            <TableCell>{getLeaveTypeLabel(request.leave_type)}</TableCell>
                                            <TableCell>{new Date(request.start_date).toLocaleDateString()}</TableCell>
                                            <TableCell>{new Date(request.end_date).toLocaleDateString()}</TableCell>
                                            <TableCell>{request.days_count} days</TableCell>
                                            <TableCell>{getStatusBadge(request.status)}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(request.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setSelectedRequest(request);
                                                                setRemarks(request.remarks || '');
                                                            }}
                                                        >
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            View
                                                        </DropdownMenuItem>
                                                        {canApprove && request.status === 'pending' && (
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    if (processingId === request.id) return;
                                                                    setRemarks('');
                                                                    approveRequest(request.id);
                                                                }}
                                                            >
                                                                <Check className="mr-2 h-4 w-4" />
                                                                Approve
                                                            </DropdownMenuItem>
                                                        )}
                                                        {canReject && request.status === 'pending' && (
                                                            <DropdownMenuItem
                                                                className="text-red-600 focus:text-red-700"
                                                                onClick={() => {
                                                                    setRejectId(request.id);
                                                                    setRejectionReason('');
                                                                    setSelectedRequest(request);
                                                                    setRemarks(request.remarks || '');
                                                                }}
                                                            >
                                                                <X className="mr-2 h-4 w-4" />
                                                                Reject
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {!loading && requests.length > 0 && (
                        <div className="flex items-center justify-between mt-4">
                            <div className="text-sm text-muted-foreground">
                                Showing {from} to {to} of {total} results
                            </div>
                            <div className="flex items-center gap-2">
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
                                <span className="text-sm">
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

            {/* Reject Dialog */}
            <AlertDialog
                open={rejectId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRejectId(null);
                        setRemarks('');
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Leave Request</AlertDialogTitle>
                        <AlertDialogDescription>
                            Provide a reason for rejecting this leave request.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Rejection Reason</label>
                        <Textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={4}
                            placeholder="Enter reason"
                        />
                        <label className="text-sm font-medium">Remarks (optional)</label>
                        <Textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            rows={3}
                            placeholder="Any additional notes"
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={rejectRequest}
                            disabled={rejecting || rejectionReason.trim().length < 5}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {rejecting ? 'Rejecting...' : 'Reject'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* View Details Dialog */}
            <Dialog
                open={!!selectedRequest}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedRequest(null);
                        setRemarks('');
                    }
                }}
            >
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Leave Request Details</DialogTitle>
                        <DialogDescription>Review the request before taking action.</DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">Employee</p>
                                <p className="font-semibold">{selectedRequest.user?.name}</p>
                                <p className="text-sm text-muted-foreground">{selectedRequest.user?.email}</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">Leave Type</p>
                                <p className="font-semibold">{getLeaveTypeLabel(selectedRequest.leave_type)}</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">Dates</p>
                                <p className="font-semibold">
                                    {new Date(selectedRequest.start_date).toLocaleDateString()} - {new Date(selectedRequest.end_date).toLocaleDateString()} ({selectedRequest.days_count} days)
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">Status</p>
                                {getStatusBadge(selectedRequest.status)}
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Reason</p>
                                <p className="rounded-md border bg-muted/40 p-3 text-sm">
                                    {selectedRequest.reason}
                                </p>
                            </div>
                            {selectedRequest.rejection_reason && (
                                <div className="md:col-span-2 space-y-2">
                                    <p className="text-sm text-muted-foreground">Rejection Reason</p>
                                    <p className="rounded-md border bg-muted/40 p-3 text-sm text-red-600 dark:text-red-400">
                                        {selectedRequest.rejection_reason}
                                    </p>
                                </div>
                            )}
                            {selectedRequest.remarks && (
                                <div className="md:col-span-2 space-y-2">
                                    <p className="text-sm text-muted-foreground">Remarks</p>
                                    <p className="rounded-md border bg-muted/40 p-3 text-sm">
                                        {selectedRequest.remarks}
                                    </p>
                                </div>
                            )}
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-medium">Remarks (optional)</label>
                                <Textarea
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    rows={3}
                                    placeholder="Add any internal remarks"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-4">
                        <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                            Close
                        </Button>
                        {selectedRequest?.status === 'pending' ? (
                            <>
                                {canReject && (
                                    <Button
                                        variant="destructive"
                                        onClick={() => {
                                            if (!selectedRequest) return;
                                            setRejectId(selectedRequest.id);
                                            setRejectionReason('');
                                            setRemarks(selectedRequest.remarks || '');
                                        }}
                                    >
                                        Reject
                                    </Button>
                                )}
                                {canApprove && (
                                    <Button
                                        onClick={() => {
                                            if (!selectedRequest) return;
                                            setRemarks(selectedRequest.remarks || '');
                                            approveRequest(selectedRequest.id);
                                        }}
                                    >
                                        Approve
                                    </Button>
                                )}
                            </>
                        ) : (
                            canManageRemarks && (
                                <Button
                                    onClick={updateRemarks}
                                    disabled={updatingRemarks || remarks === (selectedRequest?.remarks || '')}
                                >
                                    {updatingRemarks ? 'Updating...' : 'Update Remarks'}
                                </Button>
                            )
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
