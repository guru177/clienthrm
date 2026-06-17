import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChatNotificationPush } from '@/contexts/ChatNotificationContext';
import { useChatWs } from '@/hooks/use-chat-ws';
import { showDesktopNotification, requestNotificationPermission } from '@/lib/desktop-notifications';
import { messagePreview, shouldNotifyChatMessage } from '@/lib/chat-notification-utils';
import type { ChatMessage } from '@/lib/chat-api';

export function useChatNotifications() {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const inbox = useChatNotificationPush();
    const isOnChatPage = location.pathname.startsWith('/admin/chat');

    useEffect(() => {
        void requestNotificationPermission();
    }, []);

    const handleEvent = useCallback(
        (event: Record<string, unknown>) => {
            if (event.type !== 'message.new') return;

            const msg = event.message as ChatMessage | undefined;
            if (!msg || !shouldNotifyChatMessage(msg, user?.id, location.pathname)) return;

            const spaceId = msg.space_id;
            const senderName = msg.user_name || 'New message';
            const preview = messagePreview(msg);
            const goToChat = () => navigate(`/admin/chat/${spaceId}`);

            if (isOnChatPage && inbox) {
                inbox.push({
                    id: `chat-${spaceId}-${msg.id}`,
                    spaceId,
                    senderName,
                    preview,
                    userPhoto: msg.user_photo,
                });
            }

            if (!isOnChatPage || !document.hasFocus()) {
                showDesktopNotification({
                    title: senderName,
                    body: preview,
                    tag: `chat-${spaceId}-${msg.id}`,
                    onClick: goToChat,
                });
            }
        },
        [user?.id, location.pathname, navigate, isOnChatPage, inbox],
    );

    useChatWs(handleEvent, !!user);
}
