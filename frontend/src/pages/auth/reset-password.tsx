import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { apiPost } from '@/lib/api';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token') || '';
    const emailFromUrl = searchParams.get('email') || '';

    const [email, setEmail] = useState(emailFromUrl);
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');

        if (!token) {
            setError('Invalid reset link. Request a new password reset email.');
            setProcessing(false);
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            setProcessing(false);
            return;
        }

        if (password !== passwordConfirmation) {
            setError('Passwords do not match');
            setProcessing(false);
            return;
        }

        try {
            await apiPost('/auth/reset-password', {
                email: email.trim(),
                token,
                password,
                password_confirmation: passwordConfirmation,
            });
            setSuccess(true);
            setTimeout(() => navigate('/login', { replace: true }), 2500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Reset failed');
        } finally {
            setProcessing(false);
        }
    }

    if (!token || !emailFromUrl) {
        return (
            <AuthLayout
                title="Reset password"
                description="This reset link is invalid or incomplete."
            >
                <div className="space-y-4 text-center text-sm text-muted-foreground">
                    <p>Request a new link from the forgot password page.</p>
                    <Button asChild>
                        <Link to="/forgot-password">Forgot password</Link>
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Reset password"
            description="Please enter your new password below"
        >
            {success ? (
                <div className="space-y-4 text-center">
                    <p className="text-sm font-medium text-green-600">
                        Password updated successfully. Redirecting to login…
                    </p>
                    <Button asChild variant="outline">
                        <Link to="/login">Go to login</Link>
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="grid gap-6">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            name="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full"
                            readOnly
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="password">Password</Label>
                        <PasswordInput
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            className="mt-1 block w-full"
                            autoFocus
                            placeholder="New password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="password_confirmation">Confirm password</Label>
                        <PasswordInput
                            id="password_confirmation"
                            name="password_confirmation"
                            autoComplete="new-password"
                            className="mt-1 block w-full"
                            placeholder="Confirm password"
                            value={passwordConfirmation}
                            onChange={(e) => setPasswordConfirmation(e.target.value)}
                            required
                            minLength={8}
                        />
                        <InputError message={error} />
                    </div>

                    <Button
                        type="submit"
                        className="mt-4 w-full"
                        disabled={processing}
                        data-test="reset-password-button"
                    >
                        {processing && <Spinner />}
                        Reset password
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}
