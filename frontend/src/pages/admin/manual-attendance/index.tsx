import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, FileSpreadsheet } from 'lucide-react';

import AttendanceStats from '@/components/attendance/attendance-stats';
import ManualAttendanceForm from '@/components/attendance/manual-attendance-form';
import ManualAttendanceGrid from '@/components/attendance/manual-attendance-grid';
import ManualAttendanceMonthReport from '@/components/attendance/manual-attendance-month-report';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/layouts/app-layout';
import { useAttendanceStats } from '@/hooks/use-attendance-stats';
import { usePermissions } from '@/hooks/use-permissions';

function LiveClock({ timeZone }: { timeZone?: string | null }) {
    const [now, setNow] = useState(() => new Date());
    const zone = timeZone?.trim() || undefined;

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className="rounded-xl border bg-background/80 px-3 py-2 text-right shadow-sm tabular-nums">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Live time{zone ? ` · ${zone}` : ''}
            </div>
            <div className="text-sm font-semibold leading-tight sm:text-base">
                {now.toLocaleTimeString(undefined, {
                    timeZone: zone,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                })}
            </div>
            <div className="text-[11px] text-muted-foreground">
                {now.toLocaleDateString(undefined, {
                    timeZone: zone,
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                })}
            </div>
        </div>
    );
}

export default function ManualAttendancePage() {
    const [gridKey, setGridKey] = useState(0);
    const [reportOpen, setReportOpen] = useState(false);
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');
    const { stats, loading, reload } = useAttendanceStats('all');

    const orgTimezone = useMemo(() => {
        const orgTz = user?.organization?.timezone;
        const userTz = user?.timezone;
        return (typeof orgTz === 'string' && orgTz.trim()) ||
            (typeof userTz === 'string' && userTz.trim()) ||
            null;
    }, [user?.organization?.timezone, user?.timezone]);

    const breadcrumbs = [{ label: 'Attendance', href: '/admin/manual-attendance' }];

    const refreshGrid = async () => {
        setGridKey((k) => k + 1);
        await reload();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-4 sm:space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                            <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                                Attendance
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Mark check-in, check-out, or absent for the day. Location and app
                                punches also appear here as check-in/out.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setReportOpen(true)}
                            className="shrink-0"
                        >
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Report
                        </Button>
                        <LiveClock timeZone={orgTimezone} />
                    </div>
                </div>

                <ManualAttendanceMonthReport open={reportOpen} onOpenChange={setReportOpen} />

                <Tabs defaultValue="daily" className="w-full">
                    <TabsList className="grid h-auto w-full grid-cols-3">
                        <TabsTrigger value="daily">Daily grid</TabsTrigger>
                        <TabsTrigger value="statistics">Statistics</TabsTrigger>
                        <TabsTrigger value="entry">Single entry</TabsTrigger>
                    </TabsList>

                    <TabsContent value="daily" className="mt-4 space-y-4">
                        <ManualAttendanceGrid key={gridKey} onSaved={refreshGrid} />
                    </TabsContent>

                    <TabsContent value="statistics" className="mt-4 space-y-4">
                        <AttendanceStats
                            stats={stats}
                            loading={loading}
                            title="Attendance statistics"
                        />
                        {!canManage && (
                            <p className="text-sm text-muted-foreground">
                                Statistics show your recorded sessions (including location / app
                                punches). Attendance managers can see all employees.
                            </p>
                        )}
                    </TabsContent>

                    <TabsContent value="entry" className="mt-4 space-y-4">
                        <ManualAttendanceForm onSuccess={refreshGrid} />
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
