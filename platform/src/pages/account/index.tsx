import { useEffect, useState } from 'react';
import { Shield, ShieldOff, Smartphone, X } from 'lucide-react';
import {
    platformDelete,
    platformGet,
    platformPost,
} from '@/lib/platform-api';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { PlatformAlertDialog, PlatformConfirmDialog } from '@/components/platform-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SessionRow {
    id: number;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string | null;
    last_used_at: string | null;
    expires_at: string | null;
    revoked: boolean;
    is_current: boolean;
}

interface SetupResp {
    secret: string;
    otpauth_url: string;
    issuer: string;
    account: string;
}

export default function PlatformAccount() {
    const { admin, refreshAdmin } = usePlatformAuth();
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(true);
    const [setup, setSetup] = useState<SetupResp | null>(null);
    const [code, setCode] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [showDisable, setShowDisable] = useState(false);
    const [alert, setAlert] = useState<{ title?: string; message: string } | null>(null);
    const [confirmRevoke, setConfirmRevoke] = useState<SessionRow | null>(null);
    const [busy, setBusy] = useState(false);

    async function loadSessions() {
        setLoadingSessions(true);
        try {
            const res = await platformGet<SessionRow[]>('/sessions');
            setSessions(res.data);
        } finally {
            setLoadingSessions(false);
        }
    }

    useEffect(() => {
        loadSessions();
    }, []);

    async function startSetup() {
        setBusy(true);
        try {
            const res = await platformPost<SetupResp>('/auth/2fa/setup', {});
            setSetup(res.data);
            setCode('');
        } catch (err: unknown) {
            setAlert({
                title: 'Failed',
                message: err instanceof Error ? err.message : 'Could not start setup',
            });
        } finally {
            setBusy(false);
        }
    }

    async function confirmEnable() {
        setBusy(true);
        try {
            await platformPost('/auth/2fa/enable', { code: code.trim() });
            setSetup(null);
            setCode('');
            await refreshAdmin();
            setAlert({
                title: '2FA enabled',
                message: 'You will need a code from your authenticator on next sign-in.',
            });
        } catch (err: unknown) {
            setAlert({
                title: 'Verification failed',
                message: err instanceof Error ? err.message : 'Invalid code',
            });
        } finally {
            setBusy(false);
        }
    }

    async function disable2FA() {
        setBusy(true);
        try {
            await platformPost('/auth/2fa/disable', {
                password: disablePassword,
                code: disableCode.trim() || undefined,
            });
            setShowDisable(false);
            setDisablePassword('');
            setDisableCode('');
            await refreshAdmin();
            setAlert({ title: '2FA disabled', message: 'Two-factor authentication has been disabled.' });
        } catch (err: unknown) {
            setAlert({
                title: 'Failed',
                message: err instanceof Error ? err.message : 'Could not disable 2FA',
            });
        } finally {
            setBusy(false);
        }
    }

    async function handleRevoke() {
        if (!confirmRevoke) return;
        setBusy(true);
        try {
            await platformDelete(`/sessions/${confirmRevoke.id}`);
            const wasCurrent = confirmRevoke.is_current;
            setConfirmRevoke(null);
            if (wasCurrent) {
                window.location.href = '/login';
                return;
            }
            await loadSessions();
        } catch (err: unknown) {
            setAlert({
                title: 'Revoke failed',
                message: err instanceof Error ? err.message : 'Could not revoke session',
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Account & 2FA</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Manage your platform admin account, two-factor authentication, and active sessions.
                </p>
            </div>

            <section className="rounded-2xl border border-white/80 bg-white/80 p-6 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <h2 className="text-lg font-semibold text-[#001f3f]">Profile</h2>
                <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Name</dt>
                        <dd className="text-sm font-medium text-[#001f3f]">{admin?.name}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Email</dt>
                        <dd className="text-sm font-medium text-[#001f3f]">{admin?.email}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Role</dt>
                        <dd className="text-sm font-medium text-[#001f3f]">{admin?.role}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last login</dt>
                        <dd className="text-sm font-medium text-[#001f3f]">
                            {admin?.last_login_at || '—'}
                        </dd>
                    </div>
                </dl>
            </section>

            <section className="rounded-2xl border border-white/80 bg-white/80 p-6 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-[#001f3f]">Two-factor authentication</h2>
                        <p className="text-sm text-muted-foreground">
                            Use an authenticator app (Google Authenticator, 1Password, Authy) to add a second step at sign-in.
                        </p>
                    </div>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                            admin?.totp_enabled
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700',
                        )}
                    >
                        {admin?.totp_enabled ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                        {admin?.totp_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>

                {!admin?.totp_enabled && !setup && (
                    <Button className="mt-4" onClick={startSetup} disabled={busy}>
                        <Smartphone className="h-4 w-4" />
                        Enable 2FA
                    </Button>
                )}

                {setup && (
                    <div className="mt-4 space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                        <div>
                            <p className="text-sm">
                                Scan this in your authenticator app, or paste the secret manually:
                            </p>
                            <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs">
                                {setup.secret}
                            </code>
                            <p className="mt-2 text-xs text-muted-foreground">
                                otpauth URL:{' '}
                                <a
                                    className="text-blue-600 underline"
                                    href={setup.otpauth_url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    open
                                </a>
                            </p>
                            <img
                                alt="2FA QR"
                                className="mt-3 h-44 w-44 rounded border border-border bg-white p-2"
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setup.otpauth_url)}`}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Enter the 6-digit code from the app</Label>
                            <Input
                                inputMode="numeric"
                                maxLength={6}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                className="tracking-[0.5em] text-center text-lg"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setSetup(null)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button onClick={confirmEnable} disabled={busy || code.length !== 6}>
                                {busy ? 'Verifying…' : 'Verify and enable'}
                            </Button>
                        </div>
                    </div>
                )}

                {admin?.totp_enabled && !showDisable && (
                    <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => setShowDisable(true)}
                    >
                        Disable 2FA
                    </Button>
                )}

                {showDisable && admin?.totp_enabled && (
                    <div className="mt-4 space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-4">
                        <p className="text-sm text-red-700">
                            Confirm with your password and a current authenticator code to disable 2FA.
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Password</Label>
                                <PasswordInput
                                    value={disablePassword}
                                    onChange={(e) => setDisablePassword(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Current 2FA code</Label>
                                <Input
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={disableCode}
                                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    className="tracking-[0.5em] text-center"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowDisable(false);
                                    setDisablePassword('');
                                    setDisableCode('');
                                }}
                                disabled={busy}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={disable2FA}
                                disabled={busy || !disablePassword || disableCode.length !== 6}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                {busy ? 'Disabling…' : 'Disable 2FA'}
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/80 bg-white/80 p-6 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <h2 className="text-lg font-semibold text-[#001f3f]">Active sessions</h2>
                <p className="text-sm text-muted-foreground">
                    Each browser sign-in gets a session. Revoke sessions you don't recognise.
                </p>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 font-medium">IP</th>
                                <th className="px-3 py-2 font-medium">User agent</th>
                                <th className="px-3 py-2 font-medium">Created</th>
                                <th className="px-3 py-2 font-medium">Last used</th>
                                <th className="px-3 py-2 font-medium">Status</th>
                                <th className="px-3 py-2 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingSessions && (
                                <tr>
                                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                        Loading…
                                    </td>
                                </tr>
                            )}
                            {sessions.map((s) => (
                                <tr key={s.id} className="border-b border-border/60 last:border-0 align-top">
                                    <td className="px-3 py-2 text-sm">{s.ip_address || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate" title={s.user_agent || ''}>
                                        {s.user_agent || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.created_at}</td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.last_used_at}</td>
                                    <td className="px-3 py-2">
                                        {s.revoked ? (
                                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                                                revoked
                                            </span>
                                        ) : s.is_current ? (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                                                this session
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                                active
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        {!s.revoked && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                onClick={() => setConfirmRevoke(s)}
                                            >
                                                <X className="h-3 w-3" />
                                                Revoke
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <PlatformAlertDialog
                open={!!alert}
                title={alert?.title}
                message={alert?.message ?? ''}
                onClose={() => setAlert(null)}
            />

            <PlatformConfirmDialog
                open={!!confirmRevoke}
                title="Revoke session"
                message={
                    confirmRevoke?.is_current
                        ? 'This is your current session. Revoking it will sign you out. Continue?'
                        : 'Sign out this session? The browser will need to sign in again.'
                }
                confirmLabel="Revoke"
                destructive
                loading={busy}
                onConfirm={handleRevoke}
                onClose={() => !busy && setConfirmRevoke(null)}
            />
        </div>
    );
}
