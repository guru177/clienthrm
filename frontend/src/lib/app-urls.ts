/** Platform admin app origin (separate dev server). */
export function platformAppUrl(): string {
    return (import.meta.env.VITE_PLATFORM_APP_URL || 'http://localhost:5175').replace(/\/$/, '');
}
