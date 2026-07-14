import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const authStatePath = path.join(__dirname, '.auth-state.json');
const credentialsCachePath = path.join(__dirname, '.e2e-credentials.json');

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001/api';

type AuthState = {
    email: string;
    password: string;
    orgSlug: string;
    token: string;
    refreshToken?: string;
};

async function tryLogin(email: string, password: string, orgSlug: string): Promise<AuthState | null> {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password, org_slug: orgSlug }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const token = json?.data?.token;
    if (!token) return null;
    return {
        email,
        password,
        orgSlug,
        token,
        refreshToken: json?.data?.refresh_token,
    };
}

function saveState(state: AuthState) {
    fs.writeFileSync(authStatePath, JSON.stringify(state, null, 2));
    fs.writeFileSync(
        credentialsCachePath,
        JSON.stringify(
            { email: state.email, password: state.password, orgSlug: state.orgSlug },
            null,
            2,
        ),
    );
}

async function provisionViaSignup(): Promise<AuthState | null> {
    const suffix = Date.now().toString(36);
    const orgSlug = `e2e-${suffix}`;
    const email = `e2e-${suffix}@test.local`;
    const password = 'E2eTestPassword123!';
    const payload = {
        channel: 'email',
        organization_name: `E2E Org ${suffix}`,
        org_slug: orgSlug,
        contact_person: 'E2E Runner',
        company_email: `company-${suffix}@test.local`,
        company_phone: '+919999999999',
        country: 'India',
        timezone: 'Asia/Kolkata',
        admin_name: 'E2E Admin',
        admin_email: email,
        admin_mobile: '+919999999999',
        admin_password: password,
        confirm_password: password,
    };

    const otpRes = await fetch(`${API}/public/signup/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!otpRes.ok) {
        console.warn('[e2e setup] send-otp failed', otpRes.status, await otpRes.text());
        return null;
    }
    const otpJson = await otpRes.json();
    const verificationId = otpJson?.data?.verification_id;
    const otp = otpJson?.data?.debug_otp;
    if (!verificationId || !otp) {
        console.warn('[e2e setup] missing verification_id or debug_otp (run backend in debug or set SIGNUP_OTP_DEBUG=1)');
        return null;
    }

    const signupRes = await fetch(`${API}/public/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            ...payload,
            verification_id: verificationId,
            otp: String(otp),
        }),
    });
    if (!signupRes.ok) {
        console.warn('[e2e setup] signup failed', signupRes.status, await signupRes.text());
        return null;
    }
    const signupJson = await signupRes.json();
    const token = signupJson?.data?.token;
    if (!token) return null;

    return {
        email,
        password,
        orgSlug,
        token,
        refreshToken: signupJson?.data?.refresh_token,
    };
}

function loadCachedCredentials(): { email: string; password: string; orgSlug: string } | null {
    for (const file of [authStatePath, credentialsCachePath]) {
        if (!fs.existsSync(file)) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (parsed.email && parsed.password && parsed.orgSlug) {
                return {
                    email: parsed.email,
                    password: parsed.password,
                    orgSlug: parsed.orgSlug,
                };
            }
        } catch {
            // try next file
        }
    }
    return null;
}

export default async function globalSetup() {
    const fromEnv = await tryLogin(
        process.env.E2E_EMAIL ?? 'info@retaildaddy.in',
        process.env.E2E_PASSWORD ?? 'Guru!1234',
        process.env.E2E_ORG_SLUG ?? 'mashuptech',
    );
    if (fromEnv) {
        saveState(fromEnv);
        console.log(`[e2e setup] Auth ready for ${fromEnv.email} (${fromEnv.orgSlug})`);
        return;
    }

    const cached = loadCachedCredentials();
    if (cached) {
        const relogin = await tryLogin(cached.email, cached.password, cached.orgSlug);
        if (relogin) {
            saveState(relogin);
            console.log(`[e2e setup] Reused auth for ${relogin.email}`);
            return;
        }
    }

    const state = await provisionViaSignup();
    if (!state) {
        console.warn('[e2e setup] No auth state — authenticated tests will be skipped');
        return;
    }

    saveState(state);
    console.log(`[e2e setup] Auth ready for ${state.email} (${state.orgSlug})`);
}
