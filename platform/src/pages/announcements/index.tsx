import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import {
    platformDelete,
    platformGet,
    platformPatch,
    platformPost,
    platformUpload,
} from '@/lib/platform-api';
import { platformStorageUrl } from '@/lib/storage-url';
import { PlatformAlertDialog, PlatformConfirmDialog } from '@/components/platform-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { datetimeLocalToUtcSql, utcSqlToDatetimeLocal } from '@/lib/datetime';

interface Announcement {
    id: number;
    organization_id: number | null;
    title: string;
    body: string;
    severity: string;
    audience: string;
    published: boolean;
    starts_at: string | null;
    ends_at: string | null;
    image_url: string | null;
    created_at: string | null;
}

interface OrgOption {
    id: number;
    name: string;
}

const SEVERITY_OPTIONS = ['info', 'warning', 'critical', 'success'];
const AUDIENCE_OPTIONS = ['all', 'admins', 'employees'];

const emptyForm = {
    organization_id: '' as string,
    title: '',
    body: '',
    severity: 'info',
    audience: 'all',
    published: true,
    starts_at: '',
    ends_at: '',
    image_url: '',
};

function severityTone(s: string) {
    return {
        info: 'bg-blue-100 text-blue-700',
        warning: 'bg-amber-100 text-amber-700',
        critical: 'bg-red-100 text-red-700',
        success: 'bg-emerald-100 text-emerald-700',
    }[s] ?? 'bg-slate-100 text-slate-700';
}

export default function PlatformAnnouncements() {
    const [items, setItems] = useState<Announcement[]>([]);
    const [orgs, setOrgs] = useState<OrgOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...emptyForm });
    const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);
    const [alert, setAlert] = useState<{ title?: string; message: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [bannerPreview, setBannerPreview] = useState('');
    const bannerPreviewRef = useRef('');

    function revokeBannerPreview() {
        if (bannerPreviewRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(bannerPreviewRef.current);
        }
        bannerPreviewRef.current = '';
    }

    function setLocalBannerPreview(url: string) {
        revokeBannerPreview();
        bannerPreviewRef.current = url;
        setBannerPreview(url);
    }

    useEffect(() => {
        return () => revokeBannerPreview();
    }, []);

    async function load() {
        setLoading(true);
        try {
            const [annRes, orgRes] = await Promise.all([
                platformGet<Announcement[]>('/announcements'),
                platformGet<OrgOption[]>('/organizations'),
            ]);
            setItems(annRes.data);
            setOrgs(orgRes.data);
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
        setBannerFile(null);
        setLocalBannerPreview('');
        setShowForm(true);
    }

    function openEdit(a: Announcement) {
        setEditing(a);
        setForm({
            organization_id: a.organization_id ? String(a.organization_id) : '',
            title: a.title,
            body: a.body,
            severity: a.severity,
            audience: a.audience,
            published: a.published,
            starts_at: utcSqlToDatetimeLocal(a.starts_at),
            ends_at: utcSqlToDatetimeLocal(a.ends_at),
            image_url: a.image_url || '',
        });
        setBannerFile(null);
        setLocalBannerPreview(a.image_url ? platformStorageUrl(a.image_url) : '');
        setShowForm(true);
    }

    function handleBannerSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setAlert({ title: 'Invalid file', message: 'Please choose a PNG, JPG, GIF, or WebP image.' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setAlert({ title: 'File too large', message: 'Banner must be 5MB or smaller.' });
            return;
        }
        setBannerFile(file);
        setLocalBannerPreview(URL.createObjectURL(file));
    }

    function clearBanner() {
        setBannerFile(null);
        setLocalBannerPreview('');
        setForm({ ...form, image_url: '' });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        let imagePath = form.image_url.trim() || null;
        try {
            if (bannerFile) {
                const fd = new FormData();
                fd.append('banner', bannerFile);
                const upload = await platformUpload<{ path: string; file_url: string }>(
                    '/announcements/upload-banner',
                    fd,
                );
                imagePath = upload.data.path || upload.data.file_url;
            }
        } catch (err: unknown) {
            setBusy(false);
            setAlert({
                title: 'Upload failed',
                message: err instanceof Error ? err.message : 'Could not upload banner',
            });
            return;
        }
        const payload = {
            organization_id: form.organization_id ? Number(form.organization_id) : null,
            title: form.title,
            body: form.body || null,
            severity: form.severity,
            audience: form.audience,
            published: form.published,
            starts_at: datetimeLocalToUtcSql(form.starts_at),
            ends_at: datetimeLocalToUtcSql(form.ends_at),
            image_url: imagePath,
        };
        try {
            if (editing) {
                await platformPatch(`/announcements/${editing.id}`, payload);
            } else {
                await platformPost('/announcements', payload);
            }
            setShowForm(false);
            setBannerFile(null);
            setLocalBannerPreview('');
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

    async function handleDelete() {
        if (!confirmDelete) return;
        setBusy(true);
        try {
            await platformDelete(`/announcements/${confirmDelete.id}`);
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
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Announcements</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Show banners inside tenant apps. Leave organization empty to broadcast to all.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> New announcement
                </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-secondary/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium">Title</th>
                            <th className="px-4 py-3 font-medium">Severity</th>
                            <th className="px-4 py-3 font-medium">Audience</th>
                            <th className="px-4 py-3 font-medium">Org</th>
                            <th className="px-4 py-3 font-medium">Window</th>
                            <th className="px-4 py-3 font-medium">Status</th>
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
                        {items.map((a) => (
                            <tr key={a.id} className="border-b border-border/60 last:border-0 align-top">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-[#001f3f]">{a.title}</div>
                                    {a.body && (
                                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2 max-w-md">
                                            {a.body}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={cn(
                                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                                            severityTone(a.severity),
                                        )}
                                    >
                                        {a.severity}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{a.audience}</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                    {a.organization_id
                                        ? orgs.find((o) => o.id === a.organization_id)?.name || `#${a.organization_id}`
                                        : 'All tenants'}
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                    {a.starts_at || '—'}<br />
                                    {a.ends_at ? `→ ${a.ends_at}` : 'no end'}
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={cn(
                                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                                            a.published
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-700',
                                        )}
                                    >
                                        {a.published ? 'published' : 'draft'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 w-8 p-0"
                                            onClick={() => openEdit(a)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                            onClick={() => setConfirmDelete(a)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                                    No announcements yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
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
                            {editing ? 'Edit announcement' : 'New announcement'}
                        </h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label>Title</Label>
                                <Input
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Body (optional, supports plain text)</Label>
                                <textarea
                                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                            <div className="space-y-2 md:col-span-2">
                                <Label>Banner image (optional)</Label>
                                <Input
                                    type="file"
                                    accept="image/png,image/jpeg,image/gif,image/webp"
                                    onChange={handleBannerSelect}
                                    disabled={busy}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Shown as a wide image at the top of the tenant popup. PNG, JPG, GIF, or WebP — max 5MB.
                                </p>
                                {(bannerPreview || form.image_url) && (
                                    <div className="relative overflow-hidden rounded-lg border border-border">
                                        <img
                                            src={bannerPreview || platformStorageUrl(form.image_url)}
                                            alt="Banner preview"
                                            className="h-32 w-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="absolute right-2 top-2 h-8 w-8 p-0"
                                            onClick={clearBanner}
                                            disabled={busy}
                                            aria-label="Remove banner"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Organization</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.organization_id}
                                    onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
                                >
                                    <option value="">All tenants (broadcast)</option>
                                    {orgs.map((o) => (
                                        <option key={o.id} value={String(o.id)}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Starts at (optional, your local time)</Label>
                                <Input
                                    type="datetime-local"
                                    value={form.starts_at}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            starts_at: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Ends at (optional, your local time)</Label>
                                <Input
                                    type="datetime-local"
                                    value={form.ends_at}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            ends_at: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <label className="flex items-center gap-2 md:col-span-2">
                                <input
                                    type="checkbox"
                                    checked={form.published}
                                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                                />
                                <span className="text-sm">Published (visible to tenants)</span>
                            </label>
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
                title="Delete announcement"
                message={
                    confirmDelete
                        ? `Delete "${confirmDelete.title}"? This cannot be undone.`
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
