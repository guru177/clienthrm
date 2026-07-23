/** Local calendar date as YYYY-MM-DD (avoids UTC day shift from toISOString). */
export function localTodayISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Calendar date YYYY-MM-DD in an IANA timezone (falls back to local). */
export function todayISOInTimezone(timeZone?: string | null): string {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timeZone?.trim() || undefined,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date());
        const y = parts.find((p) => p.type === 'year')?.value;
        const m = parts.find((p) => p.type === 'month')?.value;
        const d = parts.find((p) => p.type === 'day')?.value;
        if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
        /* invalid zone → local */
    }
    return localTodayISO();
}

/**
 * Current wall-clock time as HH:mm (24h) in an IANA timezone.
 * Used for manual attendance stamps; falls back to the browser's local zone.
 */
export function nowTimeInTimezone(timeZone?: string | null): string {
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timeZone?.trim() || undefined,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(new Date());
        let hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
        const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
        // Some engines report midnight as "24"
        if (hour === '24') hour = '00';
        return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    } catch {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
}

/** Backend SQLite datetimes are UTC: "YYYY-MM-DD HH:MM:SS" (no timezone suffix). */
export function parseBackendUtc(value: string | null | undefined): Date | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        const d = new Date(trimmed);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const d = new Date(`${normalized}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Attendance punch timestamps (`YYYY-MM-DDTHH:MM:SS` from combine_datetime) are
 * org/server wall-clock times, NOT UTC. Parsing them as UTC shifts display by the
 * local offset (e.g. +5:30 in India → shows ~5.5h ahead).
 */
export function parseAttendanceWallDateTime(value: string | null | undefined): Date | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        const d = new Date(trimmed);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    // No Z → JS treats as local wall time
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Format attendance clock_in / clock_out for display without timezone conversion. */
export function formatAttendanceWallTime(value: string | null | undefined): string {
    if (!value) return '--:--';
    const trimmed = value.trim();
    if (!trimmed) return '--:--';

    const timePart = trimmed.includes('T')
        ? (trimmed.split('T')[1] ?? '')
        : trimmed.includes(' ')
          ? (trimmed.split(' ')[1] ?? '')
          : trimmed;
    const hm = timePart.slice(0, 5);
    const [h, m] = hm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return '--:--';

    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

export function formatRelativeTime(value: string | null | undefined): string {
    const d = parseBackendUtc(value);
    if (!d) return '—';

    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return 'Just now';

    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;

    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;

    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;

    return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function formatDateTimeLocal(value: string | null | undefined): string {
    const d = parseBackendUtc(value);
    if (!d) return '—';

    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}
