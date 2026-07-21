import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axios';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { Clock, LogIn, LogOut, Calendar, Timer, UserCheck } from 'lucide-react';
import { useState, useEffect } from 'react';

import AttendanceStats from '@/components/attendance/attendance-stats';
import AttendanceTable from '@/components/attendance/attendance-table';
import DailyAttendanceRegister from '@/components/attendance/daily-attendance-register';
import EmployeeAttendanceLog from '@/components/attendance/employee-attendance-log';
import ClockInFaceDialog, {
    type ClockInVerificationPayload,
} from '@/components/attendance/clock-in-face-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useAttendanceStats } from '@/hooks/use-attendance-stats';
import { useLocationTracking } from '@/hooks/use-location-tracking';
import {
    enqueueOfflinePunch,
    getOfflinePunchQueue,
    isNetworkError,
    removeOfflinePunch,
} from '@/lib/offline-punch-queue';
import { isModuleAllowed } from '@/lib/plan-modules';
import { type SharedData } from '@/types';
import toast from 'react-hot-toast';

export default function AttendancePage() {
    const { user, planModules } = useAuth();
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-attendance');
    const navigate = useNavigate();
    const canClockIn = hasPermission('clock-inout');
    const canMarkManual =
        isModuleAllowed(planModules, 'manual_attendance') &&
        (hasPermission('mark-attendance') || hasPermission('manage-attendance'));
    const [todayData, setTodayData] = useState<any>(null);
    const { stats, loading: statsLoading, reload: reloadStats } = useAttendanceStats('all');
    const [loading, setLoading] = useState(true);
    const [clockingIn, setClockingIn] = useState(false);
    const [clockingOut, setClockingOut] = useState(false);
    const [clockInOpen, setClockInOpen] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Get active clock-in (one without clock-out)
    const activeClockIn = todayData?.active_clock_in;
    // Get the latest completed session
    const latestSession = todayData?.attendances?.[0];
    const allSessions = todayData?.attendances || [];

    useEffect(() => {
        loadData();
    }, []);

    // Timer effect for active session
    useEffect(() => {
        if (!activeClockIn?.clock_in || activeClockIn?.clock_out) return;

        const interval = setInterval(() => {
            const clockInTime = new Date(activeClockIn.clock_in).getTime();
            const now = new Date().getTime();
            const elapsed = Math.floor((now - clockInTime) / 1000); // in seconds
            setElapsedTime(elapsed);
        }, 1000);

        return () => clearInterval(interval);
    }, [activeClockIn?.clock_in, activeClockIn?.clock_out]);

    const { requestLocation, locationData } = useLocationTracking();

    const loadData = async () => {
        setLoading(true);
        try {
            const [todayRes] = await Promise.all([
                axios.get('/admin/attendance/today'),
                reloadStats().catch(() => null),
            ]);
            setTodayData(todayRes.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const flushOfflinePunches = async () => {
        if (!canClockIn || !navigator.onLine) return;
        const queue = getOfflinePunchQueue();
        if (queue.length === 0) return;

        let synced = 0;
        for (const item of queue) {
            try {
                if (item.type === 'clock-in') {
                    await axios.post('/admin/attendance/clock-in', item.payload);
                } else {
                    await axios.post('/admin/attendance/clock-out', item.payload);
                }
                removeOfflinePunch(item.id);
                synced += 1;
            } catch (error) {
                if (isNetworkError(error)) break;
                removeOfflinePunch(item.id);
                handleApiError(error);
            }
        }
        if (synced > 0) {
            toast.success('Offline punches synced');
            await loadData();
        }
    };

    useEffect(() => {
        if (!canClockIn) return;
        const onOnline = () => {
            void flushOfflinePunches();
        };
        window.addEventListener('online', onOnline);
        void flushOfflinePunches();
        return () => window.removeEventListener('online', onOnline);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- flush on mount / permission only
    }, [canClockIn]);

    const handleClockIn = async (payload: ClockInVerificationPayload) => {
        setClockingIn(true);
        try {
            if (!navigator.onLine) {
                enqueueOfflinePunch('clock-in', payload as unknown as Record<string, unknown>);
                toast.success('Clock-in saved offline — will sync when online');
                setClockInOpen(false);
                return;
            }
            const response = await axios.post('/admin/attendance/clock-in', payload);
            handleApiResponse(response);
            setClockInOpen(false);
            // Refresh UI in background — don't block the success path.
            void loadData();
        } catch (error) {
            if (canClockIn && isNetworkError(error)) {
                enqueueOfflinePunch('clock-in', payload as unknown as Record<string, unknown>);
                toast.success('Clock-in saved offline — will sync when online');
                setClockInOpen(false);
            } else {
                handleApiError(error);
            }
        } finally {
            setClockingIn(false);
        }
    };

    const handleClockOut = async () => {
        setClockingOut(true);
        try {
            // Use cached GPS when available; otherwise soft-timeout so the button feels instant.
            const location =
                locationData ??
                (await Promise.race([
                    requestLocation({ softTimeoutMs: 2500 }),
                    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2800)),
                ]));
            const payload = location ? { location } : {};
            if (!navigator.onLine) {
                enqueueOfflinePunch('clock-out', payload);
                toast.success('Clock-out saved offline — will sync when online');
                return;
            }
            const response = await axios.post('/admin/attendance/clock-out', payload);
            handleApiResponse(response);
            void loadData();
        } catch (error) {
            if (canClockIn && isNetworkError(error)) {
                const location = locationData ?? (await requestLocation({ softTimeoutMs: 1500 }).catch(() => null));
                enqueueOfflinePunch('clock-out', location ? { location } : {});
                toast.success('Clock-out saved offline — will sync when online');
            } else {
                handleApiError(error);
            }
        } finally {
            setClockingOut(false);
        }
    };

    const breadcrumbs = [{ label: 'Attendance', href: '/admin/attendance' }];
    const userPhotoUrl = useStorageSrc(user?.photo);

    const todayShift = todayData?.shift;
    const formatShiftTime = (value?: string) => {
        if (!value) return '--:--';
        const part = value.slice(0, 5);
        const [h, m] = part.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return value;
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatElapsedTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate total duration across all sessions today (including active session)
    const calculateTotalDuration = () => {
        let totalSeconds = 0;

        // Add duration from all completed sessions
        allSessions.forEach((session: any) => {
            if (session.duration_minutes) {
                totalSeconds += session.duration_minutes * 60;
            }
        });

        // Add current active session elapsed time
        if (activeClockIn && !activeClockIn.clock_out) {
            totalSeconds += elapsedTime;
        }

        return totalSeconds;
    };

    const totalDurationSeconds = calculateTotalDuration();

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                
                <div className="flex items-center justify-center min-h-96">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            

            <div className="min-w-0 max-w-full space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 break-words text-2xl font-bold tracking-tight sm:text-3xl">
                            <Calendar className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" />
                            Attendance
                        </h1>
                        <p className="text-muted-foreground mt-1 break-words">
                            Track your daily clock-in and clock-out times
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                        {hasPermission('view-leave-requests') && (
                            <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => navigate('/admin/leave-requests')}>
                                Leave Requests
                            </Button>
                        )}
                        {canMarkManual && (
                            <Button variant="outline" className="min-h-11 w-full sm:w-auto" asChild>
                                <Link to="/admin/manual-attendance">
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Mark attendance
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Today's Attendance Card */}
                <Card>
                    <CardHeader>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <CardTitle className="break-words">Today's Attendance</CardTitle>
                                {todayData?.total_sessions > 0 && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {todayData.total_sessions} session{todayData.total_sessions > 1 ? 's' : ''} today
                                    </p>
                                )}
                            </div>
                            {activeClockIn && (
                                <Badge variant="default">Active Session</Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {todayShift && (
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                                    <Timer className="h-4 w-4 text-primary" />
                                    <span className="font-medium">
                                        Today&apos;s Shift: {todayShift.template_name || 'Default Shift'}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {formatShiftTime(todayShift.start_time)} – {formatShiftTime(todayShift.end_time)}
                                    </span>
                                    {(todayShift.grace_in_minutes > 0 || todayShift.grace_out_minutes > 0) && (
                                        <span className="text-xs text-muted-foreground">
                                            Grace: +{todayShift.grace_in_minutes}m in / -{todayShift.grace_out_minutes}m out
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Total Duration Counter (Green) */}
                            {totalDurationSeconds > 0 && (
                                <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-lg border-2 border-green-200 dark:border-green-800/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm text-muted-foreground font-medium">
                                            TOTAL TIME TODAY
                                        </p>
                                        {activeClockIn && !activeClockIn.clock_out && (
                                            <span className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                                                <span className="inline-block w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></span>
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 font-mono sm:text-5xl break-all">
                                        {formatElapsedTime(totalDurationSeconds)}
                                    </p>
                                    {todayData?.total_sessions > 1 && (
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Across {todayData.total_sessions} sessions
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Clock In/Out Status */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Clock In */}
                                <div className="p-4 border rounded-lg">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {activeClockIn ? 'Current Clock In' : 'Last Clock In'}
                                        </span>
                                        <LogIn className="h-4 w-4 text-green-600" />
                                    </div>
                                    <p className="text-2xl font-bold">
                                        {activeClockIn?.clock_in
                                            ? new Date(activeClockIn.clock_in).toLocaleTimeString('en-US', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true,
                                            })
                                            : latestSession?.clock_in
                                                ? new Date(latestSession.clock_in).toLocaleTimeString('en-US', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: true,
                                                })
                                                : '--:--'}
                                    </p>
                                    {activeClockIn?.is_late && (
                                        <p className="text-xs text-red-600 mt-2">
                                            ⚠ Late arrival
                                        </p>
                                    )}
                                    {activeClockIn && (
                                        <p className="text-xs text-green-600 mt-2">
                                            ● Active now
                                        </p>
                                    )}
                                </div>

                                {/* Clock Out */}
                                <div className="p-4 border rounded-lg">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {activeClockIn ? 'Current Clock Out' : 'Last Clock Out'}
                                        </span>
                                        <LogOut className="h-4 w-4 text-red-600" />
                                    </div>
                                    <p className="text-2xl font-bold">
                                        {activeClockIn?.clock_out
                                            ? new Date(activeClockIn.clock_out).toLocaleTimeString('en-US', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true,
                                            })
                                            : latestSession?.clock_out
                                                ? new Date(latestSession.clock_out).toLocaleTimeString('en-US', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: true,
                                                })
                                                : '--:--'}
                                    </p>
                                    {(activeClockIn?.is_early_exit || latestSession?.is_early_exit) && (
                                        <p className="text-xs text-orange-600 mt-2">
                                            ⚠ Early exit
                                        </p>
                                    )}
                                </div>

                                {/* Duration */}
                                <div className="p-4 border rounded-lg">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {activeClockIn && !activeClockIn.clock_out ? 'Current Session' : 'Last Session'}
                                        </span>
                                        <Clock className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                                        {activeClockIn && !activeClockIn.clock_out
                                            ? formatElapsedTime(elapsedTime)
                                            : latestSession?.duration_minutes
                                                ? `${Math.floor(latestSession.duration_minutes / 60)}h ${latestSession.duration_minutes % 60}m`
                                                : '--:--'}
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            {canClockIn && (
                            <div className="sticky z-10 -mx-1 flex gap-3 bg-background/95 py-2 backdrop-blur bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:static md:bottom-auto md:bg-transparent md:py-0 md:backdrop-blur-none">
                                <Button
                                    onClick={() => setClockInOpen(true)}
                                    disabled={clockingIn}
                                    className="min-h-11 flex-1"
                                    size="lg"
                                    variant={activeClockIn ? 'outline' : 'default'}
                                >
                                    <LogIn className="mr-2 h-4 w-4" />
                                    {clockingIn ? 'Clocking In...' : activeClockIn ? 'Start New Session' : 'Clock In'}
                                </Button>
                                <Button
                                    onClick={handleClockOut}
                                    disabled={
                                        !activeClockIn ||
                                        clockingOut
                                    }
                                    className="min-h-11 flex-1"
                                    size="lg"
                                    variant={!activeClockIn ? 'outline' : 'default'}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    {clockingOut ? 'Clocking Out...' : 'Clock Out'}
                                </Button>
                            </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="statistics" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
                        <TabsTrigger value="statistics">Statistics</TabsTrigger>
                        <TabsTrigger value="daily">Daily Register</TabsTrigger>
                        <TabsTrigger value="employee-log">Employee Log</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="statistics" className="space-y-4">
                        <AttendanceStats
                            stats={stats}
                            loading={statsLoading}
                            title="Attendance statistics"
                        />
                        {!canManage && (
                            <p className="text-sm text-muted-foreground">
                                You see only your own attendance. HR managers with{' '}
                                <code className="rounded bg-muted px-1">manage-attendance</code> see
                                organization totals.
                            </p>
                        )}
                    </TabsContent>

                    <TabsContent value="daily" className="space-y-4">
                        {canManage ? (
                            <DailyAttendanceRegister />
                        ) : (
                            <Card>
                                <CardContent className="py-8 text-center text-muted-foreground">
                                    Daily register is available to attendance managers.
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="employee-log" className="space-y-4">
                        <EmployeeAttendanceLog />
                    </TabsContent>

                    <TabsContent value="history" className="space-y-4">
                        <AttendanceTable />
                    </TabsContent>
                </Tabs>
            </div>

            <ClockInFaceDialog
                open={clockInOpen}
                onOpenChange={setClockInOpen}
                onVerify={handleClockIn}
                userPhotoUrl={userPhotoUrl}
                busy={clockingIn}
            />
        </AppLayout>
    );
}
