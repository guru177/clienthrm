import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { usePlatformAuth, type PlatformAdmin } from '@/contexts/PlatformAuthContext';
import AuthSplitLayout from '@/layouts/auth-split-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

type Step =
    | { kind: 'credentials' }
    | { kind: 'two_factor'; preAuthToken: string; admin: PlatformAdmin };

export default function PlatformLogin() {
    const { admin, loading, login, verifyTwoFactor } = usePlatformAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [processing, setProcessing] = useState(false);
    const [step, setStep] = useState<Step>({ kind: 'credentials' });

    if (!loading && admin) {
        return <Navigate to="/" replace />;
    }

    async function handleCredentials(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');
        try {
            const res = await login(email, password);
            if (res.kind === 'requires_2fa') {
                setStep({ kind: 'two_factor', preAuthToken: res.pre_auth_token, admin: res.admin });
                setProcessing(false);
                return;
            }
            window.location.href = '/';
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed');
            setProcessing(false);
        }
    }

    async function handleTwoFactor(e: FormEvent) {
        e.preventDefault();
        if (step.kind !== 'two_factor') return;
        setProcessing(true);
        setError('');
        try {
            await verifyTwoFactor(step.preAuthToken, code.trim());
            window.location.href = '/';
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '2FA verification failed');
            setProcessing(false);
        }
    }

    if (step.kind === 'two_factor') {
        return (
            <AuthSplitLayout
                title="Two-factor authentication"
                description={`Enter the 6-digit code from your authenticator app for ${step.admin.email}.`}
            >
                {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
                )}
                <form onSubmit={handleTwoFactor} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="otp_code">Authenticator code</Label>
                        <Input
                            id="otp_code"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            required
                            className="h-11 tracking-[0.5em] text-center text-lg"
                            placeholder="000000"
                        />
                    </div>
                    <Button type="submit" className="h-11 w-full" disabled={processing}>
                        {processing && <Spinner size="sm" />}
                        {processing ? 'Verifying...' : 'Verify and sign in'}
                    </Button>
                    <button
                        type="button"
                        className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            setStep({ kind: 'credentials' });
                            setCode('');
                            setError('');
                        }}
                    >
                        Back to login
                    </button>
                </form>
            </AuthSplitLayout>
        );
    }

    return (
        <AuthSplitLayout
            title="Platform admin"
            description="Sign in to manage organizations across the Raintech HRM platform"
        >
            {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}

            <form onSubmit={handleCredentials} className="space-y-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="platform_email">Email</Label>
                        <Input
                            id="platform_email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="h-11"
                            placeholder="platform@hrm.local"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="platform_password">Password</Label>
                        <PasswordInput
                            id="platform_password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="h-11"
                        />
                    </div>
                </div>
                <Button type="submit" className="h-11 w-full" disabled={processing}>
                    {processing && <Spinner size="sm" />}
                    {processing ? 'Signing in...' : 'Sign in to platform'}
                </Button>
            </form>
        </AuthSplitLayout>
    );
}
