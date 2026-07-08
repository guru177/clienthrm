import axios from '@/lib/axios';
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/use-permissions';
import { exportAttendanceRegisterExcel } from '@/lib/attendance-register-excel';
import { handleApiError } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface RegisterEmployee {
    user_id: number;
    name: string;
    employee_id?: string | null;
    department_name?: string | null;
    days: Record<string, string>;
    present_days: number;
}

interface DailyTotals {
    present: number;
    absent: number;
    leave: number;
    off: number;
    holiday: number;
    open: number;
}

interface RegisterData {
    start_date: string;
    end_date: string;
    dates: string[];
    legend: Record<string, string>;
    employees: RegisterEmployee[];
    daily_totals: Record<string, DailyTotals>;
    total_employees: number;
}

interface DepartmentOption {
    id: number;
    name: string;
}

function monthBounds(): { start: string; end: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, '0');
    return {
        start: `${y}-${mm}-01`,
        end: `${y}-${mm}-${String(last).padStart(2, '0')}`,
    };
}

function dayHeader(dateStr: string): { dayNum: number; weekday: string } {
    const d = new Date(`${dateStr}T12:00:00`);
    return {
        dayNum: d.getDate(),
        weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    };
}

const CODE_STYLES: Record<string, string> = {
    P: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    A: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    L: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    O: 'bg-muted text-muted-foreground',
    H: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    '•': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
};

export default function AttendanceRegisterReport() {
    const bounds = useMemo(() => monthBounds(), []);
    const { settings } = useAuth();
    const { hasPermission } = usePermissions();
    const canExport = hasPermission('export-reports') || hasPermission('view-reports');

    const [startDate, setStartDate] = useState(bounds.start);
    const [endDate, setEndDate] = useState(bounds.end);
    const [departmentId, setDepartmentId] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [data, setData] = useState<RegisterData | null>(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);

    const orgTitle =
        settings.company_name ||
        settings.organization_name ||
        settings.org_name ||
        'Organization';

    useEffect(() => {
        axios
            .get('/admin/departments/list')
            .then((r) => setDepartments(r.data?.data ?? []))
            .catch(() => {});
    }, []);

    const loadRegister = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = {
                start_date: startDate,
                end_date: endDate,
            };
            if (departmentId !== 'all') params.department_id = Number(departmentId);
            const trimmed = search.trim();
            if (trimmed) params.search = trimmed;

            const res = await axios.get('/admin/reports/attendance-register', { params });
            setData(res.data?.data ?? null);
        } catch (error) {
            handleApiError(error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, departmentId, search]);

    useEffect(() => {
        void loadRegister();
    }, [loadRegister]);

    const handleExport = async () => {
        if (!data) return;
        setExporting(true);
        try {
            await exportAttendanceRegisterExcel(data, orgTitle);
        } catch (error) {
            handleApiError(error);
        } finally {
            setExporting(false);
        }
    };

    const legend = data?.legend ?? {
        P: 'Present',
        A: 'Absent',
        L: 'Leave',
        O: 'Off day',
        H: 'Holiday',
        '•': 'Open session',
    };

    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        Attendance Register
                    </CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Book-style grid by date range — export to Excel
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void loadRegister()} disabled={loading}>
                        <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                        {loading ? 'Loading…' : 'Load'}
                    </Button>
                    {canExport && (
                        <Button onClick={() => void handleExport()} disabled={!data || exporting}>
                            <Download className="mr-2 h-4 w-4" />
                            {exporting ? 'Exporting…' : 'Export Excel'}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="reg-start">Start date</Label>
                        <Input
                            id="reg-start"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-40"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reg-end">End date</Label>
                        <Input
                            id="reg-end"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-40"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={departmentId} onValueChange={setDepartmentId}>
                            <SelectTrigger className="w-48">
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
                    <div className="space-y-2">
                        <Label htmlFor="reg-search">Search</Label>
                        <Input
                            id="reg-search"
                            placeholder="Name, ID, phone…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-48"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs">
                    {Object.entries(legend).map(([code, label]) => (
                        <span key={code} className="flex items-center gap-1.5">
                            <span
                                className={cn(
                                    'inline-flex h-6 w-6 items-center justify-center rounded font-semibold',
                                    CODE_STYLES[code] ?? 'bg-muted',
                                )}
                            >
                                {code}
                            </span>
                            <span className="text-muted-foreground">{label}</span>
                        </span>
                    ))}
                </div>

                {!data && !loading && (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                        Choose a date range and click Load to view the register.
                    </p>
                )}

                {data && (
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full min-w-max border-collapse text-xs">
                            <thead>
                                <tr className="bg-muted/60">
                                    <th className="sticky left-0 z-20 min-w-[2.5rem] border-b border-r bg-muted/95 px-2 py-2 text-left font-medium">
                                        #
                                    </th>
                                    <th className="sticky left-[2.5rem] z-20 min-w-[5rem] border-b border-r bg-muted/95 px-2 py-2 text-left font-medium">
                                        Emp ID
                                    </th>
                                    <th className="sticky left-[7.5rem] z-20 min-w-[8rem] border-b border-r bg-muted/95 px-2 py-2 text-left font-medium">
                                        Name
                                    </th>
                                    <th className="sticky left-[15.5rem] z-20 min-w-[6rem] border-b border-r bg-muted/95 px-2 py-2 text-left font-medium">
                                        Dept
                                    </th>
                                    {data.dates.map((d) => {
                                        const { dayNum, weekday } = dayHeader(d);
                                        return (
                                            <th
                                                key={d}
                                                className="border-b px-1 py-2 text-center font-medium whitespace-nowrap"
                                                title={d}
                                            >
                                                <div>{dayNum}</div>
                                                <div className="text-muted-foreground font-normal">{weekday}</div>
                                            </th>
                                        );
                                    })}
                                    <th className="min-w-[4rem] border-b border-l bg-muted/60 px-2 py-2 text-center font-medium">
                                        Present
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.employees.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5 + data.dates.length}
                                            className="text-muted-foreground px-4 py-8 text-center"
                                        >
                                            No employees found for the selected filters.
                                        </td>
                                    </tr>
                                ) : (
                                    data.employees.map((emp, idx) => (
                                        <tr key={emp.user_id} className="hover:bg-muted/30">
                                            <td className="sticky left-0 z-10 border-b border-r bg-background px-2 py-1">
                                                {idx + 1}
                                            </td>
                                            <td className="sticky left-[2.5rem] z-10 border-b border-r bg-background px-2 py-1">
                                                {emp.employee_id ?? '—'}
                                            </td>
                                            <td className="sticky left-[7.5rem] z-10 max-w-[8rem] truncate border-b border-r bg-background px-2 py-1">
                                                {emp.name}
                                            </td>
                                            <td className="sticky left-[15.5rem] z-10 max-w-[6rem] truncate border-b border-r bg-background px-2 py-1">
                                                {emp.department_name ?? '—'}
                                            </td>
                                            {data.dates.map((d) => {
                                                const code = emp.days[d] ?? '';
                                                return (
                                                    <td key={d} className="border-b px-0.5 py-1 text-center">
                                                        <span
                                                            className={cn(
                                                                'inline-flex h-6 w-6 items-center justify-center rounded font-semibold',
                                                                CODE_STYLES[code] ?? '',
                                                            )}
                                                        >
                                                            {code}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                            <td className="border-b border-l px-2 py-1 text-center font-medium">
                                                {emp.present_days}
                                            </td>
                                        </tr>
                                    ))
                                )}
                                {data.employees.length > 0 && (
                                    <tr className="bg-muted/40 font-medium">
                                        <td
                                            colSpan={4}
                                            className="sticky left-0 z-10 border-t border-r bg-muted/95 px-2 py-2"
                                        >
                                            Daily present
                                        </td>
                                        {data.dates.map((d) => (
                                            <td key={d} className="border-t px-1 py-2 text-center">
                                                {data.daily_totals[d]?.present ?? 0}
                                            </td>
                                        ))}
                                        <td className="border-t border-l" />
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {data && (
                    <p className="text-muted-foreground text-xs">
                        {data.total_employees} employee(s) · {data.start_date} to {data.end_date}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
