import axios from '@/lib/axios';
import { Wallet, FileDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { openPayslipPdf } from '@/lib/payslip-pdf';
import { handleApiError } from '@/lib/toast';

interface PayslipRow {
    id: number;
    month: number;
    year: number;
    gross_salary: string;
    total_deductions: string;
    net_salary: string;
    status: string;
}

export default function MyPayslipsPage() {
    const [payslips, setPayslips] = useState<PayslipRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [openingId, setOpeningId] = useState<number | null>(null);

    useEffect(() => {
        void loadPayslips();
    }, []);

    const loadPayslips = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/me/payslips');
            setPayslips(res.data.data || []);
        } catch (error) {
            handleApiError(error);
            setPayslips([]);
        } finally {
            setLoading(false);
        }
    };

    const monthName = (m: number) =>
        new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' });

    const handleOpenPdf = async (id: number) => {
        setOpeningId(id);
        try {
            await openPayslipPdf(id);
        } catch (error) {
            handleApiError(error);
        } finally {
            setOpeningId(null);
        }
    };

    return (
        <AppLayout breadcrumbs={[{ title: 'My Payslips', href: '/admin/my-payslips' }]}>
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Wallet className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">My Payslips</h1>
                        <p className="text-muted-foreground text-sm">View your generated payslips</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Payslip History</CardTitle>
                        <CardDescription>Only generated payslips are shown here</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Gross</TableHead>
                                    <TableHead>Deductions</TableHead>
                                    <TableHead>Net</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">
                                            Loading...
                                        </TableCell>
                                    </TableRow>
                                ) : payslips.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            No payslips yet
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    payslips.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell>
                                                {monthName(p.month)} {p.year}
                                            </TableCell>
                                            <TableCell>₹{p.gross_salary}</TableCell>
                                            <TableCell>₹{p.total_deductions}</TableCell>
                                            <TableCell className="font-medium">₹{p.net_salary}</TableCell>
                                            <TableCell>{p.status}</TableCell>
                                            <TableCell className="text-right">
                                                {p.status === 'generated' && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={openingId === p.id}
                                                        onClick={() => void handleOpenPdf(p.id)}
                                                    >
                                                        <FileDown className="h-4 w-4 mr-1" />
                                                        PDF
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
