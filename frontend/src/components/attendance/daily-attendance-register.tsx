import axios from '@/lib/axios';
import { CalendarDays, ChevronDown, ChevronRight, Fingerprint, Monitor, Users } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
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
import { handleApiError } from '@/lib/toast';

interface NamedOption {
    id: number;
    name: string;
}

interface SessionRow {
    id: number;
    clock_in?: string | null;
    clock_out?: string | null;
    duration_minutes?: number;
    source?: string;
    source_label?: string;
    is_late?: boolean;
    is_early_exit?: boolean;
}

interface DailyRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    total_minutes: number;
    session_count: number;
    is_late: boolean;
    is_early_exit: boolean;
    has_open_session: boolean;
    attendance_status: 'present' | 'open' | 'absent' | 'scheduled_off';
    sessions?: SessionRow[];
    sources?: string[];
    source_summary?: { biometric: number; app: number; manual?: number };
}

interface DailyPayload {
    date: string;
    employees: DailyRow[];
    total_employees: number;
    present_count: number;
    open_count: number;
    absent_count: number;
    scheduled_off_count?: number;
    biometric_synced?: number;
}

function formatTime(value?: string | null) {
    if (!value) return '--:--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

function formatDuration(minutes: number) {
    if (!minutes) return '--';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
}

function statusBadge(status: DailyRow['attendance_status']) {
    if (status === 'present') return <Badge>Present</Badge>;
    if (status === 'open') return <Badge variant="secondary">Open session</Badge>;
    if (status === 'scheduled_off') return <Badge variant="outline">Scheduled off</Badge>;
    return <Badge variant="outline">Absent</Badge>;
}

function SourceBadges({ row }: { row: DailyRow }) {
    const bio = row.source_summary?.biometric ?? 0;
    const app = row.source_summary?.app ?? 0;
    if (bio === 0 && app === 0) return <span className="text-muted-foreground text-sm">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {bio > 0 && (
                <Badge variant="outline" className="gap-1 text-xs">
                    <Fingerprint className="h-3 w-3" /> Biometric ({bio})
                </Badge>
            )}
            {app > 0 && (
                <Badge variant="outline" className="gap-1 text-xs">
                    <Monitor className="h-3 w-3" /> App ({app})
                </Badge>
            )}
        </div>
    );
}

export default function DailyAttendanceRegister() {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [branchId, setBranchId] = useState('all');
    const [designationId, setDesignationId] = useState('all');
    const [branches, setBranches] = useState<NamedOption[]>([]);
    const [designations, setDesignations] = useState<NamedOption[]>([]);
    const [data, setData] = useState<DailyPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [centersRes, desgRes] = await Promise.all([
                    axios.get('/admin/settings/centers', { params: { compact: 1 } }),
                    axios.get('/admin/designations/list', { params: { compact: 1 } }),
                ]);
                if (cancelled) return;
                const centerList = centersRes.data?.data ?? centersRes.data ?? [];
                const desgList = desgRes.data?.data ?? desgRes.data ?? [];
                setBranches(
                    (Array.isArray(centerList) ? centerList : []).map((c: NamedOption) => ({
                        id: Number(c.id),
                        name: c.name,
                    })),
                );
                setDesignations(
                    (Array.isArray(desgList) ? desgList : []).map((d: NamedOption) => ({
                        id: Number(d.id),
                        name: d.name,
                    })),
                );
            } catch {
                /* filters stay empty; register still works */
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
                    center_id: branchId !== 'all' ? Number(branchId) : undefined,
                    designation_id: designationId !== 'all' ? Number(designationId) : undefined,
                },
            });
            setData(res.data.data ?? null);
        } catch (error) {
            handleApiError(error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [date, branchId, designationId]);

    useEffect(() => {
        void load();
    }, [load]);

    const chartData = (data?.employees ?? [])
        .filter((r) => r.total_minutes > 0)
        .slice(0, 15)
        .map((r) => ({
            name: r.name.split(' ')[0],
            hours: Number((r.total_minutes / 60).toFixed(1)),
        }));

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-primary" />
                            Daily Attendance Register
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Combined view — biometric device punches and app/system clock-in on one register
                        </p>
                    </div>
                    <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
                        <div className="space-y-1">
                            <Label htmlFor="daily_date">Date</Label>
                            <Input
                                id="daily_date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full sm:w-[180px]"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Branch</Label>
                            <Select value={branchId} onValueChange={setBranchId}>
                                <SelectTrigger className="w-full sm:w-[180px]">
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
                            <Label>Designation</Label>
                            <Select value={designationId} onValueChange={setDesignationId}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="All designations" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All designations</SelectItem>
                                    {designations.map((d) => (
                                        <SelectItem key={d.id} value={String(d.id)}>
                                            {d.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {data && (
                        <div className="mb-4 flex flex-wrap gap-3 text-sm">
                            <span className="flex items-center gap-1 text-muted-foreground">
                                <Users className="h-4 w-4" /> {data.total_employees} employees
                            </span>
                            <Badge variant="default">{data.present_count} present</Badge>
                            {data.open_count > 0 && (
                                <Badge variant="secondary">{data.open_count} open</Badge>
                            )}
                            <Badge variant="outline">{data.absent_count} absent</Badge>
                            {(data.scheduled_off_count ?? 0) > 0 && (
                                <Badge variant="outline">{data.scheduled_off_count} scheduled off</Badge>
                            )}
                            {(data.biometric_synced ?? 0) > 0 && (
                                <Badge variant="outline" className="gap-1">
                                    <Fingerprint className="h-3 w-3" />
                                    {data.biometric_synced} biometric punch(es) synced
                                </Badge>
                            )}
                        </div>
                    )}

                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8" />
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Employee ID</TableHead>
                                    <TableHead>Check In</TableHead>
                                    <TableHead>Check Out</TableHead>
                                    <TableHead>Total Time</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-10">
                                            Loading daily register...
                                        </TableCell>
                                    </TableRow>
                                ) : (data?.employees ?? []).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                            No employees found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data!.employees.map((row) => {
                                        const isOpen = expanded === row.user_id;
                                        const hasSessions = (row.sessions?.length ?? 0) > 0;
                                        return (
                                            <Fragment key={row.user_id}>
                                                <TableRow>
                                                    <TableCell>
                                                        {hasSessions ? (
                                                            <button
                                                                type="button"
                                                                className="text-muted-foreground hover:text-foreground"
                                                                onClick={() =>
                                                                    setExpanded(isOpen ? null : row.user_id)
                                                                }
                                                                aria-label="Toggle session detail"
                                                            >
                                                                {isOpen ? (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronRight className="h-4 w-4" />
                                                                )}
                                                            </button>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell className="font-medium">{row.name}</TableCell>
                                                    <TableCell>{row.employee_id || '—'}</TableCell>
                                                    <TableCell>
                                                        <div>
                                                            <p>{formatTime(row.check_in)}</p>
                                                            {row.is_late && (
                                                                <p className="text-xs text-red-600">Late</p>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div>
                                                            <p>
                                                                {row.has_open_session && !row.check_out
                                                                    ? 'Open'
                                                                    : formatTime(row.check_out)}
                                                            </p>
                                                            {row.is_early_exit && (
                                                                <p className="text-xs text-orange-600">Early</p>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono">
                                                        {formatDuration(row.total_minutes)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <SourceBadges row={row} />
                                                    </TableCell>
                                                    <TableCell>{statusBadge(row.attendance_status)}</TableCell>
                                                </TableRow>
                                                {isOpen && hasSessions && (
                                                    <TableRow className="bg-muted/30">
                                                        <TableCell colSpan={8} className="py-3">
                                                            <p className="text-xs font-medium text-muted-foreground mb-2">
                                                                Session breakdown ({row.session_count})
                                                            </p>
                                                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                                {row.sessions!.map((s) => (
                                                                    <div
                                                                        key={s.id}
                                                                        className="rounded-md border bg-background px-3 py-2 text-sm"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                                            <span className="font-medium">
                                                                                {formatTime(s.clock_in)} →{' '}
                                                                                {s.clock_out
                                                                                    ? formatTime(s.clock_out)
                                                                                    : 'Open'}
                                                                            </span>
                                                                            <Badge variant="outline" className="text-[10px]">
                                                                                {s.source_label ||
                                                                                    (s.source === 'biometric'
                                                                                        ? 'Biometric'
                                                                                        : 'App / system')}
                                                                            </Badge>
                                                                        </div>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {formatDuration(s.duration_minutes ?? 0)}
                                                                        </p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {chartData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Hours worked (top employees)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} barSize={22}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} unit="h" />
                                <Tooltip formatter={(v: number) => [`${v} hrs`, 'Worked']} />
                                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
