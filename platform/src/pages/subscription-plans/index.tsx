import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import {
    platformDelete,
    platformGet,
    platformPatch,
    platformPost,
} from '@/lib/platform-api';
import {
    emptyPlanForm,
    formToPayload,
    PlanFormModal,
    planToForm,
    type PlanFormValues,
    type SubscriptionPlan,
    selectClassName,
} from '@/components/plan-form-modal';
import { PlatformAlertDialog, PlatformConfirmDialog } from '@/components/platform-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OrganizationRow {
    id: number;
    name: string;
    slug: string;
    plan: string;
    status: string;
    plan_started_at?: string | null;
    plan_expires_at?: string | null;
    billing_period?: string;
    days_remaining?: number | null;
    subscription_expired?: boolean;
}

function formatSubscriptionEnd(org: OrganizationRow) {
    if (!org.plan_expires_at) return 'No expiry';
    const parsed = new Date(org.plan_expires_at.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return org.plan_expires_at;
    return parsed.toLocaleDateString();
}

function formatPeriodRemaining(org: OrganizationRow) {
    if (!org.plan_expires_at) {
        return org.billing_period === 'custom' ? 'No expiry' : '—';
    }
    if (org.subscription_expired) {
        return 'Expired';
    }
    const days = org.days_remaining;
    if (days == null) return '—';
    if (days === 0) return 'Expires today';
    return `${days} day${days === 1 ? '' : 's'} left`;
}

function periodRemainingClass(org: OrganizationRow) {
    if (org.subscription_expired) return 'font-medium text-red-600';
    if (!org.plan_expires_at) return 'text-muted-foreground';
    const days = org.days_remaining;
    if (days != null && days <= 7) return 'font-medium text-amber-600';
    return 'font-medium text-[#001f3f]';
}

function subscriptionBadge(org: OrganizationRow) {
    if (!org.plan_expires_at || org.subscription_expired) {
        if (org.subscription_expired) {
            return <span className="text-xs font-medium text-red-600">Subscription expired</span>;
        }
        return null;
    }
    const days = org.days_remaining;
    if (days != null && days <= 7) {
        return (
            <span className="text-xs font-medium text-amber-600">
                Renew soon
            </span>
        );
    }
    return null;
}

export default function PlatformSubscriptionPlans() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [savingPlan, setSavingPlan] = useState(false);
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; plan?: SubscriptionPlan } | null>(
        null,
    );
    const [alertDialog, setAlertDialog] = useState<{ title?: string; message: string } | null>(null);
    const [planToDelete, setPlanToDelete] = useState<SubscriptionPlan | null>(null);
    const [deletingPlan, setDeletingPlan] = useState(false);
    const [orgToRenew, setOrgToRenew] = useState<OrganizationRow | null>(null);
    const [renewingOrg, setRenewingOrg] = useState(false);

    function showError(message: string) {
        setAlertDialog({ title: 'Error', message });
    }

    async function load() {
        setLoading(true);
        try {
            const [plansRes, orgsRes] = await Promise.all([
                platformGet<SubscriptionPlan[]>('/plans'),
                platformGet<OrganizationRow[]>('/organizations'),
            ]);
            setPlans(plansRes.data);
            setOrgs(orgsRes.data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load plans');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    const activePlans = useMemo(
        () => plans.filter((plan) => plan.is_active),
        [plans],
    );

    async function assignPlan(orgId: number, planSlug: string) {
        setUpdatingId(orgId);
        try {
            await platformPatch(`/organizations/${orgId}`, { plan: planSlug });
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Failed to update plan');
        } finally {
            setUpdatingId(null);
        }
    }

    function requestRenewOrg(org: OrganizationRow) {
        setOrgToRenew(org);
    }

    async function handleConfirmRenewOrg() {
        if (!orgToRenew) return;
        setRenewingOrg(true);
        try {
            await platformPatch(`/organizations/${orgToRenew.id}`, {
                plan: orgToRenew.plan,
                renew_subscription: true,
            });
            setOrgToRenew(null);
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Failed to renew subscription');
        } finally {
            setRenewingOrg(false);
        }
    }

    async function savePlan(values: PlanFormValues) {
        setSavingPlan(true);
        try {
            const payload = formToPayload(values);
            if (modal?.mode === 'edit' && modal.plan) {
                await platformPatch(`/plans/${modal.plan.id}`, payload);
            } else {
                await platformPost('/plans', payload);
            }
            setModal(null);
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Failed to save plan');
        } finally {
            setSavingPlan(false);
        }
    }

    function requestDeletePlan(plan: SubscriptionPlan) {
        if (plan.org_count > 0) {
            setAlertDialog({
                title: 'Cannot delete plan',
                message: `"${plan.name}" is assigned to ${plan.org_count} organization(s). Reassign them to another plan first, then try again.`,
            });
            return;
        }
        setPlanToDelete(plan);
    }

    async function handleConfirmDeletePlan() {
        if (!planToDelete) return;
        setDeletingPlan(true);
        try {
            await platformDelete(`/plans/${planToDelete.id}`);
            setPlanToDelete(null);
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Failed to delete plan');
        } finally {
            setDeletingPlan(false);
        }
    }

    function formatUserLimit(maxUsers: number) {
        return maxUsers <= 0 ? 'Unlimited users' : `Up to ${maxUsers} users`;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Subscription plan</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Create plans, set user limits, choose tenant modules, and assign organizations.
                    </p>
                </div>
                <Button onClick={() => setModal({ mode: 'create' })}>
                    <Plus className="h-4 w-4" />
                    Add plan
                </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading && <p className="text-muted-foreground">Loading plans...</p>}

            {!loading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className={cn(
                                'rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md',
                                !plan.is_active && 'opacity-70',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    {plan.name}
                                </p>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0"
                                        onClick={() => setModal({ mode: 'edit', plan })}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                        onClick={() => requestDeletePlan(plan)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <p className="mt-2 text-2xl font-bold text-[#001f3f]">
                                {plan.price_label}
                                <span className="text-sm font-normal text-muted-foreground">
                                    {plan.billing_period ? ` / ${plan.billing_period}` : ''}
                                </span>
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">{formatUserLimit(plan.max_users)}</p>
                            <p className="text-sm text-muted-foreground">
                                {plan.org_count} organization{plan.org_count === 1 ? '' : 's'}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {plan.modules.length} module{plan.modules.length === 1 ? '' : 's'} enabled
                            </p>
                            <ul className="mt-4 space-y-2">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2 text-sm">
                                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <div className="border-b border-border px-4 py-3">
                    <h2 className="font-semibold text-[#001f3f]">Organization subscriptions</h2>
                </div>
                {!loading && (
                    <table className="w-full table-fixed text-left text-sm">
                        <colgroup>
                            <col className="w-[16%]" />
                            <col className="w-[10%]" />
                            <col className="w-[10%]" />
                            <col className="w-[12%]" />
                            <col className="w-[10%]" />
                            <col className="w-[22%]" />
                        </colgroup>
                        <thead className="border-b border-border bg-secondary/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 font-medium">Organization</th>
                                <th className="px-4 py-3 font-medium">Current plan</th>
                                <th className="px-4 py-3 font-medium">Days left</th>
                                <th className="px-4 py-3 font-medium">Expires</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Change plan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orgs.map((org) => (
                                <tr key={org.id} className="border-b border-border/60 last:border-0">
                                    <td className="px-4 py-3 font-medium text-[#001f3f]">{org.name}</td>
                                    <td className="px-4 py-3 capitalize">{org.plan}</td>
                                    <td className="px-4 py-3">
                                        <div className={periodRemainingClass(org)}>
                                            {formatPeriodRemaining(org)}
                                        </div>
                                        {org.billing_period && org.plan_expires_at && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {org.billing_period} plan
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {formatSubscriptionEnd(org)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <span
                                                className={cn(
                                                    'inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                                                    org.status === 'active'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-amber-100 text-amber-700',
                                                )}
                                            >
                                                {org.status}
                                            </span>
                                            {subscriptionBadge(org)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex max-w-xs items-center gap-2">
                                            <select
                                                className={selectClassName}
                                                value={org.plan.toLowerCase()}
                                                disabled={updatingId === org.id}
                                                onChange={(e) => assignPlan(org.id, e.target.value)}
                                            >
                                                {!activePlans.some(
                                                    (p) =>
                                                        p.slug.toLowerCase() === org.plan.toLowerCase(),
                                                ) && (
                                                    <option value={org.plan}>{org.plan}</option>
                                                )}
                                                {activePlans.map((plan) => (
                                                    <option key={plan.id} value={plan.slug}>
                                                        {plan.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="shrink-0"
                                                disabled={updatingId === org.id}
                                                onClick={() => requestRenewOrg(org)}
                                                title="Renew current plan period"
                                            >
                                                Renew
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {modal && (
                <PlanFormModal
                    title={modal.mode === 'create' ? 'Add subscription plan' : 'Edit subscription plan'}
                    initial={
                        modal.mode === 'edit' && modal.plan
                            ? planToForm(modal.plan)
                            : emptyPlanForm()
                    }
                    saving={savingPlan}
                    onClose={() => setModal(null)}
                    onSubmit={savePlan}
                />
            )}

            <PlatformAlertDialog
                open={!!alertDialog}
                title={alertDialog?.title}
                message={alertDialog?.message ?? ''}
                onClose={() => setAlertDialog(null)}
            />

            <PlatformConfirmDialog
                open={!!orgToRenew}
                title="Renew subscription"
                message={
                    orgToRenew
                        ? `Add ${orgToRenew.billing_period ?? 'one billing period'} to ${orgToRenew.name}'s current "${orgToRenew.plan}" subscription? Remaining days will be extended from the current expiry date.`
                        : ''
                }
                confirmLabel="Submit"
                cancelLabel="Cancel"
                loading={renewingOrg}
                onConfirm={handleConfirmRenewOrg}
                onClose={() => !renewingOrg && setOrgToRenew(null)}
            />

            <PlatformConfirmDialog
                open={!!planToDelete}
                title="Delete plan"
                message={
                    planToDelete
                        ? `Delete plan "${planToDelete.name}"? This cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                destructive
                loading={deletingPlan}
                onConfirm={handleConfirmDeletePlan}
                onClose={() => !deletingPlan && setPlanToDelete(null)}
            />
        </div>
    );
}
