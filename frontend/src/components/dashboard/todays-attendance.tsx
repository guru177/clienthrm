import axios from '@/lib/axios';
import { LogIn, LogOut, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { handleApiError } from '@/lib/toast';
import { useNavigate } from 'react-router-dom';

export default function TodaysAttendance() {
    const navigate = useNavigate();
    const [todayData, setTodayData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Get active clock-in session
    const activeSession = todayData?.active_clock_in;
    const allSessions = todayData?.attendances || [];

    useEffect(() => {
        loadToday();
    }, []);

    // Timer effect for active session
    useEffect(() => {
        if (!activeSession?.clock_in || activeSession?.clock_out) return;

        const interval = setInterval(() => {
            const clockInTime = new Date(activeSession.clock_in).getTime();
            const now = new Date().getTime();
            const elapsed = Math.floor((now - clockInTime) / 1000); // in seconds
            setElapsedTime(elapsed);
        }, 1000);

        return () => clearInterval(interval);
    }, [activeSession?.clock_in, activeSession?.clock_out]);

    const loadToday = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/admin/attendance/today');
            setTodayData(response.data.data);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Today's Attendance</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center h-32">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    const formatTime = (time: string | null) => {
        if (!time) return '--:--';
        try {
            return new Date(time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
        } catch {
            return '--:--';
        }
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
        if (activeSession && !activeSession.clock_out) {
            totalSeconds += elapsedTime;
        }

        return totalSeconds;
    };

    const totalDurationSeconds = calculateTotalDuration();

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Today's Attendance</CardTitle>
                    {todayData?.total_sessions > 0 && (
                        <Badge variant="default">
                            {todayData.total_sessions} Session{todayData.total_sessions > 1 ? 's' : ''}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Total Duration Counter (Green) */}
                {totalDurationSeconds > 0 && (
                    <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-lg border-2 border-green-200 dark:border-green-800/50">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">
                            TOTAL TIME TODAY
                        </p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 font-mono">
                            {formatElapsedTime(totalDurationSeconds)}
                        </p>
                        {activeSession && !activeSession.clock_out && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                                <span className="inline-block w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></span>
                                Active session running
                            </p>
                        )}
                    </div>
                )}

                {/* Times Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">
                                {activeSession ? 'Current In' : 'Last In'}
                            </span>
                            <LogIn className="h-3 w-3 text-green-600" />
                        </div>
                        <p className="text-lg font-semibold">
                            {formatTime(activeSession?.clock_in || allSessions[0]?.clock_in)}
                        </p>
                        {activeSession?.is_late && (
                            <p className="text-xs text-red-600 mt-1">Late</p>
                        )}
                    </div>

                    <div className="p-3 bg-muted rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">
                                {activeSession ? 'Current Out' : 'Last Out'}
                            </span>
                            <LogOut className="h-3 w-3 text-red-600" />
                        </div>
                        <p className="text-lg font-semibold">
                            {formatTime(activeSession?.clock_out || allSessions[0]?.clock_out)}
                        </p>
                        {(activeSession?.is_early_exit || allSessions[0]?.is_early_exit) && (
                            <p className="text-xs text-orange-600 mt-1">
                                Early
                            </p>
                        )}
                    </div>
                </div>

                {/* Current Session Duration (if active) */}
                {activeSession && !activeSession.clock_out && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800/50">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                                Current Session
                            </span>
                            <Clock className="h-3 w-3 text-blue-600" />
                        </div>
                        <p className="text-lg font-semibold mt-1 text-blue-600 dark:text-blue-400 font-mono">
                            {formatElapsedTime(elapsedTime)}
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                    <Button
                        onClick={() => navigate('/admin/attendance')}
                        size="sm"
                        className="flex-1"
                        variant={activeSession ? 'outline' : 'default'}
                    >
                        <LogIn className="h-3 w-3 mr-1" />
                        {activeSession ? 'New Session' : 'Clock In'}
                    </Button>
                    <Button
                        onClick={() => navigate('/admin/attendance')}
                        disabled={!activeSession}
                        size="sm"
                        className="flex-1"
                        variant={!activeSession ? 'outline' : 'default'}
                    >
                        <LogOut className="h-3 w-3 mr-1" />
                        Clock Out
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
