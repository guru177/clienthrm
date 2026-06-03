import { type ReactNode, useEffect } from 'react';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { type BreadcrumbItem } from '@/types';

interface AppLayoutProps {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
}

export default function AppLayout({ children, breadcrumbs }: AppLayoutProps) {
    const { setBreadcrumbs } = useBreadcrumbs();
    
    useEffect(() => {
        if (breadcrumbs) {
            setBreadcrumbs(breadcrumbs);
        }
    }, [breadcrumbs, setBreadcrumbs]);

    return <>{children}</>;
}
