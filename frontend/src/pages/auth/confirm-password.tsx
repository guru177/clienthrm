import { useState, type FormEvent } from 'react';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';

export default function ConfirmPassword() {
    const [password, setPassword] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');
        try {
            if (!password) {
                throw new Error('Password is required');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Confirmation failed');
        } finally {
            setProcessing(false);
        }
    }

    return (
        <AuthLayout
            title="Confirm your password"
            description="This is a secure area of the application. Please confirm your password before continuing."
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput
                        id="password"
                        name="password"
                        placeholder="Password"
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <InputError message={error} />
                </div>

                <Button
                    type="submit"
                    className="w-full"
                    disabled={processing}
                    data-test="confirm-password-button"
                >
                    {processing && <Spinner />}
                    Confirm password
                </Button>
            </form>
        </AuthLayout>
    );
}
