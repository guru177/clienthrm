/* Tiny inline-SVG sparkline + bar chart components — no external chart dep. */

interface SparklinePoint {
    label?: string;
    value: number;
}

export function Sparkline({
    data,
    height = 60,
    width = 320,
    stroke = '#1d4ed8',
    fill = 'rgba(29,78,216,0.12)',
}: {
    data: SparklinePoint[];
    height?: number;
    width?: number;
    stroke?: string;
    fill?: string;
}) {
    if (data.length === 0) {
        return (
            <div
                className="flex items-center justify-center text-xs text-muted-foreground"
                style={{ height, width: '100%' }}
            >
                no data
            </div>
        );
    }
    const padding = { top: 6, right: 6, bottom: 14, left: 6 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const max = Math.max(...data.map((d) => d.value), 1);
    const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;
    const points = data
        .map((d, i) => {
            const x = padding.left + i * stepX;
            const y = padding.top + innerH - (d.value / max) * innerH;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    const areaPoints = `${padding.left},${padding.top + innerH} ${points} ${
        padding.left + (data.length - 1) * stepX
    },${padding.top + innerH}`;
    const last = data[data.length - 1];
    const lastX = padding.left + (data.length - 1) * stepX;
    const lastY = padding.top + innerH - (last.value / max) * innerH;
    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
            <polyline points={areaPoints} fill={fill} stroke="none" />
            <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
            <circle cx={lastX} cy={lastY} r="3" fill={stroke} />
        </svg>
    );
}

interface BarRow {
    label: string;
    value: number;
    secondary?: number;
}

export function HBarChart({
    data,
    accent = '#1d4ed8',
    secondaryAccent = '#22c55e',
}: {
    data: BarRow[];
    accent?: string;
    secondaryAccent?: string;
}) {
    if (data.length === 0) {
        return <p className="text-xs text-muted-foreground">No rows.</p>;
    }
    const max = Math.max(...data.map((d) => Math.max(d.value, d.secondary ?? 0)), 1);
    return (
        <div className="space-y-2.5">
            {data.map((row, i) => {
                const pct = (row.value / max) * 100;
                const sPct = row.secondary != null ? (row.secondary / max) * 100 : null;
                return (
                    <div key={`${row.label}-${i}`}>
                        <div className="flex items-baseline justify-between text-xs">
                            <span className="font-medium text-[#001f3f]">{row.label}</span>
                            <span className="tabular-nums text-muted-foreground">
                                {row.value}
                                {row.secondary != null ? ` / ${row.secondary}` : ''}
                            </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary/60">
                            <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: accent }}
                            />
                            {sPct != null && (
                                <div
                                    className="-mt-2 h-2 rounded-full opacity-50 transition-all"
                                    style={{ width: `${sPct}%`, background: secondaryAccent }}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
