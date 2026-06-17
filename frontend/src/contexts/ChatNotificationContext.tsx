import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

export type ChatNotificationItem = {
    id: string;
    spaceId: number;
    senderName: string;
    preview: string;
    userPhoto?: string | null;
};

type ChatNotificationContextValue = {
    items: ChatNotificationItem[];
    push: (item: ChatNotificationItem) => void;
    dismiss: (id: string) => void;
    openChat: (spaceId: number) => void;
};

const ChatNotificationContext = createContext<ChatNotificationContextValue | null>(null);

const AUTO_DISMISS_MS = 8000;
const MAX_ITEMS = 4;

export function ChatNotificationProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ChatNotificationItem[]>([]);
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const navigate = useNavigate();

    const dismiss = useCallback((id: string) => {
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setItems((prev) => prev.filter((i) => i.id !== id));
    }, []);

    const push = useCallback(
        (item: ChatNotificationItem) => {
            setItems((prev) => {
                const withoutDup = prev.filter((i) => i.id !== item.id);
                return [...withoutDup, item].slice(-MAX_ITEMS);
            });

            const existing = timersRef.current.get(item.id);
            if (existing) clearTimeout(existing);

            timersRef.current.set(
                item.id,
                setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS),
            );
        },
        [dismiss],
    );

    const openChat = useCallback(
        (spaceId: number) => {
            navigate(`/admin/chat/${spaceId}`);
            setItems((prev) => prev.filter((i) => i.spaceId !== spaceId));
        },
        [navigate],
    );

    const value = useMemo(
        () => ({ items, push, dismiss, openChat }),
        [items, push, dismiss, openChat],
    );

    return (
        <ChatNotificationContext.Provider value={value}>
            {children}
        </ChatNotificationContext.Provider>
    );
}

export function useChatNotificationInbox() {
    const ctx = useContext(ChatNotificationContext);
    if (!ctx) {
        throw new Error('useChatNotificationInbox must be used within ChatNotificationProvider');
    }
    return ctx;
}

export function useChatNotificationPush() {
    return useContext(ChatNotificationContext);
}
