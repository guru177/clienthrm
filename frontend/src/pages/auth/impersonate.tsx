import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { setToken, setRefreshToken } from '@/lib/api';
import { setImpersonation } from '@/lib/impersonation';

function PageLoader() {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}

/** Accepts tenant JWT from the platform app (cross-origin) and starts an impersonation session. */
export default function ImpersonateCallback() {
    const [searchParams] = useSearchParams();
    const [error, setError] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        const refreshToken = searchParams.get('refresh_token');
        const orgSlug = searchParams.get('org_slug');
        const orgName = searchParams.get('org_name');
        const next = searchParams.get('next') || '/admin/dashboard';

        if (!token || !orgSlug || !orgName) {
            setError('Invalid impersonation link. Missing required parameters.');
            return;
        }

        setToken(token);
        if (refreshToken) {
            setRefreshToken(refreshToken);
        }
        setImpersonation(orgSlug, orgName);
        window.location.replace(next);
    }, [searchParams]);

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6">
                <p className="text-center text-sm text-destructive">{error}</p>
            </div>
        );
    }

    return <PageLoader />;
}
