import { cn } from '@/lib/utils';
import { useStorageSrc } from '@/hooks/use-storage-src';

interface OrgNotificationBannerProps {
    imageUrl?: string | null;
    previewSrc?: string | null;
    className?: string;
    imgClassName?: string;
    alt?: string;
}

export function OrgNotificationBanner({
    imageUrl,
    previewSrc,
    className,
    imgClassName,
    alt = '',
}: OrgNotificationBannerProps) {
    const storageSrc = useStorageSrc(imageUrl);
    const src = previewSrc?.trim() || storageSrc || undefined;
    if (!src) return null;

    return (
        <div
            className={cn(
                'relative flex w-full items-center justify-center overflow-hidden bg-[#eef4fc] dark:bg-[#0a1828]',
                className,
            )}
        >
            <img
                src={src}
                alt={alt}
                className={cn(
                    'mx-auto block h-auto max-h-40 w-auto max-w-full object-contain object-center',
                    imgClassName,
                )}
                onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                }}
            />
        </div>
    );
}
