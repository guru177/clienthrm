import { useAuth } from '@/contexts/AuthContext';
import { staticAssetUrl } from '@/lib/static-asset';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { cn } from '@/lib/utils';

type AppLogoProps = {
    showName?: boolean;
    className?: string;
};

export default function AppLogo({ showName = true, className }: AppLogoProps) {
    const { settings } = useAuth();
    const appName = settings?.app_name || 'HR Daddy';
    const logoSrc = useStorageSrc(settings?.app_logo);
    // Fall back while blob URL loads — never pass src="" (triggers full-page refetch warning).
    const appLogo = logoSrc || staticAssetUrl('images/logo.png');

    return (
        <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
            <img
                src={appLogo}
                alt={appName}
                className="h-10 w-10 shrink-0 object-contain group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
            />
            {showName ? (
                <span className="truncate text-base font-semibold leading-tight text-foreground group-data-[collapsible=icon]:hidden">
                    {appName}
                </span>
            ) : null}
        </div>
    );
}