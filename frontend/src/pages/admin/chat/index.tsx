import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Hash, Lock, Plus, Search, Send, Smile, Paperclip, Pin, Star, MessageSquare,
    MoreHorizontal, X, Users, Bold, Italic, Code, AtSign, Loader2, MessagesSquare,
    Download, FileText, Film, Music, File, Building2,
} from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { useAuth } from '@/contexts/AuthContext';
import { useChatWs } from '@/hooks/use-chat-ws';
import {
    chatApi, QUICK_EMOJIS, type ChatMessage, type ChatSpace, type ChatMember, type ChatAttachment,
} from '@/lib/chat-api';
import { storageUrl, fetchAuthenticatedBlobUrl, authStorageFetch } from '@/lib/storage-url';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { isMobileViewport } from '@/lib/default-route';
import { handleApiError } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { cn } from '@/lib/utils';
import { ChatNotificationStack } from '@/components/chat/chat-notification-stack';

function UserAvatarPhoto({ path }: { path: string }) {
    const src = useStorageSrc(path);
    if (!src) return null;
    return <AvatarImage src={src} />;
}

function AuthenticatedMedia({
    path,
    alt,
    className,
    as = 'img',
}: {
    path: string;
    alt: string;
    className?: string;
    as?: 'img' | 'video' | 'audio';
}) {
    const src = useStorageSrc(path);
    if (!src) {
        return <div className={cn('animate-pulse rounded-lg bg-muted', className)} aria-hidden />;
    }
    if (as === 'video') {
        return <video src={src} controls playsInline className={className}><track kind="captions" /></video>;
    }
    if (as === 'audio') {
        return <audio src={src} controls className={className} />;
    }
    return <img src={src} alt={alt} className={className} />;
}

function initials(name: string) {
    return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(ts: string) {
    const d = new Date(ts.replace(' ', 'T') + 'Z');
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function upsertById<T extends { id: number }>(items: T[], item: T): T[] {
    const idx = items.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
        const next = [...items];
        next[idx] = item;
        return next;
    }
    return [...items, item];
}

function dedupeById<T extends { id: number }>(items: T[]): T[] {
    const map = new Map<number, T>();
    for (const item of items) map.set(item.id, item);
    return Array.from(map.values());
}

function dedupeByUserId<T extends { user_id: number }>(items: T[]): T[] {
    const map = new Map<number, T>();
    for (const item of items) map.set(item.user_id, item);
    return Array.from(map.values());
}

function spaceLabel(space: ChatSpace, currentUserId?: number) {
    if (space.kind === 'channel') return space.name || space.slug || 'channel';
    if (space.dm_members?.length === 1) return space.dm_members[0].name;
    if (space.dm_members?.length) {
        return space.dm_members.map((m) => m.name.split(' ')[0]).join(', ');
    }
    return space.name || 'Direct message';
}

function FormatMessage({ text, users }: { text: string; users: ChatMember[] }) {
    if (!text || text === '[deleted]') {
        return <span className="italic text-muted-foreground">This message was deleted</span>;
    }
    const parts = text.split(/(@\w[\w.-]*|<@[^>]+>|\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|https?:\/\/[^\s]+)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i}>{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('_') && part.endsWith('_')) {
                    return <em key={i}>{part.slice(1, -1)}</em>;
                }
                if (part.startsWith('`') && part.endsWith('`')) {
                    return <code key={i} className="rounded bg-muted px-1 py-0.5 text-sm font-mono">{part.slice(1, -1)}</code>;
                }
                if (part.startsWith('http')) {
                    return <a key={i} href={part} target="_blank" rel="noreferrer" className="text-primary underline">{part}</a>;
                }
                if (part.startsWith('@') || part.startsWith('<@')) {
                    const idMatch = part.match(/<@(\d+)>/);
                    const user = idMatch
                        ? users.find((u) => u.user_id === Number(idMatch[1]))
                        : users.find((u) => u.name.toLowerCase().includes(part.slice(1).toLowerCase()));
                    return (
                        <span key={i} className="rounded bg-[#071b3a]/10 px-1 font-medium text-[#071b3a] dark:text-blue-300">
                            @{user?.name || part.replace(/[<@>]/g, '')}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

function MessageItem({
    msg, users, currentUserId, onReact, onReply, onEdit, onDelete, onPin, onStar, onOpenThread, onAttachmentPreview,
}: {
    msg: ChatMessage;
    users: ChatMember[];
    currentUserId: number;
    onReact: (id: number, emoji: string) => void;
    onReply: (msg: ChatMessage) => void;
    onEdit: (msg: ChatMessage) => void;
    onDelete: (id: number) => void;
    onPin: (id: number) => void;
    onStar: (id: number) => void;
    onOpenThread: (msg: ChatMessage) => void;
    onAttachmentPreview: (attachment: ChatAttachment) => void;
}) {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const isOwn = msg.user_id === currentUserId;

    useEffect(() => {
        if (!showMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [showMenu]);

    const menuItemClass =
        'flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground';

    return (
        <div id={`chat-msg-${msg.id}`} className="group relative flex gap-3 rounded-lg px-4 py-2 hover:bg-[#071b3a]/5 dark:hover:bg-white/5">
            <Avatar className="h-9 w-9 shrink-0 mt-0.5">
                {msg.user_photo && <UserAvatarPhoto path={msg.user_photo} />}
                <AvatarFallback className="text-xs">{initials(msg.user_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{msg.user_name}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
                    {msg.is_edited && <span className="text-xs text-muted-foreground">(edited)</span>}
                    {msg.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                    {msg.is_starred && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                </div>
                <div className="text-sm mt-0.5 break-words whitespace-pre-wrap">
                    <FormatMessage text={msg.content} users={users} />
                </div>
                {msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {msg.attachments.map((a) => (
                            <AttachmentPreview key={a.id} attachment={a} onPreview={onAttachmentPreview} />
                        ))}
                    </div>
                )}
                {msg.reactions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {msg.reactions.map((r) => (
                            <button
                                key={r.emoji}
                                type="button"
                                onClick={() => onReact(msg.id, r.emoji)}
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                                    r.reacted_by_me ? 'border-[#071b3a]/30 bg-[#071b3a]/10' : 'border-border bg-background',
                                )}
                            >
                                {r.emoji} {r.count}
                            </button>
                        ))}
                    </div>
                )}
                {!msg.is_deleted && msg.thread_count > 0 && (
                    <button
                        type="button"
                        onClick={() => onOpenThread(msg)}
                        className="mt-2 text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {msg.thread_count} {msg.thread_count === 1 ? 'reply' : 'replies'}
                    </button>
                )}
            </div>
            {!msg.is_deleted && (
                <div className="absolute right-2 top-1 z-10 hidden group-hover:flex items-center gap-0.5 rounded-md border bg-background shadow-sm p-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                            setShowEmoji(!showEmoji);
                            setShowMenu(false);
                        }}
                    >
                        <Smile className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                            onReply(msg);
                            setShowMenu(false);
                        }}
                    >
                        <MessageSquare className="h-4 w-4" />
                    </Button>
                    <div className="relative" ref={menuRef}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e: ReactMouseEvent) => {
                                e.stopPropagation();
                                setShowMenu((open) => !open);
                                setShowEmoji(false);
                            }}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {showMenu && (
                            <div className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    onClick={() => {
                                        onOpenThread(msg);
                                        setShowMenu(false);
                                    }}
                                >
                                    Reply in thread
                                </button>
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    onClick={() => {
                                        onPin(msg.id);
                                        setShowMenu(false);
                                    }}
                                >
                                    {msg.is_pinned ? 'Unpin' : 'Pin'} message
                                </button>
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    onClick={() => {
                                        onStar(msg.id);
                                        setShowMenu(false);
                                    }}
                                >
                                    {msg.is_starred ? 'Unstar' : 'Star'} message
                                </button>
                                {isOwn && (
                                    <button
                                        type="button"
                                        className={menuItemClass}
                                        onClick={() => {
                                            onEdit(msg);
                                            setShowMenu(false);
                                        }}
                                    >
                                        Edit message
                                    </button>
                                )}
                                {isOwn && (
                                    <button
                                        type="button"
                                        className={cn(menuItemClass, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
                                        onClick={() => {
                                            onDelete(msg.id);
                                            setShowMenu(false);
                                        }}
                                    >
                                        Delete message
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {showEmoji && (
                <div className="absolute right-2 top-10 z-10 flex gap-1 rounded-lg border bg-background p-2 shadow-lg">
                    {QUICK_EMOJIS.map((e) => (
                        <button key={e} type="button" className="text-lg hover:scale-110 transition" onClick={() => { onReact(msg.id, e); setShowEmoji(false); }}>
                            {e}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'docx' | 'xlsx' | 'text' | 'other';

function resolveAttachmentUrl(url: string) {
    return storageUrl(url);
}

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMediaKind(attachment: ChatAttachment): MediaKind {
    const mime = attachment.mime_type?.toLowerCase() ?? '';
    const name = attachment.file_name.toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name)) return 'image';
    if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(name)) return 'video';
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) return 'audio';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (
        mime.includes('wordprocessingml')
        || mime === 'application/msword'
        || name.endsWith('.docx')
    ) return 'docx';
    if (
        mime.includes('spreadsheetml')
        || mime === 'application/vnd.ms-excel'
        || name.endsWith('.xlsx')
        || name.endsWith('.xls')
    ) return 'xlsx';
    if (mime.startsWith('text/') || /\.(txt|csv|md|json|log|xml|html?)$/i.test(name)) return 'text';
    return 'other';
}

function DocumentPreviewBody({ url, kind }: { url: string; kind: 'docx' | 'xlsx' | 'text' }) {
    const [html, setHtml] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setHtml(null);
        setText(null);

        void (async () => {
            try {
                const res = await authStorageFetch(url);
                if (!res.ok) throw new Error('Could not load file');
                const buf = await res.arrayBuffer();

                if (kind === 'docx') {
                    const mammoth = await import('mammoth');
                    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
                    if (!cancelled) setHtml(result.value);
                } else if (kind === 'xlsx') {
                    const XLSX = await import('xlsx');
                    const wb = XLSX.read(buf, { type: 'array' });
                    const sheetName = wb.SheetNames[0];
                    if (!sheetName) throw new Error('Spreadsheet is empty');
                    const sheetHtml = XLSX.utils.sheet_to_html(wb.Sheets[sheetName]);
                    if (!cancelled) setHtml(sheetHtml);
                } else {
                    const decoded = new TextDecoder().decode(buf);
                    if (!cancelled) setText(decoded);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Preview failed');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [url, kind]);

    if (loading) {
        return (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Loading preview…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <File className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-destructive">{error}</p>
                <p className="text-xs text-muted-foreground">Use Download to open the file locally.</p>
            </div>
        );
    }

    if (text != null) {
        return (
            <pre className="max-h-full w-full overflow-auto rounded-lg border bg-white p-4 text-left text-xs leading-relaxed whitespace-pre-wrap dark:bg-slate-900">
                {text}
            </pre>
        );
    }

    if (html != null) {
        return (
            <div
                className={cn(
                    'max-h-full w-full overflow-auto rounded-lg border bg-white p-4 text-left text-sm leading-relaxed shadow-sm dark:bg-slate-900',
                    kind === 'xlsx' && '[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1',
                    kind === 'docx' && '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1',
                )}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
            />
        );
    }

    return null;
}

async function downloadAttachment(attachment: ChatAttachment) {
    const url = resolveAttachmentUrl(attachment.file_url);
    try {
        const res = await authStorageFetch(url);
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = attachment.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

function MediaPreviewPanel({
    attachment,
    onClose,
}: {
    attachment: ChatAttachment;
    onClose: () => void;
}) {
    const kind = getMediaKind(attachment);
    const pdfSrc = useStorageSrc(attachment.file_url);

    return (
        <aside className="flex w-[min(480px,42vw)] shrink-0 flex-col border-l border-[#071b3a]/10 bg-gradient-to-b from-[#f4f9ff] to-white dark:from-[#0d1e33] dark:to-[#071220]">
            <header className="flex items-start justify-between gap-2 border-b border-[#071b3a]/10 bg-[#e8f2fd]/50 px-4 py-3 dark:bg-[#0d1e33]/50">
                <div className="min-w-0">
                    <h3 className="truncate font-semibold text-sm">{attachment.file_name}</h3>
                    <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.file_size)}
                        {attachment.mime_type ? ` · ${attachment.mime_type}` : ''}
                    </p>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </header>
            <div className="flex min-h-0 flex-1 overflow-auto bg-[#0a0f1a]/5 p-4 dark:bg-black/20">
                {kind === 'image' && (
                    <div className="flex w-full items-center justify-center">
                        <AuthenticatedMedia
                            path={attachment.file_url}
                            alt={attachment.file_name}
                            className="max-h-full max-w-full rounded-lg object-contain shadow-md"
                        />
                    </div>
                )}
                {kind === 'video' && (
                    <div className="flex w-full items-center justify-center">
                        <AuthenticatedMedia
                            path={attachment.file_url}
                            alt={attachment.file_name}
                            as="video"
                            className="max-h-full max-w-full rounded-lg bg-black shadow-md"
                        />
                    </div>
                )}
                {kind === 'audio' && (
                    <div className="flex w-full items-center justify-center">
                        <div className="w-full rounded-xl border bg-background p-5 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#071b3a]/10">
                                    <Music className="h-5 w-5 text-[#071b3a]" />
                                </div>
                                <p className="truncate text-sm font-medium">{attachment.file_name}</p>
                            </div>
                            <AuthenticatedMedia path={attachment.file_url} alt={attachment.file_name} as="audio" className="w-full" />
                        </div>
                    </div>
                )}
                {kind === 'pdf' && pdfSrc && (
                    <iframe src={pdfSrc} title={attachment.file_name} className="h-full min-h-[360px] w-full rounded-lg border bg-white shadow-md" />
                )}
                {(kind === 'docx' || kind === 'xlsx' || kind === 'text') && (
                    <DocumentPreviewBody url={resolveAttachmentUrl(attachment.file_url)} kind={kind} />
                )}
                {kind === 'other' && (
                    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#071b3a]/10">
                            <File className="h-7 w-7 text-[#071b3a]" />
                        </div>
                        <p className="text-sm font-medium">{attachment.file_name}</p>
                        <p className="text-xs text-muted-foreground">Preview not available for this file type.</p>
                    </div>
                )}
            </div>
            <div className="border-t border-[#071b3a]/10 p-3">
                <Button
                    className="w-full bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] text-white"
                    onClick={() => void downloadAttachment(attachment)}
                >
                    <Download className="h-4 w-4" />
                    Download
                </Button>
            </div>
        </aside>
    );
}

function AttachmentPreview({
    attachment,
    onPreview,
}: {
    attachment: ChatAttachment;
    onPreview: (attachment: ChatAttachment) => void;
}) {
    const kind = getMediaKind(attachment);

    const thumb = (() => {
        if (kind === 'image') {
            return (
                <AuthenticatedMedia
                    path={attachment.file_url}
                    alt={attachment.file_name}
                    className="max-h-48 max-w-xs rounded-lg border object-cover transition group-hover:opacity-90"
                />
            );
        }
        const Icon = kind === 'video' ? Film
            : kind === 'pdf' || kind === 'docx' ? FileText
            : kind === 'xlsx' ? FileText
            : kind === 'audio' ? Music
            : Paperclip;
        return (
            <div className="flex max-w-xs items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition group-hover:bg-muted">
                <Icon className="h-4 w-4 shrink-0 text-[#071b3a]" />
                <span className="truncate">{attachment.file_name}</span>
            </div>
        );
    })();

    return (
        <button
            type="button"
            onClick={() => onPreview(attachment)}
            className="group block cursor-pointer text-left"
            title={`Preview ${attachment.file_name}`}
        >
            {thumb}
        </button>
    );
}

export default function TeamChatPage() {
    const { spaceId: spaceIdParam } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const confirm = useConfirm();
    const currentUserId = user?.id ?? 0;

    const [spaces, setSpaces] = useState<ChatSpace[]>([]);
    const [users, setUsers] = useState<ChatMember[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [spacesReady, setSpacesReady] = useState(false);
    const [sending, setSending] = useState(false);
    const [composer, setComposer] = useState('');
    const [pendingAttachments, setPendingAttachments] = useState<{ id: number; file_name: string }[]>([]);
    const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
    const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
    const [threadComposer, setThreadComposer] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
    const [createChannelOpen, setCreateChannelOpen] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [newChannelPrivate, setNewChannelPrivate] = useState(false);
    const [newDmOpen, setNewDmOpen] = useState(false);
    const [selectedDmUsers, setSelectedDmUsers] = useState<number[]>([]);
    const [showPinsPanel, setShowPinsPanel] = useState(false);
    const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
    const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
    const [showStarred, setShowStarred] = useState(false);
    const [starredMessages, setStarredMessages] = useState<ChatMessage[]>([]);

    const deleteMessageWithConfirm = async (id: number) => {
        if (
            !(await confirm({
                title: 'Delete message',
                description: 'Delete this message? This cannot be undone.',
                confirmText: 'Delete',
            }))
        ) {
            return;
        }
        try {
            await chatApi.deleteMessage(id);
        } catch (e) {
            handleApiError(e);
        }
    };
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
    const [editContent, setEditContent] = useState('');
    const [peopleFilter, setPeopleFilter] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);

    const activeSpaceId = spaceIdParam ? Number(spaceIdParam) : undefined;
    const activeSpace = activeSpaceId
        ? spaces.find((s) => s.id === activeSpaceId)
        : undefined;
    const conversationOpen = Boolean(activeSpaceId);

    const channels = useMemo(
        () => spaces.filter((s) => s.kind === 'channel' && !s.department_id),
        [spaces],
    );
    const departmentChannels = useMemo(
        () => spaces.filter((s) => s.kind === 'channel' && s.department_id),
        [spaces],
    );
    const dms = useMemo(() => spaces.filter((s) => s.kind === 'dm'), [spaces]);
    const totalUnread = useMemo(() => spaces.reduce((n, s) => n + (s.unread_count || 0), 0), [spaces]);
    const teamPeople = useMemo(() => {
        const q = peopleFilter.trim().toLowerCase();
        return dedupeByUserId(users)
            .filter((u) => u.user_id !== currentUserId)
            .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [users, currentUserId, peopleFilter]);

    const loadSpaces = useCallback(async () => {
        try {
            const res = await chatApi.spaces();
            setSpaces(res.data);
            // Desktop: land in a default channel. Mobile: stay on the list until tapped.
            if (!spaceIdParam && res.data.length > 0 && !isMobileViewport()) {
                const general = res.data.find((s) => s.slug === 'general') || res.data[0];
                navigate(`/admin/chat/${general.id}`, { replace: true });
            }
        } catch (e) {
            handleApiError(e);
        }
    }, [navigate, spaceIdParam]);

    const loadUsers = useCallback(async () => {
        try {
            const res = await chatApi.users();
            setUsers(dedupeByUserId(res.data));
        } catch (e) {
            handleApiError(e);
        }
    }, []);

    const loadMessages = useCallback(async (spaceId: number) => {
        try {
            const res = await chatApi.messages(spaceId);
            setMessages(dedupeById(res.data));
            await chatApi.markRead(spaceId);
            setSpaces((prev) => prev.map((s) => (s.id === spaceId ? { ...s, unread_count: 0 } : s)));
        } catch (e) {
            handleApiError(e);
        }
    }, []);

    const loadThread = useCallback(async (parent: ChatMessage) => {
        try {
            const res = await chatApi.messages(parent.space_id, { parent_id: parent.id });
            setThreadMessages(dedupeById(res.data.filter((m) => m.id !== parent.id)));
        } catch (e) {
            handleApiError(e);
        }
    }, []);

    const loadPins = useCallback(async (spaceId: number) => {
        try {
            const res = await chatApi.pins(spaceId);
            setPinnedMessages(res.data);
        } catch (e) {
            handleApiError(e);
        }
    }, []);

    const handlePin = useCallback(async (messageId: number) => {
        try {
            const res = await chatApi.pin(messageId);
            const pinned = res.data.pinned;
            setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_pinned: pinned } : m)));
            setThreadMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_pinned: pinned } : m)));
            if (activeSpaceId) await loadPins(activeSpaceId);
            setShowPinsPanel(true);
        } catch (e) {
            handleApiError(e);
        }
    }, [activeSpaceId, loadPins]);

    const openAttachmentPreview = useCallback((attachment: ChatAttachment) => {
        setThreadParent(null);
        setThreadMessages([]);
        setPreviewAttachment(attachment);
    }, []);

    const handleWsEvent = useCallback((event: Record<string, unknown>) => {
        const type = event.type as string;
        const evtSpaceId = event.space_id as number | undefined;

        if (type === 'message.new' || type === 'message.updated') {
            const msg = event.message as ChatMessage | undefined;
            if (!msg) return;
            if (msg.parent_id) {
                setThreadMessages((prev) => {
                    const wasNew = !prev.some((m) => m.id === msg.id);
                    if (type === 'message.new' && wasNew) {
                        setMessages((msgs) =>
                            msgs.map((m) => (m.id === msg.parent_id ? { ...m, thread_count: m.thread_count + 1 } : m)),
                        );
                    }
                    return upsertById(prev, msg);
                });
            } else if (evtSpaceId === activeSpaceId) {
                setMessages((prev) => upsertById(prev, msg));
            }
            if (type === 'message.new') {
                setSpaces((prev) => {
                    const exists = prev.some((s) => s.id === evtSpaceId);
                    if (!exists) {
                        void loadSpaces();
                        return prev;
                    }
                    return prev.map((s) => {
                        if (s.id !== evtSpaceId) return s;
                        const viewing = evtSpaceId === activeSpaceId;
                        return {
                            ...s,
                            last_message_at: msg.created_at,
                            last_message_preview: (msg.content || '').slice(0, 80),
                            unread_count:
                                viewing || msg.user_id === currentUserId
                                    ? s.unread_count
                                    : s.unread_count + 1,
                        };
                    });
                });
            }
        }

        if (type === 'message.deleted' && evtSpaceId === activeSpaceId) {
            const messageId = event.message_id as number;
            setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: '[deleted]' } : m)));
        }

        if (type === 'reaction.updated' && evtSpaceId === activeSpaceId) {
            const messageId = event.message_id as number;
            const reactions = event.reactions as ChatMessage['reactions'];
            setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
            setThreadMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
        }
    }, [activeSpaceId, currentUserId, loadSpaces]);

    const { sendTyping } = useChatWs(handleWsEvent);

    useEffect(() => {
        void (async () => {
            setLoading(true);
            setSpacesReady(false);
            await loadSpaces();
            setSpacesReady(true);
            setLoading(false);
            // People/mentions list — don't block first paint
            void loadUsers();
        })();
    }, [loadSpaces, loadUsers]);

    useEffect(() => {
        if (!spacesReady || !activeSpaceId) return;
        void loadMessages(activeSpaceId);
        setShowPinsPanel(false);
        setPinnedMessages([]);
        setPreviewAttachment(null);
    }, [spacesReady, activeSpaceId, loadMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, threadMessages]);

    const wrapFormat = (prefix: string, suffix: string) => {
        const el = composerRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = composer.slice(start, end);
        const next = composer.slice(0, start) + prefix + selected + suffix + composer.slice(end);
        setComposer(next);
    };

    const extractMentions = (text: string) => {
        const ids: number[] = [];
        const re = /<@(\d+)>/g;
        let m;
        while ((m = re.exec(text)) !== null) ids.push(Number(m[1]));
        return ids;
    };

    const sendMessage = async (content: string, parentId?: number, clearFn?: () => void) => {
        if (!activeSpaceId || (!content.trim() && pendingAttachments.length === 0)) return;
        setSending(true);
        try {
            const res = await chatApi.sendMessage(activeSpaceId, {
                content: content.trim() || '(attachment)',
                parent_id: parentId,
                attachment_ids: pendingAttachments.map((a) => a.id),
                mentions: extractMentions(content),
            });
            if (parentId) {
                setThreadMessages((prev) => {
                    const wasNew = !prev.some((m) => m.id === res.data.id);
                    if (wasNew) {
                        setMessages((msgs) =>
                            msgs.map((m) => (m.id === parentId ? { ...m, thread_count: m.thread_count + 1 } : m)),
                        );
                    }
                    return upsertById(prev, res.data);
                });
            } else {
                setMessages((prev) => upsertById(prev, res.data));
            }
            clearFn?.();
            setPendingAttachments([]);
            setSpaces((prev) =>
                prev.map((s) =>
                    s.id === activeSpaceId
                        ? {
                              ...s,
                              last_message_at: res.data.created_at,
                              last_message_preview: (res.data.content || '').slice(0, 80),
                          }
                        : s,
                ),
            );
        } catch (e) {
            handleApiError(e);
        } finally {
            setSending(false);
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files?.length) return;
        for (const file of Array.from(files)) {
            if (!file.size) {
                handleApiError(new Error('Selected file is empty'));
                continue;
            }
            try {
                const data = await chatApi.upload(file);
                setPendingAttachments((prev) => [...prev, { id: data.id, file_name: data.file_name }]);
            } catch (e) {
                handleApiError(e);
            }
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const openThread = (msg: ChatMessage) => {
        setPreviewAttachment(null);
        setThreadParent(msg);
        void loadThread(msg);
    };

    const handleSearch = async () => {
        if (searchQuery.trim().length < 2) return;
        try {
            const res = await chatApi.search(searchQuery.trim());
            setSearchResults(res.data);
        } catch (e) {
            handleApiError(e);
        }
    };

    const createChannel = async () => {
        if (!newChannelName.trim()) return;
        try {
            const res = await chatApi.createChannel({
                name: newChannelName.trim(),
                is_private: newChannelPrivate,
            });
            setCreateChannelOpen(false);
            setNewChannelName('');
            await loadSpaces();
            navigate(`/admin/chat/${res.data.id}`);
        } catch (e) {
            handleApiError(e);
        }
    };

    const startDm = async () => {
        if (selectedDmUsers.length === 0) return;
        try {
            const res = await chatApi.createDm(selectedDmUsers);
            setNewDmOpen(false);
            setSelectedDmUsers([]);
            await loadSpaces();
            navigate(`/admin/chat/${res.data.id}`);
        } catch (e) {
            handleApiError(e);
        }
    };

    const openDmWithUser = async (userId: number) => {
        try {
            const res = await chatApi.createDm([userId]);
            await loadSpaces();
            navigate(`/admin/chat/${res.data.id}`);
        } catch (e) {
            handleApiError(e);
        }
    };

    const insertMention = (member: ChatMember) => {
        setComposer((c) => `${c}<@${member.user_id}> `);
        composerRef.current?.focus();
    };

    const breadcrumbs = [{ label: 'Team Chat' }];

    const navItemClass = (active: boolean) =>
        cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
            active
                ? 'bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] font-medium text-white shadow-sm'
                : 'text-[#001f3f] hover:bg-[#071b3a]/8 dark:text-white dark:hover:bg-white/10',
        );

    const sectionLabelClass =
        'text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]/60 dark:text-blue-200/60';

    if (loading) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="-mx-4 md:-mx-6 -mt-2 flex h-[calc(100dvh-7.5rem)] md:min-h-[520px] overflow-hidden rounded-2xl border border-white/40 bg-white/60 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
                {/* Chat sidebar — full width on mobile list; hidden when a space is open */}
                <aside
                    className={cn(
                        'shrink-0 flex-col border-r border-[#071b3a]/10 bg-gradient-to-b from-[#e8f2fd] via-[#dceaf8] to-[#d0e4f8] dark:from-[#0d1e33] dark:via-[#0a1828] dark:to-[#071220]',
                        conversationOpen
                            ? 'hidden md:flex md:w-[272px]'
                            : 'flex w-full md:w-[272px]',
                    )}
                >
                    <div className="flex items-center justify-between border-b border-[#071b3a]/10 px-4 py-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#071b3a]/15 bg-[#071b3a]/10 shadow-inner dark:border-white/10 dark:bg-white/10">
                                <MessagesSquare className="h-4 w-4 text-[#071b3a] dark:text-blue-300" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-[#001f3f] dark:text-white">Team Chat</p>
                                {totalUnread > 0 && (
                                    <Badge className="mt-0.5 h-5 bg-[#071b3a] text-[10px] text-white">{totalUnread} unread</Badge>
                                )}
                            </div>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-[#071b3a] hover:bg-[#071b3a]/10 dark:text-blue-300"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setCreateChannelOpen(true)}>Create channel</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setNewDmOpen(true)}>New message</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setShowStarred(true); void chatApi.starred().then((r) => setStarredMessages(r.data)); }}>
                                    Starred messages
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="px-3 py-2">
                        <button
                            type="button"
                            onClick={() => setSearchOpen(true)}
                            className="flex w-full items-center gap-2 rounded-lg border border-[#071b3a]/10 bg-white/70 px-3 py-2 text-sm text-[#1e3a5f]/80 shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-blue-200/80"
                        >
                            <Search className="h-4 w-4" />
                            Search messages
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2 pb-4">
                        <p className={cn('px-2 py-1', sectionLabelClass)}>Channels</p>
                        <div className="space-y-0.5">
                            {channels.map((ch) => (
                                <button
                                    key={ch.id}
                                    type="button"
                                    onClick={() => navigate(`/admin/chat/${ch.id}`)}
                                    className={navItemClass(activeSpaceId === ch.id)}
                                >
                                    {ch.is_private ? (
                                        <Lock className="h-4 w-4 shrink-0 opacity-70" />
                                    ) : (
                                        <Hash className="h-4 w-4 shrink-0 opacity-70" />
                                    )}
                                    <span className="truncate">{ch.name || ch.slug}</span>
                                    {ch.unread_count > 0 && (
                                        <Badge className="ml-auto h-5 min-w-5 justify-center bg-red-500 text-[10px] text-white">
                                            {ch.unread_count}
                                        </Badge>
                                    )}
                                </button>
                            ))}
                        </div>

                        {departmentChannels.length > 0 && (
                            <>
                                <div className="mt-4 flex w-full items-center justify-between px-2 py-1">
                                    <span className={sectionLabelClass}>Departments</span>
                                    <span className="text-[10px] text-muted-foreground">{departmentChannels.length}</span>
                                </div>
                                <div className="space-y-0.5">
                                    {departmentChannels.map((ch) => (
                                        <button
                                            key={ch.id}
                                            type="button"
                                            onClick={() => navigate(`/admin/chat/${ch.id}`)}
                                            className={navItemClass(activeSpaceId === ch.id)}
                                        >
                                            <Building2 className="h-4 w-4 shrink-0 opacity-70" />
                                            <span className="truncate">{ch.name || ch.slug}</span>
                                            {ch.unread_count > 0 && (
                                                <Badge className="ml-auto h-5 min-w-5 justify-center bg-red-500 text-[10px] text-white">
                                                    {ch.unread_count}
                                                </Badge>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="mt-4 flex w-full items-center justify-between px-2 py-1">
                            <span className={sectionLabelClass}>Direct messages</span>
                            {dms.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">{dms.length}</span>
                            )}
                        </div>
                        <div className="space-y-0.5">
                            {dms.length === 0 && (
                                <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet</p>
                            )}
                            {dms.map((dm) => (
                                <button
                                    key={dm.id}
                                    type="button"
                                    onClick={() => navigate(`/admin/chat/${dm.id}`)}
                                    className={navItemClass(activeSpaceId === dm.id)}
                                >
                                    <span
                                        className={cn(
                                            'h-2 w-2 shrink-0 rounded-full',
                                            dm.dm_members?.[0]?.is_online ? 'bg-emerald-500' : 'bg-[#071b3a]/25',
                                        )}
                                    />
                                    <span className="truncate">{spaceLabel(dm, currentUserId)}</span>
                                    {dm.unread_count > 0 && (
                                        <Badge className="ml-auto h-5 min-w-5 justify-center bg-red-500 text-[10px] text-white">
                                            {dm.unread_count}
                                        </Badge>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 flex w-full items-center justify-between px-2 py-1">
                            <span className={sectionLabelClass}>People</span>
                            <span className="text-[10px] text-muted-foreground">{teamPeople.length}</span>
                        </div>
                        <div className="px-1 pb-1">
                            <input
                                type="text"
                                value={peopleFilter}
                                onChange={(e) => setPeopleFilter(e.target.value)}
                                placeholder="Find a teammate..."
                                className="w-full rounded-lg border border-[#071b3a]/10 bg-white/80 px-2.5 py-1.5 text-xs text-[#001f3f] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#071b3a]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                            />
                        </div>
                        <div className="max-h-[220px] space-y-0.5 overflow-y-auto">
                            {teamPeople.length === 0 ? (
                                <p className="px-2 py-1 text-xs text-muted-foreground">
                                    {users.length === 0 ? 'Loading teammates…' : 'No teammates match your search'}
                                </p>
                            ) : (
                                teamPeople.map((person) => (
                                    <button
                                        key={person.user_id}
                                        type="button"
                                        onClick={() => void openDmWithUser(person.user_id)}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[#001f3f] transition hover:bg-[#071b3a]/8 dark:text-white dark:hover:bg-white/10"
                                    >
                                        <span
                                            className={cn(
                                                'h-2 w-2 shrink-0 rounded-full',
                                                person.is_online ? 'bg-emerald-500' : 'bg-[#071b3a]/25',
                                            )}
                                        />
                                        <Avatar className="h-6 w-6 shrink-0">
                                            {person.photo ? <UserAvatarPhoto path={person.photo} /> : null}
                                            <AvatarFallback className="bg-[#071b3a]/10 text-[10px] text-[#071b3a]">
                                                {initials(person.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="truncate text-left">{person.name}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </aside>

                {/* Main chat area — hidden on mobile until a space is selected */}
                <main
                    className={cn(
                        'relative min-w-0 flex-1 flex-col bg-white/50 dark:bg-slate-950/30',
                        conversationOpen ? 'flex' : 'hidden md:flex',
                    )}
                >
                    <ChatNotificationStack spaces={spaces} currentUserId={currentUserId} />
                    {activeSpace ? (
                        <>
                            <header className="flex items-center justify-between border-b border-[#071b3a]/10 bg-gradient-to-r from-[#e8f2fd]/90 via-[#dceaf8]/50 to-transparent px-4 py-3 dark:from-[#0d1e33]/90">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 md:hidden"
                                            aria-label="Back to conversations"
                                            onClick={() => navigate('/admin/chat')}
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#071b3a]/15 bg-[#071b3a]/10 dark:border-white/10 dark:bg-white/10">
                                            {activeSpace.kind === 'channel' ? (
                                                activeSpace.is_private ? (
                                                    <Lock className="h-4 w-4 text-[#071b3a] dark:text-blue-300" />
                                                ) : (
                                                    <Hash className="h-4 w-4 text-[#071b3a] dark:text-blue-300" />
                                                )
                                            ) : (
                                                <Users className="h-4 w-4 text-[#071b3a] dark:text-blue-300" />
                                            )}
                                        </div>
                                        <h2 className="truncate font-bold text-[#001f3f] dark:text-white">
                                            {activeSpace.kind === 'channel'
                                                ? `#${activeSpace.name || activeSpace.slug}`
                                                : spaceLabel(activeSpace, currentUserId)}
                                        </h2>
                                    </div>
                                    {activeSpace.topic && (
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{activeSpace.topic}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            'text-[#071b3a] hover:bg-[#071b3a]/8 dark:text-blue-300',
                                            showPinsPanel && 'bg-[#071b3a]/10',
                                        )}
                                        onClick={() => {
                                            setShowPinsPanel((v) => {
                                                const next = !v;
                                                if (next && activeSpaceId) void loadPins(activeSpaceId);
                                                return next;
                                            });
                                        }}
                                    >
                                        <Pin className="mr-1 h-4 w-4" />
                                        Pins{pinnedMessages.length > 0 ? ` (${pinnedMessages.length})` : ''}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[#071b3a] hover:bg-[#071b3a]/8 dark:text-blue-300"
                                        onClick={() => setSearchOpen(true)}
                                    >
                                        <Search className="h-4 w-4" />
                                    </Button>
                                </div>
                            </header>

                            {showPinsPanel && (
                                <div className="border-b border-amber-200/60 bg-gradient-to-r from-amber-50/90 to-[#fff8e8]/80 px-4 py-3 dark:border-amber-900/30 dark:from-amber-950/40 dark:to-[#1a1508]/40">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/80">
                                            <Pin className="h-3.5 w-3.5" />
                                            Pinned in this channel
                                        </span>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPinsPanel(false)}>
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    {pinnedMessages.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No pinned messages yet. Pin a message from the ⋯ menu.</p>
                                    ) : (
                                        <div className="max-h-36 space-y-2 overflow-y-auto">
                                            {pinnedMessages.map((msg) => (
                                                <button
                                                    key={msg.id}
                                                    type="button"
                                                    className="w-full rounded-lg border border-amber-200/50 bg-white/80 px-3 py-2 text-left text-sm transition hover:bg-white dark:border-amber-900/20 dark:bg-white/5 dark:hover:bg-white/10"
                                                    onClick={() => {
                                                        document.getElementById(`chat-msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                    }}
                                                >
                                                    <p className="font-medium text-xs text-[#071b3a] dark:text-blue-200">{msg.user_name}</p>
                                                    <p className="mt-0.5 truncate text-muted-foreground">
                                                        {msg.content === '(attachment)' && msg.attachments.length > 0
                                                            ? `📎 ${msg.attachments[0].file_name}`
                                                            : msg.content}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto py-4">
                                {messages.length === 0 ? (
                                    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[#071b3a]/15 bg-[#071b3a]/10 shadow-inner dark:border-white/10 dark:bg-white/10">
                                            {activeSpace.kind === 'channel' ? (
                                                <Hash className="h-7 w-7 text-[#071b3a] dark:text-blue-300" />
                                            ) : (
                                                <MessageSquare className="h-7 w-7 text-[#071b3a] dark:text-blue-300" />
                                            )}
                                        </div>
                                        <h3 className="text-lg font-semibold text-[#001f3f] dark:text-white">
                                            Welcome to{' '}
                                            {activeSpace.kind === 'channel'
                                                ? `#${activeSpace.name || activeSpace.slug || 'chat'}`
                                                : spaceLabel(activeSpace, currentUserId)}
                                        </h3>
                                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                            {activeSpace.description ||
                                                'This is the start of your team conversation. Send a message to get things going.'}
                                        </p>
                                    </div>
                                ) : (
                                    messages.map((msg) => (
                                        <MessageItem
                                            key={msg.id}
                                            msg={msg}
                                            users={users}
                                            currentUserId={currentUserId}
                                            onReact={async (id, emoji) => {
                                                try {
                                                    await chatApi.react(id, emoji);
                                                } catch (e) { handleApiError(e); }
                                            }}
                                            onReply={(m) => openThread(m)}
                                            onEdit={(m) => { setEditingMessage(m); setEditContent(m.content); }}
                                            onDelete={deleteMessageWithConfirm}
                                            onPin={(id) => void handlePin(id)}
                                            onStar={async (id) => {
                                                try { await chatApi.star(id); } catch (e) { handleApiError(e); }
                                            }}
                                            onOpenThread={openThread}
                                            onAttachmentPreview={openAttachmentPreview}
                                        />
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Composer */}
                            <div className="border-t border-[#071b3a]/10 bg-white/60 p-4 dark:bg-slate-900/40">
                                {pendingAttachments.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        {pendingAttachments.map((a) => (
                                            <Badge key={a.id} variant="secondary" className="gap-1">
                                                <Paperclip className="h-3 w-3" /> {a.file_name}
                                                <button type="button" onClick={() => setPendingAttachments((p) => p.filter((x) => x.id !== a.id))}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                <div className="rounded-xl border border-[#071b3a]/10 bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#071b3a]/20 dark:border-white/10 dark:bg-slate-900/60">
                                    <div className="flex items-center gap-1 border-b px-2 py-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapFormat('**', '**')}><Bold className="h-3.5 w-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapFormat('_', '_')}><Italic className="h-3.5 w-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapFormat('`', '`')}><Code className="h-3.5 w-3.5" /></Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7"><AtSign className="h-3.5 w-3.5" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="max-h-60 overflow-y-auto">
                                                {users.filter((u) => u.user_id !== currentUserId).map((u) => (
                                                    <DropdownMenuItem key={u.user_id} onClick={() => insertMention(u)}>{u.name}</DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fileInputRef.current?.click()}>
                                            <Paperclip className="h-3.5 w-3.5" />
                                        </Button>
                                        <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(e) => void handleFileUpload(e.target.files)} />
                                    </div>
                                    <div className="flex items-end gap-2 p-2">
                                        <Textarea
                                            ref={composerRef}
                                            value={composer}
                                            onChange={(e) => {
                                                setComposer(e.target.value);
                                                if (activeSpaceId) sendTyping(activeSpaceId);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    void sendMessage(composer, undefined, () => setComposer(''));
                                                }
                                            }}
                                            placeholder={`Message ${activeSpace.kind === 'channel' ? '#' + (activeSpace.name || '') : spaceLabel(activeSpace)}`}
                                            className="min-h-[44px] max-h-32 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                                            rows={1}
                                        />
                                        <Button
                                            size="icon"
                                            disabled={sending || (!composer.trim() && pendingAttachments.length === 0)}
                                            className="shrink-0 bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] text-white shadow-md hover:from-[#040f22] hover:to-[#0a3272]"
                                            onClick={() => void sendMessage(composer, undefined, () => setComposer(''))}
                                        >
                                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1 px-1">Enter to send · Shift+Enter for new line · **bold** _italic_ `code`</p>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-muted-foreground">
                            Select a channel or start a conversation
                        </div>
                    )}
                </main>

                {/* Media preview panel — inside chat layout */}
                {previewAttachment && (
                    <MediaPreviewPanel
                        attachment={previewAttachment}
                        onClose={() => setPreviewAttachment(null)}
                    />
                )}

                {/* Thread panel */}
                {threadParent && !previewAttachment && (
                    <aside className="flex w-[380px] shrink-0 flex-col border-l border-[#071b3a]/10 bg-gradient-to-b from-[#f4f9ff] to-white dark:from-[#0d1e33] dark:to-[#071220]">
                        <header className="flex items-center justify-between border-b border-[#071b3a]/10 bg-[#e8f2fd]/50 px-4 py-3 dark:bg-[#0d1e33]/50">
                            <div>
                                <h3 className="font-semibold">Thread</h3>
                                <p className="text-xs text-muted-foreground truncate max-w-[280px]">{threadParent.content.slice(0, 60)}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => { setThreadParent(null); setThreadMessages([]); }}>
                                <X className="h-4 w-4" />
                            </Button>
                        </header>
                        <div className="flex-1 overflow-y-auto py-2 border-b">
                            <MessageItem
                                msg={threadParent}
                                users={users}
                                currentUserId={currentUserId}
                                onReact={async (id, emoji) => { try { await chatApi.react(id, emoji); } catch (e) { handleApiError(e); } }}
                                onReply={() => {}}
                                onEdit={(m) => { setEditingMessage(m); setEditContent(m.content); }}
                                onDelete={deleteMessageWithConfirm}
                                onPin={(id) => void handlePin(id)}
                                onStar={async (id) => { try { await chatApi.star(id); } catch (e) { handleApiError(e); } }}
                                onOpenThread={() => {}}
                                onAttachmentPreview={openAttachmentPreview}
                            />
                            {threadMessages.map((msg) => (
                                <MessageItem
                                    key={msg.id}
                                    msg={msg}
                                    users={users}
                                    currentUserId={currentUserId}
                                    onReact={async (id, emoji) => { try { await chatApi.react(id, emoji); } catch (e) { handleApiError(e); } }}
                                    onReply={() => {}}
                                    onEdit={(m) => { setEditingMessage(m); setEditContent(m.content); }}
                                    onDelete={deleteMessageWithConfirm}
                                    onPin={(id) => void handlePin(id)}
                                    onStar={async (id) => { try { await chatApi.star(id); } catch (e) { handleApiError(e); } }}
                                    onOpenThread={() => {}}
                                    onAttachmentPreview={openAttachmentPreview}
                                />
                            ))}
                        </div>
                        <div className="p-3">
                            <div className="flex gap-2">
                                <Textarea
                                    value={threadComposer}
                                    onChange={(e) => setThreadComposer(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            void sendMessage(threadComposer, threadParent.id, () => setThreadComposer(''));
                                        }
                                    }}
                                    placeholder="Reply in thread..."
                                    className="min-h-[40px] resize-none"
                                    rows={1}
                                />
                                <Button
                                    size="icon"
                                    disabled={sending || !threadComposer.trim()}
                                    className="bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] text-white shadow-md hover:from-[#040f22] hover:to-[#0a3272]"
                                    onClick={() => void sendMessage(threadComposer, threadParent.id, () => setThreadComposer(''))}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </aside>
                )}
            </div>

            {/* Search dialog */}
            <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Search messages</DialogTitle></DialogHeader>
                    <div className="flex gap-2">
                        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." onKeyDown={(e) => e.key === 'Enter' && void handleSearch()} />
                        <Button onClick={() => void handleSearch()}>Search</Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-2 mt-2">
                        {searchResults.map((msg) => (
                            <button
                                key={msg.id}
                                type="button"
                                className="w-full text-left rounded-lg border p-3 hover:bg-muted text-sm"
                                onClick={() => { setSearchOpen(false); navigate(`/admin/chat/${msg.space_id}`); }}
                            >
                                <p className="font-medium">{msg.user_name}</p>
                                <p className="text-muted-foreground truncate">{msg.content}</p>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create channel */}
            <Dialog open={createChannelOpen} onOpenChange={setCreateChannelOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create a channel</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Channel name</Label>
                            <Input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. marketing" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="private" checked={newChannelPrivate} onCheckedChange={(v) => setNewChannelPrivate(!!v)} />
                            <Label htmlFor="private">Make private</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateChannelOpen(false)}>Cancel</Button>
                        <Button onClick={() => void createChannel()}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* New DM */}
            <Dialog open={newDmOpen} onOpenChange={setNewDmOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>New message</DialogTitle></DialogHeader>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                        {users.filter((u) => u.user_id !== currentUserId).map((u) => (
                            <label key={u.user_id} className="flex items-center gap-3 rounded-lg border p-2 cursor-pointer hover:bg-muted">
                                <Checkbox
                                    checked={selectedDmUsers.includes(u.user_id)}
                                    onCheckedChange={(checked) => {
                                        setSelectedDmUsers((prev) =>
                                            checked ? [...prev, u.user_id] : prev.filter((id) => id !== u.user_id),
                                        );
                                    }}
                                />
                                <Avatar className="h-8 w-8">
                                    {u.photo ? <UserAvatarPhoto path={u.photo} /> : null}
                                    <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm font-medium">{u.name}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                                {u.is_online && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />}
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewDmOpen(false)}>Cancel</Button>
                        <Button onClick={() => void startDm()} disabled={selectedDmUsers.length === 0}>Start conversation</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showStarred} onOpenChange={setShowStarred}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Starred messages</DialogTitle></DialogHeader>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                        {starredMessages.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No starred messages yet</p>
                        ) : starredMessages.map((msg) => (
                            <button
                                key={msg.id}
                                type="button"
                                className="w-full text-left rounded-lg border p-3 text-sm hover:bg-muted"
                                onClick={() => { setShowStarred(false); navigate(`/admin/chat/${msg.space_id}`); }}
                            >
                                <p className="font-medium">{msg.user_name}</p>
                                <p className="truncate text-muted-foreground">{msg.content}</p>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit message */}
            <Dialog open={!!editingMessage} onOpenChange={(o) => !o && setEditingMessage(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit message</DialogTitle></DialogHeader>
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingMessage(null)}>Cancel</Button>
                        <Button onClick={async () => {
                            if (!editingMessage) return;
                            try {
                                const res = await chatApi.editMessage(editingMessage.id, editContent);
                                setMessages((prev) => prev.map((m) => (m.id === res.data.id ? res.data : m)));
                                setThreadMessages((prev) => prev.map((m) => (m.id === res.data.id ? res.data : m)));
                                setEditingMessage(null);
                            } catch (e) { handleApiError(e); }
                        }}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
