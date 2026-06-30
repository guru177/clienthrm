import axios from '@/lib/axios';

/** Open payslip A4 PDF in a new tab. */
export async function openPayslipPdf(payslipId: number): Promise<void> {
    const res = await axios.get(`/admin/payslips/${payslipId}/pdf`, {
        responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
        URL.revokeObjectURL(url);
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
    }
    win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
}

/** Email one generated payslip to the employee. */
export async function sendPayslipEmail(payslipId: number) {
    return axios.post(`/admin/payslips/${payslipId}/send-email`);
}

/** Email all generated payslips for a month (or selected IDs). */
export async function bulkSendPayslipEmails(options: {
    month?: number;
    year?: number;
    payslipIds?: number[];
}) {
    const payload =
        options.payslipIds && options.payslipIds.length > 0
            ? { payslip_ids: options.payslipIds }
            : { month: options.month, year: options.year };
    return axios.post('/admin/payslips/bulk-send-email', payload);
}

/** Download a ZIP of A4 payslip PDFs for the month. */
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
