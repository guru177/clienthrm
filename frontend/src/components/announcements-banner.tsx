import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren,
} from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle, Info, Megaphone } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

const DISMISSED_KEY = 'hrm_dismissed_announcements';

function loadDismissed(): number[] {
    try {
        const raw = localStorage.getItem(DISMISSED_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
    } catch {
        return [];
    }
}

function saveDismissed(ids: number[]) {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
}

const SEVERITY: Record<
    string,
    { label: string; icon: typeof Info; accent: string; badge: string; header: string }
> = {
    info: {
        label: 'Information',
        icon: Info,
        accent: 'border-t-blue-500',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
        header: 'from-[#092244] to-[#071b3a]',
    },
    warning: {
        label: 'Important',
        icon: AlertTriangle,
        accent: 'border-t-amber-500',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
        header: 'from-amber-700 to-amber-900',
    },
    critical: {
        label: 'Critical',
        icon: AlertOctagon,
        accent: 'border-t-red-500',
        badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
        header: 'from-red-700 to-red-900',
    },
    success: {
        label: 'Update',
        icon: CheckCircle,
        accent: 'border-t-emerald-500',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
        header: 'from-emerald-700 to-emerald-900',
    },
};

interface AnnouncementsContextValue {
    unreadCount: number;
    openPortal: () => void;
    reload: () => void;
}

const AnnouncementsContext = createContext<AnnouncementsContextValue | null>(null);

export function AnnouncementsProvider({ children }: PropsWithChildren) {
    const [items, setItems] = useState<Announcement[]>([]);
    const [dismissed, setDismissed] = useState<number[]>(() => loadDismissed());
    const [open, setOpen] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [index, setIndex] = useState(0);
    const seenAutoOpenRef = useRef<Set<number>>(new Set());

    const reload = useCallback(() => {
        apiGet<Announcement[]>('/admin/announcements')
            .then((res) => setItems(Array.isArray(res.data) ? res.data : []))
            .catch(() => setItems([]));
    }, []);

    useEffect(() => {
        reload();
        window.addEventListener('focus', reload);
        return () => window.removeEventListener('focus', reload);
    }, [reload]);

    const undismissed = useMemo(
        () => items.filter((a) => !dismissed.includes(a.id)),
        [items, dismissed],
    );

    const unreadCount = undismissed.length;

    useEffect(() => {
        const fresh = undismissed.filter((a) => !seenAutoOpenRef.current.has(a.id));
        if (fresh.length > 0 && !manualOpen && !open) {
            fresh.forEach((a) => seenAutoOpenRef.current.add(a.id));
            setOpen(true);
            setIndex(0);
        }
    }, [undismissed, manualOpen, open]);

    const visibleList = manualOpen ? items : undismissed;
    const current = visibleList[index] ?? visibleList[0] ?? null;
    const dialogOpen = open && !!current;
    const bannerSrc = useStorageSrc(current?.image_url);

    function dismissCurrent() {
        if (!current) return;
        if (!dismissed.includes(current.id)) {
            const next = [...dismissed, current.id];
            setDismissed(next);
            saveDismissed(next);
        }
        seenAutoOpenRef.current.add(current.id);
        if (index < visibleList.length - 1) {
            setIndex((i) => i + 1);
            return;
        }
        setOpen(false);
        setManualOpen(false);
        setIndex(0);
    }

    function closePortal() {
        if (current) {
            seenAutoOpenRef.current.add(current.id);
        }
        setOpen(false);
        setManualOpen(false);
        setIndex(0);
    }

    function openPortal() {
        if (items.length === 0) {
            reload();
        }
        setManualOpen(true);
        setIndex(0);
        setOpen(true);
    }

    const tone = current ? (SEVERITY[current.severity] ?? SEVERITY.info) : SEVERITY.info;
    const Icon = tone.icon;

    return (
        <AnnouncementsContext.Provider value={{ unreadCount, openPortal, reload }}>
            {children}

            <Dialog
                open={dialogOpen}
                onOpenChange={(isOpen) => {
                    if (!isOpen) closePortal();
                }}
            >
                <DialogContent
                    className={cn(
                        'gap-0 overflow-hidden border-0 p-0 sm:max-w-xl',
                        tone.accent,
                        'border-t-4',
                    )}
                    overlayClassName="bg-[#001f3f]/55 backdrop-blur-sm"
                >
                    {current && (
                        <>
                            <div
                                className={cn(
                                    'bg-gradient-to-r px-6 py-4 text-white',
                                    tone.header,
                                )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                                            <Megaphone className="h-4 w-4" />
                                        </span>
                                        <div>
                                            <p className="text-xs font-medium text-white/80">
                                                Company announcement
                                            </p>
                                            <p className="text-sm font-semibold">HR Daddy</p>
                                        </div>
                                    </div>
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                                            tone.badge,
                                        )}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {tone.label}
                                    </span>
                                </div>
                            </div>

                            {bannerSrc && (
                                <div className="relative max-h-56 w-full overflow-hidden bg-[#eef4fc]">
                                    <img
                                        src={bannerSrc}
                                        alt=""
                                        className="h-full max-h-56 w-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                            )}

                            <div className="space-y-4 bg-white p-6 dark:bg-slate-950">
                                <DialogHeader className="space-y-2 text-left">
                                    <DialogTitle className="text-xl font-bold tracking-tight text-[#001f3f] dark:text-white">
                                        {current.title}
                                    </DialogTitle>
                                    {current.body ? (
                                        <DialogDescription className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                                            {current.body}
                                        </DialogDescription>
                                    ) : null}
                                </DialogHeader>

                                {visibleList.length > 1 && (
                                    <div className="flex items-center justify-center gap-1.5">
                                        {visibleList.map((a, i) => (
                                            <span
                                                key={a.id}
                                                className={cn(
                                                    'h-1.5 rounded-full transition-all',
                                                    i === index
                                                        ? 'w-6 bg-[#071b3a]'
                                                        : 'w-1.5 bg-[#dce8f8]',
                                                )}
                                            />
                                        ))}
                                    </div>
                                )}

                                <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
                                    <p className="self-center text-xs text-muted-foreground">
                                        {visibleList.length > 1
                                            ? `${index + 1} of ${visibleList.length}`
                                            : 'Visible to everyone in your organization'}
                                    </p>
                                    <Button
                                        type="button"
                                        className="bg-[#001f3f] hover:bg-[#071b3a]"
                                        onClick={dismissCurrent}
                                    >
                                        {index < visibleList.length - 1 ? 'Next' : 'Got it'}
                                    </Button>
                                </DialogFooter>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </AnnouncementsContext.Provider>
    );
}

export function AnnouncementsHeaderButton() {
    const ctx = useContext(AnnouncementsContext);
    if (!ctx) return null;

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            title="Announcements"
            onClick={ctx.openPortal}
        >
            <Megaphone className="h-4 w-4" />
            {ctx.unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {ctx.unreadCount > 9 ? '9+' : ctx.unreadCount}
                </span>
            )}
        </Button>
    );
}

/** @deprecated Use AnnouncementsProvider — kept for layout import compatibility */
export function AnnouncementsBanner() {
    return null;
}
