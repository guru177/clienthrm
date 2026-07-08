import type { ImgHTMLAttributes } from 'react';
import { useStorageSrc } from '@/hooks/use-storage-src';

type StorageImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    path: string | null | undefined;
};

/** Image backed by authenticated storage (cookie on web, Bearer blob on Electron). */
export function StorageImg({ path, alt = '', ...props }: StorageImgProps) {
    const src = useStorageSrc(path);
    if (!src) return null;
    return <img src={src} alt={alt} {...props} />;
}
