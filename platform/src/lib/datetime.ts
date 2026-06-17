/** Convert browser datetime-local value to UTC storage: "YYYY-MM-DD HH:MM:SS" */
export function datetimeLocalToUtcSql(local: string): string | null {
    const trimmed = local.trim();
    if (!trimmed) return null;
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Convert UTC storage string to datetime-local input value */
export function utcSqlToDatetimeLocal(utc: string | null | undefined): string {
    if (!utc) return '';
    const trimmed = utc.trim();
    if (!trimmed) return '';
    const d = new Date(trimmed.includes('T') ? `${trimmed}Z` : `${trimmed.replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
