import axios from '@/lib/axios';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Pencil,
    Plus,
    Search,
    Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/use-permissions';
import { isModuleAllowed } from '@/lib/plan-modules';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';

interface ShiftInfo {
    template_name?: string;
    start_time?: string;
    end_time?: string;
}

interface AttendanceRecord {
    id: number;
    user_id: number;
    user?: {
        id: number;
        name: string;
        email: string;
    };
    date: string;
    clock_in: string;
    clock_out: string;
    duration_minutes: number;
    is_late: boolean;
    is_early_exit: boolean;
    status: string;
    source?: string;
    shift?: ShiftInfo | null;
}

const STATUS_OPTIONS = ['present', 'absent', 'half_day', 'leave', 'sick_leave', 'holiday'];

/** Extract an "HH:MM" value for a time input from a combined datetime or time string. */
function toTimeInput(value?: string | null): string {
    if (!value) return '';
    const part = value.includes('T') ? value.split('T')[1] ?? '' : value;
    return part.slice(0, 5);
}

export default function AttendanceTable() {
    const confirm = useConfirm();
    const { planModules } = useAuth();
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');
    const canMarkManual =
        isModuleAllowed(planModules, 'manual_attendance') &&
        (hasPermission('mark-attendance') || hasPermission('manage-attendance'));

    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [onlyOpen, setOnlyOpen] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [from, setFrom] = useState(0);
    const [to, setTo] = useState(0);

    // Edit dialog state
    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState<AttendanceRecord | null>(null);
    const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '', status: 'present', notes: '' });
    const [saving, setSaving] = useState(false);

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/attendance/list', {
                params: {
                    search,
                    status: status !== 'all' ? status : undefined,
                    only_open: onlyOpen ? true : undefined,
                    date_from: dateFrom || undefined,
                    date_to: dateTo || undefined,
                    page: currentPage,
                    per_page: perPage,
                },
            });

            if (response.data.success) {
                const payload = response.data.data;
                const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
                setRecords(rows);
                setCurrentPage(payload?.current_page ?? 1);
                setLastPage(payload?.last_page ?? 1);
                setTotal(payload?.total ?? rows.length);
                setFrom(payload?.from ?? (rows.length ? 1 : 0));
                setTo(payload?.to ?? rows.length);
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    }, [search, status, onlyOpen, dateFrom, dateTo, currentPage, perPage]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const openEdit = (record: AttendanceRecord) => {
        setEditRow(record);
        setEditForm({
            clock_in: toTimeInput(record.clock_in),
            clock_out: toTimeInput(record.clock_out),
            status: record.status || 'present',
            notes: '',
        });
        setEditOpen(true);
    };

    const submitEdit = async () => {
        if (!editRow) return;
        setSaving(true);
        try {
            const res = await axios.patch(`/admin/attendance/${editRow.id}`, {
                clock_in: editForm.clock_in || '',
                clock_out: editForm.clock_out || '',
                status: editForm.status,
                notes: editForm.notes || undefined,
            });
            handleApiResponse(res);
            setEditOpen(false);
            setEditRow(null);
            fetchRecords();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const deleteRecord = async (record: AttendanceRecord) => {
        if (!window.confirm('Delete this attendance record? This cannot be undone.')) return;
        try {
            const res = await axios.delete(`/admin/attendance/${record.id}`);
            handleApiResponse(res);
            fetchRecords();
        } catch (error) {
            handleApiError(error);
        }
    };

    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, { variant: any; label: string }> = {
            present: { variant: 'default', label: 'Present' },
            absent: { variant: 'destructive', label: 'Absent' },
            half_day: { variant: 'secondary', label: 'Half Day' },
            leave: { variant: 'outline', label: 'Leave' },
            sick_leave: { variant: 'secondary', label: 'Sick Leave' },
            holiday: { variant: 'outline', label: 'Holiday' },
        };

        const config = statusMap[status] || { variant: 'outline', label: status };
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const formatTime = (time: string) => {
        if (!time) return '--:--';
        return new Date(time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    const formatShiftTime = (value?: string) => {
        if (!value) return '';
        const part = value.includes('T') ? value.split('T')[1]?.slice(0, 5) : value.slice(0, 5);
        const [h, m] = part.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return value;
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const colSpan = canManage ? 9 : 8;

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Attendance History</CardTitle>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {/* Search */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-8"
                            />
                        </div>

                        {/* Status Filter */}
                        <Select
                            value={status}
                            onValueChange={(value) => {
                                setStatus(value);
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full sm:w-[140px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="present">Present</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="half_day">Half Day</SelectItem>
                                <SelectItem value="leave">Leave</SelectItem>
                                <SelectItem value="sick_leave">Sick Leave</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Date range */}
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-[150px]"
                            title="From date"
                        />
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => {
                                setDateTo(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-[150px]"
                            title="To date"
                        />

                        {/* Open-sessions filter */}
                        <Button
                            type="button"
                            variant={onlyOpen ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                setOnlyOpen((v) => !v);
                                setCurrentPage(1);
                            }}
                            title="Show sessions clocked in but never clocked out"
                        >
                            Open sessions
                        </Button>

                        {/* Per Page Selector */}
                        <Select
                            value={perPage.toString()}
                            onValueChange={(value) => {
                                setPerPage(parseInt(value));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full sm:w-[100px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>

                        {canMarkManual && (
                            <Button type="button" size="sm" variant="outline" asChild>
                                <Link to="/admin/manual-attendance">
                                    <Plus className="mr-1 h-4 w-4" /> Mark attendance
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>Clock In</TableHead>
                                <TableHead>Clock Out</TableHead>
                                <TableHead>Shift</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Source</TableHead>
                                {canManage && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={colSpan} className="text-center py-8">
                                        <div className="flex items-center justify-center">
                                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : records.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={colSpan}
                                        className="text-center py-8 text-muted-foreground"
                                    >
                                        No records found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                records.map((record) => (
                                    <TableRow key={record.id}>
                                        <TableCell className="font-medium">
                                            {new Date(record.date).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">
                                                    {record.user?.name || `User #${record.user_id}`}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {record.user?.email || ''}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p>{formatTime(record.clock_in)}</p>
                                                {record.is_late && (
                                                    <p className="text-xs text-red-600">Late</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p>
                                                    {record.clock_out ? (
                                                        formatTime(record.clock_out)
                                                    ) : (
                                                        <span className="text-amber-600">Open</span>
                                                    )}
                                                </p>
                                                {record.is_early_exit && (
                                                    <p className="text-xs text-orange-600">Early</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {record.shift?.template_name ? (
                                                <div>
                                                    <p className="text-sm font-medium">{record.shift.template_name}</p>
                                                    {(record.shift.start_time || record.shift.end_time) && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {formatShiftTime(record.shift.start_time)}
                                                            {record.shift.end_time ? ` – ${formatShiftTime(record.shift.end_time)}` : ''}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">Default</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {record.duration_minutes
                                                ? `${Math.floor(record.duration_minutes / 60)}h ${record.duration_minutes % 60}m`
                                                : '--'}
                                        </TableCell>
                                        <TableCell>{getStatusBadge(record.status)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">
                                                {record.source === 'biometric'
                                                    ? 'Biometric'
                                                    : record.source === 'manual'
                                                      ? 'Manual'
                                                      : !record.source
                                                        ? 'App / system'
                                                        : record.source}
                                            </Badge>
                                        </TableCell>
                                        {canManage && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => openEdit(record)}
                                                        title="Edit / regularize"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => deleteRecord(record)}
                                                        title="Delete record"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {!loading && records.length > 0 && (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-4">
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
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
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
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(lastPage)}
                                disabled={currentPage === lastPage}
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            {/* Edit dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Edit attendance — {editRow?.user?.name || `User #${editRow?.user_id}`}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {editRow ? new Date(editRow.date).toLocaleDateString() : ''} · leave clock-out
                            empty to mark the session open.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="edit_in">Clock in</Label>
                                <Input
                                    id="edit_in"
                                    type="time"
                                    value={editForm.clock_in}
                                    onChange={(e) => setEditForm((f) => ({ ...f, clock_in: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="edit_out">Clock out</Label>
                                <Input
                                    id="edit_out"
                                    type="time"
                                    value={editForm.clock_out}
                                    onChange={(e) => setEditForm((f) => ({ ...f, clock_out: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Status</Label>
                            <Select
                                value={editForm.status}
                                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_OPTIONS.map((s) => (
                                        <SelectItem key={s} value={s} className="capitalize">
                                            {s.replace('_', ' ')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="edit_notes">Notes</Label>
                            <Textarea
                                id="edit_notes"
                                placeholder="Reason for correction (optional)"
                                value={editForm.notes}
                                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={submitEdit} disabled={saving}>
                            {saving ? 'Saving...' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </Card>
    );
}
