import { useEffect, useState } from 'react';
import { Plus, Shield, ShieldOff, KeyRound, Trash2 } from 'lucide-react';
import {
    platformDelete,
    platformGet,
    platformPatch,
    platformPost,
} from '@/lib/platform-api';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PlatformAlertDialog, PlatformConfirmDialog } from '@/components/platform-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface TeamAdmin {
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    totp_enabled: boolean;
    last_login_at: string | null;
}

const ROLE_OPTIONS = ['owner', 'admin', 'support', 'read_only'] as const;

function roleBadge(role: string) {
    const tones: Record<string, string> = {
        owner: 'bg-amber-100 text-amber-800',
        admin: 'bg-blue-100 text-blue-700',
        support: 'bg-emerald-100 text-emerald-700',
        read_only: 'bg-slate-100 text-slate-700',
    };
    return tones[role] || 'bg-slate-100 text-slate-700';
}

export default function PlatformTeam() {
    const { admin: currentAdmin, hasRole } = usePlatformAuth();
    const [team, setTeam] = useState<TeamAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: 'admin' as (typeof ROLE_OPTIONS)[number],
    });
    const [alert, setAlert] = useState<{ title?: string; message: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<TeamAdmin | null>(null);
    const [resetTarget, setResetTarget] = useState<TeamAdmin | null>(null);
    const [resetPassword, setResetPassword] = useState('');
    const [busy, setBusy] = useState(false);

    const isOwner = hasRole('owner');

    async function load() {
        setLoading(true);
        try {
            const res = await platformGet<TeamAdmin[]>('/team');
            setTeam(res.data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load team');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        try {
            await platformPost('/team', form);
            setShowCreate(false);
            setForm({ name: '', email: '', password: '', role: 'admin' });
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Create failed',
                message: err instanceof Error ? err.message : 'Failed to create admin',
            });
        } finally {
            setBusy(false);
        }
    }

    async function changeRole(adminId: number, role: string) {
        try {
            await platformPatch(`/team/${adminId}`, { role });
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Update failed',
                message: err instanceof Error ? err.message : 'Failed to update',
            });
        }
    }

    async function toggleActive(adminId: number, current: boolean) {
        try {
            await platformPatch(`/team/${adminId}`, { is_active: !current });
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Update failed',
                message: err instanceof Error ? err.message : 'Failed to update',
            });
        }
    }

    async function handleDelete() {
        if (!confirmDelete) return;
        setBusy(true);
        try {
            await platformDelete(`/team/${confirmDelete.id}`);
            setConfirmDelete(null);
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Delete failed',
                message: err instanceof Error ? err.message : 'Failed to delete',
            });
        } finally {
            setBusy(false);
        }
    }

    async function handleResetPassword() {
        if (!resetTarget) return;
        if (resetPassword.length < 12) {
            setAlert({ title: 'Validation', message: 'Password must be at least 12 characters' });
            return;
        }
        setBusy(true);
        try {
            await platformPost(`/team/${resetTarget.id}/reset-password`, {
                new_password: resetPassword,
            });
            setResetTarget(null);
            setResetPassword('');
            await load();
            setAlert({ title: 'Password reset', message: 'New password set; the admin has been signed out everywhere.' });
        } catch (err: unknown) {
            setAlert({
                title: 'Reset failed',
                message: err instanceof Error ? err.message : 'Failed to reset password',
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Platform team</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Add platform admins, set their role, and disable accounts. Owners can manage everything; admins can mutate orgs/plans; support can drill into tenants; read_only can only view.
                    </p>
                </div>
                {isOwner && (
                    <Button onClick={() => setShowCreate((v) => !v)}>
                        <Plus className="h-4 w-4" />
                        {showCreate ? 'Cancel' : 'Add admin'}
                    </Button>
                )}
            </div>

            {!isOwner && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Only owners can add or modify platform admins. You have read-only access here.
                </p>
            )}

            {showCreate && isOwner && (
                <form
                    onSubmit={handleCreate}
                    className="grid gap-4 rounded-2xl border border-white/80 bg-white/80 p-6 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md md:grid-cols-2"
                >
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Role</Label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={form.role}
                            onChange={(e) =>
                                setForm({ ...form, role: e.target.value as (typeof ROLE_OPTIONS)[number] })
                            }
                        >
                            {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Initial password (min 12 chars)</Label>
                        <Input
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            required
                            minLength={12}
                        />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button type="submit" disabled={busy}>
                            {busy ? 'Creating…' : 'Create admin'}
                        </Button>
                    </div>
                </form>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-secondary/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Email</th>
                            <th className="px-4 py-3 font-medium">Role</th>
                            <th className="px-4 py-3 font-medium">2FA</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Last login</th>
                            <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                                    Loading…
                                </td>
                            </tr>
                        )}
                        {team.map((a) => {
                            const isSelf = currentAdmin?.id === a.id;
                            return (
                                <tr key={a.id} className="border-b border-border/60 last:border-0">
                                    <td className="px-4 py-3 font-medium text-[#001f3f]">
                                        {a.name}
                                        {isSelf && (
                                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                                you
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                                    <td className="px-4 py-3">
                                        {isOwner && !isSelf ? (
                                            <select
                                                className={cn(
                                                    'h-8 rounded-md border border-input bg-background px-2 text-xs',
                                                )}
                                                value={a.role}
                                                onChange={(e) => changeRole(a.id, e.target.value)}
                                            >
                                                {ROLE_OPTIONS.map((r) => (
                                                    <option key={r} value={r}>
                                                        {r}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span
                                                className={cn(
                                                    'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                                                    roleBadge(a.role),
                                                )}
                                            >
                                                {a.role}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {a.totp_enabled ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                                                <Shield className="h-3 w-3" /> on
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                                                <ShieldOff className="h-3 w-3" /> off
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={cn(
                                                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                                                a.is_active
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-red-100 text-red-700',
                                            )}
                                        >
                                            {a.is_active ? 'active' : 'disabled'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {a.last_login_at || 'never'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {isOwner && (
                                            <div className="flex justify-end gap-1">
                                                {!isSelf && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs"
                                                        onClick={() => toggleActive(a.id, a.is_active)}
                                                    >
                                                        {a.is_active ? 'Disable' : 'Enable'}
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => {
                                                        setResetTarget(a);
                                                        setResetPassword('');
                                                    }}
                                                    title="Reset password"
                                                >
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                </Button>
                                                {!isSelf && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                        onClick={() => setConfirmDelete(a)}
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <PlatformAlertDialog
                open={!!alert}
                title={alert?.title}
                message={alert?.message ?? ''}
                onClose={() => setAlert(null)}
            />

            <PlatformConfirmDialog
                open={!!confirmDelete}
                title="Delete platform admin"
                message={
                    confirmDelete
                        ? `Permanently delete ${confirmDelete.email}? This cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                destructive
                loading={busy}
                onConfirm={handleDelete}
                onClose={() => !busy && setConfirmDelete(null)}
            />

            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Close"
                        className="absolute inset-0 bg-black/50"
                        onClick={() => !busy && setResetTarget(null)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/80 bg-white p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-[#001f3f]">Reset password</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Set a new password for {resetTarget.email}. They will be signed out from all sessions.
                        </p>
                        <div className="mt-4 space-y-2">
                            <Label>New password</Label>
                            <Input
                                type="password"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                minLength={12}
                                placeholder="at least 12 characters"
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button onClick={handleResetPassword} disabled={busy}>
                                {busy ? 'Saving…' : 'Reset password'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
