import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    platformDelete,
    platformGet,
    platformPatch,
    platformPost,
} from '@/lib/platform-api';
import { defaultAdminRoute, redirectToTenantImpersonation } from '@/lib/app-urls';
import { PlatformAlertDialog, PlatformConfirmDialog } from '@/components/platform-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface OrganizationRow {
    id: number;
    name: string;
    slug: string;
    status: string;
    plan: string;
    email: string;
    phone: string;
    user_count: number;
    created_at?: string;
}

export interface OrganizationDetail extends OrganizationRow {
    country?: string | null;
    timezone?: string | null;
    updated_at?: string;
    plan_started_at?: string | null;
    plan_expires_at?: string | null;
    billing_period?: string;
    days_remaining?: number | null;
    subscription_expired?: boolean;
    admin_name?: string | null;
    admin_email?: string | null;
    admin_phone?: string | null;
    company_email?: string | null;
    company_phone?: string | null;
}

interface OrganizationsPanelProps {
    compact?: boolean;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-border/60 py-2.5 last:border-0">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium text-[#001f3f]">{value?.trim() || '—'}</dd>
        </div>
    );
}

function OrganizationDetailModal({
    orgId,
    onClose,
}: {
    orgId: number;
    onClose: () => void;
}) {
    const [detail, setDetail] = useState<OrganizationDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [impersonating, setImpersonating] = useState(false);

    useEffect(() => {
        platformGet<OrganizationDetail>(`/organizations/${orgId}`)
            .then((res) => setDetail(res.data))
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load details'),
            )
            .finally(() => setLoading(false));
    }, [orgId]);

    async function enterWorkspace() {
        if (!detail) return;
        setImpersonating(true);
        try {
            const res = await platformPost<{
                token: string;
                refresh_token?: string;
                permissions: string[];
            }>(`/organizations/${detail.id}/impersonate`, {});

            const perms = res.data.permissions ?? ['*'];
            const has = (slug: string) => perms.includes('*') || perms.includes(slug);

            redirectToTenantImpersonation({
                token: res.data.token,
                refreshToken: res.data.refresh_token,
                orgSlug: detail.slug,
                orgName: detail.name,
                next: defaultAdminRoute(has),
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Impersonation failed');
            setImpersonating(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-black/50"
                aria-label="Close"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/80 bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-[#001f3f]">Organization details</h3>
                        <p className="text-sm text-muted-foreground">Full tenant profile and admin contact.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {loading && <p className="text-muted-foreground">Loading details...</p>}
                {error && <p className="text-sm text-red-600">{error}</p>}

                {detail && (
                    <>
                        <dl>
                            <DetailRow label="Name" value={detail.name} />
                            <DetailRow label="Email" value={detail.email} />
                            <DetailRow label="Phone no" value={detail.phone} />
                            <DetailRow label="Plan" value={detail.plan} />
                            <DetailRow label="Status" value={detail.status} />
                            <DetailRow label="Users" value={String(detail.user_count)} />
                            <DetailRow label="Slug" value={detail.slug} />
                            <DetailRow label="Country" value={detail.country} />
                            <DetailRow label="Timezone" value={detail.timezone} />
                            <DetailRow label="Admin name" value={detail.admin_name} />
                            <DetailRow label="Admin email" value={detail.admin_email} />
                            <DetailRow label="Admin phone" value={detail.admin_phone} />
                            <DetailRow label="Created" value={detail.created_at} />
                            <DetailRow label="Updated" value={detail.updated_at} />
                        </dl>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={onClose}>
                                Close
                            </Button>
                            <Button
                                disabled={impersonating || detail.status === 'suspended'}
                                onClick={enterWorkspace}
                            >
                                {impersonating ? 'Opening...' : 'Enter workspace'}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function ActionMenu({
    org,
    onToggleStatus,
    onDelete,
    onViewDetail,
}: {
    org: OrganizationRow;
    onToggleStatus: (org: OrganizationRow) => void;
    onDelete: (org: OrganizationRow) => void;
    onViewDetail: (org: OrganizationRow) => void;
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        if (!open || !buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const menuWidth = 180;
        const menuHeight = 132;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight + 12;

        setMenuStyle({
            position: 'fixed',
            left: Math.max(8, rect.right - menuWidth),
            top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
            width: menuWidth,
            zIndex: 9999,
        });
    }, [open]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            setOpen(false);
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <>
            <div ref={buttonRef} className="inline-flex">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setOpen((v) => !v)}
                    aria-label="Actions"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </div>
            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        style={menuStyle}
                        className="overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg"
                    >
                        <button
                            type="button"
                            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-secondary"
                            onClick={() => {
                                setOpen(false);
                                onViewDetail(org);
                            }}
                        >
                            View full detail
                        </button>
                        <button
                            type="button"
                            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-secondary"
                            onClick={() => {
                                setOpen(false);
                                onToggleStatus(org);
                            }}
                        >
                            {org.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                            type="button"
                            className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                            onClick={() => {
                                setOpen(false);
                                onDelete(org);
                            }}
                        >
                            Delete
                        </button>
                    </div>,
                    document.body,
                )}
        </>
    );
}

interface SubscriptionPlanOption {
    id: number;
    slug: string;
    name: string;
    is_active?: boolean;
}

export function OrganizationsPanel({ compact = false }: OrganizationsPanelProps) {
    const navigate = useNavigate();
    const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
    const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [detailOrgId, setDetailOrgId] = useState<number | null>(null);
    const [alertDialog, setAlertDialog] = useState<{ title?: string; message: string } | null>(null);
    const [orgToDelete, setOrgToDelete] = useState<OrganizationRow | null>(null);
    const [deletingOrg, setDeletingOrg] = useState(false);

    function showError(message: string) {
        setAlertDialog({ title: 'Error', message });
    }

    const [form, setForm] = useState({
        name: '',
        slug: '',
        plan: 'trial',
        admin_name: '',
        admin_email: '',
        admin_password: '',
    });

    async function load() {
        setLoading(true);
        try {
            const [orgRes, planRes] = await Promise.all([
                platformGet<OrganizationRow[]>('/organizations'),
                platformGet<SubscriptionPlanOption[]>('/plans'),
            ]);
            setOrgs(orgRes.data);
            setPlans((planRes.data ?? []).filter((p) => p.is_active !== false));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load organizations');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        try {
            await platformPost('/organizations', form);
            setShowCreate(false);
            setForm({
                name: '',
                slug: '',
                plan: 'trial',
                admin_name: '',
                admin_email: '',
                admin_password: '',
            });
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Create failed');
        }
    }

    async function toggleStatus(org: OrganizationRow) {
        const next = org.status === 'active' ? 'suspended' : 'active';
        try {
            await platformPatch(`/organizations/${org.id}`, { status: next });
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Update failed');
        }
    }

    function requestDeleteOrg(org: OrganizationRow) {
        setOrgToDelete(org);
    }

    async function handleConfirmDeleteOrg() {
        if (!orgToDelete) return;
        setDeletingOrg(true);
        try {
            await platformDelete(`/organizations/${orgToDelete.id}`);
            setOrgToDelete(null);
            await load();
        } catch (err: unknown) {
            showError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeletingOrg(false);
        }
    }

    if (loading) {
        return <p className="text-muted-foreground">Loading organizations...</p>;
    }

    return (
        <div className="space-y-4">
            {!compact && (
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-[#001f3f]">Organizations</h2>
                        <p className="text-sm text-muted-foreground">
                            Manage tenants, plans, and access customer workspaces.
                        </p>
                    </div>
                    <Button onClick={() => setShowCreate((v) => !v)}>
                        {showCreate ? 'Cancel' : 'New organization'}
                    </Button>
                </div>
            )}

            {compact && (
                <div className="flex justify-end">
                    <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
                        {showCreate ? 'Cancel' : 'New organization'}
                    </Button>
                </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {showCreate && (
                <form
                    onSubmit={handleCreate}
                    className="space-y-4 rounded-2xl border border-white/80 bg-white/80 p-6 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md"
                >
                    <h3 className="font-semibold text-[#001f3f]">Create organization</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Company name</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Slug</Label>
                            <Input
                                value={form.slug}
                                onChange={(e) =>
                                    setForm({ ...form, slug: e.target.value.toLowerCase() })
                                }
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Subscription plan</Label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={form.plan}
                                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                                required
                            >
                                {(plans.length > 0 ? plans : [{ slug: 'trial', name: 'Trial' } as SubscriptionPlanOption]).map((plan) => (
                                    <option key={plan.slug} value={plan.slug}>
                                        {plan.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Admin name</Label>
                            <Input
                                value={form.admin_name}
                                onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Admin email</Label>
                            <Input
                                type="email"
                                value={form.admin_email}
                                onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Admin password</Label>
                            <Input
                                type="password"
                                value={form.admin_password}
                                onChange={(e) =>
                                    setForm({ ...form, admin_password: e.target.value })
                                }
                                required
                                minLength={8}
                            />
                        </div>
                    </div>
                    <Button type="submit">Create</Button>
                </form>
            )}

            <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-secondary/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Email</th>
                            <th className="px-4 py-3 font-medium">Phone no</th>
                            <th className="px-4 py-3 font-medium">Plan</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Users</th>
                            <th className="px-4 py-3 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orgs.map((org) => (
                            <tr key={org.id} className="border-b border-border/60 last:border-0">
                                <td className="px-4 py-3 font-medium text-[#001f3f]">{org.name}</td>
                                <td className="px-4 py-3 text-muted-foreground">{org.email || '—'}</td>
                                <td className="px-4 py-3 text-muted-foreground">{org.phone || '—'}</td>
                                <td className="px-4 py-3 capitalize">{org.plan}</td>
                                <td className="px-4 py-3">
                                    <span
                                        className={cn(
                                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                                            org.status === 'active'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-amber-100 text-amber-700',
                                        )}
                                    >
                                        {org.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3">{org.user_count}</td>
                                <td className="px-4 py-3 text-right">
                                    <ActionMenu
                                        org={org}
                                        onToggleStatus={toggleStatus}
                                        onDelete={requestDeleteOrg}
                                        onViewDetail={(item) => navigate(`/tenants/${item.id}`)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {orgs.length === 0 && (
                    <p className="p-6 text-center text-muted-foreground">No organizations yet.</p>
                )}
            </div>

            {detailOrgId !== null && (
                <OrganizationDetailModal
                    orgId={detailOrgId}
                    onClose={() => setDetailOrgId(null)}
                />
            )}

            <PlatformAlertDialog
                open={!!alertDialog}
                title={alertDialog?.title}
                message={alertDialog?.message ?? ''}
                onClose={() => setAlertDialog(null)}
            />

            <PlatformConfirmDialog
                open={!!orgToDelete}
                title="Delete organization"
                message={
                    orgToDelete
                        ? `Delete organization "${orgToDelete.name}"? This cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                destructive
                loading={deletingOrg}
                onConfirm={handleConfirmDeleteOrg}
                onClose={() => !deletingOrg && setOrgToDelete(null)}
            />
        </div>
    );
}
