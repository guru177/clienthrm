import axios from '@/lib/axios';
import { BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';

import AttendanceRegisterReport from '@/components/reports/attendance-register-report';
import SalarySplitReport from '@/components/reports/salary-split-report';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { handleApiError } from '@/lib/toast';
import { earningColumnKind, type DeductionColumn, type EarningColumn, type SalarySplitTotals } from '@/lib/salary-split-excel';

export default function ReportsPage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [attendance, setAttendance] = useState<any[]>([]);
    const [payroll, setPayroll] = useState<any[]>([]);
    const [payrollSplit, setPayrollSplit] = useState<any[]>([]);
    const [payrollSplitTotals, setPayrollSplitTotals] = useState<SalarySplitTotals>({});
    const [earningColumns, setEarningColumns] = useState<EarningColumn[]>([]);
    const [deductionColumns, setDeductionColumns] = useState<DeductionColumn[]>([]);
    const [leave, setLeave] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('attendance');

    useEffect(() => {
        if (activeTab === 'attendance-register') return;
        void loadReports();
    }, [month, year, activeTab]);

    const loadReports = async () => {
        setLoading(true);
        try {
            const [att, pay, split, lev] = await Promise.all([
                axios.get('/admin/reports/attendance-summary', { params: { month, year } }),
                axios.get('/admin/reports/payroll-register', { params: { month, year } }),
                axios.get('/admin/reports/payroll-split', { params: { month, year } }),
                axios.get('/admin/reports/leave-balance'),
            ]);
            setAttendance(att.data.data?.employees || []);
            setPayroll(pay.data.data?.payslips || []);
            setPayrollSplit(split.data.data?.rows || []);
            setPayrollSplitTotals(split.data.data?.totals || {});
            let columns: EarningColumn[] = split.data.data?.earning_columns || [];
            if (columns.length === 0) {
                try {
                    const compRes = await axios.get('/admin/salaries/components/list', {
                        params: { type: 'earning' },
                    });
                    if (compRes.data.success) {
                        columns = (compRes.data.data || [])
                            .filter((c: { is_active?: boolean }) => c.is_active !== false)
                            .map((c: { id: number; name: string; slug?: string }) => ({
                                id: c.id,
                                name: c.name,
                                slug: c.slug,
                                kind: earningColumnKind(c.slug, c.name),
                            }));
                    }
                } catch {
                    /* keep empty — payroll-split is primary source */
                }
            }
            setEarningColumns(columns);
            let deductions: DeductionColumn[] = split.data.data?.deduction_columns || [];
            if (deductions.length === 0) {
                try {
                    const compRes = await axios.get('/admin/salaries/components/list', {
                        params: { type: 'deduction' },
                    });
                    if (compRes.data.success) {
                        deductions = (compRes.data.data || [])
                            .filter((c: { is_active?: boolean; name?: string; slug?: string }) => {
                                const s = (c.slug || '').toLowerCase();
                                const n = (c.name || '').toLowerCase();
                                return c.is_active !== false && !s.includes('employer') && !n.includes('employer');
                            })
                            .map((c: { id: number; name: string; slug?: string; is_pre_tax?: boolean }) => ({
                                id: c.id,
                                name: c.name,
                                slug: c.slug,
                                is_pre_tax: c.is_pre_tax,
                                kind: 'deduct' as const,
                            }));
                    }
                } catch {
                    /* keep empty */
                }
            }
            setDeductionColumns(deductions);
            setLeave(lev.data.data || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={[{ title: 'Reports', href: '/admin/reports' }]}>
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <BarChart3 className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">Reports</h1>
                        <p className="text-muted-foreground text-sm">Attendance, payroll, and leave summaries</p>
                    </div>
                </div>

                {activeTab !== 'attendance-register' && (
                    <div className="flex gap-4 items-end">
                        <div className="space-y-2">
                            <Label>Month</Label>
                            <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" />
                        </div>
                        <div className="space-y-2">
                            <Label>Year</Label>
                            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
                        </div>
                    </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                        <TabsTrigger value="attendance">Attendance</TabsTrigger>
                        <TabsTrigger value="attendance-register">Attendance Register</TabsTrigger>
                        <TabsTrigger value="payroll">Payroll Register</TabsTrigger>
                        <TabsTrigger value="split">Salary Split</TabsTrigger>
                        <TabsTrigger value="leave">Leave Balance</TabsTrigger>
                    </TabsList>

                    <TabsContent value="attendance">
                        <Card>
                            <CardHeader><CardTitle>Attendance Summary</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Employee</TableHead>
                                            <TableHead>Present Days</TableHead>
                                            <TableHead>Late</TableHead>
                                            <TableHead>Early Exit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow><TableCell colSpan={4} className="text-center">Loading...</TableCell></TableRow>
                                        ) : attendance.map((r) => (
                                            <TableRow key={r.user_id}>
                                                <TableCell>{r.name}</TableCell>
                                                <TableCell>{r.present_days}</TableCell>
                                                <TableCell>{r.late_marks}</TableCell>
                                                <TableCell>{r.early_exits}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="attendance-register">
                        <AttendanceRegisterReport />
                    </TabsContent>

                    <TabsContent value="payroll">
                        <Card>
                            <CardHeader><CardTitle>Payroll Register</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Employee</TableHead>
                                            <TableHead>LOP</TableHead>
                                            <TableHead>Penalty</TableHead>
                                            <TableHead>Gross</TableHead>
                                            <TableHead>Net</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payroll.map((r) => (
                                            <TableRow key={r.payslip_id}>
                                                <TableCell>{r.name}</TableCell>
                                                <TableCell>₹{(r.lop_deduction ?? 0).toFixed?.(2) ?? r.lop_deduction}</TableCell>
                                                <TableCell>₹{(r.shift_penalty ?? 0).toFixed?.(2) ?? r.shift_penalty}</TableCell>
                                                <TableCell>₹{r.gross_salary?.toFixed?.(2) ?? r.gross_salary}</TableCell>
                                                <TableCell>₹{r.net_salary?.toFixed?.(2) ?? r.net_salary}</TableCell>
                                                <TableCell>{r.status}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="split">
                        <SalarySplitReport
                            month={month}
                            year={year}
                            earningColumns={earningColumns}
                            deductionColumns={deductionColumns}
                            rows={payrollSplit}
                            totals={payrollSplitTotals}
                            loading={loading}
                            onReload={() => void loadReports()}
                        />
                    </TabsContent>

                    <TabsContent value="leave">
                        <Card>
                            <CardHeader><CardTitle>Leave Balance</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Employee</TableHead>
                                            <TableHead>Base</TableHead>
                                            <TableHead>Bonus</TableHead>
                                            <TableHead>Total</TableHead>
                                            <TableHead>Used</TableHead>
                                            <TableHead>Pending</TableHead>
                                            <TableHead>Available</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {leave.map((r) => (
                                            <TableRow key={r.user_id}>
                                                <TableCell>{r.name}</TableCell>
                                                <TableCell>{r.annual_quota}</TableCell>
                                                <TableCell>{r.bonus_days ?? 0}</TableCell>
                                                <TableCell>{r.total_allowance ?? r.annual_quota}</TableCell>
                                                <TableCell>{r.used_days}</TableCell>
                                                <TableCell>{r.pending_days ?? 0}</TableCell>
                                                <TableCell>{r.available_days ?? r.balance}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
