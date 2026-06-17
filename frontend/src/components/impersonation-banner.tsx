import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { clearToken } from '@/lib/api';
import { clearImpersonation, getImpersonation } from '@/lib/impersonation';
import { platformAppUrl } from '@/lib/app-urls';

export function ImpersonationBanner() {
    const [info, setInfo] = useState<{ orgSlug: string; orgName: string } | null>(null);

    useEffect(() => {
        setInfo(getImpersonation());
    }, []);

    if (!info) return null;

    function endImpersonation() {
        clearImpersonation();
        clearToken();
        window.location.replace(platformAppUrl());
    }

    return (
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-sm">
            <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>
                    Platform admin session — viewing <strong>{info.orgName}</strong> ({info.orgSlug})
                </span>
            </div>
            <button
                type="button"
                onClick={endImpersonation}
                className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50"
            >
                End impersonation
            </button>
        </div>
    );
}
