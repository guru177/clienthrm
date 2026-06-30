import { useNavigate } from 'react-router-dom';
import { Download, Eye, FileText, Mail, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import axios from '@/lib/axios';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { openPayslipPdf, sendPayslipEmail } from '@/lib/payslip-pdf';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface Employee {
    id: number;
    name: string;
    email: string;
    employee_id: string | null;
}

interface Payslip {
    id: number;
    month: number;
    year: number;
    gross_salary: string;
    total_deductions: string;
    net_salary: string;
    status: string;
    generated_at: string | null;
    created_at: string;
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (v: string | number) =>
    '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (status) {
        case 'paid': return 'default';
        case 'approved': return 'secondary';
        case 'generated': return 'secondary';
        case 'preview': return 'outline';
        default: return 'outline';
    }
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function EmployeePayslipsPage({ employee }: { employee: Employee }) {
    const navigate = useNavigate();
    const { hasPermission } = usePermissions();
    const canManagePayroll = hasPermission('manage-payroll');
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');
    const [sendingWa, setSendingWa] = useState<number | null>(null);
    const [sendingEmail, setSendingEmail] = useState<number | null>(null);
    const [openingPdf, setOpeningPdf] = useState<number | null>(null);

    const breadcrumbs = [
        { title: 'Salaries', href: '/admin/salaries/components' },
        { title: 'Employees', href: '/admin/salaries/employees' },
        { title: employee.name, href: `/admin/salaries/employees/${employee.id}/payslips` },
        { title: 'Payslips', href: `/admin/salaries/employees/${employee.id}/payslips` },
    ];

    const fetchPayslips = async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (filterYear !== 'all') params.year = filterYear;
            if (filterMonth !== 'all') params.month = filterMonth;

            const res = await axios.get(`/admin/salaries/employees/${employee.id}/payslips/list`, { params });
            if (res.data.success) setPayslips(res.data.data);
        } catch (e) {
            handleApiError(e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenPdf = async (payslipId: number) => {
        setOpeningPdf(payslipId);
        try {
            await openPayslipPdf(payslipId);
        } catch (e) {
            handleApiError(e);
        } finally {
            setOpeningPdf(null);
        }
    };

    const handleSendEmail = async (payslipId: number) => {
        setSendingEmail(payslipId);
        try {
            const res = await sendPayslipEmail(payslipId);
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setSendingEmail(null);
        }
    };

    const handleSendWhatsApp = async (payslipId: number) => {
        setSendingWa(payslipId);
        try {
            const res = await axios.post(`/admin/payslips/${payslipId}/send-whatsapp`);
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setSendingWa(null);
        }
    };

    useEffect(() => {
        fetchPayslips();
    }, [filterYear, filterMonth]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="flex flex-1 flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            {employee.name}
                            {employee.employee_id && (
                                <span className="text-sm font-normal text-muted-foreground">({employee.employee_id})</span>
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">{employee.email}</p>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/admin/salaries/employees')}>
                        Back to Employees
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filterYear} onValueChange={setFilterYear}>
                        <SelectTrigger className="w-36">
                            <SelectValue placeholder="All Years" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Years</SelectItem>
                            {YEARS.map((y) => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="All Months" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Months</SelectItem>
                            {MONTH_NAMES.slice(1).map((name, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {(filterYear !== 'all' || filterMonth !== 'all') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setFilterYear('all'); setFilterMonth('all'); }}
                        >
                            Clear
                        </Button>
                    )}
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                                Loading...
                            </div>
                        ) : payslips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
                                <FileText className="h-8 w-8 opacity-30" />
                                <span>No payslips found for this employee.</span>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Period</TableHead>
                                        <TableHead className="text-right">Gross</TableHead>
                                        <TableHead className="text-right">Deductions</TableHead>
                                        <TableHead className="text-right">Net Salary</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Generated On</TableHead>
                                        <TableHead className="w-20"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payslips.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">
                                                {MONTH_NAMES[p.month]} {p.year}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {fmt(p.gross_salary)}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-red-600">
                                                {fmt(p.total_deductions)}
                                            </TableCell>
                                            <TableCell className="text-right text-sm font-semibold text-primary">
                                                {fmt(p.net_salary)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant(p.status)} className="capitalize">
                                                    {p.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {p.generated_at
                                                    ? new Date(p.generated_at).toLocaleDateString('en-IN', {
                                                        day: '2-digit', month: 'short', year: 'numeric',
                                                      })
                                                    : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1.5"
                                                        disabled={openingPdf === p.id}
                                                        onClick={() => void handleOpenPdf(p.id)}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                        {openingPdf === p.id ? 'Opening…' : 'PDF'}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="gap-1.5"
                                                        disabled={openingPdf === p.id}
                                                        onClick={() => void handleOpenPdf(p.id)}
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        View
                                                    </Button>
                                                    {canManagePayroll && p.status === 'generated' && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1.5"
                                                        disabled={sendingEmail === p.id}
                                                        onClick={() => handleSendEmail(p.id)}
                                                    >
                                                        <Mail className="h-3.5 w-3.5" />
                                                        {sendingEmail === p.id ? 'Sending…' : 'Email'}
                                                    </Button>
                                                    )}
                                                    {canManagePayroll && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1.5 text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
                                                        disabled={sendingWa === p.id}
                                                        onClick={() => handleSendWhatsApp(p.id)}
                                                    >
                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                        {sendingWa === p.id ? 'Sending…' : 'WhatsApp'}
                                                    </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}