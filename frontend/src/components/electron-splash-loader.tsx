/** Electron uses electron/splash.html — no separate React splash. */
export function ElectronSplashLoader(_props?: { message?: string }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}
