import axios from '@/lib/axios';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface VariableItem {
    id: number;
    user_id: number;
    item_type: string;
    label: string;
    amount: number;
}

const fmt = (n: number) =>
    '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

/** One-time bonus / incentive for this employee — paid with that month’s payroll. */
export function EmployeeExtraPayPanel({ userId }: { userId: number }) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(currentYear);
    const [items, setItems] = useState<VariableItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [itemType, setItemType] = useState('bonus');
    const [label, setLabel] = useState('');
    const [amount, setAmount] = useState('');
    const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/payroll/variable-pay', {
                params: { month, year, user_id: userId },
            });
            const all: VariableItem[] = res.data.data ?? [];
            setItems(all.filter((i) => Number(i.user_id) === Number(userId)));
        } catch (e) {
            handleApiError(e);
        } finally {
            setLoading(false);
        }
    }, [userId, month, year]);

    useEffect(() => {
        void load();
    }, [load]);

    const submit = async () => {
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            handleApiError({ response: { data: { message: 'Enter a valid amount' } } });
            return;
        }
        const note = label.trim() || itemType;
        setSaving(true);
        try {
            const res = await axios.post('/admin/payroll/variable-pay', {
                user_id: userId,
                month,
                year,
                item_type: itemType,
                label: note,
                amount: amt,
            });
            handleApiResponse(res);
            const newId = Number(res.data?.data?.id);
            if (Number.isFinite(newId) && newId > 0) {
                setItems((prev) => [
                    {
                        id: newId,
                        user_id: userId,
                        item_type: itemType,
                        label: note,
                        amount: amt,
                    },
                    ...prev,
                ]);
            }
            setLabel('');
            setAmount('');
            // Refresh in background; do not block the button on list reload
            void load();
        } catch (e) {
            handleApiError(e);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: number) => {
        if (!window.confirm('Remove this extra pay from the payroll month?')) return;
        try {
            const res = await axios.delete(`/admin/payroll/variable-pay/${id}`);
            handleApiResponse(res);
            await load();
        } catch (e) {
            handleApiError(e);
        }
    };

    const selectClass =
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

    return (
        <div className="space-y-4 rounded-lg border p-4">
            <div>
                <h3 className="text-base font-semibold">Bonus / one-time pay</h3>
                <p className="text-sm text-muted-foreground">
                    Paid only in the selected month. Does not change monthly salary.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <Label htmlFor={`extra_month_${userId}`}>Month</Label>
                    <select
                        id={`extra_month_${userId}`}
                        className={selectClass}
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                    >
                        {MONTHS.map((name, i) => (
                            <option key={name} value={i + 1}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor={`extra_year_${userId}`}>Year</Label>
                    <select
                        id={`extra_year_${userId}`}
                        className={selectClass}
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                    >
                        {yearOptions.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor={`extra_type_${userId}`}>Type</Label>
                    <select
                        id={`extra_type_${userId}`}
                        className={selectClass}
                        value={itemType}
                        onChange={(e) => setItemType(e.target.value)}
                    >
                        <option value="bonus">Bonus</option>
                        <option value="incentive">Incentive</option>
                        <option value="commission">Commission</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor={`extra_label_${userId}`}>Note (optional)</Label>
                    <Input
                        id={`extra_label_${userId}`}
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. Diwali bonus"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor={`extra_amount_${userId}`}>Amount (₹)</Label>
                    <Input
                        id={`extra_amount_${userId}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="5000"
                    />
                </div>
            </div>

            <Button type="button" onClick={submit} disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? 'Adding…' : 'Add bonus'}
            </Button>

            <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                    {MONTHS[month - 1]} {year}
                </p>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing added for this month yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {items.map((item) => (
                            <li
                                key={item.id}
                                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                            >
                                <span>
                                    <span className="capitalize">{item.item_type}</span>
                                    {item.label ? ` · ${item.label}` : ''}
                                    <span className="ml-2 font-medium">{fmt(item.amount)}</span>
                                </span>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => remove(item.id)}
                                    aria-label="Remove"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
