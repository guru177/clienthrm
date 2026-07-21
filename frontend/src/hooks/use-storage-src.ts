import { useEffect, useState } from 'react';
import {
    fetchAuthenticatedBlobUrl,
    storageUrl,
} from '@/lib/storage-url';

/** Resolve a storage path to an img `src` via authenticated blob fetch (media tags cannot send Bearer).
 * Returns `undefined` while loading / on failure so consumers never pass `src=""`. */
export function useStorageSrc(path: string | null | undefined): string | undefined {
    const [src, setSrc] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!path?.trim()) {
            setSrc(undefined);
            return;
        }

        const url = storageUrl(path);
        if (!url) {
            setSrc(undefined);
            return;
        }

        let cancelled = false;
        setSrc(undefined);
        fetchAuthenticatedBlobUrl(url).then((resolved) => {
            if (cancelled) return;
            setSrc(resolved || undefined);
        });

        // Do not revoke blob: URLs here — they are owned by the shared storage blob cache.
        // Revoking on unmount left a dead URL in the cache, so returning to the page showed
        // a blank avatar until a full cache clear.
        return () => {
            cancelled = true;
        };
    }, [path]);

    return src;
}
