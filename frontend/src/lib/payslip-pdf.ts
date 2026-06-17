import axios from '@/lib/axios';

/** Open a printable payslip in a new tab (use browser Print → Save as PDF). */
export async function openPayslipPdf(payslipId: number): Promise<void> {
    const res = await axios.get(`/admin/payslips/${payslipId}/pdf`, {
        responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
        URL.revokeObjectURL(url);
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
    }
    win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
}

/** Download a ZIP of printable payslip HTML files for the month (open each → Save as PDF). */
export async function downloadBulkPayslipsZip(options: {
    month?: number;
    year?: number;
    payslipIds?: number[];
}): Promise<void> {
    const payload =
        options.payslipIds && options.payslipIds.length > 0
            ? { payslip_ids: options.payslipIds }
            : { month: options.month, year: options.year };

    const res = await axios.post('/admin/payslips/bulk-download', payload, {
        responseType: 'blob',
    });

    const month = options.month ?? new Date().getMonth() + 1;
    const year = options.year ?? new Date().getFullYear();
    const filename =
        options.payslipIds && options.payslipIds.length > 0
            ? `payslips-selected.zip`
            : `payslips-${year}-${String(month).padStart(2, '0')}.zip`;

    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
