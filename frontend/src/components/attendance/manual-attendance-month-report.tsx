import axios from '@/lib/axios';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
    exportAttendanceRegisterExcel,
    type RegisterExcelData,
} from '@/lib/attendance-register-excel';
import { exportAttendanceRegisterPdf } from '@/lib/attendance-register-pdf';
import { handleApiError, showToast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface RegisterEmployee {
    user_id: number;
    name: string;
    employee_id?: string | null;
    department_name?: string | null;
    days: Record<string, string>;
    present_days: number;
}

interface RegisterData {
    start_date: string;
    end_date: string;
    dates: string[];
    legend: Record<string, string>;
    employees: RegisterEmployee[];
    total_employees: number;
    daily_totals?: RegisterExcelData['daily_totals'];
}

interface BranchOption {
    id: number;
    name: string;
}

const CODE_STYLES: Record<string, string> = {
    P: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    A: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    HD: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    L: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    O: 'bg-muted text-muted-foreground',
    H: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    EW: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-300',
    '•': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
};

const MONTH_OPTIONS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
] as const;

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function boundsForYearMonth(year: string, month: string): { start: string; end: string } {
    const y = Number(year);
    const m = Number(month);
    const last = new Date(y, m, 0).getDate();
    return {
        start: `${y}-${pad2(m)}-01`,
        end: `${y}-${pad2(m)}-${pad2(last)}`,
    };
}

function dayHeader(dateStr: string): { dayNum: number; weekday: string } {
    const d = new Date(`${dateStr}T12:00:00`);
    return {
        dayNum: d.getDate(),
        weekday: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
    };
}

function buildYearOptions(centerYear: number): string[] {
    // Wide range so HR can open any historical or near-future month.
    const start = 1970;
    const end = Math.max(centerYear + 10, 2040);
    const out: string[] = [];
    for (let y = start; y <= end; y++) {
        out.push(String(y));
    }
    return out;
}

function computeDailyTotals(
    dates: string[],
    employees: RegisterEmployee[],
): RegisterExcelData['daily_totals'] {
    const totals: RegisterExcelData['daily_totals'] = {};
    for (const d of dates) {
        totals[d] = { present: 0, absent: 0, leave: 0, off: 0, holiday: 0, open: 0 };
    }
    for (const emp of employees) {
        for (const d of dates) {
            const code = emp.days[d] ?? '';
            const bucket = totals[d];
            if (!bucket) continue;
            if (code === 'P' || code === 'HD') bucket.present += 1;
            else if (code === 'A') bucket.absent += 1;
            else if (code === 'L') bucket.leave += 1;
            else if (code === 'O') bucket.off += 1;
            else if (code === 'H') bucket.holiday += 1;
            else if (code === '•') bucket.open += 1;
        }
    }
    return totals;
}

interface ManualAttendanceMonthReportProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function ManualAttendanceMonthReport({
    open,
    onOpenChange,
}: ManualAttendanceMonthReportProps) {
    const { settings, canAccessAllCenters, branchScope, canAccessCenter } = useAuth();
    const allCenters = canAccessAllCenters();
    const now = useMemo(() => new Date(), []);
    const [year, setYear] = useState(() => String(now.getFullYear()));
    const [month, setMonth] = useState(() => pad2(now.getMonth() + 1));
    const [branchId, setBranchId] = useState('all');
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [data, setData] = useState<RegisterData | null>(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);

    const yearOptions = useMemo(() => buildYearOptions(now.getFullYear()), [now]);
    const orgTitle =
        settings.company_name ||
        settings.organization_name ||
        settings.org_name ||
        'Organization';
    const monthLabel =
        MONTH_OPTIONS.find((m) => m.value === month)?.label ?? month;

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
        if (!open) return;
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
                /* empty filters */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, allCenters, canAccessCenter]);

    useEffect(() => {
        if (!open) return;

        const controller = new AbortController();
        const { start, end } = boundsForYearMonth(year, month);
        setLoading(true);

        void (async () => {
            try {
                const params: Record<string, string | number> = {
                    start_date: start,
                    end_date: end,
                };
                if (branchId !== 'all') params.center_id = Number(branchId);
                const res = await axios.get('/admin/reports/attendance-register', {
                    params,
                    signal: controller.signal,
                });
                setData(res.data?.data ?? null);
            } catch (error) {
                if (
                    axios.isCancel?.(error) ||
                    (error as { code?: string; name?: string })?.code === 'ERR_CANCELED' ||
                    (error as { name?: string })?.name === 'CanceledError'
                ) {
                    return;
                }
                handleApiError(error);
                setData(null);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        })();

        return () => controller.abort();
    }, [open, year, month, branchId, refreshTick]);

    const legend = data?.legend ?? {
        P: 'Present',
        A: 'Absent',
        HD: 'Half day',
        L: 'Leave',
        O: 'Off day',
        H: 'Holiday',
        EW: 'Extra work',
        '•': 'Open session',
    };

    const exportExcel = async () => {
        if (!data) return;
        setExporting('excel');
        try {
            const payload: RegisterExcelData = {
                ...data,
                daily_totals: data.daily_totals ?? computeDailyTotals(data.dates, data.employees),
            };
            await exportAttendanceRegisterExcel(payload, orgTitle);
            showToast({ type: 'success', message: 'Excel downloaded' });
        } catch (error) {
            handleApiError(error);
        } finally {
            setExporting(null);
        }
    };

    const exportPdf = async () => {
        if (!data) return;
        setExporting('pdf');
        try {
            const branchName =
                branchId === 'all'
                    ? allCenters
                        ? 'All branches'
                        : 'My branches'
                    : branches.find((b) => String(b.id) === branchId)?.name ?? 'Branch';
            await exportAttendanceRegisterPdf(data, orgTitle, {
                subtitle: `${monthLabel} ${year} · ${branchName} · ${data.total_employees} employee(s)`,
            });
        } catch (error) {
            handleApiError(error);
        } finally {
            setExporting(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(92vh,960px)] w-[calc(100%-1.5rem)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:w-[calc(100%-2rem)] sm:max-w-none sm:p-5">
                <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                        Monthly attendance report
                    </DialogTitle>
                    <DialogDescription>
                        Employees on the left, calendar days across the top — Present (P), Absent
                        (A), Half day (HD).
                    </DialogDescription>
                </DialogHeader>

                <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Year</Label>
                            <Select value={year} onValueChange={setYear}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Select year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearOptions.map((y) => (
                                        <SelectItem key={y} value={y}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Month</Label>
                            <Select value={month} onValueChange={setMonth}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Select month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {MONTH_OPTIONS.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Branch</Label>
                            <Select
                                value={branchId}
                                onValueChange={setBranchId}
                                disabled={!allCenters && branches.length <= 1}
                            >
                                <SelectTrigger className="w-[180px]">
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
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void exportExcel()}
                            disabled={!data || loading || exporting !== null}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {exporting === 'excel' ? 'Excel…' : 'Excel'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void exportPdf()}
                            disabled={!data || loading || exporting !== null}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            {exporting === 'pdf' ? 'PDF…' : 'PDF'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRefreshTick((n) => n + 1)}
                            disabled={loading || exporting !== null}
                        >
                            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                            {loading ? 'Loading…' : 'Refresh'}
                        </Button>
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-3 text-xs">
                    {Object.entries(legend).map(([code, label]) => (
                        <span key={code} className="flex items-center gap-1.5">
                            <span
                                className={cn(
                                    'inline-flex h-6 min-w-6 items-center justify-center rounded px-1 font-semibold',
                                    CODE_STYLES[code] ?? 'bg-muted',
                                )}
                            >
                                {code}
                            </span>
                            <span className="text-muted-foreground">{label}</span>
                        </span>
                    ))}
                </div>

                <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
                    {loading && data && (
                        <div className="pointer-events-none absolute inset-0 z-30 bg-background/40" />
                    )}
                    {loading && !data ? (
                        <div className="flex h-48 items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        </div>
                    ) : !data ? (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            No report data for this month.
                        </p>
                    ) : (
                        <table className="w-full min-w-max border-collapse text-xs">
                            <thead>
                                <tr className="bg-muted/60">
                                    <th className="sticky left-0 z-20 min-w-[11rem] border-b border-r bg-muted/95 px-3 py-2 text-left font-medium sm:min-w-[14rem]">
                                        Employee
                                    </th>
                                    {data.dates.map((d) => {
                                        const { dayNum, weekday } = dayHeader(d);
                                        return (
                                            <th
                                                key={d}
                                                className="border-b px-0.5 py-2 text-center font-medium"
                                                title={d}
                                            >
                                                <div className="tabular-nums">{dayNum}</div>
                                                <div className="text-[10px] font-normal text-muted-foreground">
                                                    {weekday}
                                                </div>
                                            </th>
                                        );
                                    })}
                                    <th className="min-w-[3.5rem] border-b border-l bg-muted/60 px-2 py-2 text-center font-medium">
                                        Days
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.employees.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={2 + data.dates.length}
                                            className="px-4 py-10 text-center text-muted-foreground"
                                        >
                                            No employees found
                                        </td>
                                    </tr>
                                ) : (
                                    data.employees.map((emp) => (
                                        <tr key={emp.user_id} className="hover:bg-muted/25">
                                            <td className="sticky left-0 z-10 max-w-[14rem] border-b border-r bg-background px-3 py-1.5">
                                                <p className="truncate font-medium leading-tight">
                                                    {emp.name}
                                                </p>
                                                <p className="truncate text-[10px] text-muted-foreground">
                                                    {[emp.department_name, emp.employee_id]
                                                        .filter(Boolean)
                                                        .join(' · ') || '—'}
                                                </p>
                                            </td>
                                            {data.dates.map((d) => {
                                                const code = emp.days[d] ?? '';
                                                return (
                                                    <td
                                                        key={d}
                                                        className="border-b px-0.5 py-1 text-center"
                                                    >
                                                        {code ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex h-6 min-w-6 items-center justify-center rounded px-0.5 font-semibold',
                                                                    CODE_STYLES[code] ?? 'bg-muted',
                                                                )}
                                                            >
                                                                {code}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground/40">
                                                                ·
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="border-b border-l px-2 py-1 text-center font-medium tabular-nums">
                                                {emp.present_days}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {data && (
                    <p className="shrink-0 text-xs text-muted-foreground">
                        {data.total_employees} employee(s) · {data.start_date} to {data.end_date}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
