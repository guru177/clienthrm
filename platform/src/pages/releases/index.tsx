import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
    platformDelete,
    platformGet,
    platformPatch,
    platformPost,
} from '@/lib/platform-api';
import { PlatformAlertDialog, PlatformConfirmDialog } from '@/components/platform-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ReleaseNote {
    id: number;
    version: string;
    title: string;
    body: string;
    audience: string;
    severity: string;
    status: 'draft' | 'published';
    published_at: string | null;
    created_at: string | null;
    updated_at: string | null;
}

const AUDIENCE_OPTIONS = ['all', 'admins', 'employees'];
const SEVERITY_OPTIONS = ['info', 'warning', 'critical', 'success'];
const STATUS_OPTIONS: ('draft' | 'published')[] = ['draft', 'published'];

const emptyForm = {
    version: '',
    title: '',
    body: '',
    audience: 'all',
    severity: 'info',
    status: 'draft' as 'draft' | 'published',
};

function severityTone(s: string) {
    return {
        info: 'bg-blue-100 text-blue-700',
        warning: 'bg-amber-100 text-amber-700',
        critical: 'bg-red-100 text-red-700',
        success: 'bg-emerald-100 text-emerald-700',
    }[s] ?? 'bg-slate-100 text-slate-700';
}

export default function PlatformReleases() {
    const [releases, setReleases] = useState<ReleaseNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<ReleaseNote | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [confirmDelete, setConfirmDelete] = useState<ReleaseNote | null>(null);
    const [alert, setAlert] = useState<{ title?: string; message: string } | null>(null);
    const [busy, setBusy] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const res = await platformGet<ReleaseNote[]>('/releases');
            setReleases(res.data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    function openCreate() {
        setEditing(null);
        setForm({ ...emptyForm });
        setShowForm(true);
    }

    function openEdit(r: ReleaseNote) {
        setEditing(r);
        setForm({
            version: r.version,
            title: r.title,
            body: r.body,
            audience: r.audience,
            severity: r.severity,
            status: r.status,
        });
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        try {
            if (editing) {
                await platformPatch(`/releases/${editing.id}`, form);
            } else {
                await platformPost('/releases', form);
            }
            setShowForm(false);
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Failed',
                message: err instanceof Error ? err.message : 'Could not save',
            });
        } finally {
            setBusy(false);
        }
    }

    async function toggleStatus(r: ReleaseNote) {
        try {
            await platformPatch(`/releases/${r.id}`, {
                version: r.version,
                title: r.title,
                body: r.body,
                audience: r.audience,
                severity: r.severity,
                status: r.status === 'published' ? 'draft' : 'published',
            });
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Failed',
                message: err instanceof Error ? err.message : 'Could not update',
            });
        }
    }

    async function handleDelete() {
        if (!confirmDelete) return;
        setBusy(true);
        try {
            await platformDelete(`/releases/${confirmDelete.id}`);
            setConfirmDelete(null);
            await load();
        } catch (err: unknown) {
            setAlert({
                title: 'Delete failed',
                message: err instanceof Error ? err.message : 'Could not delete',
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Release notes</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Publish "What's new" entries that show up inside every tenant app.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> New release
                </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid gap-4 lg:grid-cols-2">
                {loading && (
                    <p className="text-muted-foreground">Loading…</p>
                )}
                {!loading && releases.length === 0 && (
                    <p className="text-muted-foreground">No releases yet.</p>
                )}
                {releases.map((r) => (
                    <article
                        key={r.id}
                        className={cn(
                            'flex flex-col rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md',
                            r.status === 'draft' && 'opacity-80',
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                                    v{r.version}
                                </p>
                                <h3 className="mt-1 text-lg font-semibold text-[#001f3f]">{r.title}</h3>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    <span
                                        className={cn(
                                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                                            severityTone(r.severity),
                                        )}
                                    >
                                        {r.severity}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs capitalize text-slate-700">
                                        {r.audience}
                                    </span>
                                    <span
                                        className={cn(
                                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                                            r.status === 'published'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-amber-100 text-amber-700',
                                        )}
                                    >
                                        {r.status}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => openEdit(r)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                    onClick={() => setConfirmDelete(r)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                        {r.body && (
                            <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                                {r.body}
                            </p>
                        )}
                        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{r.published_at ? `Published ${r.published_at}` : `Updated ${r.updated_at || '—'}`}</span>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => toggleStatus(r)}
                            >
                                {r.status === 'published' ? 'Unpublish' : 'Publish'}
                            </Button>
                        </div>
                    </article>
                ))}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Close"
                        className="absolute inset-0 bg-black/50"
                        onClick={() => !busy && setShowForm(false)}
                    />
                    <form
                        onSubmit={handleSubmit}
                        className="relative z-10 w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-white/80 bg-white p-6 shadow-2xl max-h-[90vh]"
                    >
                        <h3 className="text-lg font-semibold text-[#001f3f]">
                            {editing ? 'Edit release' : 'New release'}
                        </h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Version</Label>
                                <Input
                                    value={form.version}
                                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                                    required
                                    placeholder="1.2.0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Status</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.status}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            status: e.target.value as 'draft' | 'published',
                                        })
                                    }
                                >
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Title</Label>
                                <Input
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>What's new (multi-line)</Label>
                                <textarea
                                    className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.body}
                                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Severity</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.severity}
                                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                                >
                                    {SEVERITY_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Audience</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.audience}
                                    onChange={(e) => setForm({ ...form, audience: e.target.value })}
                                >
                                    {AUDIENCE_OPTIONS.map((a) => (
                                        <option key={a} value={a}>
                                            {a}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowForm(false)}
                                disabled={busy}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <PlatformAlertDialog
                open={!!alert}
                title={alert?.title}
                message={alert?.message ?? ''}
                onClose={() => setAlert(null)}
            />

            <PlatformConfirmDialog
                open={!!confirmDelete}
                title="Delete release"
                message={
                    confirmDelete
                        ? `Delete release v${confirmDelete.version}? This cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                destructive
                loading={busy}
                onConfirm={handleDelete}
                onClose={() => !busy && setConfirmDelete(null)}
            />
        </div>
    );
}
