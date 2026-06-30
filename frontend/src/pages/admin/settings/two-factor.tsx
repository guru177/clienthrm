import { ShieldBan, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import TwoFactorRecoveryCodes from '@/components/two-factor-recovery-codes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import TwoFactorSetupModal from '@/components/two-factor-setup-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TENANT_TWO_FACTOR_AVAILABLE, OTP_MAX_LENGTH, useTwoFactorAuth } from '@/hooks/use-two-factor-auth';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { type BreadcrumbItem } from '@/types';

interface TwoFactorProps {
    requiresConfirmation?: boolean;
    twoFactorEnabled?: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Two-Factor Authentication',
        href: '/admin/settings/two-factor',
    },
];

export default function TwoFactor({
    requiresConfirmation = true,
    twoFactorEnabled: initialEnabled = false,
}: TwoFactorProps) {
    const tenantTwoFactorAvailable = TENANT_TWO_FACTOR_AVAILABLE;
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(initialEnabled);
    const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[]>([]);
    const [showDisableForm, setShowDisableForm] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [disableError, setDisableError] = useState('');
    const [disabling, setDisabling] = useState(false);
    const {
        qrCodeSvg,
        hasSetupData,
        manualSetupKey,
        clearSetupData,
        fetchSetupData,
        recoveryCodesList,
        fetchRecoveryCodes,
        enableTwoFactor,
        disableTwoFactor,
        fetchStatus,
        errors,
    } = useTwoFactorAuth();
    const [showSetupModal, setShowSetupModal] = useState<boolean>(false);

    useEffect(() => {
        if (!tenantTwoFactorAvailable) return;
        fetchStatus()
            .then(setTwoFactorEnabled)
            .catch(() => undefined);
    }, [fetchStatus, tenantTwoFactorAvailable]);

    const displayRecoveryCodes = freshRecoveryCodes.length > 0 ? freshRecoveryCodes : recoveryCodesList;

    async function handleDisable() {
        if (!disablePassword.trim()) {
            setDisableError('Password is required');
            return;
        }
        if (disableCode.trim().length < OTP_MAX_LENGTH) {
            setDisableError('Enter your current 6-digit authentication code');
            return;
        }
        setDisabling(true);
        setDisableError('');
        try {
            await disableTwoFactor(disablePassword, disableCode);
            setTwoFactorEnabled(false);
            setFreshRecoveryCodes([]);
            setShowDisableForm(false);
            setDisablePassword('');
            setDisableCode('');
            clearSetupData();
        } catch (err: unknown) {
            setDisableError(err instanceof Error ? err.message : 'Failed to disable 2FA');
        } finally {
            setDisabling(false);
        }
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <h1 className="sr-only">Two-Factor Authentication Settings</h1>

            <SettingsLayout>
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Two-Factor Authentication</CardTitle>
                            <CardDescription>Manage your two-factor authentication settings</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {twoFactorEnabled ? (
                                <div className="flex flex-col items-start justify-start space-y-4">
                                    <Badge variant="default">Enabled</Badge>
                                    <p className="text-muted-foreground">
                                        With two-factor authentication enabled, you will be prompted for a secure,
                                        random pin during login, which you can retrieve from the TOTP-supported
                                        application on your phone.
                                    </p>

                                    <TwoFactorRecoveryCodes
                                        recoveryCodesList={displayRecoveryCodes}
                                        fetchRecoveryCodes={fetchRecoveryCodes}
                                        errors={errors}
                                    />

                                    {showDisableForm ? (
                                        <div className="w-full max-w-md space-y-3 rounded-lg border border-border p-4">
                                            <p className="text-sm text-muted-foreground">
                                                Confirm your password and authentication code to disable 2FA.
                                            </p>
                                            <Input
                                                type="password"
                                                placeholder="Password"
                                                value={disablePassword}
                                                onChange={(e) => setDisablePassword(e.target.value)}
                                            />
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={OTP_MAX_LENGTH}
                                                placeholder="6-digit code"
                                                value={disableCode}
                                                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                                            />
                                            {disableError ? (
                                                <p className="text-sm text-destructive">{disableError}</p>
                                            ) : null}
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    type="button"
                                                    onClick={() => {
                                                        setShowDisableForm(false);
                                                        setDisableError('');
                                                    }}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    type="button"
                                                    disabled={disabling}
                                                    onClick={() => void handleDisable()}
                                                >
                                                    {disabling ? 'Disabling…' : 'Confirm disable'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button variant="destructive" type="button" onClick={() => setShowDisableForm(true)}>
                                            <ShieldBan /> Disable 2FA
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-start justify-start space-y-4">
                                    <Badge variant="destructive">Disabled</Badge>
                                    <p className="text-muted-foreground">
                                        When you enable two-factor authentication, you will be prompted for a secure pin
                                        during login. This pin can be retrieved from a TOTP-supported application on
                                        your phone.
                                    </p>

                                    <div>
                                        {hasSetupData ? (
                                            <Button onClick={() => setShowSetupModal(true)}>
                                                <ShieldCheck />
                                                Continue Setup
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                disabled={!tenantTwoFactorAvailable}
                                                onClick={async () => {
                                                    if (!tenantTwoFactorAvailable) return;
                                                    await fetchSetupData();
                                                    setShowSetupModal(true);
                                                }}
                                            >
                                                <ShieldCheck />
                                                Enable 2FA
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <TwoFactorSetupModal
                        isOpen={showSetupModal}
                        onClose={() => setShowSetupModal(false)}
                        requiresConfirmation={requiresConfirmation}
                        twoFactorEnabled={twoFactorEnabled}
                        qrCodeSvg={qrCodeSvg}
                        manualSetupKey={manualSetupKey}
                        clearSetupData={clearSetupData}
                        fetchSetupData={fetchSetupData}
                        enableTwoFactor={enableTwoFactor}
                        onEnabled={(codes) => {
                            setFreshRecoveryCodes(codes);
                            setTwoFactorEnabled(true);
                            setShowSetupModal(false);
                            clearSetupData();
                        }}
                        errors={errors}
                    />
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
