import axios from '@/lib/axios';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { handleApiError, handleApiResponse } from '@/lib/toast';

export interface EmployeeAdvance {
    id: number;
    amount: number;
    balance: number;
    monthly_emi: number;
    description?: string | null;
    is_active?: boolean;
    created_at?: string;
}

const fmt = (n: number) =>
    '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export function EmployeeAdvancesPanel({ userId }: { userId: number }) {
    const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [amount, setAmount] = useState('');
    const [monthlyEmi, setMonthlyEmi] = useState('');
    const [description, setDescription] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/admin/users/${userId}/advances`);
            setAdvances(res.data.data ?? []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const submit = async () => {
        const amt = parseFloat(amount);
        const emi = parseFloat(monthlyEmi);
        if (!Number.isFinite(amt) || amt <= 0) {
            handleApiError({ response: { data: { message: 'Enter a valid advance amount' } } });
            return;
        }
        if (!Number.isFinite(emi) || emi <= 0) {
            handleApiError({ response: { data: { message: 'Enter a valid monthly EMI' } } });
            return;
        }
        setSaving(true);
        try {
            const res = await axios.post(`/admin/users/${userId}/advances`, {
                amount: amt,
                monthly_emi: emi,
                description: description.trim() || undefined,
            });
            handleApiResponse(res);
            setAmount('');
            setMonthlyEmi('');
            setDescription('');
            await load();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Salary advances</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Record advances here; recover them per month from the payroll screen.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading advances…</p>
                ) : advances.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No advances recorded for this employee.</p>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Original</TableHead>
                                    <TableHead>Balance</TableHead>
                                    <TableHead>Monthly EMI</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {advances.map((a) => (
                                    <TableRow key={a.id}>
                                        <TableCell>{a.description || '—'}</TableCell>
                                        <TableCell>{fmt(a.amount)}</TableCell>
                                        <TableCell>{fmt(a.balance)}</TableCell>
                                        <TableCell>{fmt(a.monthly_emi)}</TableCell>
                                        <TableCell>{a.is_active ? 'Active' : 'Closed'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3 border-t pt-4">
                    <div className="space-y-1">
                        <Label htmlFor={`advance_amount_${userId}`}>Advance amount</Label>
                        <Input
                            id={`advance_amount_${userId}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="10000"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`advance_emi_${userId}`}>Monthly EMI</Label>
                        <Input
                            id={`advance_emi_${userId}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={monthlyEmi}
                            onChange={(e) => setMonthlyEmi(e.target.value)}
                            placeholder="2000"
                        />
                    </div>
                    <div className="space-y-1 sm:col-span-1">
                        <Label htmlFor={`advance_desc_${userId}`}>Description</Label>
                        <Input
                            id={`advance_desc_${userId}`}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Festival advance"
                        />
                    </div>
                </div>
                <Button type="button" onClick={submit} disabled={saving}>
                    <Plus className="mr-2 h-4 w-4" />
                    {saving ? 'Saving…' : 'Add advance'}
                </Button>
            </CardContent>
        </Card>
    );
}
