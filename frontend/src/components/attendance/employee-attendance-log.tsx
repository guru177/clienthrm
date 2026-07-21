import axios from '@/lib/axios';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/use-permissions';
import { handleApiError } from '@/lib/toast';

interface EmployeeOption {
    id: number;
    name: string;
    email?: string;
}

interface LogSession {
    id: number;
    date: string;
    clock_in?: string;
    clock_out?: string;
    duration_minutes?: number;
    is_late: boolean;
    is_early_exit: boolean;
    status?: string;
    source?: string;
    source_label?: string;
}

function sourceDisplay(row: LogSession) {
    if (row.source_label) return row.source_label;
    if (row.source === 'biometric') return 'Biometric device';
    return 'App / system';
}

function monthStartIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatTime(value?: string) {
    if (!value) return '--:--';
    return new Date(value).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

function formatDuration(minutes?: number) {
    if (!minutes) return '--';
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function EmployeeAttendanceLog() {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');

    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [userId, setUserId] = useState<string>('');
    const [startDate, setStartDate] = useState(monthStartIso());
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [sessions, setSessions] = useState<LogSession[]>([]);
    const [summary, setSummary] = useState<{
        total_sessions: number;
        distinct_days: number;
        total_minutes: number;
        by_source?: { biometric: number; app: number };
    } | null>(null);
    const [employeeName, setEmployeeName] = useState('');

    useEffect(() => {
        if (canManage) {
            axios
                .get('/admin/attendance/users')
                .then((res) => {
                    const list = res.data.data ?? [];
                    setEmployees(list);
                    if (list.length && !userId) setUserId(String(list[0].id));
                })
                .catch(() => {});
        } else if (user?.id) {
            setUserId(String(user.id));
            setEmployeeName(user.name ?? 'You');
        }
    }, [canManage, user?.id, user?.name, userId]);

    const loadLog = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await axios.get('/admin/reports/employee-attendance-log', {
                params: {
                    user_id: Number(userId),
                    start_date: startDate,
                    end_date: endDate,
                    page,
                    per_page: 25,
                },
            });
            const payload = res.data.data;
            setSessions(payload?.sessions ?? []);
            setSummary(payload?.summary ?? null);
            setEmployeeName(payload?.employee?.name ?? '');
            setLastPage(payload?.last_page ?? 1);
        } catch (error) {
            handleApiError(error);
            setSessions([]);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, [userId, startDate, endDate, page]);

    useEffect(() => {
        void loadLog();
    }, [loadLog]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Employee Attendance Log
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Combined biometric device punches and app/system clock-in for the selected date range
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                    {canManage && (
                        <div className="w-full min-w-0 space-y-1 sm:min-w-[220px] sm:w-auto">
                            <Label>Employee</Label>
                            <Select
                                value={userId}
                                onValueChange={(v) => {
                                    setUserId(v);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map((e) => (
                                        <SelectItem key={e.id} value={String(e.id)}>
                                            {e.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="w-full min-w-0 space-y-1 sm:w-auto">
                        <Label htmlFor="log_start">Start date</Label>
                        <Input
                            id="log_start"
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                setPage(1);
                            }}
                            className="w-full sm:w-[170px]"
                        />
                    </div>
                    <div className="w-full min-w-0 space-y-1 sm:w-auto">
                        <Label htmlFor="log_end">End date</Label>
                        <Input
                            id="log_end"
                            type="date"
                            value={endDate}
                            onChange={(e) => {
                                setEndDate(e.target.value);
                                setPage(1);
                            }}
                            className="w-full sm:w-[170px]"
                        />
                    </div>
                </div>

                {summary && (
                    <div className="flex flex-wrap gap-2 text-sm">
                        <Badge variant="outline">{employeeName || 'Employee'}</Badge>
                        <Badge>{summary.distinct_days} days</Badge>
                        <Badge variant="secondary">{summary.total_sessions} sessions</Badge>
                        <Badge variant="default">
                            Total {formatDuration(summary.total_minutes)}
                        </Badge>
                        {(summary.by_source?.biometric ?? 0) > 0 && (
                            <Badge variant="outline">
                                Biometric {summary.by_source!.biometric}
                            </Badge>
                        )}
                        {(summary.by_source?.app ?? 0) > 0 && (
                            <Badge variant="outline">
                                App / system {summary.by_source!.app}
                            </Badge>
                        )}
                    </div>
                )}

                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Check In</TableHead>
                                <TableHead>Check Out</TableHead>
                                <TableHead>Total Time</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Source</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10">
                                        Loading log...
                                    </TableCell>
                                </TableRow>
                            ) : sessions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                        No attendance records in this date range
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sessions.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">
                                            {new Date(row.date).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p>{formatTime(row.clock_in)}</p>
                                                {row.is_late && (
                                                    <p className="text-xs text-red-600">Late</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p>
                                                    {row.clock_out
                                                        ? formatTime(row.clock_out)
                                                        : 'Open'}
                                                </p>
                                                {row.is_early_exit && (
                                                    <p className="text-xs text-orange-600">Early</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>{formatDuration(row.duration_minutes)}</TableCell>
                                        <TableCell className="capitalize">{row.status || 'present'}</TableCell>
                                        <TableCell>{sourceDisplay(row)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {lastPage > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Page {page} of {lastPage}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= lastPage}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
