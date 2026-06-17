import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Bell,
    Building2,
    Clock,
    ImagePlus,
    Loader2,
    Megaphone,
    Send,
    Sparkles,
    Trash2,
    Users,
    UsersRound,
} from 'lucide-react';

import { OrgNotificationBanner } from '@/components/org-notification-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { OrgNotification } from '@/components/org-notifications-panel';
import AppLayout from '@/layouts/app-layout';
import { apiGet, apiPost, apiUpload } from '@/lib/api';
import { formatDateTimeLocal, formatRelativeTime } from '@/lib/datetime';
import {
    audienceIcon,
    audienceSummary,
    severityConfig,
} from '@/lib/org-notifications-ui';
import { handleApiError, handleApiResponse, showToast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface NamedOption {
    id: number;
    name: string;
}

const breadcrumbs = [{ label: 'Notifications' }];

const AUDIENCE_OPTIONS = [
    { value: 'all', label: 'All employees', description: 'Everyone in your organization', icon: Users },
    { value: 'department', label: 'Department', description: 'Target one department', icon: Building2 },
    { value: 'designation', label: 'Designation', description: 'Target one job role', icon: UsersRound },
] as const;

export default function NotificationsAdminPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [severity, setSeverity] = useState('info');
    const [audience, setAudience] = useState<'all' | 'department' | 'designation'>('all');
    const [targetId, setTargetId] = useState('');
    const [departments, setDepartments] = useState<NamedOption[]>([]);
    const [designations, setDesignations] = useState<NamedOption[]>([]);
    const [sent, setSent] = useState<OrgNotification[]>([]);
    const [loadingSent, setLoadingSent] = useState(true);
    const [sending, setSending] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [localBannerPreview, setLocalBannerPreview] = useState('');
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const loadSent = useCallback(() => {
        setLoadingSent(true);
        apiGet<OrgNotification[]>('/admin/org-notifications/sent')
            .then((res) => setSent(Array.isArray(res.data) ? res.data : []))
            .catch(() => setSent([]))
            .finally(() => setLoadingSent(false));
    }, []);

    useEffect(() => {
        loadSent();
        Promise.all([
            apiGet<NamedOption[]>('/admin/departments/list'),
            apiGet<NamedOption[]>('/admin/designations/list'),
        ])
            .then(([deptRes, desRes]) => {
                setDepartments(Array.isArray(deptRes.data) ? deptRes.data : []);
                setDesignations(Array.isArray(desRes.data) ? desRes.data : []);
            })
            .catch(() => {
                setDepartments([]);
                setDesignations([]);
            });
    }, [loadSent]);

    const targetName = useMemo(() => {
        if (audience === 'department') {
            return departments.find((d) => String(d.id) === targetId)?.name ?? null;
        }
        if (audience === 'designation') {
            return designations.find((d) => String(d.id) === targetId)?.name ?? null;
        }
        return null;
    }, [audience, targetId, departments, designations]);

    const previewSeverity = severityConfig(severity);
    const PreviewIcon = previewSeverity.icon;
    const AudienceIcon = audienceIcon(audience);

    function handleBannerSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            handleApiError(new Error('Please choose a PNG, JPG, GIF, or WebP image'));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            handleApiError(new Error('Banner must be 5MB or smaller'));
            return;
        }
        setBannerFile(file);
        setLocalBannerPreview(URL.createObjectURL(file));
        setImageUrl('');
    }

    function clearBanner() {
        setBannerFile(null);
        setLocalBannerPreview('');
        setImageUrl('');
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim() || !body.trim()) {
            handleApiError(new Error('Title and message are required'));
            return;
        }
        if (audience !== 'all' && !targetId) {
            handleApiError(new Error('Select a department or designation'));
            return;
        }

        setSending(true);
        try {
            let uploadedImagePath: string | null = imageUrl.trim() || null;
            if (bannerFile) {
                const fd = new FormData();
                fd.append('banner', bannerFile);
                const upload = await apiUpload<{ path: string; file_url: string }>(
                    '/admin/org-notifications/upload-banner',
                    fd,
                );
                uploadedImagePath = upload.data.path || upload.data.file_url;
            }

            const res = await apiPost('/admin/org-notifications', {
                title: title.trim(),
                body: body.trim(),
                severity,
                audience,
                target_id: audience === 'all' ? null : Number(targetId),
                image_url: uploadedImagePath,
            });
            handleApiResponse(res);
            showToast({ type: 'success', message: 'Notification delivered to employee inboxes' });
            setTitle('');
            setBody('');
            setSeverity('info');
            setAudience('all');
            setTargetId('');
            clearBanner();
            loadSent();
        } catch (err) {
            handleApiError(err);
        } finally {
            setSending(false);
        }
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6">
                {/* Page hero */}
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-[#e8f2fd] via-[#d0e4f8] to-[#c4d8f0] px-6 py-5 shadow-sm dark:border-white/10 dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220]">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#071b3a]/20 bg-[#071b3a]/15 shadow-inner dark:border-white/10 dark:bg-white/10">
                                <Bell className="h-6 w-6 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                    Company notifications
                                </h1>
                                <p className="mt-1 max-w-xl text-sm text-[#1e3a5f]/70 dark:text-blue-200/70">
                                    Broadcast updates to your team. Messages appear instantly in the bell icon for every targeted employee.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 sm:shrink-0">
                            <div className="rounded-xl border border-white/70 bg-white/60 px-4 py-3 text-center shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                                <p className="text-2xl font-bold tabular-nums text-[#001f3f] dark:text-white">{sent.length}</p>
                                <p className="text-xs font-medium uppercase tracking-wider text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Sent
                                </p>
                            </div>
                            <div className="rounded-xl border border-white/70 bg-white/60 px-4 py-3 text-center shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                                <p className="text-2xl font-bold tabular-nums text-[#001f3f] dark:text-white">
                                    {departments.length}
                                </p>
                                <p className="text-xs font-medium uppercase tracking-wider text-[#1e3a5f]/60 dark:text-blue-200/60">
                                    Depts
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* Compose */}
                    <Card className="border-border/80 shadow-sm lg:col-span-3">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                    <Send className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Compose message</CardTitle>
                                    <CardDescription className="mt-0.5">
                                        Delivered to employee notification inboxes
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSend} className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="notif-title">Subject</Label>
                                        <span className="text-xs text-muted-foreground">{title.length}/200</span>
                                    </div>
                                    <Input
                                        id="notif-title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g. Office closed tomorrow for maintenance"
                                        maxLength={200}
                                        className="h-11"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="notif-body">Message</Label>
                                    <Textarea
                                        id="notif-body"
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        placeholder="Share clear, actionable information your team needs to know..."
                                        rows={5}
                                        className="min-h-[120px] resize-y"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Banner image <span className="font-normal text-muted-foreground">(optional)</span></Label>
                                    <input
                                        ref={bannerInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/gif,image/webp"
                                        className="hidden"
                                        onChange={handleBannerSelect}
                                    />
                                    {(localBannerPreview || imageUrl) ? (
                                        <div className="overflow-hidden rounded-xl border border-border">
                                            <OrgNotificationBanner
                                                imageUrl={imageUrl}
                                                previewSrc={localBannerPreview}
                                                imgClassName="max-h-44"
                                            />
                                            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {bannerFile?.name ?? 'Banner attached'}
                                                </p>
                                                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={clearBanner}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Remove
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => bannerInputRef.current?.click()}
                                            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
                                        >
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                                <ImagePlus className="h-5 w-5 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Upload banner image</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    PNG, JPG, GIF or WebP · max 5MB · recommended 1200×400
                                                </p>
                                            </div>
                                        </button>
                                    )}
                                </div>

                                <Separator />

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Priority</Label>
                                        <Select value={severity} onValueChange={setSeverity}>
                                            <SelectTrigger className="h-11">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(['info', 'success', 'warning', 'critical'] as const).map((key) => {
                                                    const cfg = severityConfig(key);
                                                    const Icon = cfg.icon;
                                                    return (
                                                        <SelectItem key={key} value={key}>
                                                            <span className="flex items-center gap-2">
                                                                <Icon className="h-3.5 w-3.5" />
                                                                {cfg.label}
                                                            </span>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Audience</Label>
                                        <Select
                                            value={audience}
                                            onValueChange={(v) => {
                                                setAudience(v as typeof audience);
                                                setTargetId('');
                                            }}
                                        >
                                            <SelectTrigger className="h-11">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AUDIENCE_OPTIONS.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {audience === 'department' && (
                                    <div className="space-y-2">
                                        <Label>Select department</Label>
                                        <Select value={targetId} onValueChange={setTargetId}>
                                            <SelectTrigger className="h-11">
                                                <SelectValue placeholder="Choose department" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {departments.map((d) => (
                                                    <SelectItem key={d.id} value={String(d.id)}>
                                                        {d.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {audience === 'designation' && (
                                    <div className="space-y-2">
                                        <Label>Select designation</Label>
                                        <Select value={targetId} onValueChange={setTargetId}>
                                            <SelectTrigger className="h-11">
                                                <SelectValue placeholder="Choose designation" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {designations.map((d) => (
                                                    <SelectItem key={d.id} value={String(d.id)}>
                                                        {d.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Megaphone className="h-3.5 w-3.5" />
                                        Separate from platform-wide announcements
                                    </p>
                                    <Button type="submit" disabled={sending} size="lg" className="gap-2 sm:min-w-[180px]">
                                        {sending ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Sending…
                                            </>
                                        ) : (
                                            <>
                                                <Send className="h-4 w-4" />
                                                Send notification
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Live preview */}
                    <Card className="border-border/80 shadow-sm lg:col-span-2">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-amber-500" />
                                <CardTitle className="text-base">Inbox preview</CardTitle>
                            </div>
                            <CardDescription>How employees will see this notification</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-sm border-l-4', previewSeverity.accent)}>
                                <OrgNotificationBanner
                                    imageUrl={imageUrl}
                                    previewSrc={localBannerPreview}
                                    imgClassName="max-h-36"
                                />
                                <div className="bg-muted/20 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', previewSeverity.badge)}>
                                            <PreviewIcon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className={cn('text-[10px] uppercase', previewSeverity.badge)}>
                                                    {previewSeverity.label}
                                                </Badge>
                                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                    <AudienceIcon className="h-3 w-3" />
                                                    {audienceSummary({ audience, target_name: targetName })}
                                                </span>
                                            </div>
                                            <p className="mt-2 font-semibold leading-snug text-foreground">
                                                {title.trim() || 'Notification title'}
                                            </p>
                                            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                                {body.trim() || 'Your message will appear here. Keep it concise and include any action items.'}
                                            </p>
                                            <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                                                <Clock className="h-3 w-3" />
                                                Just now · From you
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-2 rounded-lg bg-muted/40 p-3">
                                <p className="text-xs font-medium text-foreground">Delivery tips</p>
                                <ul className="space-y-1 text-xs text-muted-foreground">
                                    <li>· Use <strong className="font-medium text-foreground">Critical</strong> only for urgent, time-sensitive alerts</li>
                                    <li>· Add a banner for events, holidays, or visual announcements</li>
                                    <li>· Employees can dismiss notifications from the bell menu</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sent history */}
                <Card className="border-border/80 shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                    <Bell className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Delivery history</CardTitle>
                                    <CardDescription className="mt-0.5">
                                        Recent notifications sent from your organization
                                    </CardDescription>
                                </div>
                            </div>
                            {!loadingSent && sent.length > 0 && (
                                <Badge variant="secondary">{sent.length} total</Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loadingSent ? (
                            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading history…
                            </div>
                        ) : sent.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                                    <Bell className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="mt-4 font-medium text-foreground">No notifications sent yet</p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                    When you send your first message, it will appear here with delivery details.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {sent.map((n) => {
                                    const cfg = severityConfig(n.severity);
                                    const Icon = cfg.icon;
                                    const AudIcon = audienceIcon(n.audience);
                                    return (
                                        <article
                                            key={n.id}
                                            className={cn(
                                                'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md',
                                                cfg.accent,
                                                'border-l-4',
                                            )}
                                        >
                                            {n.image_url?.trim() && (
                                                <OrgNotificationBanner
                                                    imageUrl={n.image_url}
                                                    imgClassName="max-h-36"
                                                />
                                            )}
                                            <div className="flex min-w-0 flex-1 flex-col p-4">
                                                <div className="flex items-start gap-3">
                                                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', cfg.badge)}>
                                                        <Icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <Badge variant="outline" className={cn('text-[10px] uppercase', cfg.badge)}>
                                                                {cfg.label}
                                                            </Badge>
                                                            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                                                                <AudIcon className="h-3 w-3 shrink-0" />
                                                                <span className="truncate">{audienceSummary(n)}</span>
                                                            </span>
                                                        </div>
                                                        <h3 className="mt-2 line-clamp-2 font-semibold leading-snug text-foreground">
                                                            {n.title}
                                                        </h3>
                                                    </div>
                                                </div>
                                                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                                                    {n.body}
                                                </p>
                                                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                                                    <span className="inline-flex shrink-0 items-center gap-1" title={formatDateTimeLocal(n.created_at)}>
                                                        <Clock className="h-3 w-3" />
                                                        {formatRelativeTime(n.created_at)}
                                                    </span>
                                                    {n.created_by_name && (
                                                        <>
                                                            <span>·</span>
                                                            <span className="truncate">by {n.created_by_name}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
