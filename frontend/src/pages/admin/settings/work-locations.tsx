import { useEffect, useState } from 'react';
import axios from '@/lib/axios';
import { MapPin, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { handleApiError, handleApiResponse } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';

interface WorkLocation {
    id: number;
    name: string;
}

export default function WorkLocationsPage() {
    const confirm = useConfirm();
    const [locations, setLocations] = useState<WorkLocation[]>([]);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [loading, setLoading] = useState(false);

    const breadcrumbs = [
        { label: 'Settings', href: '#' },
        { label: 'Work Locations', href: '#' },
    ];

    const loadLocations = async () => {
        const res = await axios.get('/admin/settings/centers');
        const items = (res.data?.data ?? []) as Array<{ id: number; name: string }>;
        setLocations(items.map((c) => ({ id: c.id, name: c.name })));
    };

    useEffect(() => {
        loadLocations().catch(handleApiError);
    }, []);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        try {
            const res = await axios.post('/admin/settings/centers', { name: newName.trim() });
            await loadLocations();
            setNewName('');
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (loc: WorkLocation) => {
        setEditingId(loc.id);
        setEditingName(loc.name);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingName('');
    };

    const handleUpdate = async (id: number) => {
        if (!editingName.trim()) return;
        setLoading(true);
        try {
            const res = await axios.put(`/admin/settings/centers/${id}`, { name: editingName.trim() });
            await loadLocations();
            cancelEdit();
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!(await confirm({ description: 'Delete this work location?' }))) return;
        setLoading(true);
        try {
            const res = await axios.delete(`/admin/settings/centers/${id}`);
            await loadLocations();
            handleApiResponse(res);
        } catch (e) {
            handleApiError(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <div className="space-y-6 max-w-2xl">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <MapPin className="h-6 w-6 text-primary" />
                        Work Locations
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage branches used as employee work locations (same data as Branches).
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Add Location</CardTitle>
                        <CardDescription>Enter a name for the new work location</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. Head Office, Remote, Branch - Mumbai"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                                className="flex-1"
                            />
                            <Button onClick={handleAdd} disabled={loading || !newName.trim()}>
                                <Plus className="h-4 w-4 mr-1" /> Add
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Existing Locations</CardTitle>
                        <CardDescription>{locations.length} location{locations.length !== 1 ? 's' : ''} configured</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {locations.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8 italic">
                                No work locations added yet. Use the form above to add one.
                            </p>
                        ) : (
                            locations.map((loc) => (
                                <div
                                    key={loc.id}
                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                                >
                                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />

                                    {editingId === loc.id ? (
                                        <>
                                            <Input
                                                className="flex-1 h-8"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleUpdate(loc.id);
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                autoFocus
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-green-600"
                                                onClick={() => handleUpdate(loc.id)}
                                                disabled={loading}
                                            >
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8"
                                                onClick={cancelEdit}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 font-medium">{loc.name}</span>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8"
                                                onClick={() => startEdit(loc)}
                                                disabled={loading}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(loc.id)}
                                                disabled={loading}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
