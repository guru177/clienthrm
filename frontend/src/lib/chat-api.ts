import axios from '@/lib/axios';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

export interface ChatMember {
    user_id: number;
    name: string;
    email: string;
    photo?: string | null;
    is_online: boolean;
}

export interface ChatSpace {
    id: number;
    organization_id: number;
    kind: 'channel' | 'dm';
    name?: string | null;
    slug?: string | null;
    description?: string | null;
    topic?: string | null;
    is_private: boolean;
    department_id?: number | null;
    created_by?: number | null;
    member_count: number;
    unread_count: number;
    last_message_at?: string | null;
    last_message_preview?: string | null;
    dm_members?: ChatMember[] | null;
    created_at: string;
    updated_at: string;
}

export interface ChatReaction {
    emoji: string;
    count: number;
    user_ids: number[];
    reacted_by_me: boolean;
}

export interface ChatAttachment {
    id: number;
    file_name: string;
    file_url: string;
    file_size: number;
    mime_type?: string | null;
}

export interface ChatMessage {
    id: number;
    space_id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    user_photo?: string | null;
    parent_id?: number | null;
    content: string;
    is_edited: boolean;
    is_deleted: boolean;
    is_pinned: boolean;
    is_starred: boolean;
    thread_count: number;
    reactions: ChatReaction[];
    attachments: ChatAttachment[];
    mentions: number[];
    created_at: string;
    updated_at: string;
}

export const chatApi = {
    spaces: () => apiGet<ChatSpace[]>('/admin/chat/spaces'),
    users: () => apiGet<ChatMember[]>('/admin/chat/users'),
    messages: (spaceId: number, params?: { before?: number; parent_id?: number; thread?: boolean }) =>
        apiGet<ChatMessage[]>(`/admin/chat/spaces/${spaceId}/messages`, params as Record<string, string | number | undefined>),
    sendMessage: (spaceId: number, body: { content: string; parent_id?: number; attachment_ids?: number[]; mentions?: number[] }) =>
        apiPost<ChatMessage>(`/admin/chat/spaces/${spaceId}/messages`, body),
    editMessage: (id: number, content: string) => apiPatch<ChatMessage>(`/admin/chat/messages/${id}`, { content }),
    deleteMessage: (id: number) => apiDelete(`/admin/chat/messages/${id}`),
    react: (id: number, emoji: string) => apiPost<ChatReaction[]>(`/admin/chat/messages/${id}/reactions`, { emoji }),
    pin: (id: number) => apiPost<{ pinned: boolean }>(`/admin/chat/messages/${id}/pin`),
    star: (id: number) => apiPost<{ starred: boolean }>(`/admin/chat/messages/${id}/star`),
    markRead: (spaceId: number) => apiPost(`/admin/chat/spaces/${spaceId}/read`),
    search: (q: string) => apiGet<ChatMessage[]>('/admin/chat/search', { q }),
    pins: (spaceId: number) => apiGet<ChatMessage[]>(`/admin/chat/spaces/${spaceId}/pins`),
    starred: () => apiGet<ChatMessage[]>('/admin/chat/starred'),
    createChannel: (body: { name: string; description?: string; is_private?: boolean; member_ids?: number[] }) =>
        apiPost<ChatSpace>('/admin/chat/channels', body),
    updateChannel: (id: number, body: { name?: string; description?: string; topic?: string }) =>
        apiPatch<ChatSpace>(`/admin/chat/channels/${id}`, body),
    joinChannel: (id: number) => apiPost(`/admin/chat/channels/${id}/join`),
    leaveChannel: (id: number) => apiPost(`/admin/chat/channels/${id}/leave`),
    addMembers: (id: number, user_ids: number[]) => apiPost(`/admin/chat/channels/${id}/members`, { user_ids }),
    createDm: (user_ids: number[]) => apiPost<ChatSpace>('/admin/chat/dm', { user_ids }),
    upload: async (file: File) => {
        if (!file.size) {
            throw new Error('Selected file is empty');
        }
        const form = new FormData();
        form.append('file', file, file.name);
        const res = await axios.post('/admin/chat/upload', form);
        return res.data.data as { id: number; file_name: string; file_url: string; file_size: number; mime_type?: string };
    },
};

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '🔥', '✅', '💯', '🚀'];
