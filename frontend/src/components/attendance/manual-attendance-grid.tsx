import axios from '@/lib/axios';
import { Clock, Save, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { nowTimeInTimezone, todayISOInTimezone } from '@/lib/datetime';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { cn } from '@/lib/utils';


interface NamedOption {
    id: number;
    name: string;
}

interface DailyRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    phone?: string | null;
    department_name?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    attendance_status: 'present' | 'open' | 'absent' | 'scheduled_off' | 'half_day' | string;
    session_count: number;
    sessions?: Array<{ status?: string | null }>;
    shift?: {
        template_name?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        is_day_off?: boolean;
    } | null;
}

interface GridRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    phone?: string | null;
    department_name?: string | null;
    shift_name?: string | null;
    shift_hours?: string | null;
    check_in_on: boolean;
    check_out_on: boolean;
    absent: boolean;
    half_day: boolean;
    clock_in: string;
    clock_out: string;
    dirty: boolean;
}

function toTimeInput(value?: string | null): string {
    if (!value) return '';
    const part = value.includes('T') ? (value.split('T')[1] ?? '') : value;
    return part.slice(0, 5);
}

function formatShiftHours(start?: string | null, end?: string | null): string | null {
    if (!start && !end) return null;
    const fmt = (t?: string | null) => (t ? t.slice(0, 5) : '—');
    return `${fmt(start)}–${fmt(end)}`;
}

function fromDaily(row: DailyRow): GridRow {
    const sessionStatuses = (row.sessions ?? []).map((s) =>
        (s.status || '').trim().toLowerCase(),
    );
    const clockIn = toTimeInput(row.check_in);
    const clockOut = toTimeInput(row.check_out);
    const isHalfDay =
        row.attendance_status === 'half_day' || sessionStatuses.includes('half_day');
    // Real punch times always win over an absent marker (e.g. location / app clock-in).
    const isAbsent =
        !isHalfDay &&
        !clockIn &&
        (row.attendance_status === 'absent' ||
            row.attendance_status === 'scheduled_off' ||
            sessionStatuses.includes('absent'));
    const shiftName = row.shift?.is_day_off
        ? 'Off'
        : row.shift?.template_name || null;
    return {
        user_id: row.user_id,
        name: row.name,
        employee_id: row.employee_id,
        phone: row.phone,
        department_name: row.department_name,
        shift_name: shiftName,
        shift_hours: row.shift?.is_day_off
            ? null
            : formatShiftHours(row.shift?.start_time, row.shift?.end_time),
        check_in_on:
            !isAbsent &&
            Boolean(
                clockIn ||
                    isHalfDay ||
                    row.attendance_status === 'present' ||
                    row.attendance_status === 'open',
            ),
        check_out_on: !isAbsent && Boolean(clockOut),
        absent: isAbsent,
        half_day: isHalfDay,
        clock_in: clockIn,
        clock_out: clockOut,
        dirty: false,
    };
}

function rowPayload(row: GridRow, fallbackTime: string) {
    if (row.absent) {
        return {
            user_id: row.user_id,
            status: 'absent',
            clock_in: undefined,
            clock_out: undefined,
        };
    }
    return {
        user_id: row.user_id,
        status: row.half_day ? 'half_day' : 'present',
        clock_in: row.check_in_on ? row.clock_in || fallbackTime : undefined,
        clock_out: row.check_out_on ? row.clock_out || fallbackTime : undefined,
    };
}

interface ManualAttendanceGridProps {
    onSaved?: () => void;
}

export default function ManualAttendanceGrid({ onSaved }: ManualAttendanceGridProps) {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');

    const orgTimezone = useMemo(() => {
        const orgTz = user?.organization?.timezone;
        const userTz = user?.timezone;
        return (typeof orgTz === 'string' && orgTz.trim()) ||
            (typeof userTz === 'string' && userTz.trim()) ||
            null;
    }, [user?.organization?.timezone, user?.timezone]);

    const stampNow = useCallback(
        () => nowTimeInTimezone(orgTimezone),
        [orgTimezone],
    );

    const [date, setDate] = useState(() => todayISOInTimezone(null));
    const [branchId, setBranchId] = useState('all');
    const [departmentId, setDepartmentId] = useState('all');
    const [branches, setBranches] = useState<NamedOption[]>([]);
    const [departments, setDepartments] = useState<NamedOption[]>([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [rows, setRows] = useState<GridRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!orgTimezone) return;
        setDate((prev) => {
            const today = todayISOInTimezone(orgTimezone);
            // Only auto-correct when still on the initial browser-local today
            return prev === todayISOInTimezone(null) ? today : prev;
        });
    }, [orgTimezone]);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [centersRes, deptRes] = await Promise.all([
                    axios.get('/admin/settings/centers', { params: { compact: 1 } }),
                    axios.get('/admin/departments/list', { params: { compact: 1 } }),
                ]);
                if (cancelled) return;
                const centerList = centersRes.data?.data ?? centersRes.data ?? [];
                const deptList = deptRes.data?.data ?? deptRes.data ?? [];
                setBranches(
                    (Array.isArray(centerList) ? centerList : []).map((c: NamedOption) => ({
                        id: Number(c.id),
                        name: c.name,
                    })),
                );
                setDepartments(
                    (Array.isArray(deptList) ? deptList : []).map((d: NamedOption) => ({
                        id: Number(d.id),
                        name: d.name,
                    })),
                );
            } catch {
                /* filters stay empty */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/reports/daily-attendance', {
                params: {
                    date,
                    search: debouncedSearch || undefined,
                    center_id: branchId !== 'all' ? Number(branchId) : undefined,
                    department_id: departmentId !== 'all' ? Number(departmentId) : undefined,
                },
            });
            const employees: DailyRow[] = res.data.data?.employees ?? [];
            setRows(employees.map(fromDaily));
        } catch (error) {
            handleApiError(error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [date, debouncedSearch, branchId, departmentId]);

    useEffect(() => {
        void load();
    }, [load]);

    const dirtyRows = useMemo(() => rows.filter((r) => r.dirty), [rows]);

    const allSelected = useMemo(
        () =>
            rows.length > 0 &&
            rows.every((r) => r.check_in_on && r.check_out_on && !r.absent),
        [rows],
    );

    const updateRow = (userId: number, patch: Partial<GridRow>) => {
        setRows((prev) =>
            prev.map((row) =>
                row.user_id === userId ? { ...row, ...patch, dirty: true } : row,
            ),
        );
    };

    const setCheckIn = (userId: number, on: boolean) => {
        const now = stampNow();
        setRows((prev) =>
            prev.map((row) => {
                if (row.user_id !== userId) return row;
                if (!on) {
                    return {
                        ...row,
                        check_in_on: false,
                        check_out_on: false,
                        clock_out: '',
                        absent: false,
                        dirty: true,
                    };
                }
                return {
                    ...row,
                    check_in_on: true,
                    absent: false,
                    clock_in: row.clock_in || now,
                    dirty: true,
                };
            }),
        );
    };

    const setCheckOut = (userId: number, on: boolean) => {
        const now = stampNow();
        setRows((prev) =>
            prev.map((row) => {
                if (row.user_id !== userId) return row;
                if (!on) {
                    return { ...row, check_out_on: false, dirty: true };
                }
                return {
                    ...row,
                    check_out_on: true,
                    check_in_on: true,
                    absent: false,
                    clock_in: row.clock_in || now,
                    clock_out: row.clock_out || now,
                    dirty: true,
                };
            }),
        );
    };

    const setAbsent = (userId: number, on: boolean) => {
        setRows((prev) =>
            prev.map((row) => {
                if (row.user_id !== userId) return row;
                if (!on) {
                    return { ...row, absent: false, dirty: true };
                }
                return {
                    ...row,
                    absent: true,
                    half_day: false,
                    check_in_on: false,
                    check_out_on: false,
                    clock_in: '',
                    clock_out: '',
                    dirty: true,
                };
            }),
        );
    };

    const setHalfDay = (userId: number, on: boolean) => {
        const now = stampNow();
        setRows((prev) =>
            prev.map((row) => {
                if (row.user_id !== userId) return row;
                if (!on) {
                    return { ...row, half_day: false, dirty: true };
                }
                return {
                    ...row,
                    half_day: true,
                    absent: false,
                    check_in_on: true,
                    clock_in: row.clock_in || now,
                    dirty: true,
                };
            }),
        );
    };

    const syncTimeNow = (userId: number, field: 'clock_in' | 'clock_out') => {
        const now = stampNow();
        setRows((prev) =>
            prev.map((row) => {
                if (row.user_id !== userId) return row;
                if (field === 'clock_in') {
                    return {
                        ...row,
                        check_in_on: true,
                        absent: false,
                        clock_in: now,
                        dirty: true,
                    };
                }
                return {
                    ...row,
                    check_out_on: true,
                    check_in_on: true,
                    absent: false,
                    clock_in: row.clock_in || now,
                    clock_out: now,
                    dirty: true,
                };
            }),
        );
    };

    const toggleSelectAll = (on: boolean) => {
        const now = stampNow();
        setRows((prev) =>
            prev.map((row) =>
                on
                    ? {
                          ...row,
                          absent: false,
                          half_day: false,
                          check_in_on: true,
                          check_out_on: true,
                          clock_in: row.clock_in || now,
                          clock_out: row.clock_out || now,
                          dirty: true,
                      }
                    : {
                          ...row,
                          check_in_on: false,
                          check_out_on: false,
                          absent: false,
                          half_day: false,
                          clock_in: '',
                          clock_out: '',
                          dirty: true,
                      },
            ),
        );
    };

    const saveDay = async () => {
        if (dirtyRows.length === 0) return;
        setSaving(true);
        const fallbackTime = stampNow();
        try {
            const res = await axios.post('/admin/attendance/manual/bulk', {
                date,
                entries: dirtyRows.map((row) => rowPayload(row, fallbackTime)),
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
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="space-y-1">
                        <Label htmlFor="manual_grid_search" className="text-xs">
                            Search
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="manual_grid_search"
                                type="search"
                                placeholder="Name, dept, phone…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full min-w-[200px] pl-8 sm:w-[220px]"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="manual_grid_date" className="text-xs">
                            Date
                        </Label>
                        <Input
                            id="manual_grid_date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-[160px]"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Branch</Label>
                        <Select value={branchId} onValueChange={setBranchId}>
                            <SelectTrigger className="w-full sm:w-[160px]">
                                <SelectValue placeholder="All branches" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All branches</SelectItem>
                                {branches.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Department</Label>
                        <Select value={departmentId} onValueChange={setDepartmentId}>
                            <SelectTrigger className="w-full sm:w-[160px]">
                                <SelectValue placeholder="All departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All departments</SelectItem>
                                {departments.map((d) => (
                                    <SelectItem key={d.id} value={String(d.id)}>
                                        {d.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button
                    type="button"
                    onClick={() => void saveDay()}
                    disabled={saving || dirtyRows.length === 0}
                    className="shrink-0"
                >
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving…' : `Save (${dirtyRows.length})`}
                </Button>
            </div>

            {canManage && (
                <p className="border-b px-4 py-2 text-xs text-muted-foreground">
                    Edit or delete existing punches in{' '}
                    <Link
                        to="/admin/attendance"
                        className="text-primary underline-offset-4 hover:underline"
                    >
                        Attendance → History
                    </Link>
                    .
                </p>
            )}

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="w-12 text-center">#</TableHead>
                            <TableHead className="min-w-[200px]">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={(v) => toggleSelectAll(!!v)}
                                        aria-label="Select all"
                                        disabled={loading || rows.length === 0}
                                    />
                                    <span>Employee</span>
                                    <span className="hidden text-[11px] font-normal text-muted-foreground sm:inline">
                                        (Select all)
                                    </span>
                                </div>
                            </TableHead>
                            <TableHead className="min-w-[160px]">Check-in</TableHead>
                            <TableHead className="min-w-[160px]">Check-out</TableHead>
                            <TableHead className="w-[100px] text-center">Half day</TableHead>
                            <TableHead className="w-[100px] text-center">Absent</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-12 text-center">
                                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                </TableCell>
                            </TableRow>
                        ) : rows.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="py-10 text-center text-muted-foreground"
                                >
                                    No employees found
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row, index) => (
                                <TableRow
                                    key={row.user_id}
                                    className={cn(
                                        'transition-colors',
                                        row.dirty && 'bg-amber-50/60 dark:bg-amber-950/20',
                                        row.half_day && 'bg-amber-50/35 dark:bg-amber-950/10',
                                        row.absent && 'bg-rose-50/40 dark:bg-rose-950/15',
                                    )}
                                >
                                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                                        {index + 1}
                                    </TableCell>
                                    <TableCell>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium leading-tight">
                                                {row.name}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {[row.department_name, row.phone, row.employee_id]
                                                    .filter(Boolean)
                                                    .join(' · ') || '—'}
                                            </p>
                                            {row.shift_name && (
                                                <p className="truncate text-[11px] text-muted-foreground">
                                                    Shift: {row.shift_name}
                                                    {row.shift_hours ? ` (${row.shift_hours})` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <Checkbox
                                                checked={row.check_in_on}
                                                onCheckedChange={(v) =>
                                                    setCheckIn(row.user_id, !!v)
                                                }
                                                aria-label={`Check-in ${row.name}`}
                                            />
                                            <Input
                                                type="time"
                                                value={row.clock_in}
                                                disabled={!row.check_in_on}
                                                onChange={(e) =>
                                                    updateRow(row.user_id, {
                                                        clock_in: e.target.value,
                                                        check_in_on: true,
                                                        absent: false,
                                                    })
                                                }
                                                className="h-9 w-[118px]"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                title="Set to current org time"
                                                aria-label={`Sync check-in time for ${row.name}`}
                                                onClick={() => syncTimeNow(row.user_id, 'clock_in')}
                                            >
                                                <Clock className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <Checkbox
                                                checked={row.check_out_on}
                                                onCheckedChange={(v) =>
                                                    setCheckOut(row.user_id, !!v)
                                                }
                                                aria-label={`Check-out ${row.name}`}
                                            />
                                            <Input
                                                type="time"
                                                value={row.clock_out}
                                                disabled={!row.check_out_on}
                                                onChange={(e) => {
                                                    const now = stampNow();
                                                    updateRow(row.user_id, {
                                                        clock_out: e.target.value,
                                                        check_out_on: true,
                                                        check_in_on: true,
                                                        clock_in: row.clock_in || now,
                                                        absent: false,
                                                    });
                                                }}
                                                className="h-9 w-[118px]"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                title="Set to current org time"
                                                aria-label={`Sync check-out time for ${row.name}`}
                                                onClick={() =>
                                                    syncTimeNow(row.user_id, 'clock_out')
                                                }
                                            >
                                                <Clock className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-center gap-2">
                                            <Checkbox
                                                checked={row.half_day}
                                                onCheckedChange={(v) =>
                                                    setHalfDay(row.user_id, !!v)
                                                }
                                                aria-label={`Half day ${row.name}`}
                                            />
                                            <span
                                                className={cn(
                                                    'text-xs font-semibold',
                                                    row.half_day
                                                        ? 'text-amber-700 dark:text-amber-400'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                HD
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-center gap-2">
                                            <Checkbox
                                                checked={row.absent}
                                                onCheckedChange={(v) =>
                                                    setAbsent(row.user_id, !!v)
                                                }
                                                aria-label={`Absent ${row.name}`}
                                            />
                                            <span
                                                className={cn(
                                                    'text-xs font-semibold',
                                                    row.absent
                                                        ? 'text-rose-600 dark:text-rose-400'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                A
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
