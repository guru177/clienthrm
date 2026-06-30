import { useCallback, useEffect, useState } from 'react';
import axios from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { usePermissions } from '@/hooks/use-permissions';

function downloadCsv(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function PayrollAdvancedPage() {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('manage-payroll');
    const canApprove = hasPermission('approve-payroll');
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    const [variableItems, setVariableItems] = useState<any[]>([]);
    const [claims, setClaims] = useState<any[]>([]);
    const [runs, setRuns] = useState<any[]>([]);
    const [checklist, setChecklist] = useState<any>(null);
    const [reminder, setReminder] = useState<any>(null);
    const [payGroups, setPayGroups] = useState<any[]>([]);

    const [varForm, setVarForm] = useState({
        user_id: '',
        item_type: 'bonus',
        label: '',
        amount: '',
    });
    const [claimForm, setClaimForm] = useState({ title: '', amount: '' });
    const [payGroupName, setPayGroupName] = useState('');

    const loadAll = useCallback(async () => {
        try {
            const [v, c, r, cl, rem, pg] = await Promise.all([
                axios.get('/admin/payroll/variable-pay', { params: { month, year } }),
                axios.get('/admin/payroll/reimbursements'),
                axios.get('/admin/payroll/runs', { params: { month, year } }),
                axios.get('/admin/payroll/checklist', { params: { month, year } }),
                axios.get('/admin/payroll/reminder'),
                axios.get('/admin/payroll/pay-groups'),
            ]);
            if (v.data.success) setVariableItems(v.data.data ?? []);
            if (c.data.success) setClaims(c.data.data ?? []);
            if (r.data.success) setRuns(r.data.data ?? []);
            if (cl.data.success) setChecklist(cl.data.data);
            if (rem.data.success) setReminder(rem.data.data);
            if (pg.data.success) setPayGroups(pg.data.data ?? []);
        } catch (e) {
            handleApiError(e);
        }
    }, [month, year]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    async function addVariablePay() {
        if (!varForm.user_id || !varForm.amount) return;
        try {
            const r = await axios.post('/admin/payroll/variable-pay', {
                user_id: Number(varForm.user_id),
                month,
                year,
                item_type: varForm.item_type,
                label: varForm.label || varForm.item_type,
                amount: Number(varForm.amount),
            });
            handleApiResponse(r);
            setVarForm({ user_id: '', item_type: 'bonus', label: '', amount: '' });
            loadAll();
        } catch (e) {
            handleApiError(e);
        }
    }

    async function submitClaim() {
        try {
            const r = await axios.post('/admin/payroll/reimbursements', {
                title: claimForm.title,
                amount: Number(claimForm.amount),
                claim_month: month,
                claim_year: year,
            });
            handleApiResponse(r);
            setClaimForm({ title: '', amount: '' });
            loadAll();
        } catch (e) {
            handleApiError(e);
        }
    }

    async function reviewClaim(id: number, status: 'approved' | 'rejected') {
        try {
            const r = await axios.post(`/admin/payroll/reimbursements/${id}/review`, {
                status,
                payroll_month: month,
                payroll_year: year,
            });
            handleApiResponse(r);
            loadAll();
        } catch (e) {
            handleApiError(e);
        }
    }

    async function createRun() {
        try {
            const r = await axios.post('/admin/payroll/runs', { month, year, run_type: 'monthly' });
            handleApiResponse(r);
            loadAll();
        } catch (e) {
            handleApiError(e);
        }
    }

    async function runAction(id: number, action: string) {
        try {
            const r = await axios.post(`/admin/payroll/runs/${id}/action`, { action });
            handleApiResponse(r);
            loadAll();
        } catch (e) {
            handleApiError(e);
        }
    }

    async function exportCompliance(type: string) {
        try {
            const r = await axios.get('/admin/payroll/compliance-export', {
                params: { type, month, year },
            });
            const data = r.data.data;
            if (data.format === 'csv') {
                downloadCsv(data.filename, data.content);
            } else {
                const blob = new Blob([JSON.stringify(data.data, null, 2)], {
                    type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `form16_${year}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            handleApiError(e);
        }
    }

    async function downloadBankFile() {
        try {
            const r = await axios.get('/admin/payroll/bank-file', { params: { month, year } });
            const data = r.data.data;
            downloadCsv(data.filename, data.content);
            if (data.payslip_ids?.length && canManage) {
                await axios.post('/admin/payroll/mark-paid', { payslip_ids: data.payslip_ids });
            }
        } catch (e) {
            handleApiError(e);
        }
    }

    async function downloadJournal() {
        try {
            const r = await axios.get('/admin/payroll/accounting-export', { params: { month, year } });
            downloadCsv(r.data.data.filename, r.data.data.content);
        } catch (e) {
            handleApiError(e);
        }
    }

    async function addPayGroup() {
        if (!payGroupName.trim()) return;
        try {
            const r = await axios.post('/admin/payroll/pay-groups', { name: payGroupName });
            handleApiResponse(r);
            setPayGroupName('');
            loadAll();
        } catch (e) {
            handleApiError(e);
        }
    }

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Payroll', href: '/admin/payroll' },
                { title: 'Advanced', href: '/admin/payroll/advanced' },
            ]}
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                        <Label>Month</Label>
                        <Input
                            type="number"
                            min={1}
                            max={12}
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="w-24"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>Year</Label>
                        <Input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="w-28"
                        />
                    </div>
                    {reminder?.reminder_due && (
                        <p className="text-sm font-medium text-amber-600">
                            Payroll reminder: no generated payslips for this month yet.
                        </p>
                    )}
                </div>

                {checklist && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Payroll checklist</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-1">
                            <p>Pending leave requests: {checklist.pending_leave_requests}</p>
                            <p>Employees without salary: {checklist.employees_without_salary}</p>
                            <p>Pending reimbursements: {checklist.pending_reimbursements}</p>
                            <p>Generated payslips: {checklist.generated_payslips}</p>
                            <p className={checklist.ready ? 'text-green-600 font-medium' : 'text-amber-600'}>
                                {checklist.ready ? 'Ready for payroll run' : 'Resolve items above before generating'}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <Tabs defaultValue="runs">
                    <TabsList className="flex flex-wrap h-auto">
                        <TabsTrigger value="runs">Runs & approval</TabsTrigger>
                        <TabsTrigger value="variable">Variable pay</TabsTrigger>
                        <TabsTrigger value="reimburse">Reimbursements</TabsTrigger>
                        <TabsTrigger value="exports">Compliance & finance</TabsTrigger>
                        <TabsTrigger value="groups">Pay groups</TabsTrigger>
                    </TabsList>

                    <TabsContent value="runs" className="space-y-4">
                        {canManage && (
                            <Button onClick={createRun}>Create payroll run</Button>
                        )}
                        <div className="space-y-2">
                            {runs.map((run: any) => (
                                <Card key={run.id}>
                                    <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                                        <div>
                                            <p className="font-medium">
                                                {run.run_type} — {run.month}/{run.year}
                                            </p>
                                            <p className="text-sm text-muted-foreground">Status: {run.status}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            {canManage && run.status === 'draft' && (
                                                <Button size="sm" variant="outline" onClick={() => runAction(run.id, 'review')}>
                                                    Mark reviewed
                                                </Button>
                                            )}
                                            {canApprove && run.status === 'reviewed' && (
                                                <Button size="sm" onClick={() => runAction(run.id, 'approve')}>
                                                    Approve
                                                </Button>
                                            )}
                                            {canApprove && run.status === 'approved' && (
                                                <Button size="sm" variant="secondary" onClick={() => runAction(run.id, 'release')}>
                                                    Release
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {runs.length === 0 && (
                                <p className="text-sm text-muted-foreground">No payroll runs for this period.</p>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="variable" className="space-y-4">
                        {canManage && (
                            <Card>
                                <CardContent className="grid gap-3 pt-6 md:grid-cols-5">
                                    <Input
                                        placeholder="User ID"
                                        value={varForm.user_id}
                                        onChange={(e) => setVarForm({ ...varForm, user_id: e.target.value })}
                                    />
                                    <Select
                                        value={varForm.item_type}
                                        onValueChange={(v) => setVarForm({ ...varForm, item_type: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="bonus">Bonus</SelectItem>
                                            <SelectItem value="commission">Commission</SelectItem>
                                            <SelectItem value="incentive">Incentive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        placeholder="Label"
                                        value={varForm.label}
                                        onChange={(e) => setVarForm({ ...varForm, label: e.target.value })}
                                    />
                                    <Input
                                        placeholder="Amount"
                                        type="number"
                                        value={varForm.amount}
                                        onChange={(e) => setVarForm({ ...varForm, amount: e.target.value })}
                                    />
                                    <Button onClick={addVariablePay}>Add</Button>
                                </CardContent>
                            </Card>
                        )}
                        <ul className="text-sm space-y-1">
                            {variableItems.map((item: any) => (
                                <li key={item.id}>
                                    {item.user_name}: {item.label} — ₹{item.amount} ({item.item_type})
                                </li>
                            ))}
                        </ul>
                    </TabsContent>

                    <TabsContent value="reimburse" className="space-y-4">
                        <Card>
                            <CardContent className="grid gap-3 pt-6 md:grid-cols-3">
                                <Input
                                    placeholder="Claim title"
                                    value={claimForm.title}
                                    onChange={(e) => setClaimForm({ ...claimForm, title: e.target.value })}
                                />
                                <Input
                                    placeholder="Amount"
                                    type="number"
                                    value={claimForm.amount}
                                    onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })}
                                />
                                <Button onClick={submitClaim}>Submit claim</Button>
                            </CardContent>
                        </Card>
                        <div className="space-y-2">
                            {claims.map((c: any) => (
                                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3 text-sm">
                                    <span>
                                        {c.user_name}: {c.title} — ₹{c.amount} [{c.status}]
                                    </span>
                                    {canManage && c.status === 'pending' && (
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => reviewClaim(c.id, 'approved')}>
                                                Approve
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => reviewClaim(c.id, 'rejected')}>
                                                Reject
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="exports" className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => exportCompliance('pf_ecr')}>
                            PF ECR CSV
                        </Button>
                        <Button variant="outline" onClick={() => exportCompliance('esi')}>
                            ESI CSV
                        </Button>
                        <Button variant="outline" onClick={() => exportCompliance('pt_return')}>
                            PT return
                        </Button>
                        <Button variant="outline" onClick={() => exportCompliance('form16')}>
                            Form 16 data
                        </Button>
                        {canManage && (
                            <>
                                <Button onClick={downloadBankFile}>Bank NEFT file</Button>
                                <Button variant="secondary" onClick={downloadJournal}>
                                    Accounting journal
                                </Button>
                            </>
                        )}
                    </TabsContent>

                    <TabsContent value="groups" className="space-y-4">
                        {canManage && (
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Pay group name"
                                    value={payGroupName}
                                    onChange={(e) => setPayGroupName(e.target.value)}
                                />
                                <Button onClick={addPayGroup}>Add group</Button>
                            </div>
                        )}
                        <ul className="text-sm space-y-1">
                            {payGroups.map((g: any) => (
                                <li key={g.id}>
                                    {g.name} ({g.frequency})
                                </li>
                            ))}
                        </ul>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
