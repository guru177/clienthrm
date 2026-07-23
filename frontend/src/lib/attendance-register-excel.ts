/** Styled Excel export for the attendance register (matches on-screen colour codes). */

export interface RegisterExcelEmployee {
    user_id: number;
    name: string;
    employee_id?: string | null;
    department_name?: string | null;
    days: Record<string, string>;
    present_days: number;
}

export interface RegisterExcelDailyTotals {
    present: number;
    absent: number;
    leave: number;
    off: number;
    holiday: number;
    open: number;
}

export interface RegisterExcelData {
    start_date: string;
    end_date: string;
    dates: string[];
    legend: Record<string, string>;
    employees: RegisterExcelEmployee[];
    daily_totals: Record<string, RegisterExcelDailyTotals>;
    total_employees: number;
}

type CellValue = string | number | { v: string | number; t?: string; s?: Record<string, unknown> };

const CODE_COLORS: Record<string, { bg: string; fg: string }> = {
    P: { bg: 'D1FAE5', fg: '065F46' },
    A: { bg: 'FEE2E2', fg: '991B1B' },
    HD: { bg: 'FEF3C7', fg: '92400E' },
    L: { bg: 'DBEAFE', fg: '1E40AF' },
    O: { bg: 'F3F4F6', fg: '6B7280' },
    H: { bg: 'EDE9FE', fg: '5B21B6' },
    EW: { bg: 'CFFAFE', fg: '155E75' },
    '•': { bg: 'FFEDD5', fg: '9A3412' },
};

const HEADER_BG = '1E293B';
const HEADER_FG = 'F8FAFC';
const HEADER_WEEKEND_BG = '334155';
const TITLE_BG = '0F172A';
const TITLE_FG = 'FFFFFF';
const SUBTITLE_FG = '64748B';
const FOOTER_BG = 'E2E8F0';
const FOOTER_FG = '0F172A';
const ROW_ALT_BG = 'F8FAFC';
const LEGEND_LABEL_FG = '475569';

const THIN_BORDER = {
    top: { style: 'thin', color: { rgb: 'E2E8F0' } },
    bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
    left: { style: 'thin', color: { rgb: 'E2E8F0' } },
    right: { style: 'thin', color: { rgb: 'E2E8F0' } },
};

function dayHeader(dateStr: string): { dayNum: number; weekday: string; isWeekend: boolean } {
    const d = new Date(`${dateStr}T12:00:00`);
    const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' });
    return {
        dayNum: d.getDate(),
        weekday,
        isWeekend: weekday === 'Sat' || weekday === 'Sun',
    };
}

function textCell(
    value: string | number,
    style: Record<string, unknown> = {},
): CellValue {
    return {
        v: value,
        t: typeof value === 'number' ? 'n' : 's',
        s: { border: THIN_BORDER, ...style },
    };
}

function codeCell(code: string): CellValue {
    const colors = CODE_COLORS[code];
    if (!colors) {
        return textCell(code, {
            alignment: { horizontal: 'center', vertical: 'center' },
        });
    }
    return {
        v: code,
        t: 's',
        s: {
            font: { bold: true, color: { rgb: colors.fg }, sz: 10, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: colors.bg } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: THIN_BORDER,
        },
    };
}

function headerCell(label: string, isWeekend = false): CellValue {
    return {
        v: label,
        t: 's',
        s: {
            font: { bold: true, color: { rgb: HEADER_FG }, sz: 10, name: 'Calibri' },
            fill: { patternType: 'solid', fgColor: { rgb: isWeekend ? HEADER_WEEKEND_BG : HEADER_BG } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: THIN_BORDER,
        },
    };
}

function bodyCell(value: string | number, alt = false, center = false): CellValue {
    return textCell(value, {
        font: { sz: 10, name: 'Calibri', color: { rgb: '0F172A' } },
        fill: alt ? { patternType: 'solid', fgColor: { rgb: ROW_ALT_BG } } : undefined,
        alignment: {
            horizontal: center ? 'center' : 'left',
            vertical: 'center',
        },
    });
}

export async function exportAttendanceRegisterExcel(
    data: RegisterExcelData,
    orgTitle: string,
): Promise<void> {
    const XLSX = await import('xlsx-js-style');

    const fixedCols = 4;
    const totalCols = fixedCols + data.dates.length + 1;

    const titleRow: CellValue[] = [
        {
            v: `Attendance Register — ${orgTitle}`,
            t: 's',
            s: {
                font: { bold: true, sz: 16, color: { rgb: TITLE_FG }, name: 'Calibri' },
                fill: { patternType: 'solid', fgColor: { rgb: TITLE_BG } },
                alignment: { horizontal: 'left', vertical: 'center' },
            },
        },
    ];
    while (titleRow.length < totalCols) titleRow.push('');

    const periodRow: CellValue[] = [
        {
            v: `Period: ${data.start_date} to ${data.end_date}  ·  ${data.total_employees} employee(s)`,
            t: 's',
            s: {
                font: { sz: 11, color: { rgb: SUBTITLE_FG }, name: 'Calibri' },
                fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
                alignment: { horizontal: 'left', vertical: 'center' },
            },
        },
    ];
    while (periodRow.length < totalCols) periodRow.push('');

    const header: CellValue[] = [
        headerCell('Sl No'),
        headerCell('Emp ID'),
        headerCell('Name'),
        headerCell('Department'),
        ...data.dates.map((d) => {
            const { dayNum, weekday, isWeekend } = dayHeader(d);
            return headerCell(`${dayNum}\n${weekday}`, isWeekend);
        }),
        headerCell('Present'),
    ];

    const body: CellValue[][] = data.employees.map((emp, idx) => {
        const alt = idx % 2 === 1;
        return [
            bodyCell(idx + 1, alt, true),
            bodyCell(emp.employee_id ?? '—', alt),
            bodyCell(emp.name, alt),
            bodyCell(emp.department_name ?? '—', alt),
            ...data.dates.map((d) => {
                const code = emp.days[d] ?? '';
                const cell = codeCell(code);
                if (alt && typeof cell === 'object' && cell.s && !CODE_COLORS[code]) {
                    cell.s = {
                        ...cell.s,
                        fill: { patternType: 'solid', fgColor: { rgb: ROW_ALT_BG } },
                    };
                }
                return cell;
            }),
            bodyCell(emp.present_days, alt, true),
        ];
    });

    const footer: CellValue[] = [
        {
            v: 'Daily Present',
            t: 's',
            s: {
                font: { bold: true, sz: 10, color: { rgb: FOOTER_FG }, name: 'Calibri' },
                fill: { patternType: 'solid', fgColor: { rgb: FOOTER_BG } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: THIN_BORDER,
            },
        },
        textCell('', { fill: { patternType: 'solid', fgColor: { rgb: FOOTER_BG } }, border: THIN_BORDER }),
        textCell('', { fill: { patternType: 'solid', fgColor: { rgb: FOOTER_BG } }, border: THIN_BORDER }),
        textCell('', { fill: { patternType: 'solid', fgColor: { rgb: FOOTER_BG } }, border: THIN_BORDER }),
        ...data.dates.map((d) =>
            textCell(data.daily_totals[d]?.present ?? 0, {
                font: { bold: true, sz: 10, color: { rgb: FOOTER_FG }, name: 'Calibri' },
                fill: { patternType: 'solid', fgColor: { rgb: FOOTER_BG } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: THIN_BORDER,
            }),
        ),
        textCell('', { fill: { patternType: 'solid', fgColor: { rgb: FOOTER_BG } }, border: THIN_BORDER }),
    ];

    const legendTitle: CellValue[] = [
        {
            v: 'Legend',
            t: 's',
            s: {
                font: { bold: true, sz: 11, color: { rgb: FOOTER_FG }, name: 'Calibri' },
                alignment: { horizontal: 'left', vertical: 'center' },
            },
        },
    ];

    const legendRows: CellValue[][] = Object.entries(data.legend).map(([code, label]) => [
        codeCell(code),
        {
            v: label,
            t: 's',
            s: {
                font: { sz: 10, color: { rgb: LEGEND_LABEL_FG }, name: 'Calibri' },
                alignment: { horizontal: 'left', vertical: 'center' },
            },
        },
    ]);

    const sheetData: CellValue[][] = [
        titleRow,
        periodRow,
        [],
        header,
        ...body,
        [],
        footer,
        [],
        legendTitle,
        ...legendRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 24 },
        { wch: 16 },
        ...data.dates.map(() => ({ wch: 5 })),
        { wch: 9 },
    ];

    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    ];

    ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 8 }, { hpt: 32 }];

    const headerRowIdx = 3;
    ws['!views'] = [
        {
            state: 'frozen',
            xSplit: fixedCols,
            ySplit: headerRowIdx + 1,
            topLeftCell: XLSX.utils.encode_cell({ r: headerRowIdx + 1, c: fixedCols }),
            activeCell: XLSX.utils.encode_cell({ r: headerRowIdx + 1, c: fixedCols }),
        },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Register');
    XLSX.writeFile(wb, `attendance-register_${data.start_date}_to_${data.end_date}.xlsx`);
}
