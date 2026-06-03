import { type ReactNode } from 'react';

interface PublicLayoutProps {
    children: ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8">{children}</div>
        </div>
    );
}
