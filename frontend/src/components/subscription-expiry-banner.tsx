import { AlertTriangle } from 'lucide-react';
import type { OrgPlanInfo } from '@/lib/plan-modules';

function formatDate(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
}

export default function SubscriptionExpiryBanner({ plan }: { plan: OrgPlanInfo | null }) {
    if (!plan?.plan_expires_at) return null;

    if (plan.subscription_expired) {
        return (
            <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                    Your <strong>{plan.name}</strong> subscription expired on{' '}
                    {formatDate(plan.plan_expires_at)}. Contact your platform admin to renew access.
                </p>
            </div>
        );
    }

    const days = plan.days_remaining;
    if (days == null || days > 7) return null;

    return (
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
                Your <strong>{plan.name}</strong> subscription expires in{' '}
                <strong>{days === 0 ? 'less than 1 day' : `${days} day${days === 1 ? '' : 's'}`}</strong>
                {plan.plan_expires_at ? ` (${formatDate(plan.plan_expires_at)})` : ''}.
            </p>
        </div>
    );
}
