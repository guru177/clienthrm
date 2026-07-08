/** Styled Excel export for salary split report (dynamic salary_components columns). */

export type ColKind = 'neutral' | 'earn' | 'yellow' | 'deduct';

export interface EarningColumn {
    id: number;
    name: string;
    slug?: string;
    kind: ColKind;
}

export interface DeductionColumn {
    id: number;
    name: string;
    slug?: string;
    is_pre_tax?: boolean;
    kind: 'deduct';
}

/** Match backend bucket colours: Basic/HRA green, other earnings yellow. */
export function earningColumnKind(slug = '', name = ''): ColKind {
    const s = slug.toLowerCase();
    const n = name.toLowerCase();
    if (s.includes('basic') || n.includes('basic')) return 'earn';
    if (s.includes('hra') || n.includes('house rent') || n.includes('hra')) return 'earn';
    return 'yellow';
}

export interface SalarySplitRow {
    user_id: number;
    name: string;
    employee_id?: string | null;
    date_of_birth?: string | null;
    date_of_joining?: string | null;
    yearly_ctc?: number | null;
    monthly_ctc?: number | null;
    gross_salary?: number | null;
    earnings?: Record<string, number>;
    deductions?: Record<string, number>;
    total_deductions?: number | null;
    net_salary?: number | null;
}

export interface SalarySplitTotals {
    yearly_ctc?: number;
    monthly_ctc?: number;
    gross_salary?: number;
    earnings?: Record<string, number>;
    deductions?: Record<string, number>;
    total_deductions?: number;
    net_salary?: number;
}

export interface SalarySplitExportData {
    month: number;
    year: number;
    earning_columns: EarningColumn[];
    deduction_columns: DeductionColumn[];
    rows: SalarySplitRow[];
    totals: SalarySplitTotals;
}

type CellValue = string | number | { v: string | number; t?: string; s?: Record<string, unknown> };

const EARN_GREEN = 'C6EFCE';
const EARN_GREEN_FG = '1B5E20';
const YELLOW_HDR = 'FFEB9C';
const YELLOW_FG = '7F6000';
const DEDUCT_HDR = 'FECACA';
const DEDUCT_HDR_FG = '991B1B';
const DEDUCT_DATA = 'FEE2E2';
const NEUTRAL_HDR = 'F8FAFC';
const NEUTRAL_HDR_FG = '0F172A';
const TITLE_BG = '0F172A';
const TITLE_FG = 'FFFFFF';
const TOTAL_BG = 'D9E1F2';
const ROW_ALT = 'F8FAFC';

const THIN_BORDER = {
    top: { style: 'thin', color: { rgb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
    left: { style: 'thin', color: { rgb: 'D1D5DB' } },
    right: { style: 'thin', color: { rgb: 'D1D5DB' } },
};

const NUM_FMT = '#,##0';

interface DynCol {
    id: string;
    label: string;
    kind: ColKind;
    section: 'fixed' | 'earning' | 'deduction' | 'summary';
    isNumber?: boolean;
}

function buildColumns(earningColumns: EarningColumn[], deductionColumns: DeductionColumn[]): DynCol[] {
    const fixed: DynCol[] = [
        { id: 'name', label: 'Emp-Name', kind: 'neutral', section: 'fixed' },
        { id: 'date_of_birth', label: 'DOB', kind: 'neutral', section: 'fixed' },
        { id: 'date_of_joining', label: 'DOJ', kind: 'neutral', section: 'fixed' },
        { id: 'yearly_ctc', label: 'Yrly CTC', kind: 'earn', section: 'fixed', isNumber: true },
        { id: 'monthly_ctc', label: 'CTC Monthly', kind: 'neutral', section: 'fixed', isNumber: true },
    ];
    const earnings: DynCol[] = earningColumns.map((c) => ({
        id: `earn_${c.id}`,
        label: c.name,
        kind: c.kind,
        section: 'earning' as const,
        isNumber: true,
    }));
    const tail: DynCol[] = [
        { id: 'gross_salary', label: 'Gross-Pay', kind: 'earn', section: 'fixed', isNumber: true },
    ];
    const deductCols: DynCol[] = deductionColumns.map((c) => ({
        id: `deduct_${c.id}`,
        label: c.name,
        kind: 'deduct',
        section: 'deduction' as const,
        isNumber: true,
    }));
    const summary: DynCol[] = [
        { id: 'total_deductions', label: 'Total Deductions', kind: 'deduct', section: 'summary', isNumber: true },
        { id: 'net_salary', label: 'Net Take-home', kind: 'earn', section: 'summary', isNumber: true },
    ];
    return [...fixed, ...earnings, ...tail, ...deductCols, ...summary];
}

function headerStyle(kind: ColKind): Record<string, unknown> {
    if (kind === 'earn') {
        return {
            font: { bold: true, color: { rgb: EARN_GREEN_FG }, sz: 10, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: EARN_GREEN } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: THIN_BORDER,
        };
    }
    if (kind === 'yellow') {
        return {
            font: { bold: true, color: { rgb: YELLOW_FG }, sz: 10, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: YELLOW_HDR } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: THIN_BORDER,
        };
    }
    if (kind === 'deduct') {
        return {
            font: { bold: true, color: { rgb: DEDUCT_HDR_FG }, sz: 10, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: DEDUCT_HDR } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: THIN_BORDER,
        };
    }
    return {
        font: { bold: true, color: { rgb: NEUTRAL_HDR_FG }, sz: 10, name: 'Calibri' },
        fill: { patternType: 'solid', fgColor: { rgb: NEUTRAL_HDR } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER,
    };
}

function dataStyle(kind: ColKind, alt: boolean, isNumber: boolean): Record<string, unknown> {
    const base: Record<string, unknown> = {
        font: { sz: 10, name: 'Calibri', color: { rgb: '0F172A' } },
        alignment: { horizontal: isNumber ? 'right' : 'left', vertical: 'center' },
        border: THIN_BORDER,
    };
    if (kind === 'earn') {
        base.fill = { patternType: 'solid', fgColor: { rgb: alt ? 'E8F5E9' : EARN_GREEN } };
    } else if (kind === 'yellow') {
        base.fill = { patternType: 'solid', fgColor: { rgb: alt ? 'FFF8E1' : YELLOW_HDR } };
    } else if (kind === 'deduct') {
        base.font = { sz: 10, name: 'Calibri', color: { rgb: DEDUCT_HDR_FG } };
        base.fill = { patternType: 'solid', fgColor: { rgb: alt ? 'FFF1F2' : DEDUCT_DATA } };
    } else if (alt) {
        base.fill = { patternType: 'solid', fgColor: { rgb: ROW_ALT } };
    }
    if (isNumber) {
        base.numFmt = NUM_FMT;
    }
    return base;
}

function cell(value: string | number, style: Record<string, unknown>): CellValue {
    return {
        v: value,
        t: typeof value === 'number' ? 'n' : 's',
        s: style,
    };
}

function fmtDate(s?: string | null): string {
    if (!s) return '';
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function num(v?: number | null): number {
    return v != null && Number.isFinite(v) ? v : 0;
}

function resolveCell(
    row: SalarySplitRow,
    col: DynCol,
): string | number {
    if (col.id === 'name') return row.name ?? '';
    if (col.id === 'date_of_birth') return fmtDate(row.date_of_birth);
    if (col.id === 'date_of_joining') return fmtDate(row.date_of_joining);
    if (col.id === 'yearly_ctc') return num(row.yearly_ctc);
    if (col.id === 'monthly_ctc') return num(row.monthly_ctc);
    if (col.id === 'gross_salary') return num(row.gross_salary);
    if (col.id.startsWith('earn_')) {
        const compId = col.id.slice(5);
        return num(row.earnings?.[compId]);
    }
    if (col.id.startsWith('deduct_')) {
        const compId = col.id.slice(7);
        return num(row.deductions?.[compId]);
    }
    if (col.id === 'total_deductions') return num(row.total_deductions);
    if (col.id === 'net_salary') return num(row.net_salary);
    return '';
}

function resolveTotal(totals: SalarySplitTotals, col: DynCol): number {
    if (col.id === 'yearly_ctc') return num(totals.yearly_ctc);
    if (col.id === 'monthly_ctc') return num(totals.monthly_ctc);
    if (col.id === 'gross_salary') return num(totals.gross_salary);
    if (col.id.startsWith('earn_')) {
        return num(totals.earnings?.[col.id.slice(5)]);
    }
    if (col.id.startsWith('deduct_')) {
        return num(totals.deductions?.[col.id.slice(7)]);
    }
    if (col.id === 'total_deductions') return num(totals.total_deductions);
    if (col.id === 'net_salary') return num(totals.net_salary);
    return 0;
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export async function exportSalarySplitExcel(
    data: SalarySplitExportData,
    orgTitle: string,
): Promise<void> {
    const XLSX = await import('xlsx-js-style');
    const columns = buildColumns(data.earning_columns, data.deduction_columns);
    const period = `${MONTH_NAMES[data.month] ?? data.month} ${data.year}`;
    const colCount = columns.length;

    const titleRow: CellValue[] = [
        {
            v: `Salary Split — ${orgTitle}`,
            t: 's',
            s: {
                font: { bold: true, sz: 16, color: { rgb: TITLE_FG }, name: 'Calibri' },
                fill: { patternType: 'solid', fgColor: { rgb: TITLE_BG } },
                alignment: { horizontal: 'left', vertical: 'center' },
            },
        },
    ];
    while (titleRow.length < colCount) titleRow.push('');

    const periodRow: CellValue[] = [
        {
            v: `Period: ${period}  ·  ${data.rows.length} employee(s)  ·  ${data.earning_columns.length} earning · ${data.deduction_columns.length} deduction component(s)`,
            t: 's',
            s: {
                font: { sz: 11, color: { rgb: '64748B' }, name: 'Calibri' },
                fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
                alignment: { horizontal: 'left', vertical: 'center' },
            },
        },
    ];
    while (periodRow.length < colCount) periodRow.push('');

    const headerRow: CellValue[] = columns.map((c) => ({
        v: c.label,
        t: 's',
        s: headerStyle(c.kind),
    }));

    const bodyRows: CellValue[][] = data.rows.map((row, idx) => {
        const alt = idx % 2 === 1;
        return columns.map((col) => {
            const val = resolveCell(row, col);
            if (col.isNumber) {
                return cell(val as number, dataStyle(col.kind, alt, true));
            }
            return cell(val as string, dataStyle(col.kind, alt, false));
        });
    });

    const totalRow: CellValue[] = columns.map((col, i) => {
        if (i === 0) {
            return cell('Total', {
                font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '0F172A' } },
                fill: { patternType: 'solid', fgColor: { rgb: TOTAL_BG } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: THIN_BORDER,
            });
        }
        if (col.isNumber) {
            const val = resolveTotal(data.totals, col);
            return cell(val, {
                font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '0F172A' } },
                fill: { patternType: 'solid', fgColor: { rgb: TOTAL_BG } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: THIN_BORDER,
                numFmt: NUM_FMT,
            });
        }
        return cell('', {
            fill: { patternType: 'solid', fgColor: { rgb: TOTAL_BG } },
            border: THIN_BORDER,
        });
    });

    const sheetData: CellValue[][] = [titleRow, periodRow, [], headerRow, ...bodyRows, [], totalRow];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = columns.map((c) => ({
        wch: c.id === 'name' ? 18 : 12,
    }));

    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    ];

    ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 8 }, { hpt: 36 }];

    const headerRowIdx = 3;
    ws['!views'] = [
        {
            state: 'frozen',
            xSplit: 1,
            ySplit: headerRowIdx + 1,
            topLeftCell: XLSX.utils.encode_cell({ r: headerRowIdx + 1, c: 1 }),
            activeCell: XLSX.utils.encode_cell({ r: headerRowIdx + 1, c: 1 }),
        },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Split');
    const mm = String(data.month).padStart(2, '0');
    XLSX.writeFile(wb, `salary-split_${data.year}-${mm}.xlsx`);
}

/** Build table column definitions shared by UI and export. */
export function buildSalarySplitTableColumns(
    earningColumns: EarningColumn[],
    deductionColumns: DeductionColumn[] = [],
) {
    const fixed = [
        { id: 'name', label: 'Emp-Name', kind: 'neutral' as ColKind, sticky: true, num: false },
        { id: 'date_of_birth', label: 'DOB', kind: 'neutral' as ColKind, sticky: false, num: false },
        { id: 'date_of_joining', label: 'DOJ', kind: 'neutral' as ColKind, sticky: false, num: false },
        { id: 'yearly_ctc', label: 'Yrly CTC', kind: 'earn' as ColKind, sticky: false, num: true },
        { id: 'monthly_ctc', label: 'CTC Monthly', kind: 'neutral' as ColKind, sticky: false, num: true },
    ];
    const earnings = earningColumns.map((c) => ({
        id: `earn_${c.id}`,
        label: c.name,
        kind: c.kind,
        sticky: false,
        num: true,
    }));
    const tail = [
        { id: 'gross_salary', label: 'Gross-Pay', kind: 'earn' as ColKind, sticky: false, num: true },
    ];
    const deduct = deductionColumns.map((c) => ({
        id: `deduct_${c.id}`,
        label: c.name,
        kind: 'deduct' as ColKind,
        sticky: false,
        num: true,
    }));
    const summary = [
        { id: 'total_deductions', label: 'Total Deductions', kind: 'deduct' as ColKind, sticky: false, num: true },
        { id: 'net_salary', label: 'Net Take-home', kind: 'earn' as ColKind, sticky: false, num: true },
    ];
    return [...fixed, ...earnings, ...tail, ...deduct, ...summary];
}
