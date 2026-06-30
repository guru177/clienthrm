/** Google Maps Street View deep link (opens in browser, no API key). */
export function googleStreetViewUrl(
    lat: number | null | undefined,
    lng: number | null | undefined,
): string | null {
    if (lat == null || lng == null) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}
