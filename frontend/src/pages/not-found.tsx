import { Link } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { useAuth } from '@/contexts/AuthContext';
import { defaultAdminRoute } from '@/lib/default-route';

export default function NotFound() {
    const { permissions } = useAuth();
    const homeHref = defaultAdminRoute((slug) => permissions.includes('*') || permissions.includes(slug));

    return (
        <AppLayout breadcrumbs={[{ title: 'Not Found', href: '#' }]}>
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 text-center">
                <div className="rounded-full bg-muted p-6">
                    <FileQuestion className="h-12 w-12 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">Page not found</h1>
                    <p className="text-muted-foreground">The page you requested does not exist.</p>
                </div>
                <Link to={homeHref}>
                    <Button>
                        <Home className="mr-2 h-4 w-4" />
                        Back to home
                    </Button>
                </Link>
            </div>
        </AppLayout>
    );
}
