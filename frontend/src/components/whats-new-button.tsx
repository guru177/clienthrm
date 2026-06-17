import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Sparkles, X } from 'lucide-react';

import { apiGet } from '@/lib/api';

import { isElectronApp } from '@/lib/is-electron';

import { useAuth } from '@/contexts/AuthContext';



interface ReleaseNote {

    id: number;

    version: string;

    title: string;

    body: string;

    audience: string;

    severity: string;

    status: 'draft' | 'published';

    published_at: string | null;

}



const SEEN_KEY = 'hrm_whatsnew_last_seen_id';



function getLastSeen(): number {

    const raw = localStorage.getItem(SEEN_KEY);

    return raw ? Number(raw) || 0 : 0;

}



function setLastSeen(id: number) {

    localStorage.setItem(SEEN_KEY, String(id));

}



export function WhatsNewButton() {

    const { user } = useAuth();

    const [items, setItems] = useState<ReleaseNote[]>([]);

    const [open, setOpen] = useState(false);

    const [lastSeen, setLastSeenState] = useState<number>(0);

    const autoOpenedRef = useRef(false);



    const loadReleases = useCallback(() => {

        if (!user) {

            setItems([]);

            return;

        }

        apiGet<ReleaseNote[]>('/admin/releases')

            .then((res) => setItems(Array.isArray(res.data) ? res.data : []))

            .catch(() => setItems([]));

    }, [user]);



    useEffect(() => {

        setLastSeenState(getLastSeen());

        loadReleases();

        window.addEventListener('focus', loadReleases);

        return () => window.removeEventListener('focus', loadReleases);

    }, [loadReleases]);



    const unseenCount = useMemo(

        () => items.filter((r) => r.id > lastSeen).length,

        [items, lastSeen],

    );



    function openDrawer() {

        setOpen(true);

        if (items.length > 0) {

            const latestId = Math.max(...items.map((r) => r.id));

            setLastSeen(latestId);

            setLastSeenState(latestId);

        }

    }



    // Desktop app: auto-open once when there are unread release notes after login.

    useEffect(() => {

        if (!isElectronApp() || autoOpenedRef.current || unseenCount === 0 || !user) {

            return;

        }

        autoOpenedRef.current = true;

        setOpen(true);

        if (items.length > 0) {

            const latestId = Math.max(...items.map((r) => r.id));

            setLastSeen(latestId);

            setLastSeenState(latestId);

        }

    }, [unseenCount, items, user]);



    if (!user || items.length === 0) return null;



    return (

        <>

            <button

                type="button"

                onClick={openDrawer}

                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"

                aria-label="What's new"

                title="What's new"

            >

                <Sparkles className="h-4 w-4" />

                {unseenCount > 0 && (

                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">

                        {unseenCount}

                    </span>

                )}

            </button>



            {open && (

                <div className="fixed inset-0 z-50 flex justify-end">

                    <button

                        type="button"

                        aria-label="Close"

                        className="absolute inset-0 bg-black/40"

                        onClick={() => setOpen(false)}

                    />

                    <aside className="relative h-full w-full max-w-md overflow-y-auto bg-background p-6 shadow-2xl">

                        <div className="mb-4 flex items-center justify-between">

                            <div className="flex items-center gap-2">

                                <Sparkles className="h-5 w-5 text-amber-500" />

                                <h2 className="text-lg font-semibold">What's new</h2>

                            </div>

                            <button

                                type="button"

                                onClick={() => setOpen(false)}

                                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"

                            >

                                <X className="h-4 w-4" />

                            </button>

                        </div>

                        <div className="space-y-5">

                            {items.map((r) => (

                                <article

                                    key={r.id}

                                    className="rounded-lg border border-border bg-card p-4"

                                >

                                    <div className="flex items-start justify-between gap-3">

                                        <div>

                                            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">

                                                v{r.version}

                                            </p>

                                            <h3 className="mt-0.5 font-semibold">{r.title}</h3>

                                        </div>

                                        {r.id > lastSeen && (

                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">

                                                new

                                            </span>

                                        )}

                                    </div>

                                    {r.body && (

                                        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">

                                            {r.body}

                                        </p>

                                    )}

                                    <p className="mt-2 text-xs text-muted-foreground">

                                        {r.published_at}

                                    </p>

                                </article>

                            ))}

                        </div>

                    </aside>

                </div>

            )}

        </>

    );

}

