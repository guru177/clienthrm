import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft, LifeBuoy, Search, TrendingUp, X } from 'lucide-react';
import { apiGet } from '@/lib/api';

interface KbArticle {
    slug: string;
    title: string;
    body: string;
    audience: string;
    published_at: string | null;
}

export function HelpCenterDrawer() {
    const [items, setItems] = useState<KbArticle[]>([]);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<KbArticle | null>(null);

    useEffect(() => {
        if (!open) return;
        apiGet<KbArticle[]>('/admin/kb')
            .then((res) => setItems(Array.isArray(res.data) ? res.data : []))
            .catch(() => setItems([]));
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (a) =>
                a.title.toLowerCase().includes(q) ||
                a.body.toLowerCase().includes(q) ||
                a.slug.toLowerCase().includes(q),
        );
    }, [items, query]);

    function closeDrawer() {
        setOpen(false);
        setSelected(null);
        setQuery('');
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Help center"
                title="Help center"
            >
                <BookOpen className="h-4 w-4" />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <button
                        type="button"
                        aria-label="Close"
                        className="absolute inset-0 bg-black/40"
                        onClick={closeDrawer}
                    />
                    <aside className="relative flex h-full w-full max-w-md flex-col bg-background shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-2">
                                {selected ? (
                                    <button
                                        type="button"
                                        onClick={() => setSelected(null)}
                                        className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <BookOpen className="h-5 w-5 text-primary" />
                                )}
                                <h2 className="text-lg font-semibold">
                                    {selected ? selected.title : 'Help center'}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeDrawer}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {!selected && (
                            <div className="border-b border-border px-5 py-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="search"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search articles…"
                                        className="w-full rounded-lg border border-border bg-muted/30 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Link
                                        to="/admin/support"
                                        onClick={closeDrawer}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
                                    >
                                        <LifeBuoy className="h-3.5 w-3.5" />
                                        Contact support
                                    </Link>
                                    <Link
                                        to="/admin/subscription"
                                        onClick={closeDrawer}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
                                    >
                                        <TrendingUp className="h-3.5 w-3.5" />
                                        Upgrade plan
                                    </Link>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-5">
                            {selected ? (
                                <article className="space-y-3">
                                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                        {selected.body}
                                    </p>
                                    {selected.published_at && (
                                        <p className="text-xs text-muted-foreground">
                                            Updated {selected.published_at}
                                        </p>
                                    )}
                                </article>
                            ) : filtered.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {items.length === 0
                                        ? 'No help articles published yet.'
                                        : 'No articles match your search.'}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {filtered.map((article) => (
                                        <button
                                            key={article.slug}
                                            type="button"
                                            onClick={() => setSelected(article)}
                                            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
                                        >
                                            <p className="font-medium">{article.title}</p>
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                {article.body}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            )}
        </>
    );
}
