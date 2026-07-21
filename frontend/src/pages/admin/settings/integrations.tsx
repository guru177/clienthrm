import { useEffect, useState } from 'react';
import { Link2, Plus, Trash2, RefreshCw } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import axios from '@/lib/axios';
import { handleApiError, handleApiResponse } from '@/lib/toast';

interface WebhookRow {
    id: number;
    url: string;
    events: string;
    is_active: boolean;
    created_at?: string | null;
}

export default function IntegrationsPage() {
    const [hooks, setHooks] = useState<WebhookRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState('');
    const [events, setEvents] = useState('leave.approved,attendance.clock_in,payslip.generated');
    const [createdSecret, setCreatedSecret] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/admin/integrations/webhooks');
            setHooks(res.data.data ?? []);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const create = async () => {
        try {
            const res = await axios.post('/admin/integrations/webhooks', { url, events });
            handleApiResponse(res);
            setCreatedSecret(res.data.data?.secret ?? null);
            setUrl('');
            await load();
        } catch (error) {
            handleApiError(error);
        }
    };

    const remove = async (id: number) => {
        try {
            const res = await axios.delete(`/admin/integrations/webhooks/${id}`);
            handleApiResponse(res);
            await load();
        } catch (error) {
            handleApiError(error);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'App Settings', href: '/admin/settings/app' },
                { label: 'Integrations' },
            ]}
        >
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Link2 className="h-6 w-6" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
                        <p className="text-sm text-muted-foreground">
                            Outbound webhooks with HMAC signatures (X-HRM-Signature)
                        </p>
                    </div>
                </div>

                {createdSecret && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
                        <p className="font-medium mb-1">Webhook secret (copy now)</p>
                        <code className="break-all">{createdSecret}</code>
                    </div>
                )}

                <div className="rounded-lg border p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Endpoint URL</Label>
                            <Input
                                placeholder="https://hooks.slack.com/services/..."
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Events (comma-separated or *)</Label>
                            <Input value={events} onChange={(e) => setEvents(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => void create()} disabled={!url.trim()}>
                            <Plus className="mr-2 h-4 w-4" />
                            Register webhook
                        </Button>
                        <Button variant="outline" onClick={() => void load()}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Events: leave.approved, attendance.clock_in, payslip.generated. Verify
                        signatures with your secret (sha256 HMAC of raw body).
                    </p>
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>URL</TableHead>
                                <TableHead>Events</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {hooks.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                                        {loading ? 'Loading…' : 'No webhooks registered.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                hooks.map((hook) => (
                                    <TableRow key={hook.id}>
                                        <TableCell className="max-w-[280px] truncate font-mono text-xs">
                                            {hook.url}
                                        </TableCell>
                                        <TableCell className="text-xs">{hook.events}</TableCell>
                                        <TableCell>
                                            <Badge variant={hook.is_active ? 'default' : 'secondary'}>
                                                {hook.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void remove(hook.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AppLayout>
    );
}
