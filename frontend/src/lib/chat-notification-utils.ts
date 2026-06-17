import type { ChatMessage } from '@/lib/chat-api';
import { storageUrl } from '@/lib/storage-url';

export function messagePreview(msg: ChatMessage): string {
    if (msg.is_deleted) return 'Message removed';
    if (msg.content?.trim()) return msg.content.slice(0, 120);
    if (msg.attachments?.length) {
        const count = msg.attachments.length;
        return count === 1 ? `Attachment: ${msg.attachments[0].file_name}` : `${count} attachments`;
    }
    return 'New message';
}

export function chatUserPhotoUrl(photo?: string | null): string | undefined {
    if (!photo) return undefined;
    return storageUrl(photo);
}

export function shouldNotifyChatMessage(
    msg: ChatMessage,
    currentUserId: number | undefined,
    pathname: string,
): boolean {
    if (!currentUserId || msg.user_id === currentUserId) return false;

    const chatMatch = pathname.match(/^\/admin\/chat\/(\d+)/);
    const activeSpaceId = chatMatch ? Number(chatMatch[1]) : null;

    if (document.hasFocus() && activeSpaceId === msg.space_id) return false;

    return true;
}
