import { isElectronApp } from '@/lib/is-electron';

/** Redirect to login in browser (BrowserRouter) and Electron (HashRouter). */
export function navigateToLogin(): void {
    if (isElectronApp()) {
        window.location.hash = '#/login';
        return;
    }
    window.location.href = '/login';
}
