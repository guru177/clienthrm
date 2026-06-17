import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import { getTimeZones } from '@vvo/tzdb';

countries.registerLocale(enLocale);

export const DEFAULT_COUNTRY = countries.getName('IN', 'en') ?? 'India';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface CountryOption {
    code: string;
    name: string;
}

export interface TimezoneOption {
    value: string;
    label: string;
}

let countryCache: CountryOption[] | null = null;
let timezoneCache: TimezoneOption[] | null = null;

export function getCountryOptions(): CountryOption[] {
    if (countryCache) return countryCache;

    const names = countries.getNames('en', { select: 'official' }) as Record<string, string>;
    countryCache = Object.entries(names)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return countryCache;
}

function formatUtcOffset(minutes: number): string {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getTimezoneOptions(): TimezoneOption[] {
    if (timezoneCache) return timezoneCache;

    timezoneCache = getTimeZones({ includeUtc: true })
        .map((tz) => ({
            value: tz.name,
            label: `(${formatUtcOffset(tz.currentTimeOffsetInMinutes)}) ${tz.name.replace(/_/g, ' ')} — ${tz.alternativeName || tz.abbreviation}`,
        }))
        .sort((a, b) => a.value.localeCompare(b.value));

    return timezoneCache;
}
