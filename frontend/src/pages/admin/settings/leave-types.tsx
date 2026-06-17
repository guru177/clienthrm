import axios from '@/lib/axios';
import { Gift, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';

const breadcrumbs = [
    { label: 'App Settings', href: '/admin/settings/app' },
    { label: 'Leave Policy' },
];

interface LeaveType {
    id: number;
    slug: string;
    name: string;
    payment_type: 'paid' | 'unpaid' | 'half_day';
    payment_type_label: string;
    counts_toward_quota: boolean;
    is_active: boolean;
}

interface EmployeeOption {
    id: number;
    name: string;
    employee_id?: string | null;
}

interface LeaveCredit {
    id: number;
    user_id: number;
    user_name?: string;
    employee_id?: string | null;
    days: number;
    reason: string;
    source: string;
    work_date?: string | null;
    year: number;
    notes?: string | null;
    created_by_name?: string | null;
    created_at?: string | null;
}

const currentYear = new Date().getFullYear();

export default function LeaveTypesSettingsPage() {
    const [items, setItems] = useState<LeaveType[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<number | 'new' | null>(null);

    const [annualQuota, setAnnualQuota] = useState('12');
    const [policySaving, setPolicySaving] = useState(false);

    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [credits, setCredits] = useState<LeaveCredit[]>([]);
    const [creditsLoading, setCreditsLoading] = useState(true);
    const [creditYear, setCreditYear] = useState(String(currentYear));
    const [creditSaving, setCreditSaving] = useState(false);
    const [creditDraft, setCreditDraft] = useState({
        user_id: '',
        days: '1',
        reason: '',
        source: 'holiday_work' as 'holiday_work' | 'manual',
        work_date: '',
        notes: '',
    });

    const [draft, setDraft] = useState({
        name: '',
        slug: '',
        payment_type: 'paid' as LeaveType['payment_type'],
        counts_toward_quota: false,
    });

    const loadTypes = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/settings/leave-types');
            if (res.data.success) setItems(res.data.data || []);
        } catch (e) {
            handleApiError(e);
        } finally {
            setLoading(false);
        }
    };

    const loadPolicy = async () => {
        try {
            const res = await axios.get('/admin/settings/leave-policy');
            if (res.data.success) {
                setAnnualQuota(String(res.data.data?.annual_leave_quota ?? 12));
            }
        } catch (e) {
            handleApiError(e);
        }
    };

    const loadEmployees = async () => {
        try {
            const res = await axios.get('/admin/users/list', { params: { per_page: 500 } });
            const rows = res.data?.data?.data ?? res.data?.data ?? [];
            setEmployees(
                rows.map((u: { id: number; name: string; employee_id?: string }) => ({
                    id: u.id,
                    name: u.name,
                    employee_id: u.employee_id,
                })),
            );
        } catch {
            setEmployees([]);
        }
    };

    const loadCredits = async () => {
        setCreditsLoading(true);
        try {
            const res = await axios.get('/admin/leave-credits', {
                params: { year: Number(creditYear) || currentYear },
            });
            if (res.data.success) setCredits(res.data.data || []);
        } catch (e) {
            handleApiError(e);
        } finally {
            setCreditsLoading(false);
        }
    };

    useEffect(() => {
        void loadTypes();
        void loadPolicy();
        void loadEmployees();
    }, []);

    useEffect(() => {
        void loadCredits();
    }, [creditYear]);

    const savePolicy = async () => {
        const quota = Number(annualQuota);
        if (Number.isNaN(quota) || quota < 0 || quota > 365) {
            handleApiError(new Error('Annual quota must be between 0 and 365'));
            return;
        }
        setPolicySaving(true);
        try {
            const res = await axios.put('/admin/settings/leave-policy', {
                annual_leave_quota: quota,
            });
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setPolicySaving(false);
        }
    };

    const grantCredit = async () => {
        if (!creditDraft.user_id) return;
        if (!creditDraft.reason.trim()) return;
        setCreditSaving(true);
        try {
            const res = await axios.post('/admin/leave-credits', {
                user_id: Number(creditDraft.user_id),
                days: Number(creditDraft.days) || 1,
                reason: creditDraft.reason.trim(),
                source: creditDraft.source,
                work_date: creditDraft.work_date || undefined,
                year: Number(creditYear) || currentYear,
                notes: creditDraft.notes.trim() || undefined,
            });
            handleApiResponse(res);
            setCreditDraft({
                user_id: '',
                days: '1',
                reason: '',
                source: 'holiday_work',
                work_date: '',
                notes: '',
            });
            await loadCredits();
        } catch (e) {
            handleApiError(e);
        } finally {
            setCreditSaving(false);
        }
    };

    const revokeCredit = async (id: number) => {
        if (!confirm('Remove this bonus leave credit?')) return;
        try {
            const res = await axios.delete(`/admin/leave-credits/${id}`);
            handleApiResponse(res);
            await loadCredits();
        } catch (e) {
            handleApiError(e);
        }
    };

    const updateItem = async (item: LeaveType, patch: Partial<LeaveType>) => {
        setSaving(item.id);
        try {
            const res = await axios.put(`/admin/settings/leave-types/${item.id}`, {
                name: patch.name ?? item.name,
                payment_type: patch.payment_type ?? item.payment_type,
                counts_toward_quota: patch.counts_toward_quota ?? item.counts_toward_quota,
                is_active: patch.is_active ?? item.is_active,
            });
            handleApiResponse(res);
            await loadTypes();
        } catch (e) {
            handleApiError(e);
        } finally {
            setSaving(null);
        }
    };

    const addItem = async () => {
        if (!draft.name.trim()) return;
        setSaving('new');
        try {
            const res = await axios.post('/admin/settings/leave-types', draft);
            handleApiResponse(res);
            setDraft({ name: '', slug: '', payment_type: 'paid', counts_toward_quota: false });
            await loadTypes();
        } catch (e) {
            handleApiError(e);
        } finally {
            setSaving(null);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-8">
                <Heading
                    title="Leave Policy"
                    description="Set annual leave allowance, configure leave types, and grant bonus days (e.g. comp-off for working on holidays)."
                />
                <Card>
                    <CardHeader>
                        <CardTitle>Annual leave quota</CardTitle>
                        <CardDescription>
                            Default paid leave days per employee per calendar year. Bonus credits (below) are added on top for individuals.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="space-y-2 sm:max-w-xs">
                                <Label htmlFor="annual_quota">Business days per year</Label>
                                <Input
                                    id="annual_quota"
                                    type="number"
                                    min={0}
                                    max={365}
                                    value={annualQuota}
                                    onChange={(e) => setAnnualQuota(e.target.value)}
                                />
                            </div>
                            <Button onClick={() => void savePolicy()} disabled={policySaving}>
                                <Save className="mr-1.5 h-4 w-4" />
                                {policySaving ? 'Saving…' : 'Save quota'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-5 w-5" />
                            Bonus leave credits
                        </CardTitle>
                        <CardDescription>
                            Grant extra leave days when an employee works on a holiday or earns comp-off. These add to their annual allowance.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Employee</Label>
                                <Select
                                    value={creditDraft.user_id}
                                    onValueChange={(v) => setCreditDraft({ ...creditDraft, user_id: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map((e) => (
                                            <SelectItem key={e.id} value={String(e.id)}>
                                                {e.name}
                                                {e.employee_id ? ` (${e.employee_id})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Days to grant</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={creditDraft.days}
                                    onChange={(e) => setCreditDraft({ ...creditDraft, days: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Credit year</Label>
                                <Input
                                    type="number"
                                    value={creditYear}
                                    onChange={(e) => setCreditYear(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Reason</Label>
                                <Input
                                    value={creditDraft.reason}
                                    onChange={(e) => setCreditDraft({ ...creditDraft, reason: e.target.value })}
                                    placeholder="e.g. Worked on Republic Day"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Holiday / work date</Label>
                                <Input
                                    type="date"
                                    value={creditDraft.work_date}
                                    onChange={(e) => setCreditDraft({ ...creditDraft, work_date: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Source</Label>
                                <Select
                                    value={creditDraft.source}
                                    onValueChange={(v) =>
                                        setCreditDraft({
                                            ...creditDraft,
                                            source: v as 'holiday_work' | 'manual',
                                        })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="holiday_work">Worked on holiday</SelectItem>
                                        <SelectItem value="manual">Manual adjustment</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                <Label>Notes (optional)</Label>
                                <Textarea
                                    rows={2}
                                    value={creditDraft.notes}
                                    onChange={(e) => setCreditDraft({ ...creditDraft, notes: e.target.value })}
                                    placeholder="Approver note or reference"
                                />
                            </div>
                        </div>
                        <Button
                            onClick={() => void grantCredit()}
                            disabled={creditSaving || !creditDraft.user_id || !creditDraft.reason.trim()}
                        >
                            <Plus className="mr-1.5 h-4 w-4" />
                            {creditSaving ? 'Granting…' : 'Grant bonus leave'}
                        </Button>

                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Employee</th>
                                        <th className="px-3 py-2 text-left font-medium">Days</th>
                                        <th className="px-3 py-2 text-left font-medium">Reason</th>
                                        <th className="px-3 py-2 text-left font-medium">Work date</th>
                                        <th className="px-3 py-2 text-left font-medium">Granted</th>
                                        <th className="px-3 py-2 text-right font-medium" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {creditsLoading ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                                                Loading credits…
                                            </td>
                                        </tr>
                                    ) : credits.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                                                No bonus credits for {creditYear}
                                            </td>
                                        </tr>
                                    ) : (
                                        credits.map((c) => (
                                            <tr key={c.id} className="border-t">
                                                <td className="px-3 py-2">
                                                    {c.user_name}
                                                    {c.employee_id ? (
                                                        <span className="text-muted-foreground"> ({c.employee_id})</span>
                                                    ) : null}
                                                </td>
                                                <td className="px-3 py-2 font-medium">+{c.days}</td>
                                                <td className="px-3 py-2">{c.reason}</td>
                                                <td className="px-3 py-2 text-muted-foreground">
                                                    {c.work_date || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-muted-foreground text-xs">
                                                    {c.created_at?.slice(0, 10) ?? '—'}
                                                    {c.created_by_name ? ` · ${c.created_by_name}` : ''}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => void revokeCredit(c.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <div>
                    <Heading
                        title="Leave Types"
                        description="Configure how each leave type affects payroll and whether it counts toward the annual quota."
                    />
                </div>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                    <div className="space-y-6">
                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Name</th>
                                        <th className="px-3 py-2 text-left font-medium">Slug</th>
                                        <th className="px-3 py-2 text-left font-medium">Payroll effect</th>
                                        <th className="px-3 py-2 text-left font-medium">Annual quota</th>
                                        <th className="px-3 py-2 text-left font-medium">Active</th>
                                        <th className="px-3 py-2 text-right font-medium">Save</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item) => (
                                        <LeaveTypeRow
                                            key={item.id}
                                            item={item}
                                            saving={saving === item.id}
                                            onSave={(patch) => void updateItem(item, patch)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                            <h3 className="font-semibold text-sm">Add leave type</h3>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                    <Label>Name</Label>
                                    <Input
                                        value={draft.name}
                                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                        placeholder="e.g. Comp Off"
                                    />
                                </div>
                                <div>
                                    <Label>Slug (optional)</Label>
                                    <Input
                                        value={draft.slug}
                                        onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                                        placeholder="auto from name"
                                    />
                                </div>
                                <div>
                                    <Label>Payroll effect</Label>
                                    <Select
                                        value={draft.payment_type}
                                        onValueChange={(v) =>
                                            setDraft({ ...draft, payment_type: v as LeaveType['payment_type'] })
                                        }
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="paid">Paid (no LOP)</SelectItem>
                                            <SelectItem value="unpaid">Unpaid (full LOP)</SelectItem>
                                            <SelectItem value="half_day">Half-day (50% LOP)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <label className="flex items-center gap-2 pt-6 text-sm">
                                    <Checkbox
                                        checked={draft.counts_toward_quota}
                                        onCheckedChange={(v) =>
                                            setDraft({ ...draft, counts_toward_quota: !!v })
                                        }
                                    />
                                    Counts toward annual leave quota
                                </label>
                            </div>
                            <Button size="sm" onClick={() => void addItem()} disabled={saving === 'new'}>
                                <Plus className="mr-1 h-4 w-4" />
                                {saving === 'new' ? 'Adding…' : 'Add type'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function LeaveTypeRow({
    item,
    saving,
    onSave,
}: {
    item: LeaveType;
    saving: boolean;
    onSave: (patch: Partial<LeaveType>) => void;
}) {
    const [name, setName] = useState(item.name);
    const [paymentType, setPaymentType] = useState(item.payment_type);
    const [quota, setQuota] = useState(item.counts_toward_quota);
    const [active, setActive] = useState(item.is_active);

    useEffect(() => {
        setName(item.name);
        setPaymentType(item.payment_type);
        setQuota(item.counts_toward_quota);
        setActive(item.is_active);
    }, [item]);

    return (
        <tr className="border-t">
            <td className="px-3 py-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            </td>
            <td className="px-3 py-2 text-muted-foreground">{item.slug}</td>
            <td className="px-3 py-2">
                <Select value={paymentType} onValueChange={(v) => setPaymentType(v as LeaveType['payment_type'])}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="unpaid">Unpaid (LOP)</SelectItem>
                        <SelectItem value="half_day">Half-day</SelectItem>
                    </SelectContent>
                </Select>
            </td>
            <td className="px-3 py-2">
                <Checkbox checked={quota} onCheckedChange={(v) => setQuota(!!v)} />
            </td>
            <td className="px-3 py-2">
                <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} />
            </td>
            <td className="px-3 py-2 text-right">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                        onSave({
                            name,
                            payment_type: paymentType,
                            counts_toward_quota: quota,
                            is_active: active,
                        })
                    }
                >
                    <Save className="h-3 w-3" />
                </Button>
            </td>
        </tr>
    );
}
