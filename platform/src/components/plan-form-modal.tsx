import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface TenantModule {
    key: string;
    label: string;
    permission: string;
}

export interface SubscriptionPlan {
    id: number;
    name: string;
    slug: string;
    price_label: string;
    billing_period: string;
    max_users: number;
    modules: string[];
    features: string[];
    is_active: boolean;
    sort_order: number;
    org_count: number;
}

export interface PlanFormValues {
    name: string;
    slug: string;
    price_label: string;
    billing_period: string;
    max_users: number;
    modules: string[];
    featuresText: string;
    is_active: boolean;
    sort_order: number;
}

export const BILLING_PERIOD_OPTIONS = [
    { value: '14 days', label: '14 days (trial)' },
    { value: 'month', label: 'Monthly' },
    { value: '3 months', label: '3 months' },
    { value: '6 months', label: '6 months' },
    { value: 'year', label: 'Yearly' },
    { value: 'custom', label: 'Custom (no expiry)' },
] as const;

export const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

/** Matches backend MODULE_CATALOG — every tenant app module that can be plan-gated. */
export const ALL_TENANT_MODULE_KEYS = [
    'dashboard',
    'users',
    'centers',
    'departments',
    'designations',
    'careers',
    'job_applications',
    'chat',
    'attendance',
    'shifts',
    'biometric',
    'leave',
    'leave_manage',
    'holidays',
    'payroll',
    'my_payslips',
    'workflows',
    'tasks',
    'projects',
    'reports',
    'subscription',
    'notifications',
    'support',
    'settings',
] as const;

export const emptyPlanForm = (): PlanFormValues => ({
    name: '',
    slug: '',
    price_label: 'Free',
    billing_period: 'month',
    max_users: 10,
    modules: [...ALL_TENANT_MODULE_KEYS],
    featuresText: '',
    is_active: true,
    sort_order: 0,
});

export function planToForm(plan: SubscriptionPlan): PlanFormValues {
    return {
        name: plan.name,
        slug: plan.slug,
        price_label: plan.price_label,
        billing_period: plan.billing_period,
        max_users: plan.max_users,
        modules: plan.modules,
        featuresText: plan.features.join('\n'),
        is_active: plan.is_active,
        sort_order: plan.sort_order,
    };
}

export function formToPayload(form: PlanFormValues) {
    return {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        price_label: form.price_label.trim(),
        billing_period: form.billing_period.trim(),
        max_users: form.max_users,
        modules: form.modules,
        features: form.featuresText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        is_active: form.is_active,
        sort_order: form.sort_order,
    };
}

interface PlanFormModalProps {
    title: string;
    initial: PlanFormValues;
    saving?: boolean;
    onClose: () => void;
    onSubmit: (values: PlanFormValues) => void;
}

export function PlanFormModal({
    title,
    initial,
    saving = false,
    onClose,
    onSubmit,
}: PlanFormModalProps) {
    const [form, setForm] = useState<PlanFormValues>(initial);
    const [modules, setModules] = useState<TenantModule[]>([]);

    useEffect(() => {
        platformGet<TenantModule[]>('/plans/modules')
            .then((res) => setModules(res.data))
            .catch(() => setModules([]));
    }, []);

    function toggleModule(key: string) {
        setForm((prev) => ({
            ...prev,
            modules: prev.modules.includes(key)
                ? prev.modules.filter((m) => m !== key)
                : [...prev.modules, key],
        }));
    }

    function selectAllModules() {
        const keys = modules.length > 0 ? modules.map((m) => m.key) : [...ALL_TENANT_MODULE_KEYS];
        setForm((prev) => ({ ...prev, modules: keys }));
    }

    function clearAllModules() {
        setForm((prev) => ({ ...prev, modules: [] }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onSubmit(form);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
            <form
                onSubmit={handleSubmit}
                className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl"
            >
                <div className="flex items-start justify-between border-b border-border px-6 py-4">
                    <div>
                        <h3 className="text-lg font-semibold text-[#001f3f]">{title}</h3>
                        <p className="text-sm text-muted-foreground">
                            Configure pricing, user limits, and tenant app modules.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Plan name</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => {
                                    const name = e.target.value;
                                    setForm((prev) => ({
                                        ...prev,
                                        name,
                                        slug:
                                            prev.slug === '' ||
                                            prev.slug === prev.name.trim().toLowerCase().replace(/\s+/g, '-')
                                                ? name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                                                : prev.slug,
                                    }));
                                }}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Slug</Label>
                            <Input
                                value={form.slug}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''),
                                    }))
                                }
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Price label</Label>
                            <Input
                                value={form.price_label}
                                onChange={(e) => setForm({ ...form, price_label: e.target.value })}
                                placeholder="₹2,999 or Free"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Billing period</Label>
                            <select
                                className={selectClassName}
                                value={
                                    BILLING_PERIOD_OPTIONS.some((o) => o.value === form.billing_period)
                                        ? form.billing_period
                                        : 'custom'
                                }
                                onChange={(e) =>
                                    setForm({ ...form, billing_period: e.target.value })
                                }
                                required
                            >
                                {BILLING_PERIOD_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Controls how long an organization subscription lasts after plan assignment.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Max users (0 = unlimited)</Label>
                            <Input
                                type="number"
                                min={0}
                                value={form.max_users}
                                onChange={(e) =>
                                    setForm({ ...form, max_users: Number(e.target.value) || 0 })
                                }
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Sort order</Label>
                            <Input
                                type="number"
                                value={form.sort_order}
                                onChange={(e) =>
                                    setForm({ ...form, sort_order: Number(e.target.value) || 0 })
                                }
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label>Tenant app modules</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={selectAllModules}
                                >
                                    Select all
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={clearAllModules}
                                >
                                    Clear all
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {modules.map((module) => (
                                <label
                                    key={module.key}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.modules.includes(module.key)}
                                        onChange={() => toggleModule(module.key)}
                                    />
                                    {module.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Marketing features (one per line)</Label>
                        <textarea
                            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={form.featuresText}
                            onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
                            placeholder={'Up to 50 users\nAttendance & leave\nBiometric sync'}
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        />
                        Plan is active and available for assignment
                    </label>
                </div>

                <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving...' : 'Save plan'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
