import axios from '@/lib/axios';
import { CalendarDays, Save, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { MANUAL_STATUS_OPTIONS } from '@/components/attendance/manual-attendance-form';
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
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface DailyRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    phone?: string | null;
    department_name?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    attendance_status: 'present' | 'open' | 'absent' | 'scheduled_off';
    session_count: number;
}

interface GridRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    phone?: string | null;
    department_name?: string | null;
    existing_check_in?: string | null;
    existing_check_out?: string | null;
    session_count: number;
    status: string;
    clock_in: string;
    clock_out: string;
    notes: string;
    dirty: boolean;
}

function toTimeInput(value?: string | null): string {
    if (!value) return '';
    const part = value.includes('T') ? value.split('T')[1] ?? '' : value;
    return part.slice(0, 5);
}

function defaultStatus(row: DailyRow): string {
    if (row.attendance_status === 'scheduled_off') return 'absent';
    if (row.attendance_status === 'absent') return 'absent';
    if (row.attendance_status === 'open') return 'present';
    return 'present';
}

interface ManualAttendanceGridProps {
    onSaved?: () => void;
}

export default function ManualAttendanceGrid({ onSaved }: ManualAttendanceGridProps) {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');

    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [rows, setRows] = useState<GridRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/reports/daily-attendance', {
                params: { date, search: debouncedSearch || undefined },
            });
            const employees: DailyRow[] = res.data.data?.employees ?? [];
            setRows(
                employees.map((row) => ({
                    user_id: row.user_id,
                    name: row.name,
                    employee_id: row.employee_id,
                    phone: row.phone,
                    department_name: row.department_name,
                    existing_check_in: row.check_in,
                    existing_check_out: row.check_out,
                    session_count: row.session_count,
                    status: defaultStatus(row),
                    clock_in: toTimeInput(row.check_in),
                    clock_out: toTimeInput(row.check_out),
                    notes: '',
                    dirty: false,
                })),
            );
        } catch (error) {
            handleApiError(error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [date, debouncedSearch]);

    useEffect(() => {
        void load();
    }, [load]);

    const dirtyRows = useMemo(() => rows.filter((r) => r.dirty), [rows]);

    const updateRow = (userId: number, patch: Partial<GridRow>) => {
        setRows((prev) =>
            prev.map((row) =>
                row.user_id === userId ? { ...row, ...patch, dirty: true } : row,
            ),
        );
    };

    const saveDay = async () => {
        if (dirtyRows.length === 0) return;
        setSaving(true);
        try {
            const res = await axios.post('/admin/attendance/manual/bulk', {
                date,
                entries: dirtyRows.map((row) => ({
                    user_id: row.user_id,
                    clock_in: row.clock_in || undefined,
                    clock_out: row.clock_out || undefined,
                    status: row.status,
                    notes: row.notes || undefined,
                })),
            });
            handleApiResponse(res);
            await load();
            onSaved?.();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" />
                        Daily marking grid
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Mark attendance for all employees on a selected date. Existing punches are shown for reference;
                        saving adds new manual entries.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="space-y-1">
                        <Label htmlFor="manual_grid_search">Search</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="manual_grid_search"
                                type="search"
                                placeholder="Search by name, department, or phone"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full min-w-[280px] sm:w-[320px] pl-8"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="manual_grid_date">Date</Label>
                        <Input
                            id="manual_grid_date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-[180px]"
                        />
                    </div>
                    <Button
                        type="button"
                        onClick={saveDay}
                        disabled={saving || dirtyRows.length === 0}
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? 'Saving...' : `Save day (${dirtyRows.length})`}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {canManage && (
                    <p className="mb-3 text-sm text-muted-foreground">
                        To edit or delete existing records, use{' '}
                        <Link to="/admin/attendance" className="text-primary underline-offset-4 hover:underline">
                            Attendance → History
                        </Link>
                        .
                    </p>
                )}
                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Existing</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Check in</TableHead>
                                <TableHead>Check out</TableHead>
                                <TableHead>Notes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center">
                                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                        No employees found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={row.user_id} className={row.dirty ? 'bg-muted/40' : undefined}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{row.name}</p>
                                                {row.department_name && (
                                                    <p className="text-xs text-muted-foreground">{row.department_name}</p>
                                                )}
                                                {row.phone && (
                                                    <p className="text-xs text-muted-foreground">{row.phone}</p>
                                                )}
                                                {row.employee_id && (
                                                    <p className="text-xs text-muted-foreground">{row.employee_id}</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {row.session_count > 0 ? (
                                                <div className="text-sm">
                                                    <p>
                                                        {row.existing_check_in
                                                            ? toTimeInput(row.existing_check_in)
                                                            : '—'}{' '}
                                                        →{' '}
                                                        {row.existing_check_out
                                                            ? toTimeInput(row.existing_check_out)
                                                            : 'Open'}
                                                    </p>
                                                    <Badge variant="outline" className="mt-1 text-xs">
                                                        {row.session_count} session(s)
                                                    </Badge>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">No punch</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                value={row.status}
                                                onValueChange={(v) => updateRow(row.user_id, { status: v })}
                                            >
                                                <SelectTrigger className="w-[130px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {MANUAL_STATUS_OPTIONS.map((s) => (
                                                        <SelectItem key={s} value={s} className="capitalize">
                                                            {s.replace('_', ' ')}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="time"
                                                value={row.clock_in}
                                                onChange={(e) =>
                                                    updateRow(row.user_id, { clock_in: e.target.value })
                                                }
                                                className="w-[120px]"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="time"
                                                value={row.clock_out}
                                                onChange={(e) =>
                                                    updateRow(row.user_id, { clock_out: e.target.value })
                                                }
                                                className="w-[120px]"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Textarea
                                                placeholder="Optional"
                                                value={row.notes}
                                                onChange={(e) =>
                                                    updateRow(row.user_id, { notes: e.target.value })
                                                }
                                                rows={2}
                                                className="min-w-[160px]"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
