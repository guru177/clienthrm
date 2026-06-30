import { useCallback, useMemo, useState } from 'react';
import axios from '@/lib/axios';

export const TENANT_TWO_FACTOR_AVAILABLE = true;
export const OTP_MAX_LENGTH = 6;

export const useTwoFactorAuth = () => {
    const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
    const [manualSetupKey, setManualSetupKey] = useState<string | null>(null);
    const [recoveryCodesList, setRecoveryCodesList] = useState<string[]>([]);
    const [errors, setErrors] = useState<string[]>([]);

    const hasSetupData = useMemo<boolean>(
        () => qrCodeSvg !== null && manualSetupKey !== null,
        [qrCodeSvg, manualSetupKey],
    );

    const fetchQrCode = useCallback(async (): Promise<void> => {
        if (!TENANT_TWO_FACTOR_AVAILABLE) return;
        try {
            const res = await axios.get('/two-factor/qr-code');
            const body = res.data as { data?: { svg?: string } };
            setQrCodeSvg(body.data?.svg ?? null);
        } catch {
            setErrors((prev) => [...prev, 'Failed to fetch QR code']);
            setQrCodeSvg(null);
        }
    }, []);

    const fetchSetupKey = useCallback(async (): Promise<void> => {
        if (!TENANT_TWO_FACTOR_AVAILABLE) return;
        try {
            const res = await axios.get('/two-factor/secret-key');
            const body = res.data as { data?: { secretKey?: string } };
            setManualSetupKey(body.data?.secretKey ?? null);
        } catch {
            setErrors((prev) => [...prev, 'Failed to fetch a setup key']);
            setManualSetupKey(null);
        }
    }, []);

    const clearErrors = useCallback((): void => {
        setErrors([]);
    }, []);

    const clearSetupData = useCallback((): void => {
        setManualSetupKey(null);
        setQrCodeSvg(null);
        clearErrors();
    }, [clearErrors]);

    const fetchRecoveryCodes = useCallback(async (): Promise<void> => {
        if (!TENANT_TWO_FACTOR_AVAILABLE) return;
        try {
            clearErrors();
            const res = await axios.get('/two-factor/recovery-codes');
            const body = res.data as { data?: string[] };
            setRecoveryCodesList(Array.isArray(body.data) ? body.data : []);
        } catch {
            setErrors((prev) => [...prev, 'Failed to fetch recovery codes']);
            setRecoveryCodesList([]);
        }
    }, [clearErrors]);

    const fetchSetupData = useCallback(async (): Promise<void> => {
        if (!TENANT_TWO_FACTOR_AVAILABLE) return;
        try {
            clearErrors();
            await Promise.all([fetchQrCode(), fetchSetupKey()]);
        } catch {
            setQrCodeSvg(null);
            setManualSetupKey(null);
        }
    }, [clearErrors, fetchQrCode, fetchSetupKey]);

    const enableTwoFactor = useCallback(async (code: string): Promise<string[]> => {
        const res = await axios.post('/two-factor/enable', { code });
        const body = res.data as { data?: { recovery_codes?: string[] } };
        return body.data?.recovery_codes ?? [];
    }, []);

    const disableTwoFactor = useCallback(async (password: string, code?: string): Promise<void> => {
        await axios.post('/two-factor/disable', { password, code: code ?? undefined });
    }, []);

    const fetchStatus = useCallback(async (): Promise<boolean> => {
        if (!TENANT_TWO_FACTOR_AVAILABLE) return false;
        const res = await axios.get('/two-factor/status');
        const body = res.data as { data?: { enabled?: boolean } };
        return Boolean(body.data?.enabled);
    }, []);

    return {
        qrCodeSvg,
        manualSetupKey,
        recoveryCodesList,
        hasSetupData,
        errors,
        clearErrors,
        clearSetupData,
        fetchQrCode,
        fetchSetupKey,
        fetchSetupData,
        fetchRecoveryCodes,
        enableTwoFactor,
        disableTwoFactor,
        fetchStatus,
    };
};
