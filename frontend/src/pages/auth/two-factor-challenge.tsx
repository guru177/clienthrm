import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp';
import { useAuth } from '@/contexts/AuthContext';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import AuthLayout from '@/layouts/auth-layout';
import { defaultAdminRoute } from '@/lib/default-route';

type ChallengeState = {
    preAuthToken?: string;
    email?: string;
};

export default function TwoFactorChallenge() {
    const navigate = useNavigate();
    const location = useLocation();
    const { completeTwoFactorLogin } = useAuth();
    const state = (location.state ?? {}) as ChallengeState;

    const [showRecoveryInput, setShowRecoveryInput] = useState(false);
    const [code, setCode] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    const authConfigContent = useMemo(() => {
        if (showRecoveryInput) {
            return {
                title: 'Recovery Code',
                description:
                    'Please confirm access to your account by entering one of your emergency recovery codes.',
                toggleText: 'login using an authentication code',
            };
        }

        return {
            title: 'Authentication Code',
            description:
                'Enter the authentication code provided by your authenticator application.',
            toggleText: 'login using a recovery code',
        };
    }, [showRecoveryInput]);

    function toggleRecoveryMode() {
        setShowRecoveryInput(!showRecoveryInput);
        setError('');
        setCode('');
        setRecoveryCode('');
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!state.preAuthToken) {
            setError('Session expired. Please log in again.');
            return;
        }
        if (showRecoveryInput) {
            if (!recoveryCode.trim()) {
                setError('Enter a recovery code');
                return;
            }
        }
        setProcessing(true);
        setError('');
        try {
            if (showRecoveryInput) {
                const perms = await completeTwoFactorLogin(state.preAuthToken, undefined, recoveryCode);
                const has = (slug: string) => perms.includes('*') || perms.includes(slug);
                navigate(defaultAdminRoute(has), { replace: true });
                return;
            }
            if (code.length < OTP_MAX_LENGTH) {
                throw new Error('Enter the full authentication code');
            }
            const perms = await completeTwoFactorLogin(state.preAuthToken, code);
            const has = (slug: string) => perms.includes('*') || perms.includes(slug);
            navigate(defaultAdminRoute(has), { replace: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Verification failed');
        } finally {
            setProcessing(false);
        }
    }

    return (
        <AuthLayout
            title={authConfigContent.title}
            description={authConfigContent.description}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {showRecoveryInput ? (
                    <>
                        <Input
                            name="recovery_code"
                            type="text"
                            placeholder="Enter recovery code"
                            autoFocus={showRecoveryInput}
                            required
                            value={recoveryCode}
                            onChange={(e) => setRecoveryCode(e.target.value)}
                        />
                    </>
                ) : (
                    <InputOTP
                        maxLength={OTP_MAX_LENGTH}
                        value={code}
                        onChange={setCode}
                        pattern={REGEXP_ONLY_DIGITS}
                    >
                        <InputOTPGroup>
                            {Array.from({ length: OTP_MAX_LENGTH }, (_, index) => (
                                <InputOTPSlot key={index} index={index} />
                            ))}
                        </InputOTPGroup>
                    </InputOTP>
                )}

                <InputError message={error} />

                <Button type="submit" className="w-full" disabled={processing}>
                    {processing ? 'Verifying…' : 'Continue'}
                </Button>

                <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                    onClick={toggleRecoveryMode}
                >
                    {authConfigContent.toggleText}
                </button>
            </form>
        </AuthLayout>
    );
}
