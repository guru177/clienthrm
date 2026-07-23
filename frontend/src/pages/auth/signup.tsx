import { useEffect, useState, type FormEvent } from 'react';

import { Link, useNavigate } from 'react-router-dom';

import { setToken, setRefreshToken, apiPost } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

import { Label } from '@/components/ui/label';

import { Spinner } from '@/components/ui/spinner';

import { SearchableSelect } from '@/components/ui/searchable-select';

import AuthLayout from '@/layouts/auth-layout';

import { defaultAdminRouteForViewport } from '@/lib/default-route';

import {

    DEFAULT_COUNTRY,

    DEFAULT_TIMEZONE,

    getCountryOptions,

    getTimezoneOptions,

} from '@/lib/geo-options';

import { cn } from '@/lib/utils';
import { isValidOrgSlug, normalizeOrgSlug } from '@/lib/org-slug';

const authInputClass =
    'h-11 rounded-xl border-[#e2e8f0] bg-white shadow-none focus-visible:border-[#3b82f6] focus-visible:ring-[#3b82f6]/20';

const primaryAuthButtonClass =
    'rounded-xl bg-gradient-to-r from-[#071428] via-[#0a192f] to-[#1e3a5f] text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(10,25,47,0.65)] transition-all hover:from-[#0a192f] hover:via-[#132f4c] hover:to-[#234b73] hover:text-white hover:shadow-[0_10px_28px_-8px_rgba(10,25,47,0.75)]';



const COUNTRIES = getCountryOptions();

const TIMEZONES = getTimezoneOptions();



const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.name, label: c.name }));

const TIMEZONE_OPTIONS = TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label }));



function slugFromName(name: string): string {
    return normalizeOrgSlug(name);
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}



type OtpChannel = 'email' | 'whatsapp';



interface SignupForm {

    organizationName: string;

    orgSlug: string;

    contactPerson: string;

    companyEmail: string;

    companyPhone: string;

    country: string;

    timezone: string;

    adminName: string;

    adminEmail: string;

    adminMobile: string;

    adminPassword: string;

    confirmPassword: string;

}



const initialForm: SignupForm = {

    organizationName: '',

    orgSlug: '',

    contactPerson: '',

    companyEmail: '',

    companyPhone: '',

    country: DEFAULT_COUNTRY,

    timezone: DEFAULT_TIMEZONE,

    adminName: '',

    adminEmail: '',

    adminMobile: '',

    adminPassword: '',

    confirmPassword: '',

};



function signupPayload(form: SignupForm) {
    return {
        organization_name: form.organizationName.trim(),
        org_slug: normalizeOrgSlug(form.orgSlug),

        contact_person: form.contactPerson.trim(),

        company_email: form.companyEmail.trim(),

        company_phone: form.companyPhone.trim(),

        country: form.country,

        timezone: form.timezone,

        admin_name: form.adminName.trim(),

        admin_email: form.adminEmail.trim(),

        admin_mobile: form.adminMobile.trim(),

        admin_password: form.adminPassword,

        confirm_password: form.confirmPassword,

    };

}



export default function Signup() {

    const navigate = useNavigate();
    const { refreshUser } = useAuth();

    const [step, setStep] = useState<1 | 2 | 3>(1);

    const [form, setForm] = useState<SignupForm>(initialForm);

    const [slugTouched, setSlugTouched] = useState(false);

    const [processing, setProcessing] = useState(false);

    const [checkingAvailability, setCheckingAvailability] = useState(false);

    const [sendingOtp, setSendingOtp] = useState(false);

    const [error, setError] = useState('');

    const [otpChannel, setOtpChannel] = useState<OtpChannel>('email');

    const [verificationId, setVerificationId] = useState('');

    const [destinationMasked, setDestinationMasked] = useState('');

    const [otp, setOtp] = useState('');

    const [otpSent, setOtpSent] = useState(false);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    function clearOtpVerification() {
        setOtpSent(false);
        setOtp('');
        setVerificationId('');
        setDestinationMasked('');
    }

    function updateField<K extends keyof SignupForm>(key: K, value: SignupForm[K]) {
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'organizationName' && !slugTouched) {
                next.orgSlug = slugFromName(String(value));
            }
            return next;
        });
        if (verificationId) {
            clearOtpVerification();
        }
    }



    function validateStep1(): string | null {
        if (!form.organizationName.trim()) return 'Company name is required';
        if (!isValidOrgSlug(form.orgSlug)) {
            return 'Organization code must be at least 2 characters (letters, numbers, hyphens only)';
        }
        if (!form.contactPerson.trim()) return 'Contact person is required';
        if (!form.companyEmail.trim()) return 'Company email is required';
        if (!isValidEmail(form.companyEmail)) return 'Enter a valid company email';
        if (!form.companyPhone.trim()) return 'Company phone number is required';
        if (!form.country) return 'Country is required';
        if (!form.timezone) return 'Time zone is required';
        return null;
    }

    function validateStep2(): string | null {
        if (!form.adminName.trim()) return 'Full name is required';
        if (!form.adminEmail.trim()) return 'Work email is required';
        if (!isValidEmail(form.adminEmail)) return 'Enter a valid work email';
        if (!form.adminMobile.trim()) return 'Mobile number is required';
        if (form.adminPassword.length < 8) return 'Password must be at least 8 characters';
        if (form.adminPassword !== form.confirmPassword) return 'Passwords do not match';
        return null;
    }

    async function checkAvailability(payload: {
        org_slug?: string;
        company_email?: string;
        admin_email?: string;
    }) {
        await apiPost<{ available: boolean }>('/public/signup/check-availability', payload);
    }

    const duplicateEmailError =
        error.includes('work email already exists') ||
        error.includes('work email is already registered') ||
        error.includes('company email is already registered') ||
        error.includes('already exists. Sign in');

    const existingOrgSlug = error.match(/organization "([^"]+)"/i)?.[1] ?? null;

    const signInHref = `/login?email=${encodeURIComponent(form.adminEmail.trim())}`;



    async function handleContinue(e: FormEvent) {

        e.preventDefault();

        setError('');

        const msg = validateStep1();
        if (msg) {
            setError(msg);
            return;
        }

        const normalizedSlug = normalizeOrgSlug(form.orgSlug);
        setCheckingAvailability(true);
        try {
            await checkAvailability({
                org_slug: normalizedSlug,
                company_email: form.companyEmail.trim(),
            });
            setForm((prev) => ({ ...prev, orgSlug: normalizedSlug }));
            setStep(2);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not verify organization code');
        } finally {
            setCheckingAvailability(false);
        }

    }



    async function handleAdminContinue(e: FormEvent) {

        e.preventDefault();

        setError('');

        const msg = validateStep2();

        if (msg) {

            setError(msg);

            return;

        }

        setCheckingAvailability(true);
        try {
            setOtpSent(false);
            setOtp('');
            setVerificationId('');
            setDestinationMasked('');
            setStep(3);
        } finally {
            setCheckingAvailability(false);
        }

    }



    async function handleSendOtp() {

        setError('');

        setSendingOtp(true);

        try {

            const res = await apiPost<{

                verification_id: string;

                destination_masked: string;

                debug_otp?: string;

            }>('/public/signup/send-otp', {

                channel: otpChannel,

                ...signupPayload(form),

            });

            setVerificationId(res.data.verification_id);

            setDestinationMasked(res.data.destination_masked);

            setOtpSent(true);

            if (res.data.debug_otp) {

                setOtp(res.data.debug_otp);

            }

        } catch (err: unknown) {

            setError(err instanceof Error ? err.message : 'Failed to send verification code');

        } finally {

            setSendingOtp(false);

        }

    }



    async function handleSubmit(e: FormEvent) {

        e.preventDefault();

        setError('');



        if (!verificationId || !otp.trim()) {

            setError('Enter the verification code sent to your email or WhatsApp');

            return;

        }



        setProcessing(true);

        try {

            const res = await apiPost<{

                token: string;

                refresh_token?: string;

                permissions: string[];

            }>('/public/signup', {

                ...signupPayload(form),

                verification_id: verificationId,

                otp: otp.trim(),

            });

            setToken(res.data.token);

            if (res.data.refresh_token) {

                setRefreshToken(res.data.refresh_token);

            }

            const perms = res.data.permissions ?? ['*'];

            const has = (slug: string) => perms.includes('*') || perms.includes(slug);

            await refreshUser();

            navigate(defaultAdminRouteForViewport(has), { replace: true });

        } catch (err: unknown) {

            setError(err instanceof Error ? err.message : 'Signup failed');

        } finally {

            setProcessing(false);

        }

    }



    const stepTitle =

        step === 1 ? 'Create your organization' : step === 2 ? 'Admin account' : 'Verify your account';

    const stepDescription =

        step === 1

            ? 'Step 1 of 3 — Company information'

            : step === 2

              ? 'Step 2 of 3 — Admin information'

              : 'Step 3 of 3 — Email or WhatsApp verification';



    return (

        <AuthLayout fitViewport scrollableCard title={stepTitle} description={stepDescription}>

            <title>Sign up — HR Daddy</title>



            <div className="mb-3 flex items-center gap-2">

                {[1, 2, 3].map((n) => (

                    <div key={n} className="flex flex-1 items-center gap-2">

                        <div

                            className={cn(

                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium',

                                step >= n

                                    ? 'bg-gradient-to-r from-[#071428] via-[#0a192f] to-[#1e3a5f] text-white'

                                    : 'bg-slate-100 text-slate-500',

                            )}

                        >

                            {n}

                        </div>

                        <div className="hidden min-w-0 sm:block">

                            <p className="truncate text-xs font-semibold text-slate-700">

                                {n === 1 ? 'Company' : n === 2 ? 'Admin' : 'Verify'}

                            </p>

                        </div>

                        {n < 3 && <div className="h-px flex-1 bg-[#e2e8f0]" />}

                    </div>

                ))}

            </div>



            {error && (

                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">

                    {error}

                    {duplicateEmailError && (
                        <p className="mt-2">
                            <Link to={signInHref} className="font-medium underline">
                                Sign in with this email
                            </Link>
                            {existingOrgSlug ? (
                                <span className="text-red-700 dark:text-red-300">
                                    {' '}
                                    (organization: {existingOrgSlug})
                                </span>
                            ) : null}
                        </p>
                    )}

                </div>

            )}



            {step === 1 ? (

                <form onSubmit={handleContinue} className="space-y-3">
                    <div className="space-y-2.5">

                        <div className="space-y-2">

                            <Label htmlFor="organization_name">Company name</Label>

                            <Input

                                id="organization_name"

                                value={form.organizationName}

                                onChange={(e) => updateField('organizationName', e.target.value)}

                                required

                                autoFocus

                                className={authInputClass}

                                placeholder="Acme Corporation"

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="org_slug">Organization code / workspace URL</Label>

                            <Input

                                id="org_slug"

                                value={form.orgSlug}

                                onChange={(e) => {
                                    setSlugTouched(true);
                                    if (verificationId) clearOtpVerification();
                                    setForm((prev) => ({
                                        ...prev,
                                        orgSlug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                                    }));
                                }}

                                required

                                className={cn(authInputClass, 'font-mono')}

                                placeholder="acme-corp"

                            />

                            <p className="text-xs text-muted-foreground">

                                Used as your workspace identifier. Lowercase letters, numbers, and

                                hyphens only.

                            </p>

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="contact_person">Contact person</Label>

                            <Input

                                id="contact_person"

                                value={form.contactPerson}

                                onChange={(e) => updateField('contactPerson', e.target.value)}

                                required

                                className={authInputClass}

                                placeholder="Jane Smith"

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="company_email">Company email</Label>

                            <Input

                                id="company_email"

                                type="email"

                                value={form.companyEmail}

                                onChange={(e) => updateField('companyEmail', e.target.value)}

                                required

                                className={authInputClass}

                                placeholder="contact@company.com"

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="company_phone">Company phone number</Label>

                            <Input

                                id="company_phone"

                                type="tel"

                                value={form.companyPhone}

                                onChange={(e) => updateField('companyPhone', e.target.value)}

                                required

                                className={authInputClass}

                                placeholder="+91 98765 43210"

                            />

                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">

                            <div className="space-y-2">

                                <Label>Country</Label>

                                <SearchableSelect

                                    value={form.country}

                                    onValueChange={(v) => updateField('country', v)}

                                    options={COUNTRY_OPTIONS}

                                    placeholder="Select country"

                                    searchPlaceholder="Search countries…"

                                />

                            </div>

                            <div className="space-y-2">

                                <Label>Time zone</Label>

                                <SearchableSelect

                                    value={form.timezone}

                                    onValueChange={(v) => updateField('timezone', v)}

                                    options={TIMEZONE_OPTIONS}

                                    placeholder="Select time zone"

                                    searchPlaceholder="Search time zones…"

                                />

                            </div>

                        </div>

                    </div>



                    <Button
                        type="submit"
                        variant="ghost"
                        className={cn(primaryAuthButtonClass, 'h-11 w-full')}
                        disabled={checkingAvailability}
                    >

                        {checkingAvailability && <Spinner size="sm" />}

                        {checkingAvailability ? 'Checking…' : 'Continue'}

                    </Button>

                </form>

            ) : step === 2 ? (

                <form onSubmit={handleAdminContinue} className="space-y-3">
                    <div className="space-y-2.5">

                        <div className="space-y-2">

                            <Label htmlFor="admin_name">Full name</Label>

                            <Input

                                id="admin_name"

                                value={form.adminName}

                                onChange={(e) => updateField('adminName', e.target.value)}

                                required

                                autoFocus

                                className={authInputClass}

                                placeholder="Jane Smith"

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="admin_email">Work email</Label>

                            <Input

                                id="admin_email"

                                type="email"

                                value={form.adminEmail}

                                onChange={(e) => updateField('adminEmail', e.target.value)}

                                required

                                className={authInputClass}

                                placeholder="jane@company.com"

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="admin_mobile">Mobile number</Label>

                            <Input

                                id="admin_mobile"

                                type="tel"

                                value={form.adminMobile}

                                onChange={(e) => updateField('adminMobile', e.target.value)}

                                required

                                className={authInputClass}

                                placeholder="+91 98765 43210"

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="admin_password">Password</Label>

                            <PasswordInput

                                id="admin_password"

                                value={form.adminPassword}

                                onChange={(e) => updateField('adminPassword', e.target.value)}

                                required

                                minLength={8}

                                className={authInputClass}

                            />

                        </div>

                        <div className="space-y-2">

                            <Label htmlFor="confirm_password">Confirm password</Label>

                            <PasswordInput

                                id="confirm_password"

                                value={form.confirmPassword}

                                onChange={(e) => updateField('confirmPassword', e.target.value)}

                                required

                                minLength={8}

                                className={authInputClass}

                            />

                        </div>

                    </div>



                    <div className="flex gap-3">

                        <Button

                            type="button"

                            variant="outline"

                            className="h-11 flex-1 rounded-xl border-[#e2e8f0] bg-white"

                            onClick={() => {
                                setError('');
                                clearOtpVerification();
                                setStep(1);
                            }}

                        >

                            Back

                        </Button>

                        <Button
                            type="submit"
                            variant="ghost"
                            className={cn(primaryAuthButtonClass, 'h-11 flex-[2]')}
                            disabled={checkingAvailability}
                        >

                            {checkingAvailability && <Spinner size="sm" />}

                            {checkingAvailability ? 'Checking…' : 'Continue'}

                        </Button>

                    </div>

                </form>

            ) : (

                <form onSubmit={handleSubmit} className="space-y-4">

                    <p className="text-sm text-muted-foreground">

                        Choose how to receive your one-time code, then complete registration.

                    </p>



                    <div className="grid grid-cols-2 gap-3">

                        <button

                            type="button"

                            className={cn(

                                'rounded-lg border p-3 text-left text-sm transition-colors',

                                otpChannel === 'email'

                                    ? 'border-primary bg-primary/5'

                                    : 'border-border hover:bg-muted/50',

                            )}

                            onClick={() => {

                                setOtpChannel('email');

                                setOtpSent(false);

                                setVerificationId('');

                                setOtp('');

                            }}

                        >

                            <p className="font-medium">Email</p>

                            <p className="mt-1 truncate text-xs text-muted-foreground">

                                {form.adminEmail || 'Work email'}

                            </p>

                        </button>

                        <button

                            type="button"

                            className={cn(

                                'rounded-lg border p-3 text-left text-sm transition-colors',

                                otpChannel === 'whatsapp'

                                    ? 'border-primary bg-primary/5'

                                    : 'border-border hover:bg-muted/50',

                            )}

                            onClick={() => {

                                setOtpChannel('whatsapp');

                                setOtpSent(false);

                                setVerificationId('');

                                setOtp('');

                            }}

                        >

                            <p className="font-medium">WhatsApp</p>

                            <p className="mt-1 truncate text-xs text-muted-foreground">

                                {form.adminMobile || 'Mobile number'}

                            </p>

                        </button>

                    </div>



                    <Button

                        type="button"

                        variant="outline"

                        className="h-11 w-full rounded-xl border-[#e2e8f0] bg-white"

                        disabled={sendingOtp}

                        onClick={() => void handleSendOtp()}

                    >

                        {sendingOtp && <Spinner size="sm" />}

                        {otpSent ? 'Resend code' : 'Send verification code'}

                    </Button>



                    {otpSent && destinationMasked && (

                        <p className="text-center text-xs text-muted-foreground">

                            Code sent to {destinationMasked}

                        </p>

                    )}



                    <div className="space-y-2">

                        <Label htmlFor="otp">Verification code</Label>

                        <Input

                            id="otp"

                            inputMode="numeric"

                            autoComplete="one-time-code"

                            value={otp}

                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}

                            required

                            className={cn(authInputClass, 'text-center text-lg tracking-widest')}

                            placeholder="000000"

                            maxLength={6}

                        />

                    </div>



                    <div className="flex gap-3">

                        <Button

                            type="button"

                            variant="outline"

                            className="h-11 flex-1 rounded-xl border-[#e2e8f0] bg-white"

                            disabled={processing}

                            onClick={() => {
                                setError('');
                                clearOtpVerification();
                                setStep(2);
                            }}

                        >

                            Back

                        </Button>

                        <Button
                            type="submit"
                            variant="ghost"
                            className={cn(primaryAuthButtonClass, 'h-11 flex-[2]')}
                            disabled={processing || !verificationId}
                        >

                            {processing && <Spinner size="sm" />}

                            {processing ? 'Creating...' : 'Create organization'}

                        </Button>

                    </div>

                </form>

            )}



            <p className="mt-3 text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-[#3b82f6] hover:underline">

                    Sign in

                </Link>

            </p>

        </AuthLayout>

    );

}


