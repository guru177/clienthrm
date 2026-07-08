import { useAuth } from '@/contexts/AuthContext';
import { staticAssetUrl } from '@/lib/static-asset';
import { useStorageSrc } from '@/hooks/use-storage-src';

export default function AppLogo() {
    const { settings } = useAuth();
    const appName = settings?.app_name || "Raintech HRM";
    const logoSrc = useStorageSrc(settings?.app_logo);
    const appLogo = settings?.app_logo ? logoSrc : staticAssetUrl('images/logo.png');

    return (
        <div className="flex min-h-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white px-2 py-1 shadow-sm ring-1 ring-border/40">
            <img
                src={appLogo}
                alt={appName}
                className="h-auto w-full max-w-[120px] object-contain"
            />
        </div>
    );
}