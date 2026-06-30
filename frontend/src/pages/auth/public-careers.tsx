import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import AuthLayout from '@/layouts/auth-layout';
import { Button } from '@/components/ui/button';

interface Career {
    id: number;
    title: string;
    department?: string | null;
    location?: string | null;
    employment_type?: string | null;
    description?: string | null;
}

export default function PublicCareers() {
    const [params] = useSearchParams();
    const orgSlug = params.get('org') ?? params.get('org_slug') ?? 'mashuptech';
    const [careers, setCareers] = useState<Career[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/public/careers?org_slug=${encodeURIComponent(orgSlug)}`,
                    { headers: { Accept: 'application/json' } },
                );
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json?.error ?? 'Failed to load careers');
                }
                if (!cancelled) {
                    setCareers(json?.data ?? []);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : 'Failed to load careers');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [orgSlug]);

    return (
        <AuthLayout
            title="Open positions"
            description={`Careers at ${orgSlug}`}
        >
            <div className="flex flex-col gap-4">
                {loading && <p className="text-sm text-muted-foreground">Loading openings…</p>}
                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}
                {!loading && !error && careers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No open positions right now.</p>
                )}
                {careers.map((career) => (
                    <article
                        key={career.id}
                        className="rounded-lg border border-border bg-card p-4 shadow-sm"
                    >
                        <h2 className="text-lg font-semibold">{career.title}</h2>
                        <p className="text-sm text-muted-foreground">
                            {[career.department, career.location, career.employment_type]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                        {career.description && (
                            <p className="mt-2 text-sm text-foreground/90 line-clamp-4">
                                {career.description}
                            </p>
                        )}
                    </article>
                ))}
                <Button asChild variant="outline" className="w-full">
                    <Link to="/login">Employee login</Link>
                </Button>
            </div>
        </AuthLayout>
    );
}
