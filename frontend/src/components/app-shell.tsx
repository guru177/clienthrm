import { SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

interface AppShellProps {
    children: React.ReactNode;
    variant?: 'header' | 'sidebar';
    className?: string;
}

export function AppShell({ children, variant = 'header', className }: AppShellProps) {
    if (variant === 'header') {
        return (
            <div className={cn('flex min-h-screen w-full flex-col', className)}>{children}</div>
        );
    }

    return (
        <SidebarProvider defaultOpen={true} className={className}>
            {children}
        </SidebarProvider>
    );
}
