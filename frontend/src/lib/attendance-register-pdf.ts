/** Landscape print/PDF export for the attendance register grid. */

export interface RegisterPdfEmployee {
    user_id: number;
    name: string;
    employee_id?: string | null;
    department_name?: string | null;
    days: Record<string, string>;
    present_days: number;
}

export interface RegisterPdfData {
    start_date: string;
    end_date: string;
    dates: string[];
    legend: Record<string, string>;
    employees: RegisterPdfEmployee[];
    total_employees: number;
}

const CODE_COLORS: Record<string, { bg: string; fg: string }> = {
    P: { bg: '#d1fae5', fg: '#065f46' },
    A: { bg: '#fee2e2', fg: '#991b1b' },
    HD: { bg: '#fef3c7', fg: '#92400e' },
    L: { bg: '#dbeafe', fg: '#1e40af' },
    O: { bg: '#f3f4f6', fg: '#6b7280' },
    H: { bg: '#ede9fe', fg: '#5b21b6' },
    EW: { bg: '#cffafe', fg: '#155e75' },
    '•': { bg: '#ffedd5', fg: '#9a3412' },
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function dayHeader(dateStr: string): { dayNum: number; weekday: string } {
    const d = new Date(`${dateStr}T12:00:00`);
    return {
        dayNum: d.getDate(),
        weekday: d.toLocaleDateString('en-IN', { weekday: 'narrow' }),
    };
}

function codeCellHtml(code: string): string {
    if (!code) return '<td class="empty">·</td>';
    const colors = CODE_COLORS[code] ?? { bg: '#f1f5f9', fg: '#0f172a' };
    return `<td class="code" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(code)}</td>`;
}

export async function exportAttendanceRegisterPdf(
    data: RegisterPdfData,
    orgTitle: string,
    options?: { subtitle?: string },
): Promise<void> {
    const subtitle =
        options?.subtitle ??
        `Period: ${data.start_date} to ${data.end_date} · ${data.total_employees} employee(s)`;

    const legendHtml = Object.entries(data.legend)
        .map(([code, label]) => {
            const colors = CODE_COLORS[code] ?? { bg: '#f1f5f9', fg: '#0f172a' };
            return `<span class="legend-item"><span class="legend-code" style="background:${colors.bg};color:${colors.fg}">${escapeHtml(code)}</span>${escapeHtml(label)}</span>`;
        })
        .join('');

    const headDays = data.dates
        .map((d) => {
            const { dayNum, weekday } = dayHeader(d);
            return `<th title="${escapeHtml(d)}"><div>${dayNum}</div><div class="wd">${escapeHtml(weekday)}</div></th>`;
        })
        .join('');

    const rows = data.employees
        .map((emp, idx) => {
            const meta = [emp.department_name, emp.employee_id].filter(Boolean).join(' · ') || '—';
            const days = data.dates.map((d) => codeCellHtml(emp.days[d] ?? '')).join('');
            return `<tr class="${idx % 2 ? 'alt' : ''}">
                <td class="emp"><strong>${escapeHtml(emp.name)}</strong><div class="meta">${escapeHtml(meta)}</div></td>
                ${days}
                <td class="days">${emp.present_days}</td>
            </tr>`;
        })
        .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Monthly attendance — ${escapeHtml(orgTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #0f172a; margin: 0; padding: 8px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .sub { font-size: 11px; color: #64748b; margin-bottom: 8px; }
  .legend { display: flex; flex-wrap: wrap; gap: 8px 12px; font-size: 10px; margin-bottom: 10px; }
  .legend-item { display: inline-flex; align-items: center; gap: 4px; }
  .legend-code { display: inline-flex; min-width: 18px; height: 18px; align-items: center; justify-content: center;
    border-radius: 3px; font-weight: 700; font-size: 10px; padding: 0 3px; }
  table { border-collapse: collapse; width: 100%; font-size: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 2px 3px; vertical-align: middle; }
  thead th { background: #1e293b; color: #f8fafc; font-weight: 600; text-align: center; }
  th .wd { font-size: 7px; font-weight: 400; opacity: 0.85; }
  td.emp { text-align: left; min-width: 110px; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  td.emp .meta { font-size: 7px; color: #64748b; font-weight: 400; }
  td.code { text-align: center; font-weight: 700; }
  td.empty { text-align: center; color: #cbd5e1; }
  td.days { text-align: center; font-weight: 600; }
  tr.alt td.emp, tr.alt td.days, tr.alt td.empty { background: #f8fafc; }
  .hint { margin-top: 10px; font-size: 10px; color: #94a3b8; }
  @media print {
    .hint { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <h1>Monthly attendance report — ${escapeHtml(orgTitle)}</h1>
  <div class="sub">${escapeHtml(subtitle)}</div>
  <div class="legend">${legendHtml}</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Employee</th>
        ${headDays}
        <th>Days</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="99" style="text-align:center;padding:16px">No employees</td></tr>'}
    </tbody>
  </table>
  <p class="hint">Use Print → Save as PDF (landscape) to download.</p>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    };
  </script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
        URL.revokeObjectURL(url);
        throw new Error('Pop-up blocked. Allow pop-ups to export PDF.');
    }
    // Revoke after the new document has loaded.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
