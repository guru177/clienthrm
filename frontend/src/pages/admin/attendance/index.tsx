import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axios';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { Clock, LogIn, LogOut, Calendar, Timer } from 'lucide-react';
import { useState, useEffect } from 'react';

import ClockInFaceDialog, {
    type ClockInVerificationPayload,
} from '@/components/attendance/clock-in-face-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useLocationTracking } from '@/hooks/use-location-tracking';
import {
    enqueueOfflinePunch,
    getOfflinePunchQueue,
    isNetworkError,
    markOfflinePunchFailed,
    removeOfflinePunch,
} from '@/lib/offline-punch-queue';
import { formatAttendanceWallTime, parseAttendanceWallDateTime } from '@/lib/datetime';
import toast from 'react-hot-toast';

function formatClockTime(value?: string | null) {
    return formatAttendanceWallTime(value);
}

/** Location / face clock-in for the logged-in user only. Records sync into Attendance. */
export default function AttendancePage() {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    const navigate = useNavigate();
    const canClockIn = hasPermission('clock-inout') || hasPermission('manage-attendance');
    const canViewMyAttendance =
        hasPermission('view-my-attendance') ||
        hasPermission('view-attendance') ||
        hasPermission('manage-attendance');
    const [todayData, setTodayData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [clockingIn, setClockingIn] = useState(false);
    const [clockingOut, setClockingOut] = useState(false);
    const [clockInOpen, setClockInOpen] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);

    const activeClockIn = todayData?.active_clock_in;
    const latestSession = todayData?.attendances?.[0];
    const allSessions = todayData?.attendances || [];

    useEffect(() => {
        void loadData();
    }, []);

    useEffect(() => {
        if (!activeClockIn?.clock_in || activeClockIn?.clock_out) return;

        const interval = setInterval(() => {
            const clockInTime = (
                parseAttendanceWallDateTime(activeClockIn.clock_in) ?? new Date(activeClockIn.clock_in)
            ).getTime();
            const now = new Date().getTime();
            setElapsedTime(Math.floor((now - clockInTime) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [activeClockIn?.clock_in, activeClockIn?.clock_out]);

    const { requestLocation, locationData } = useLocationTracking();

    const loadData = async () => {
        setLoading(true);
        try {
            const todayRes = await axios.get('/admin/attendance/today');
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
        let failed = 0;
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
                markOfflinePunchFailed(item.id, 'sync failed');
                failed += 1;
            }
        }
        if (synced > 0) {
            toast.success(`Synced ${synced} offline punch${synced > 1 ? 'es' : ''}`);
            void loadData();
        }
        if (failed > 0) {
            toast.error(`${failed} offline punch${failed > 1 ? 'es' : ''} failed`);
        }
    };

    useEffect(() => {
        void flushOfflinePunches();
        const onOnline = () => void flushOfflinePunches();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canClockIn]);

    const handleClockIn = async (verification: ClockInVerificationPayload) => {
        setClockingIn(true);
        try {
            const response = await axios.post('/admin/attendance/clock-in', {
                location: verification.location,
                face_verified: verification.face_verified,
                face_match_score: verification.face_match_score,
                face_skip_reason: verification.face_skip_reason,
            });
            handleApiResponse(response);
            setClockInOpen(false);
            void loadData();
        } catch (error) {
            if (canClockIn && isNetworkError(error)) {
                enqueueOfflinePunch('clock-in', {
                    location: verification.location,
                    face_verified: verification.face_verified,
                    face_match_score: verification.face_match_score,
                    face_skip_reason: verification.face_skip_reason,
                });
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
            const location =
                locationData ?? (await requestLocation({ softTimeoutMs: 1500 }).catch(() => null));
            const payload = location ? { location } : {};
            const response = await axios.post('/admin/attendance/clock-out', payload);
            handleApiResponse(response);
            void loadData();
        } catch (error) {
            if (canClockIn && isNetworkError(error)) {
                const location =
                    locationData ??
                    (await requestLocation({ softTimeoutMs: 1500 }).catch(() => null));
                enqueueOfflinePunch('clock-out', location ? { location } : {});
                toast.success('Clock-out saved offline — will sync when online');
            } else {
                handleApiError(error);
            }
        } finally {
            setClockingOut(false);
        }
    };

    const breadcrumbs = [{ label: 'Location based attendance', href: '/admin/attendance' }];
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

    const calculateTotalDuration = () => {
        let totalSeconds = 0;
        allSessions.forEach((session: any) => {
            if (session.duration_minutes) {
                totalSeconds += session.duration_minutes * 60;
            }
        });
        if (activeClockIn && !activeClockIn.clock_out) {
            totalSeconds += elapsedTime;
        }
        return totalSeconds;
    };

    const totalDurationSeconds = calculateTotalDuration();

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex min-h-96 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="w-full min-w-0 space-y-4 sm:space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">
                            <Calendar className="h-6 w-6 shrink-0 text-primary sm:h-7 sm:w-7" />
                            Location based attendance
                        </h1>
                        <p className="mt-1 break-words text-sm text-muted-foreground">
                            Clock in and out — records sync to Attendance
                        </p>
                    </div>
                    {canViewMyAttendance && (
                        <Button
                            variant="outline"
                            className="min-h-11 w-full shrink-0 sm:w-auto"
                            onClick={() => navigate('/admin/my-attendance')}
                        >
                            My Attendance
                        </Button>
                    )}
                </div>

                <Card className="w-full">
                    <CardHeader>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <CardTitle className="break-words">Today</CardTitle>
                                {todayData?.total_sessions > 0 && (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {todayData.total_sessions} session
                                        {todayData.total_sessions > 1 ? 's' : ''} today
                                    </p>
                                )}
                            </div>
                            {activeClockIn && <Badge variant="default">Active Session</Badge>}
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
                                        {formatShiftTime(todayShift.start_time)} –{' '}
                                        {formatShiftTime(todayShift.end_time)}
                                    </span>
                                </div>
                            )}

                            {totalDurationSeconds > 0 && (
                                <div className="rounded-lg border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-6 dark:border-green-800/50 dark:from-green-950/50 dark:to-emerald-950/50">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-sm font-medium text-muted-foreground">
                                            TOTAL TIME TODAY
                                        </p>
                                        {activeClockIn && !activeClockIn.clock_out && (
                                            <span className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                                                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-600 dark:bg-green-400" />
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="break-all font-mono text-3xl font-bold text-green-600 dark:text-green-400 sm:text-5xl">
                                        {formatElapsedTime(totalDurationSeconds)}
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="rounded-lg border p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {activeClockIn ? 'Current Clock In' : 'Last Clock In'}
                                        </span>
                                        <LogIn className="h-4 w-4 text-green-600" />
                                    </div>
                                    <p className="text-2xl font-bold">
                                        {formatClockTime(
                                            activeClockIn?.clock_in || latestSession?.clock_in,
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-lg border p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {activeClockIn ? 'Current Clock Out' : 'Last Clock Out'}
                                        </span>
                                        <LogOut className="h-4 w-4 text-red-600" />
                                    </div>
                                    <p className="text-2xl font-bold">
                                        {formatClockTime(
                                            activeClockIn?.clock_out || latestSession?.clock_out,
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-lg border p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {activeClockIn && !activeClockIn.clock_out
                                                ? 'Current Session'
                                                : 'Last Session'}
                                        </span>
                                        <Clock className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <p className="font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
                                        {activeClockIn && !activeClockIn.clock_out
                                            ? formatElapsedTime(elapsedTime)
                                            : latestSession?.duration_minutes
                                              ? `${Math.floor(latestSession.duration_minutes / 60)}h ${latestSession.duration_minutes % 60}m`
                                              : '--:--'}
                                    </p>
                                </div>
                            </div>

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
                                        {clockingIn
                                            ? 'Clocking In...'
                                            : activeClockIn
                                              ? 'Start New Session'
                                              : 'Clock In'}
                                    </Button>
                                    <Button
                                        onClick={() => void handleClockOut()}
                                        disabled={!activeClockIn || clockingOut}
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
