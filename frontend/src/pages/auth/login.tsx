import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { defaultAdminRoute } from '@/lib/default-route';

const REMEMBER_EMAIL_KEY = 'hrm_remember_email';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
    const [password, setPassword] = useState('');
    const [orgSlug, setOrgSlug] = useState('');
    const [showOrgSlug, setShowOrgSlug] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
        if (savedEmail) {
            setEmail(savedEmail);
            setRememberMe(true);
        }
    }, []);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setProcessing(true);
        setError('');

        try {
            const result = await login(email, password, orgSlug.trim() || undefined);
            if (rememberMe) {
                localStorage.setItem(REMEMBER_EMAIL_KEY, email);
            } else {
                localStorage.removeItem(REMEMBER_EMAIL_KEY);
            }
            if (result.kind === 'requires2fa') {
                navigate('/auth/two-factor-challenge', {
                    replace: true,
                    state: { preAuthToken: result.preAuthToken, email: result.email },
                });
                return;
            }
            const has = (slug: string) => result.permissions.includes('*') || result.permissions.includes(slug);
            navigate(defaultAdminRoute(has), { replace: true });
        } catch (err: any) {
            const message = err.message || 'Invalid credentials';
            if (message.includes('organization slug')) {
                setShowOrgSlug(true);
            }
            setError(message);
        } finally {
            setProcessing(false);
        }
    }

    return (
        <AuthLayout
            fitViewport
            title="Welcome back"
            description="Sign in to access your HR Daddy account"
        >
            <title>Log in — HR Daddy</title>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                            Email address
                        </Label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                                tabIndex={1}
                                autoComplete="email"
                                placeholder="name@company.com"
                                className="h-11 rounded-xl border-[#e2e8f0] bg-white pl-11 text-[15px] shadow-none focus-visible:border-[#3b82f6] focus-visible:ring-[#3b82f6]/20"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
                                Password
                            </Label>
                            <Link
                                to="/forgot-password"
                                className="text-xs font-semibold text-[#3b82f6] hover:underline"
                                tabIndex={3}
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <Lock className="pointer-events-none absolute top-1/2 left-3.5 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <PasswordInput
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                tabIndex={2}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="h-11 rounded-xl border-[#e2e8f0] bg-white pl-11 text-[15px] shadow-none focus-visible:border-[#3b82f6] focus-visible:ring-[#3b82f6]/20"
                            />
                        </div>
                    </div>

                    {showOrgSlug && (
                        <div className="space-y-2">
                            <Label htmlFor="org_slug">Organization slug</Label>
                            <Input
                                id="org_slug"
                                type="text"
                                value={orgSlug}
                                onChange={(e) => setOrgSlug(e.target.value)}
                                autoComplete="organization"
                                placeholder="your-company"
                                className="h-11 rounded-xl border-[#e2e8f0] bg-white"
                            />
                            <p className="text-xs text-slate-500">
                                Your email is registered with multiple companies. Enter your organization slug.
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-2.5 pt-1">
                        <Checkbox
                            id="remember_me"
                            checked={rememberMe}
                            onCheckedChange={(checked) => setRememberMe(checked === true)}
                            className="border-[#cbd5e1] data-[state=checked]:border-[#3b82f6] data-[state=checked]:bg-[#3b82f6]"
                        />
                        <Label htmlFor="remember_me" className="cursor-pointer text-sm font-normal text-slate-600">
                            Remember me
                        </Label>
                    </div>
                </div>

                <Button
                    type="submit"
                    variant="ghost"
                    className="h-11 w-full rounded-xl bg-gradient-to-r from-[#071428] via-[#0a192f] to-[#1e3a5f] text-[15px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(10,25,47,0.65)] transition-all hover:from-[#0a192f] hover:via-[#132f4c] hover:to-[#234b73] hover:text-white hover:shadow-[0_10px_28px_-8px_rgba(10,25,47,0.75)]"
                    tabIndex={4}
                    disabled={processing}
                    data-test="login-button"
                >
                    {processing && <Spinner size="sm" />}
                    {processing ? 'Signing in...' : 'Sign in'}
                </Button>

                <p className="pt-2 text-center text-sm text-slate-500">
                    New company?{' '}
                    <Link to="/signup" className="font-semibold text-[#3b82f6] hover:underline">
                        Create an organization
                    </Link>
                </p>
            </form>
        </AuthLayout>
    );
}
