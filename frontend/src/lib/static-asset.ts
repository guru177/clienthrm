/** Public folder assets — correct in Vite dev, web build, and Electron (`base: './'`). */
export function staticAssetUrl(relativePath: string): string {
    const path = relativePath.replace(/^\//, '');
    const base = import.meta.env.BASE_URL || '/';
    return `${base}${path}`;
}
