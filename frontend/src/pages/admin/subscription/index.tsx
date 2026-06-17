import { useEffect, useState } from 'react';
import { Check, TrendingUp } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet, apiPost } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface PlanOption {
    slug: string;
    name: string;
    price_label: string;
    billing_period: string;
    max_users: number;
    features: string[];
}

interface UpgradeRequest {
    id: number;
    requested_plan: string;
    current_plan: string;
    status: string;
    note: string | null;
    review_note: string | null;
    created_at: string | null;
    updated_at: string | null;
}

const breadcrumbs = [{ label: 'Subscription' }];

const STATUS_STYLE: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
};

export default function SubscriptionPage() {
    const { plan } = useAuth();
    const [plans, setPlans] = useState<PlanOption[]>([]);
    const [request, setRequest] = useState<UpgradeRequest | null>(null);
    const [selectedPlan, setSelectedPlan] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const currentSlug = plan?.slug?.toLowerCase() ?? '';
    const hasPending = request?.status === 'pending';

    function load() {
        setLoading(true);
        Promise.all([
            apiGet<PlanOption[]>('/admin/billing/plans'),
            apiGet<UpgradeRequest | null>('/admin/billing/upgrade-request'),
        ])
            .then(([plansRes, reqRes]) => {
                setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
                setRequest(reqRes.data && typeof reqRes.data === 'object' ? reqRes.data : null);
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to load subscription data');
            })
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        load();
    }, []);

    async function submitRequest() {
        if (!selectedPlan) {
            showToast({ type: 'warning', message: 'Select a plan to request.' });
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await apiPost('/admin/billing/upgrade-request', {
                requested_plan: selectedPlan,
                note: note.trim() || undefined,
            });
            showToast({ type: 'success', message: 'Upgrade request submitted. Our team will review it shortly.' });
            setNote('');
            setSelectedPlan('');
            load();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to submit request';
            setError(msg);
            showToast({ type: 'error', message: msg });
        } finally {
            setSubmitting(false);
        }
    }

    const upgradeOptions = plans.filter((p) => p.slug.toLowerCase() !== currentSlug);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] px-6 py-5 shadow-sm dark:border-white/10 dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220]">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#071b3a]/20 bg-[#071b3a]/15 shadow-inner dark:border-white/10 dark:bg-white/10">
                            <TrendingUp className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                Subscription & upgrades
                            </h1>
                            <p className="mt-1 text-sm text-[#1e3a5f]/60 dark:text-blue-200/60">
                                View your current plan and request a change
                            </p>
                        </div>
                    </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                {plan && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Current plan</CardTitle>
                            <CardDescription>Your organization&apos;s active subscription</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-lg font-semibold">{plan.name}</span>
                                {plan.subscription_expired ? (
                                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                                        Expired
                                    </span>
                                ) : (
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                        Active
                                    </span>
                                )}
                                {plan.days_remaining != null && plan.days_remaining <= 7 && !plan.subscription_expired && (
                                    <span className="text-sm text-amber-700">
                                        {plan.days_remaining} day{plan.days_remaining === 1 ? '' : 's'} remaining
                                    </span>
                                )}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Up to {plan.max_users} users · {plan.modules?.length ?? 0} modules included
                            </p>
                        </CardContent>
                    </Card>
                )}

                {request && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Latest upgrade request</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <span>
                                    {request.current_plan} → <strong>{request.requested_plan}</strong>
                                </span>
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[request.status] ?? 'bg-muted text-muted-foreground'}`}
                                >
                                    {request.status}
                                </span>
                            </div>
                            {request.note && (
                                <p className="text-muted-foreground">
                                    <span className="font-medium text-foreground">Your note:</span> {request.note}
                                </p>
                            )}
                            {request.review_note && (
                                <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">
                                    <span className="font-medium text-foreground">Platform response:</span>{' '}
                                    {request.review_note}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">Submitted {request.created_at}</p>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Request a plan change</CardTitle>
                        <CardDescription>
                            {hasPending
                                ? 'You already have a pending request. Wait for review before submitting another.'
                                : 'Choose a plan and submit a request. Platform admins will approve and invoice you.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loading ? (
                            <p className="text-sm text-muted-foreground">Loading plans…</p>
                        ) : (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {upgradeOptions.map((p) => (
                                        <button
                                            key={p.slug}
                                            type="button"
                                            disabled={hasPending}
                                            onClick={() => setSelectedPlan(p.slug)}
                                            className={`rounded-xl border p-4 text-left transition-all ${
                                                selectedPlan === p.slug
                                                    ? 'border-primary ring-2 ring-primary/20'
                                                    : 'border-border hover:border-primary/40'
                                            } ${hasPending ? 'cursor-not-allowed opacity-60' : ''}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="font-semibold">{p.name}</p>
                                                    <p className="mt-0.5 text-sm text-primary">{p.price_label}</p>
                                                </div>
                                                {selectedPlan === p.slug && (
                                                    <Check className="h-5 w-5 shrink-0 text-primary" />
                                                )}
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Up to {p.max_users} users · billed {p.billing_period}
                                            </p>
                                            {p.features.length > 0 && (
                                                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                                    {p.features.slice(0, 4).map((f) => (
                                                        <li key={f}>• {f}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {upgradeOptions.length === 0 && !loading && (
                                    <p className="text-sm text-muted-foreground">
                                        No other plans available to switch to right now.
                                    </p>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="upgrade-plan">Or select from list</Label>
                                    <Select
                                        value={selectedPlan}
                                        onValueChange={setSelectedPlan}
                                        disabled={hasPending}
                                    >
                                        <SelectTrigger id="upgrade-plan">
                                            <SelectValue placeholder="Choose a plan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {upgradeOptions.map((p) => (
                                                <SelectItem key={p.slug} value={p.slug}>
                                                    {p.name} — {p.price_label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="upgrade-note">Note (optional)</Label>
                                    <Textarea
                                        id="upgrade-note"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        rows={3}
                                        placeholder="Tell us why you want to upgrade or any billing questions…"
                                        disabled={hasPending}
                                    />
                                </div>

                                <Button
                                    onClick={submitRequest}
                                    disabled={submitting || hasPending || !selectedPlan}
                                >
                                    {submitting ? 'Submitting…' : 'Submit upgrade request'}
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
