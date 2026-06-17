/** Match backend `normalize_org_slug`: lowercase alphanumeric segments joined by hyphens. */
export function normalizeOrgSlug(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .split('-')
        .filter(Boolean)
        .join('-');
}

export function isValidOrgSlug(raw: string): boolean {
    const slug = normalizeOrgSlug(raw);
    return slug.length >= 2 && slug !== 'default';
}
