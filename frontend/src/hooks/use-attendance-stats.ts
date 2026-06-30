import { useCallback, useEffect, useState } from 'react';

import axios from '@/lib/axios';
import { handleApiError } from '@/lib/toast';

export type AttendanceSourceFilter = 'all' | 'app' | 'biometric' | 'manual';

export interface AttendanceStatsData {
    scope: 'org' | 'self';
    source?: string;
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    early_exit_days: number;
    total_hours: number;
    by_source?: {
        app: number;
        biometric: number;
        manual: number;
    };
}

export function useAttendanceStats(source: AttendanceSourceFilter = 'all') {
    const [stats, setStats] = useState<AttendanceStatsData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = source !== 'all' ? { source } : undefined;
            const res = await axios.get('/admin/attendance/stats', { params });
            setStats(res.data.data ?? null);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    }, [source]);

    useEffect(() => {
        void load();
    }, [load]);

    return { stats, loading, reload: load };
}
