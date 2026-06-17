export interface OrgPlanInfo {
    slug: string;
    name: string;
    max_users: number;
    modules: string[];
    billing_period?: string;
    plan_started_at?: string | null;
    plan_expires_at?: string | null;
    days_remaining?: number | null;
    subscription_expired?: boolean;
}

/** Returns true when the module is included in the org subscription plan. */
export function isModuleAllowed(planModules: string[] | null | undefined, moduleKey?: string): boolean {
    if (!moduleKey) return true;
    if (!planModules || planModules.length === 0) return false;
    return planModules.includes(moduleKey);
}
