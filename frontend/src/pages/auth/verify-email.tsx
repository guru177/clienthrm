import { useState } from 'react';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import AuthLayout from '@/layouts/auth-layout';

export default function VerifyEmail({ status }: { status?: string }) {
    const { logout } = useAuth();
    const [processing, setProcessing] = useState(false);

    return (
        <AuthLayout
            title="Verify email"
            description="Please verify your email address by clicking on the link we just emailed to you."
        >
            {status === 'verification-link-sent' && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    A new verification link has been sent to the email address you provided during registration.
                </div>
            )}

            <div className="space-y-6 text-center">
                <Button
                    disabled={processing}
                    variant="secondary"
                    onClick={() => {
                        setProcessing(true);
                        setTimeout(() => setProcessing(false), 500);
                    }}
                >
                    {processing && <Spinner />}
                    Resend verification email
                </Button>

                <TextLink to="/login" className="mx-auto block text-sm" onClick={() => logout()}>
                    Log out
                </TextLink>
            </div>
        </AuthLayout>
    );
}
