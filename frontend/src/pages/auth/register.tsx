import { Link } from 'react-router-dom';

import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/layouts/auth-layout';

export default function Register() {
    return (
        <AuthLayout
            title="Create an account"
            description="Organization signup is handled on the dedicated signup page."
        >
            <div className="flex flex-col gap-6">
                <Button asChild className="w-full">
                    <Link to="/signup">Create an organization</Link>
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <TextLink to="/login">Log in</TextLink>
                </div>
            </div>
        </AuthLayout>
    );
}
