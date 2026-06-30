import AppLogoIcon from './app-logo-icon';
import { useAuth } from '@/contexts/AuthContext';
import { storageUrl } from '@/lib/storage-url';
import { staticAssetUrl } from '@/lib/static-asset';

export default function AppLogo() {
    const { settings } = useAuth();
    const appName = settings?.app_name || "Raintech HRM";
    const appLogo = settings?.app_logo ? storageUrl(settings.app_logo) : staticAssetUrl('images/logo.webp');

    return (
        <>
            {/* Logo */}
            <div className="flex aspect-square size-8 items-center justify-center rounded-md overflow-hidden">
                <img
                    src={appLogo}
                    alt={appName}
                    className="size-10 object-contain"
                />
            </div>

            {/* App Name */}
            <div className="ml-1 grid flex-1 text-left text-[18px]">
                <span className="mb-0.5 truncate leading-tight font-semibold">
                    {appName}
                </span>
            </div>
        </>
    );
}