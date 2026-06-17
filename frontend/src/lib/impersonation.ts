const IMPERSONATION_KEY = 'hrm_impersonating_org';

export function setImpersonation(orgSlug: string, orgName: string) {
    localStorage.setItem(IMPERSONATION_KEY, JSON.stringify({ orgSlug, orgName }));
}

export function getImpersonation(): { orgSlug: string; orgName: string } | null {
    const raw = localStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function clearImpersonation() {
    localStorage.removeItem(IMPERSONATION_KEY);
}
