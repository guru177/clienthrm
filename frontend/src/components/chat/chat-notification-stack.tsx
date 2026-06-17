import { MessageSquare, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useChatNotificationInbox } from '@/contexts/ChatNotificationContext';
import { chatUserPhotoUrl } from '@/lib/chat-notification-utils';
import type { ChatSpace } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function spaceTitle(space: ChatSpace, currentUserId?: number): string {
    if (space.kind === 'channel') return `#${space.name || space.slug || 'channel'}`;
    if (space.dm_members?.length === 1) return space.dm_members[0].name;
    if (space.dm_members?.length) {
        return space.dm_members.map((m) => m.name.split(' ')[0]).join(', ');
    }
    return space.name || 'Direct message';
}

type ChatNotificationStackProps = {
    spaces: ChatSpace[];
    currentUserId?: number;
};

export function ChatNotificationStack({ spaces, currentUserId }: ChatNotificationStackProps) {
    const { items, dismiss, openChat } = useChatNotificationInbox();

    if (items.length === 0) return null;

    const spaceById = new Map(spaces.map((s) => [s.id, s]));

    return (
        <div
            className="pointer-events-none absolute right-4 top-[4.25rem] z-50 flex w-[min(100%,20rem)] flex-col gap-2"
            aria-live="polite"
        >
            {items.map((item) => {
                const space = spaceById.get(item.spaceId);
                const fromLabel = space ? spaceTitle(space, currentUserId) : 'Another conversation';
                const photoUrl = chatUserPhotoUrl(item.userPhoto);

                return (
                    <div
                        key={item.id}
                        className={cn(
                            'pointer-events-auto flex items-start gap-3 rounded-xl border border-[#071b3a]/15',
                            'bg-white/95 p-3 shadow-lg backdrop-blur-md',
                            'animate-in slide-in-from-top-2 fade-in duration-200',
                            'dark:border-white/10 dark:bg-slate-900/95',
                        )}
                    >
                        <button
                            type="button"
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            onClick={() => {
                                dismiss(item.id);
                                openChat(item.spaceId);
                            }}
                        >
                            <Avatar className="size-10 shrink-0">
                                {photoUrl && <AvatarImage src={photoUrl} alt={item.senderName} />}
                                <AvatarFallback className="bg-[#071b3a]/10 text-xs font-medium text-[#071b3a] dark:text-blue-200">
                                    {initials(item.senderName)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <MessageSquare className="size-3.5 shrink-0 text-[#071b3a] dark:text-blue-300" />
                                    <p className="truncate text-sm font-semibold text-[#001f3f] dark:text-white">
                                        {item.senderName}
                                    </p>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{fromLabel}</p>
                                <p className="mt-1 line-clamp-2 text-sm text-[#1e3a5f]/90 dark:text-blue-100/90">
                                    {item.preview}
                                </p>
                            </div>
                        </button>
                        <button
                            type="button"
                            aria-label="Dismiss"
                            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-[#071b3a]/8 hover:text-foreground"
                            onClick={() => dismiss(item.id)}
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
