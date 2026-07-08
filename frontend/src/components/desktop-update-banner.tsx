import { useEffect, useState } from 'react';
import { Download, RefreshCw, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isElectronApp } from '@/lib/is-electron';
import type { DesktopUpdateEvent } from '@/types';

export function DesktopUpdateBanner() {
    const [event, setEvent] = useState<DesktopUpdateEvent | null>(null);
    const [busy, setBusy] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!isElectronApp() || !window.electron?.onDesktopUpdate) return;
        return window.electron.onDesktopUpdate((payload) => {
            setEvent(payload);
            if (payload.status === 'available' || payload.status === 'downloaded') {
                setDismissed(false);
            }
        });
    }, []);

    if (!isElectronApp() || dismissed || !event) return null;

    const showBanner =
        event.status === 'available' ||
        event.status === 'downloaded' ||
        event.status === 'download-progress' ||
        event.status === 'checking';

    if (!showBanner) return null;

    async function handleDownload() {
        if (!window.electron?.downloadUpdate) return;
        setBusy(true);
        try {
            await window.electron.downloadUpdate();
        } finally {
            setBusy(false);
        }
    }

    async function handleInstall() {
        if (!window.electron?.installUpdate) return;
        setBusy(true);
        await window.electron.installUpdate();
    }

    async function handleRecheck() {
        if (!window.electron?.checkForUpdates) return;
        setBusy(true);
        setDismissed(false);
        try {
            await window.electron.checkForUpdates();
        } finally {
            setBusy(false);
        }
    }

    let message = 'Checking for updates…';
    if (event.status === 'available') {
        message = `HR Daddy ${event.version ?? ''} is available.`.trim();
    } else if (event.status === 'download-progress') {
        message = `Downloading update… ${Math.round(event.percent ?? 0)}%`;
    } else if (event.status === 'downloaded') {
        message = `Update ${event.version ?? ''} ready to install.`.trim();
    }

    return (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{message}</p>
                <div className="flex flex-wrap items-center gap-2">
                    {event.status === 'available' && (
                        <Button size="sm" onClick={handleDownload} disabled={busy}>
                            <Download className="mr-1 h-4 w-4" />
                            Download
                        </Button>
                    )}
                    {event.status === 'downloaded' && (
                        <Button size="sm" onClick={handleInstall} disabled={busy}>
                            <RotateCw className="mr-1 h-4 w-4" />
                            Restart to update
                        </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={handleRecheck} disabled={busy}>
                        <RefreshCw className="mr-1 h-4 w-4" />
                        Check again
                    </Button>
                    {event.status !== 'download-progress' && (
                        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                            Dismiss
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
