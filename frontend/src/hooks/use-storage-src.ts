import { useEffect, useState } from 'react';
import {
    fetchAuthenticatedBlobUrl,
    storageUrl,
} from '@/lib/storage-url';

/** Resolve a storage path to an img `src` via authenticated blob fetch (media tags cannot send Bearer). */
export function useStorageSrc(path: string | null | undefined): string {
    const [src, setSrc] = useState('');

    useEffect(() => {
        if (!path?.trim()) {
            setSrc('');
            return;
        }

        const url = storageUrl(path);
        if (!url) {
            setSrc('');
            return;
        }

        let cancelled = false;
        let blobUrl: string | null = null;
        fetchAuthenticatedBlobUrl(url).then((resolved) => {
            if (cancelled) {
                if (resolved.startsWith('blob:')) URL.revokeObjectURL(resolved);
                return;
            }
            blobUrl = resolved;
            setSrc(resolved);
        });

        return () => {
            cancelled = true;
            if (blobUrl?.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
        };
    }, [path]);

    return src;
}
