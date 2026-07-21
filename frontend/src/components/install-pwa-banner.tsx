import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

const DISMISS_KEY = 'hrm_pwa_install_dismissed';

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallPwaBanner() {
    const isMobile = useIsMobile();
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!isMobile) return;
        if (localStorage.getItem(DISMISS_KEY) === '1') return;

        const onPrompt = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
            setVisible(true);
        };

        window.addEventListener('beforeinstallprompt', onPrompt);
        return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }, [isMobile]);

    if (!isMobile || !visible || !deferred) return null;

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, '1');
        setVisible(false);
        setDeferred(null);
    };

    const install = async () => {
        await deferred.prompt();
        await deferred.userChoice;
        dismiss();
    };

    return (
        <div
            data-testid="install-pwa-banner"
            className="fixed inset-x-0 z-50 mx-auto max-w-lg px-3 md:hidden"
            style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        >
            <div className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-lg">
                <Download className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Install HRM app</p>
                    <p className="text-xs text-muted-foreground">
                        Add to your home screen for faster clock-in
                    </p>
                </div>
                <Button size="sm" className="min-h-11 shrink-0" onClick={() => void install()}>
                    Install
                </Button>
                <button
                    type="button"
                    aria-label="Dismiss install prompt"
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={dismiss}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
