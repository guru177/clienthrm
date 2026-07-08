import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/use-permissions';
import { handleApiError } from '@/lib/toast';
import {
    buildSalarySplitTableColumns,
    exportSalarySplitExcel,
    type DeductionColumn,
    type EarningColumn,
    type SalarySplitExportData,
    type SalarySplitRow,
    type SalarySplitTotals,
} from '@/lib/salary-split-excel';
import { cn } from '@/lib/utils';

const HDR: Record<string, string> = {
    neutral: 'bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100',
    earn: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
    yellow: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    deduct: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
};

const CELL: Record<string, string> = {
    neutral: '',
    earn: 'bg-emerald-50/80 dark:bg-emerald-950/30',
    yellow: 'bg-amber-50/80 dark:bg-amber-950/30',
    deduct: 'bg-rose-50/90 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200',
};

function fmt(n?: number | null): string {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtDate(s?: string | null): string {
    if (!s) return '—';
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function cellValue(row: SalarySplitRow, colId: string, isNum: boolean): string {
    if (colId === 'name') return row.name ?? '—';
    if (colId === 'date_of_birth') return fmtDate(row.date_of_birth);
    if (colId === 'date_of_joining') return fmtDate(row.date_of_joining);
    if (colId === 'yearly_ctc') return fmt(row.yearly_ctc);
    if (colId === 'monthly_ctc') return fmt(row.monthly_ctc);
    if (colId === 'gross_salary') return fmt(row.gross_salary);
    if (colId.startsWith('earn_')) {
        const compId = colId.slice(5);
        const v = row.earnings?.[compId];
        return v != null && v !== 0 ? fmt(v) : '—';
    }
    if (colId.startsWith('deduct_')) {
        const compId = colId.slice(7);
        const v = row.deductions?.[compId];
        return v != null && v !== 0 ? fmt(v) : '—';
    }
    if (colId === 'total_deductions') return fmt(row.total_deductions);
    if (colId === 'net_salary') return fmt(row.net_salary);
    if (isNum) return fmt(null);
    return '—';
}

function totalValue(totals: SalarySplitTotals, colId: string, isNum: boolean): string {
    if (!isNum) return '';
    if (colId === 'yearly_ctc') return fmt(totals.yearly_ctc);
    if (colId === 'monthly_ctc') return fmt(totals.monthly_ctc);
    if (colId === 'gross_salary') return fmt(totals.gross_salary);
    if (colId.startsWith('earn_')) {
        return fmt(totals.earnings?.[colId.slice(5)]);
    }
    if (colId.startsWith('deduct_')) {
        return fmt(totals.deductions?.[colId.slice(7)]);
    }
    if (colId === 'total_deductions') return fmt(totals.total_deductions);
    if (colId === 'net_salary') return fmt(totals.net_salary);
    return '';
}

interface SalarySplitReportProps {
    month: number;
    year: number;
    earningColumns: EarningColumn[];
    deductionColumns: DeductionColumn[];
    rows: SalarySplitRow[];
    totals: SalarySplitTotals;
    loading?: boolean;
    onReload?: () => void;
}

export default function SalarySplitReport({
    month,
    year,
    earningColumns,
    deductionColumns,
    rows,
    totals,
    loading = false,
    onReload,
}: SalarySplitReportProps) {
    const { settings } = useAuth();
    const { hasPermission } = usePermissions();
    const canExport = hasPermission('export-reports') || hasPermission('view-reports');
    const [exporting, setExporting] = useState(false);

    const columns = useMemo(
        () => buildSalarySplitTableColumns(earningColumns, deductionColumns),
        [earningColumns, deductionColumns],
    );

    const orgTitle =
        settings.company_name ||
        settings.organization_name ||
        settings.org_name ||
        'Organization';

    const handleExport = async () => {
        setExporting(true);
        try {
            const payload: SalarySplitExportData = {
                month,
                year,
                earning_columns: earningColumns,
                deduction_columns: deductionColumns,
                rows,
                totals,
            };
            await exportSalarySplitExcel(payload, orgTitle);
        } catch (error) {
            handleApiError(error);
        } finally {
            setExporting(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        Salary Split
                    </CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Monthly salary structure per employee — CTC, earnings split, and deductions (for records &amp; compliance)
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {onReload && (
                        <Button variant="outline" onClick={onReload} disabled={loading}>
                            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                            {loading ? 'Loading…' : 'Refresh'}
                        </Button>
                    )}
                    {canExport && (
                        <Button onClick={() => void handleExport()} disabled={!rows.length || exporting}>
                            <Download className="mr-2 h-4 w-4" />
                            {exporting ? 'Exporting…' : 'Export Excel'}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-max border-collapse text-xs">
                        <thead>
                            <tr>
                                {columns.map((col) => (
                                    <th
                                        key={col.id}
                                        className={cn(
                                            'border-b px-2 py-2 font-semibold whitespace-nowrap',
                                            HDR[col.kind],
                                            col.sticky &&
                                                'sticky left-0 z-20 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]',
                                        )}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length} className="text-muted-foreground px-4 py-8 text-center">
                                        Loading…
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="text-muted-foreground px-4 py-8 text-center">
                                        No salary data for this month.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row, idx) => (
                                    <tr key={row.user_id} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                                        {columns.map((col) => (
                                            <td
                                                key={col.id}
                                                className={cn(
                                                    'border-b px-2 py-1.5',
                                                    CELL[col.kind],
                                                    col.num && 'text-right tabular-nums',
                                                    col.sticky &&
                                                        'sticky left-0 z-10 border-r bg-background font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]',
                                                )}
                                            >
                                                {cellValue(row, col.id, col.num)}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {rows.length > 0 && !loading && (
                            <tfoot>
                                <tr className="bg-slate-200/80 font-bold dark:bg-slate-800">
                                    {columns.map((col, i) => (
                                        <td
                                            key={col.id}
                                            className={cn(
                                                'border-t px-2 py-2',
                                                col.num && 'text-right tabular-nums',
                                                col.sticky && 'sticky left-0 z-10 border-r bg-slate-200/80 dark:bg-slate-800',
                                            )}
                                        >
                                            {i === 0 ? 'Total' : totalValue(totals, col.id, col.num)}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                {rows.length > 0 && (
                    <p className="text-muted-foreground mt-2 text-xs">
                        {rows.length} employee(s) · {earningColumns.length} earning · {deductionColumns.length} deduction component(s) · {month}/{year}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
