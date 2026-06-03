import { Link } from 'react-router-dom';
import { Lock, Home, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';

export default function Unauthorized() {
    return (
        <AppLayout breadcrumbs={[{ label: 'Access Denied', href: '#' }]}>
            

            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-6">
                    <div className="flex justify-center">
                        <div className="bg-destructive/10 p-6 rounded-full">
                            <Lock className="h-12 w-12 text-destructive" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold">Access Denied</h1>
                        <p className="text-muted-foreground text-lg">
                            You don't have permission to access this resource.
                        </p>
                    </div>

                    <p className="text-sm text-muted-foreground max-w-md">
                        Please contact your administrator if you believe you should have access to this page.
                    </p>

                    <div className="flex justify-center gap-3 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => window.history.back()}
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Go Back
                        </Button>
                        <Link to="/admin/dashboard">
                            <Button>
                                <Home className="mr-2 h-4 w-4" />
                                Go Home
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
