import toast from 'react-hot-toast';

interface ToastOptions {
    type?: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
}

/**
 * Show a toast notification with custom styling based on type
 */
export function showToast({ type = 'info', message, duration = 4000 }: ToastOptions) {
    const styles: Record<string, any> = {
        success: {
            background: 'hsl(142 76% 36%)',
            color: 'hsl(0 0% 100%)',
            border: '1px solid hsl(142 76% 30%)',
        },
        error: {
            background: 'hsl(0 84% 60%)',
            color: 'hsl(0 0% 100%)',
            border: '1px solid hsl(0 84% 50%)',
        },
        warning: {
            background: 'hsl(38 92% 50%)',
            color: 'hsl(0 0% 100%)',
            border: '1px solid hsl(38 92% 40%)',
        },
        info: {
            background: 'hsl(221 83% 53%)',
            color: 'hsl(0 0% 100%)',
            border: '1px solid hsl(221 83% 43%)',
        },
    };

    const style = styles[type] || styles.info;

    toast(message, {
        duration,
        style,
        iconTheme: {
            primary: 'hsl(0 0% 100%)',
            secondary: style.background,
        },
    });
}

/**
 * Handle API response and show appropriate toast
 */
export function handleApiResponse(response: any) {
    const body = response?.data ?? {};
    const type = body.type ?? 'success';
    // Success payloads nest the message under `data`; errors put it at the top level.
    const message = body.message ?? body.data?.message;

    if (message) {
        showToast({ type, message });
    }
}

/**
 * Handle API error and show error toast
 */
export function handleApiError(error: any) {
    const message =
        error?.response?.data?.message ||
        (error instanceof Error && error.message ? error.message : null) ||
        (typeof error?.message === 'string' ? error.message : null) ||
        'Something went wrong';
    const type = error?.response?.data?.type || 'error';

    showToast({ type, message });
}
