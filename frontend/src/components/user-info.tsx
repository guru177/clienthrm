import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/hooks/use-initials';
import { useStorageSrc } from '@/hooks/use-storage-src';
import type { OrgPlanInfo } from '@/lib/plan-modules';
import { type User } from '@/types';

function planSubtitle(plan: OrgPlanInfo): { text: string; tone: 'default' | 'warning' | 'danger' } {
    if (!plan.plan_expires_at) {
        return { text: `${plan.name} · No expiry`, tone: 'default' };
    }
    if (plan.subscription_expired) {
        return { text: `${plan.name} · Expired`, tone: 'danger' };
    }
    const days = plan.days_remaining;
    if (days == null) {
        return { text: plan.name, tone: 'default' };
    }
    if (days === 0) {
        return { text: `${plan.name} · Expires today`, tone: 'warning' };
    }
    const daysLabel = `${days} day${days === 1 ? '' : 's'} left`;
    return {
        text: `${plan.name} · ${daysLabel}`,
        tone: days <= 7 ? 'warning' : 'default',
    };
}

const subtitleToneClass = {
    default: 'text-muted-foreground',
    warning: 'text-amber-600 dark:text-amber-500',
    danger: 'text-red-600 dark:text-red-500',
} as const;

export function UserInfo({
    user,
    showEmail = false,
    plan,
}: {
    user: User;
    showEmail?: boolean;
    plan?: OrgPlanInfo | null;
}) {
    const getInitials = useInitials();
    const photoSrc = useStorageSrc(user.photo || user.avatar);
    const subscription = plan ? planSubtitle(plan) : null;

    return (
        <>
            <Avatar className="h-8 w-8 overflow-hidden rounded-full">
                <AvatarImage src={photoSrc || undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg bg-neutral-200 text-black dark:bg-neutral-700 dark:text-white">
                    {getInitials(user.name)}
                </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                {showEmail && (
                    <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                    </span>
                )}
                {subscription && (
                    <span
                        className={`truncate text-xs ${subtitleToneClass[subscription.tone]}`}
                    >
                        {subscription.text}
                    </span>
                )}
            </div>
        </>
    );
}
