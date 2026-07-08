import { describe, expect, it } from 'vitest';
import { storageUrl } from './storage-url';

describe('storageUrl', () => {
    it('normalizes admin file paths without query tokens', () => {
        expect(storageUrl('/admin/files/photos/u1.jpg')).toContain('/admin/files/photos/u1.jpg');
        expect(storageUrl('/admin/files/photos/u1.jpg')).not.toContain('token=');
    });

    it('passes through data URLs', () => {
        const data = 'data:image/png;base64,abc';
        expect(storageUrl(data)).toBe(data);
    });
});
