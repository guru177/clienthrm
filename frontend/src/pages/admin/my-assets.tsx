import { useEffect, useState } from 'react';
import axios from '@/lib/axios';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function MyAssetsPage() {
    const [allocations, setAllocations] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Expense Form
    const [expenseOpen, setExpenseOpen] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        asset_id: '',
        expense_type: 'fuel',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        description: ''
    });

    useEffect(() => {
        fetchMyAssets();
    }, []);

    const fetchMyAssets = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/my-assets');
            setAllocations(res.data?.data?.allocations || []);
            setExpenses(res.data?.data?.expenses || []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogExpense = async () => {
        setSaving(true);
        try {
            const payload = {
                ...expenseForm,
                asset_id: parseInt(expenseForm.asset_id),
                amount: parseFloat(expenseForm.amount)
            };
            const res = await axios.post('/admin/my-assets/expenses', payload);
            handleApiResponse(res);
            setExpenseOpen(false);
            setExpenseForm({ ...expenseForm, amount: '', description: '' });
            fetchMyAssets();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    const statusBadgeVariant = (status: string) => {
        switch (status) {
            case 'approved': return 'default' as const;
            case 'pending': return 'secondary' as const;
            case 'rejected': return 'destructive' as const;
            default: return 'outline' as const;
        }
    };

    if (loading) {
        return <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="min-w-0 max-w-full space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-2xl font-bold tracking-tight break-words">My Assets</h2>
                    <p className="text-muted-foreground break-words">View your currently assigned company assets and log maintenance/fuel expenses.</p>
                </div>
                <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
                    <DialogTrigger asChild>
                        <Button className="min-h-11 w-full shrink-0 sm:w-auto" disabled={allocations.length === 0}><Plus className="mr-2 h-4 w-4" /> Log Expense</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Log Asset Expense</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Select Asset</label>
                                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={expenseForm.asset_id} onChange={e => setExpenseForm({...expenseForm, asset_id: e.target.value})}>
                                    <option value="">-- Select Asset --</option>
                                    {allocations.map(a => (
                                        <option key={a.asset_id} value={a.asset_id}>{a.asset_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Expense Type</label>
                                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={expenseForm.expense_type} onChange={e => setExpenseForm({...expenseForm, expense_type: e.target.value})}>
                                    <option value="fuel">Fuel / Petrol</option>
                                    <option value="maintenance">Maintenance / Servicing</option>
                                    <option value="repair">Repair</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Amount (₹)</label>
                                <Input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} placeholder="0.00" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date</label>
                                <Input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm({...expenseForm, expense_date: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Description</label>
                                <Input value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} placeholder="e.g. Shell Petrol Pump, Hinjewadi" />
                            </div>
                            <Button className="w-full" onClick={handleLogExpense} disabled={saving || !expenseForm.asset_id || !expenseForm.amount}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Submit Expense
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allocations.map(alloc => (
                    <Card key={alloc.id}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{alloc.asset_name}</CardTitle>
                            <CardDescription>Allocated on {alloc.allocated_date}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm space-y-1">
                                <p><span className="text-muted-foreground font-medium">Status:</span> Active</p>
                                {alloc.allocation_condition && (
                                    <p><span className="text-muted-foreground font-medium">Condition Note:</span> {alloc.allocation_condition}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {allocations.length === 0 && (
                    <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        You have no company assets currently assigned to you.
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-lg font-medium mt-8 mb-4">My Expense History</h3>
                <div className="space-y-3 md:hidden" data-testid="asset-expense-mobile-cards">
                    {expenses.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                            No expenses logged yet
                        </p>
                    ) : (
                        expenses.map((exp) => (
                            <div key={exp.id} className="rounded-xl border p-4 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium">{exp.asset_name}</p>
                                        <p className="text-sm text-muted-foreground capitalize">
                                            {exp.expense_type} · {exp.expense_date}
                                        </p>
                                    </div>
                                    <Badge variant={statusBadgeVariant(exp.status)}>{exp.status}</Badge>
                                </div>
                                <p className="text-lg font-semibold">₹{exp.amount.toLocaleString()}</p>
                                {exp.description ? (
                                    <p className="text-sm text-muted-foreground">{exp.description}</p>
                                ) : null}
                            </div>
                        ))
                    )}
                </div>
                <div className="hidden rounded-md border md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Asset</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {expenses.map(exp => (
                                <TableRow key={exp.id}>
                                    <TableCell>{exp.expense_date}</TableCell>
                                    <TableCell>{exp.asset_name}</TableCell>
                                    <TableCell className="capitalize">{exp.expense_type}</TableCell>
                                    <TableCell>₹{exp.amount.toLocaleString()}</TableCell>
                                    <TableCell>{exp.description || '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusBadgeVariant(exp.status)}>
                                            {exp.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {expenses.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="text-center">No expenses logged yet</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
