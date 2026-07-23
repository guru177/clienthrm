import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Building2, User, CreditCard, Shield, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { platformGet, platformPost } from '@/lib/platform-api';
import { redirectToTenantImpersonation, defaultAdminRoute } from '@/lib/app-urls';
import { PlatformConfirmDialog } from '@/components/platform-dialog';
import { cn } from '@/lib/utils';

interface SearchOrg {
    id: number;
    name: string;
    slug: string;
    status: string;
    plan: string;
}

interface SearchUser {
    id: number;
    name: string;
    email: string;
    organization_id: number;
    organization_name: string | null;
    organization_slug: string | null;
}

interface SearchPlan {
    id: number;
    name: string;
    slug: string;
}

interface SearchAdmin {
    id: number;
    name: string;
    email: string;
    role: string;
}

interface SearchResults {
    organizations: SearchOrg[];
    users: SearchUser[];
    plans: SearchPlan[];
    platform_admins: SearchAdmin[];
}

interface ImpersonateResponse {
    token: string;
    refresh_token?: string;
    user: { permissions?: string[] };
    permissions?: string[];
    org_slug: string;
}

type Item =
    | { kind: 'org'; data: SearchOrg }
    | { kind: 'user'; data: SearchUser }
    | { kind: 'plan'; data: SearchPlan }
    | { kind: 'admin'; data: SearchAdmin };

export function CommandPalette() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [error, setError] = useState('');
    const [impersonateTarget, setImpersonateTarget] = useState<SearchUser | null>(null);
    const [impersonating, setImpersonating] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handler(e: KeyboardEvent) {
            const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
            const isSlash =
                e.key === '/' &&
                !(document.activeElement instanceof HTMLInputElement) &&
                !(document.activeElement instanceof HTMLTextAreaElement);
            if (isCmdK || isSlash) {
                e.preventDefault();
                setOpen(true);
            } else if (e.key === 'Escape') {
                setOpen(false);
            }
        }
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 30);
        } else {
            setQuery('');
            setResults(null);
            setActiveIdx(0);
            setError('');
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults(null);
            return;
        }
        setLoading(true);
        const t = setTimeout(() => {
            platformGet<SearchResults>(`/search?q=${encodeURIComponent(trimmed)}`)
                .then((res) => {
                    setResults(res.data);
                    setActiveIdx(0);
                })
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : 'Search failed'),
                )
                .finally(() => setLoading(false));
        }, 200);
        return () => clearTimeout(t);
    }, [query, open]);

    const items: Item[] = useMemo(() => {
        if (!results) return [];
        return [
            ...results.organizations.map((o) => ({ kind: 'org' as const, data: o })),
            ...results.users.map((u) => ({ kind: 'user' as const, data: u })),
            ...results.plans.map((p) => ({ kind: 'plan' as const, data: p })),
            ...results.platform_admins.map((a) => ({ kind: 'admin' as const, data: a })),
        ];
    }, [results]);

    function handleSelect(item: Item) {
        if (item.kind === 'org') {
            setOpen(false);
            navigate(`/tenants/${item.data.id}`);
        } else if (item.kind === 'plan') {
            setOpen(false);
            navigate('/subscription-plans');
        } else if (item.kind === 'admin') {
            setOpen(false);
            navigate('/platform-team');
        } else if (item.kind === 'user') {
            setOpen(false);
            setImpersonateTarget(item.data);
        }
    }

    async function confirmImpersonation() {
        if (!impersonateTarget) return;
        setImpersonating(true);
        setError('');
        try {
            const res = await platformPost<ImpersonateResponse>(
                `/organizations/${impersonateTarget.organization_id}/impersonate`,
                {},
            );
            const perms = res.data.permissions ?? res.data.user?.permissions ?? [];
            redirectToTenantImpersonation({
                token: res.data.token,
                refreshToken: res.data.refresh_token,
                orgSlug: res.data.org_slug,
                orgName:
                    impersonateTarget.organization_name ??
                    impersonateTarget.organization_slug ??
                    '',
                next: defaultAdminRoute((slug) => perms.includes(slug)),
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed');
            setOpen(true);
        } finally {
            setImpersonating(false);
            setImpersonateTarget(null);
        }
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => Math.min(items.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = items[activeIdx];
            if (item) handleSelect(item);
        }
    }

    if (!open && !impersonateTarget) {
        return null;
    }

    return (
        <>
        {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-24">
            <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setOpen(false)}
            />
            <div
                role="dialog"
                aria-label="Command palette"
                className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl"
            >
                <div className="flex items-center gap-2 border-b border-border px-4">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKey}
                        className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search orgs, users, plans, admins…"
                    />
                    <kbd className="hidden rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground sm:inline-block">
                        Esc
                    </kbd>
                </div>
                {error && <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
                <div className="max-h-96 overflow-y-auto">
                    {query.trim().length < 2 && (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                            Type at least 2 characters. Press ⌘/Ctrl+K to open this any time.
                        </p>
                    )}
                    {loading && query.trim().length >= 2 && (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                            Searching…
                        </p>
                    )}
                    {results && items.length === 0 && (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                            No results.
                        </p>
                    )}
                    {results && items.length > 0 && (
                        <CommandSection
                            title="Organizations"
                            items={items}
                            kind="org"
                            activeIdx={activeIdx}
                            onSelect={handleSelect}
                        />
                    )}
                    {results && items.length > 0 && (
                        <CommandSection
                            title="Users (open with impersonation)"
                            items={items}
                            kind="user"
                            activeIdx={activeIdx}
                            onSelect={handleSelect}
                        />
                    )}
                    {results && items.length > 0 && (
                        <CommandSection
                            title="Plans"
                            items={items}
                            kind="plan"
                            activeIdx={activeIdx}
                            onSelect={handleSelect}
                        />
                    )}
                    {results && items.length > 0 && (
                        <CommandSection
                            title="Platform admins"
                            items={items}
                            kind="admin"
                            activeIdx={activeIdx}
                            onSelect={handleSelect}
                        />
                    )}
                </div>
            </div>
        </div>
        )}
        <PlatformConfirmDialog
            open={Boolean(impersonateTarget)}
            title="Impersonate user"
            message={
                impersonateTarget
                    ? `Open ${impersonateTarget.name} (${impersonateTarget.email}) in ${impersonateTarget.organization_name ?? impersonateTarget.organization_slug ?? 'their organization'}? You will be signed in as this user.`
                    : ''
            }
            confirmLabel="Impersonate"
            loading={impersonating}
            onConfirm={() => void confirmImpersonation()}
            onClose={() => {
                if (!impersonating) setImpersonateTarget(null);
            }}
        />
        </>
    );
}

function CommandSection({
    title,
    items,
    kind,
    activeIdx,
    onSelect,
}: {
    title: string;
    items: Item[];
    kind: Item['kind'];
    activeIdx: number;
    onSelect: (item: Item) => void;
}) {
    const filtered = items.filter((i) => i.kind === kind);
    if (filtered.length === 0) return null;
    return (
        <div className="border-b border-border last:border-0">
            <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
            </p>
            <ul className="py-1">
                {filtered.map((item) => {
                    const idx = items.indexOf(item);
                    const active = idx === activeIdx;
                    return (
                        <li key={`${item.kind}-${item.data.id}`}>
                            <button
                                type="button"
                                onClick={() => onSelect(item)}
                                className={cn(
                                    'flex w-full items-center gap-3 px-4 py-2 text-sm',
                                    active ? 'bg-blue-50 text-[#001f3f]' : 'hover:bg-secondary',
                                )}
                            >
                                <Icon kind={item.kind} />
                                <span className="flex-1 text-left">
                                    <span className="font-medium text-[#001f3f]">{label(item)}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">{subtitle(item)}</span>
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Icon({ kind }: { kind: Item['kind'] }) {
    const props = { className: 'h-4 w-4 text-blue-600' };
    if (kind === 'org') return <Building2 {...props} />;
    if (kind === 'user') return <User {...props} />;
    if (kind === 'plan') return <CreditCard {...props} />;
    return <Shield {...props} />;
}

function label(item: Item): string {
    if (item.kind === 'org' || item.kind === 'plan' || item.kind === 'admin') return item.data.name;
    return item.data.name;
}

function subtitle(item: Item): string {
    if (item.kind === 'org') return `${item.data.slug} · ${item.data.plan} · ${item.data.status}`;
    if (item.kind === 'plan') return item.data.slug;
    if (item.kind === 'admin') return `${item.data.email} · ${item.data.role}`;
    return `${item.data.email} · ${item.data.organization_name ?? '—'}`;
}
