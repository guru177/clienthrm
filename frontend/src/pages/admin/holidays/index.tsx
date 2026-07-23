import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import axios from '@/lib/axios';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { cn } from '@/lib/utils';

interface Holiday {
    id: number;
    name: string;
    date: string;
    description?: string | null;
}

interface HolidayForm {
    id?: number;
    name: string;
    date: string;
    description: string;
}

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

function daysInMonth(year: number, monthIndex: number): number {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function toISODate(year: number, monthIndex: number, day: number): string {
    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function holidayDateKey(raw: string): string {
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function yearOfDateKey(key: string): number | null {
    const y = Number(key.slice(0, 4));
    return Number.isFinite(y) ? y : null;
}

export default function HolidaysPage() {
    const confirm = useConfirm();
    const thisYear = new Date().getFullYear();
    const [year, setYear] = useState(thisYear);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<HolidayForm>({
        name: '',
        date: '',
        description: '',
    });

    const byDate = useMemo(() => {
        const map = new Map<string, Holiday>();
        for (const h of holidays) {
            const key = holidayDateKey(h.date);
            if (yearOfDateKey(key) !== year) continue;
            map.set(key, h);
        }
        return map;
    }, [holidays, year]);

    const holidayCount = byDate.size;
    const todayKey = holidayDateKey(new Date().toISOString());

    useEffect(() => {
        void fetchHolidays();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on year
    }, [year]);

    const fetchHolidays = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/holidays/list', {
                params: { year },
            });
            if (response.data.success) {
                const data = response.data.data;
                const list: Holiday[] = Array.isArray(data) ? data : data?.data || [];
                setHolidays(
                    list.filter((h) => yearOfDateKey(holidayDateKey(h.date)) === year),
                );
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const openDay = (iso: string) => {
        const existing = byDate.get(iso);
        if (existing) {
            setForm({
                id: existing.id,
                name: existing.name,
                date: iso,
                description: existing.description || '',
            });
        } else {
            setForm({ name: '', date: iso, description: '' });
        }
        setDialogOpen(true);
    };

    const saveHoliday = async () => {
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                date: form.date,
                description: form.description.trim() || undefined,
                is_paid: true,
            };
            if (form.id) {
                const response = await axios.put(`/admin/holidays/${form.id}`, payload);
                handleApiResponse(response);
            } else {
                const response = await axios.post('/admin/holidays', payload);
                handleApiResponse(response);
            }
            setDialogOpen(false);
            await fetchHolidays();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const deleteHoliday = async () => {
        if (!form.id) return;
        if (!(await confirm({ description: 'Delete this holiday?' }))) return;
        try {
            const response = await axios.delete(`/admin/holidays/${form.id}`);
            handleApiResponse(response);
            setDialogOpen(false);
            await fetchHolidays();
        } catch (error) {
            handleApiError(error);
        }
    };

    const formattedDialogDate = form.date
        ? new Date(`${form.date}T12:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : '';

    return (
        <AppLayout breadcrumbs={[{ label: 'Dashboard', href: '#' }, { label: 'Holidays' }]}>
            <div className="flex h-full min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3 md:gap-3 md:p-4">
                <div className="shrink-0 rounded-xl border border-border/60 bg-gradient-to-br from-sky-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 px-3 py-2 sm:px-4 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                                <Calendar className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-lg font-semibold tracking-tight leading-tight">
                                    Holidays
                                </h1>
                                <p className="text-xs text-muted-foreground hidden sm:block">
                                    Tap a date to add or edit a holiday
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end">
                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-0.5 shadow-sm text-xs sm:text-sm">
                                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                                <span className="font-medium tabular-nums">{holidayCount}</span>
                                <span className="text-muted-foreground">holidays</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-0.5 shadow-sm text-xs sm:text-sm text-muted-foreground">
                                <span className="h-3.5 w-3.5 rounded-md ring-1 ring-inset ring-sky-500/70 bg-sky-500/10" />
                                Today
                            </span>
                            <div className="inline-flex items-center rounded-lg border bg-background/80 p-0.5 shadow-sm">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-md"
                                    onClick={() => setYear((y) => y - 1)}
                                    aria-label="Previous year"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="min-w-[3.75rem] text-center text-sm font-semibold tabular-nums">
                                    {year}
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-md"
                                    onClick={() => setYear((y) => y + 1)}
                                    aria-label="Next year"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => void fetchHolidays()}
                                disabled={loading}
                                title="Refresh"
                            >
                                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                            </Button>
                        </div>
                    </div>
                </div>

                <div
                    className={cn(
                        'flex min-h-0 flex-1 flex-col rounded-xl border bg-card shadow-sm overflow-hidden',
                        loading && 'opacity-60 pointer-events-none',
                    )}
                >
                    <TooltipProvider delayDuration={180}>
                        <div className="h-full min-h-0 w-full overflow-x-auto overflow-y-hidden">
                            <div
                                className="grid h-full min-w-[680px] w-full"
                                style={{
                                    gridTemplateColumns: '3.25rem repeat(31, minmax(0, 1fr))',
                                    gridTemplateRows: '1.75rem repeat(12, minmax(0, 1fr))',
                                }}
                            >
                                <div className="sticky left-0 z-20 flex items-center justify-center border-b border-r bg-muted/90 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                                    {year}
                                </div>
                                {Array.from({ length: 31 }, (_, i) => (
                                    <div
                                        key={`h-${i + 1}`}
                                        className="flex items-center justify-center border-b text-[10px] sm:text-xs font-medium text-muted-foreground"
                                    >
                                        {i + 1}
                                    </div>
                                ))}

                                {MONTHS.map((monthLabel, monthIndex) => {
                                    const dim = daysInMonth(year, monthIndex);
                                    return (
                                        <div key={monthLabel} className="contents">
                                            <div className="sticky left-0 z-10 flex items-center border-b border-r bg-card px-1.5 text-xs sm:text-sm font-semibold">
                                                {monthLabel}
                                            </div>
                                            {Array.from({ length: 31 }, (_, dayIdx) => {
                                                const day = dayIdx + 1;
                                                if (day > dim) {
                                                    return (
                                                        <div
                                                            key={day}
                                                            className="border-b border-border/30 bg-muted/15"
                                                            aria-hidden
                                                        />
                                                    );
                                                }
                                                const iso = toISODate(year, monthIndex, day);
                                                const holiday = byDate.get(iso);
                                                const isToday = iso === todayKey;
                                                const prettyDate = new Date(
                                                    `${iso}T12:00:00`,
                                                ).toLocaleDateString(undefined, {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                });
                                                const cellButton = (
                                                    <button
                                                        type="button"
                                                        onClick={() => openDay(iso)}
                                                        className={cn(
                                                            'flex h-full w-full min-h-0 items-center justify-center rounded-md text-[10px] sm:text-xs transition-all duration-200',
                                                            'hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
                                                            holiday &&
                                                                'bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-600/90 hover:z-10 hover:scale-[1.06] hover:shadow-md',
                                                            !holiday && 'text-muted-foreground',
                                                            isToday &&
                                                                !holiday &&
                                                                'ring-2 ring-inset ring-sky-500/70 bg-sky-500/10 text-foreground font-semibold',
                                                            isToday &&
                                                                holiday &&
                                                                'ring-2 ring-white/80 ring-offset-1 ring-offset-emerald-600',
                                                        )}
                                                    >
                                                        {day}
                                                    </button>
                                                );
                                                return (
                                                    <div
                                                        key={day}
                                                        className="min-h-0 border-b border-border/40 p-0.5"
                                                    >
                                                        {holiday ? (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    {cellButton}
                                                                </TooltipTrigger>
                                                                <TooltipContent
                                                                    side="top"
                                                                    sideOffset={6}
                                                                    className="max-w-[240px] border-0 bg-emerald-950 text-emerald-50 px-3.5 py-2.5 shadow-xl shadow-emerald-950/25"
                                                                >
                                                                    <div className="space-y-1">
                                                                        <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-300/80">
                                                                            {prettyDate}
                                                                            {isToday ? ' · Today' : ''}
                                                                        </p>
                                                                        <p className="text-sm font-semibold leading-snug">
                                                                            {holiday.name}
                                                                        </p>
                                                                        {holiday.description ? (
                                                                            <p className="text-xs leading-relaxed text-emerald-100/75">
                                                                                {holiday.description}
                                                                            </p>
                                                                        ) : null}
                                                                    </div>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        ) : (
                                                            cellButton
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </TooltipProvider>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {form.id ? 'Edit holiday' : 'Add holiday'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
                            <div className="text-xs text-muted-foreground mb-0.5">Date</div>
                            <div className="font-medium">{formattedDialogDate}</div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium" htmlFor="holiday-name">
                                Name
                            </label>
                            <Input
                                id="holiday-name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. Republic Day"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium" htmlFor="holiday-notes">
                                Notes (optional)
                            </label>
                            <Input
                                id="holiday-notes"
                                value={form.description}
                                onChange={(e) =>
                                    setForm({ ...form, description: e.target.value })
                                }
                                placeholder="Optional description"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-3 flex-col-reverse sm:flex-row sm:justify-between">
                        <div>
                            {form.id ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive w-full sm:w-auto"
                                    onClick={() => void deleteHoliday()}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex gap-2 justify-end w-full sm:w-auto">
                            <Button
                                variant="outline"
                                className="flex-1 sm:flex-none"
                                onClick={() => setDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 sm:flex-none"
                                onClick={() => void saveHoliday()}
                                disabled={saving || !form.name.trim() || !form.date}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
