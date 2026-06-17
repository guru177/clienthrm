import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DialogShellProps {
    open: boolean;
    title: string;
    description?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer: React.ReactNode;
}

function DialogShell({ open, title, description, onClose, children, footer }: DialogShellProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-black/50"
                aria-label="Close dialog"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/80 bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-[#001f3f]">{title}</h3>
                        {description && (
                            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {children && <div className="text-sm text-[#001f3f]">{children}</div>}
                <div className="mt-6 flex justify-end gap-2">{footer}</div>
            </div>
        </div>
    );
}

interface PlatformAlertDialogProps {
    open: boolean;
    title?: string;
    message: string;
    onClose: () => void;
}

export function PlatformAlertDialog({
    open,
    title = 'Notice',
    message,
    onClose,
}: PlatformAlertDialogProps) {
    return (
        <DialogShell
            open={open}
            title={title}
            onClose={onClose}
            footer={
                <Button onClick={onClose} className="min-w-24">
                    OK
                </Button>
            }
        >
            {message}
        </DialogShell>
    );
}

interface PlatformConfirmDialogProps {
    open: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function PlatformConfirmDialog({
    open,
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    loading = false,
    onConfirm,
    onClose,
}: PlatformConfirmDialogProps) {
    return (
        <DialogShell
            open={open}
            title={title}
            onClose={onClose}
            footer={
                <>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={loading}
                        className={cn(destructive && 'bg-red-600 hover:bg-red-700')}
                    >
                        {loading ? 'Please wait...' : confirmLabel}
                    </Button>
                </>
            }
        >
            {message}
        </DialogShell>
    );
}
