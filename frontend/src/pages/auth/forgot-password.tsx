import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';

import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import AuthLayout from '@/layouts/auth-layout';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

type Step = 'contact' | 'otp' | 'password';
type ResetChannel = 'email' | 'whatsapp';

export default function ForgotPassword() {
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>('contact');
    const [channel, setChannel] = useState<ResetChannel>('email');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [orgSlug, setOrgSlug] = useState('');
    const [showOrgSlug, setShowOrgSlug] = useState(false);
    const [verificationId, setVerificationId] = useState('');
    const [destinationMasked, setDestinationMasked] = useState('');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    async function handleContactSubmit(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');
        setInfo('');

        try {
            const body: {
                channel: ResetChannel;
                email?: string;
                phone?: string;
                org_slug?: string;
            } = { channel };

            if (channel === 'email') {
                body.email = email.trim();
            } else {
                body.phone = phone.trim();
            }

            const slug = orgSlug.trim();
            if (slug) {
                body.org_slug = slug;
            }

            const res = await apiPost<{
                message?: string;
                requires_org_slug?: boolean;
                verification_id?: string;
                masked_email?: string;
                destination_masked?: string;
                channel?: string;
                account_found?: boolean;
            }>('/auth/forgot-password', body);

            const data = res.data ?? {};

            if (data.requires_org_slug) {
                setShowOrgSlug(true);
                setError(
                    channel === 'whatsapp'
                        ? 'This phone number is registered with multiple organizations. Enter your organization slug and try again.'
                        : 'This email is registered with multiple organizations. Enter your organization slug and try again.',
                );
                return;
            }

            if (data.verification_id) {
                setVerificationId(data.verification_id);
                setDestinationMasked(data.destination_masked || data.masked_email || '');
                setInfo(data.message || 'Verification code sent.');
                setStep('otp');
                setOtp('');
                return;
            }

            setInfo(data.message || 'If an account exists, a verification code has been sent.');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setProcessing(false);
        }
    }

    async function handleOtpSubmit(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');

        if (otp.length < OTP_MAX_LENGTH) {
            setError('Enter the full verification code');
            setProcessing(false);
            return;
        }

        try {
            await apiPost('/auth/verify-password-reset-otp', {
                verification_id: verificationId,
                otp,
            });
            setStep('password');
            setPassword('');
            setPasswordConfirmation('');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Verification failed');
        } finally {
            setProcessing(false);
        }
    }

    async function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');

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
                verification_id: verificationId,
                password,
                password_confirmation: passwordConfirmation,
            });
            navigate('/login', {
                replace: true,
                state: { message: 'Password updated. You can sign in with your new password.' },
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Reset failed');
        } finally {
            setProcessing(false);
        }
    }

    if (step === 'otp') {
        return (
            <AuthLayout
                title="Enter verification code"
                description={
                    destinationMasked
                        ? `We sent a 6-digit code to ${destinationMasked}`
                        : 'Enter the verification code we sent you'
                }
            >
                <form onSubmit={handleOtpSubmit} className="space-y-6">
                    {info && (
                        <div className="text-center text-sm font-medium text-green-600">
                            {info}
                        </div>
                    )}

                    <div className="flex justify-center">
                        <InputOTP
                            maxLength={OTP_MAX_LENGTH}
                            pattern={REGEXP_ONLY_DIGITS}
                            value={otp}
                            onChange={setOtp}
                            autoFocus
                        >
                            <InputOTPGroup>
                                {Array.from({ length: OTP_MAX_LENGTH }, (_, index) => (
                                    <InputOTPSlot key={index} index={index} />
                                ))}
                            </InputOTPGroup>
                        </InputOTP>
                    </div>

                    <InputError message={error} />

                    <Button className="w-full" type="submit" disabled={processing}>
                        {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        Verify code
                    </Button>

                    <div className="space-x-1 text-center text-sm text-muted-foreground">
                        <button
                            type="button"
                            className="underline underline-offset-4 hover:text-foreground"
                            onClick={() => {
                                setStep('contact');
                                setOtp('');
                                setError('');
                            }}
                        >
                            Use a different {channel === 'whatsapp' ? 'phone number' : 'email'}
                        </button>
                    </div>
                </form>
            </AuthLayout>
        );
    }

    if (step === 'password') {
        return (
            <AuthLayout
                title="Set new password"
                description="Choose a new password for your account"
            >
                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                    <div className="grid gap-2">
                        <Label htmlFor="password">New password</Label>
                        <PasswordInput
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            autoFocus
                            placeholder="At least 8 characters"
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
                            placeholder="Confirm password"
                            value={passwordConfirmation}
                            onChange={(e) => setPasswordConfirmation(e.target.value)}
                            required
                            minLength={8}
                        />
                    </div>

                    <InputError message={error} />

                    <Button className="w-full" type="submit" disabled={processing}>
                        {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        Update password
                    </Button>
                </form>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Forgot password"
            description="Choose email or WhatsApp to receive a verification code"
        >
            {info && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {info}
                </div>
            )}

            <div className="space-y-6">
                <form onSubmit={handleContactSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            className={cn(
                                'rounded-lg border p-3 text-left text-sm transition-colors',
                                channel === 'email'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-muted/50',
                            )}
                            onClick={() => {
                                setChannel('email');
                                setError('');
                            }}
                        >
                            <p className="font-medium">Email</p>
                            <p className="mt-1 text-xs text-muted-foreground">Verification code by email</p>
                        </button>
                        <button
                            type="button"
                            className={cn(
                                'rounded-lg border p-3 text-left text-sm transition-colors',
                                channel === 'whatsapp'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-muted/50',
                            )}
                            onClick={() => {
                                setChannel('whatsapp');
                                setError('');
                            }}
                        >
                            <p className="font-medium">WhatsApp</p>
                            <p className="mt-1 text-xs text-muted-foreground">Code to your mobile number</p>
                        </button>
                    </div>

                    {channel === 'email' ? (
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                autoFocus
                                placeholder="email@example.com"
                                required
                            />
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            <Label htmlFor="phone">Mobile number</Label>
                            <Input
                                id="phone"
                                type="tel"
                                name="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                autoComplete="tel"
                                autoFocus
                                placeholder="+91 62823 90631"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Use the phone number saved on your account.
                            </p>
                        </div>
                    )}

                    {showOrgSlug && (
                        <div className="grid gap-2">
                            <Label htmlFor="org_slug">Organization slug</Label>
                            <Input
                                id="org_slug"
                                type="text"
                                name="org_slug"
                                value={orgSlug}
                                onChange={(e) => setOrgSlug(e.target.value)}
                                autoComplete="organization"
                                placeholder="your-company"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Required when your {channel === 'whatsapp' ? 'phone number' : 'email'} is used by more than one organization.
                            </p>
                        </div>
                    )}

                    <InputError message={error} />

                    <Button
                        className="w-full"
                        type="submit"
                        disabled={processing}
                        data-test="send-password-reset-otp-button"
                    >
                        {processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        Send verification code
                    </Button>
                </form>

                <div className="space-x-1 text-center text-sm text-muted-foreground">
                    <span>Or, return to</span>
                    <TextLink to="/login">log in</TextLink>
                </div>
            </div>
        </AuthLayout>
    );
}
