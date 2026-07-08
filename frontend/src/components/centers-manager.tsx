import { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { Trash2, Plus, Edit2, MapPin, Building2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Center {
    id: string;
    name: string;
    address_line1: string;
    address_line2?: string;
    place: string;
    city: string;
    state: string;
    pincode: string;
}

export default function CentersManager() {
    const [centers, setCenters] = useState<Center[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCenter, setEditingCenter] = useState<Center | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        address_line1: '',
        address_line2: '',
        place: '',
        city: '',
        state: '',
        pincode: '',
    });

    useEffect(() => {
        loadCenters();
    }, []);

    const loadCenters = async () => {
        try {
            const response = await axios.get('/admin/settings/centers');
            if (response.data.success) {
                setCenters(response.data.data || []);
            }
        } catch (error) {
            console.error('Failed to load centers:', error);
            handleApiError(error);
        }
    };

    const handleOpenDialog = (center?: Center) => {
        if (center) {
            setEditingCenter(center);
            setFormData({
                name: center.name,
                address_line1: center.address_line1,
                address_line2: center.address_line2 || '',
                place: center.place,
                city: center.city,
                state: center.state,
                pincode: center.pincode,
            });
        } else {
            setEditingCenter(null);
            setFormData({
                name: '',
                address_line1: '',
                address_line2: '',
                place: '',
                city: '',
                state: '',
                pincode: '',
            });
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingCenter(null);
        setFormData({
            name: '',
            address_line1: '',
            address_line2: '',
            place: '',
            city: '',
            state: '',
            pincode: '',
        });
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            };

            if (editingCenter) {
                const response = await axios.put(
                    `/admin/settings/centers/${editingCenter.id}`,
                    formData,
                    config
                );
                handleApiResponse(response);
            } else {
                const response = await axios.post(
                    '/admin/settings/centers',
                    formData,
                    config
                );
                handleApiResponse(response);
            }

            handleCloseDialog();
            loadCenters();
        } catch (error) {
            console.error('Submit error:', error);
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteConfirmed = async () => {
        if (!deleteTargetId) return;
        setLoading(true);
        try {
            const response = await axios.delete(
                `/admin/settings/centers/${deleteTargetId}`,
                {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                }
            );
            handleApiResponse(response);
            loadCenters();
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
            setDeleteTargetId(null);
        }
    };

    const deleteTarget = centers.find((c) => c.id === deleteTargetId);

    return (
        <>
            {/* Glass card wrapper */}
            <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-white/80 dark:border-white/10 shadow-[0_8px_32px_rgba(7,27,58,0.07)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                {/* Top shimmer line */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/50 to-transparent dark:via-blue-500/20" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Branches</h2>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">Manage all branches for your company</p>
                    </div>
                    <Button
                        onClick={() => handleOpenDialog()}
                        size="sm"
                        type="button"
                        className="bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white shadow-md shadow-blue-500/25 dark:shadow-blue-900/40 rounded-xl gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add Center
                    </Button>
                </div>

                {/* Content */}
                <div className="px-6 pb-6">
                    {centers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#071b3a]/10 dark:bg-blue-900/30 border border-[#071b3a]/15 dark:border-blue-700/30 mb-4">
                                <Building2 className="h-8 w-8 text-[#071b3a]/60 dark:text-blue-400/60" />
                            </div>
                            <p className="font-medium text-foreground/80">No branches configured yet</p>
                            <p className="text-sm text-muted-foreground/60 mt-1">Add a center to get started</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {centers.map((center) => (
                                <div
                                    key={center.id}
                                    className="group relative overflow-hidden rounded-2xl border border-blue-100/80 dark:border-white/8 bg-white/80 dark:bg-white/5 backdrop-blur-sm transition-all duration-200 hover:border-blue-300/60 dark:hover:border-blue-600/40 hover:shadow-lg hover:shadow-blue-500/10 dark:hover:shadow-blue-900/20 hover:-translate-y-0.5"
                                >
                                    {/* Left gradient accent bar */}
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#071b3a] to-[#0d4a8a] rounded-l-2xl" />

                                    {/* Top shimmer on hover */}
                                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                    <div className="flex items-center justify-between gap-4 pl-5 pr-4 py-4">
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            {/* Gradient icon badge */}
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#071b3a] to-[#0d4a8a] shadow-md shadow-blue-500/25 dark:shadow-blue-900/40">
                                                <MapPin className="h-5 w-5 text-white" />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-[15px] text-foreground tracking-tight mb-1 truncate">
                                                    {center.name}
                                                </h3>
                                                <div className="text-xs text-muted-foreground/70 space-y-0.5 mb-2">
                                                    <p className="truncate">{center.address_line1}</p>
                                                    {center.address_line2 && <p className="truncate">{center.address_line2}</p>}
                                                </div>
                                                <div className="inline-flex items-center gap-1.5 bg-[#071b3a]/8 dark:bg-blue-900/30 border border-[#071b3a]/15 dark:border-blue-700/30 rounded-full px-2.5 py-0.5">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-[#071b3a] dark:bg-blue-400 shrink-0" />
                                                    <span className="text-[11px] font-medium text-[#071b3a] dark:text-blue-300 truncate">
                                                        {center.place}, {center.city}, {center.state} — {center.pincode}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex gap-2 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                type="button"
                                                onClick={() => handleOpenDialog(center)}
                                                disabled={loading}
                                                className="h-8 w-8 p-0 rounded-lg border-blue-100 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600/40 transition-all"
                                            >
                                                <Edit2 className="h-3.5 w-3.5 text-[#071b3a] dark:text-blue-300" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                type="button"
                                                onClick={() => setDeleteTargetId(center.id)}
                                                disabled={loading}
                                                className="h-8 w-8 p-0 rounded-lg border-red-100 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700/40 transition-all"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Add / Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingCenter ? 'Edit Center' : 'Add New Center'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingCenter
                                ? 'Update the center details'
                                : 'Create a new center for your company'}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Center Name *</Label>
                                <Input id="name" name="name" value={formData.name} onChange={handleFormChange} placeholder="e.g., Kochi Office" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address_line1">Address Line 1 *</Label>
                                <Input id="address_line1" name="address_line1" value={formData.address_line1} onChange={handleFormChange} placeholder="Building name/number, street" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address_line2">Address Line 2</Label>
                                <Input id="address_line2" name="address_line2" value={formData.address_line2} onChange={handleFormChange} placeholder="Apartment, suite, etc. (optional)" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="place">Place *</Label>
                                    <Input id="place" name="place" value={formData.place} onChange={handleFormChange} placeholder="e.g., Kakkanad" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="city">City *</Label>
                                    <Input id="city" name="city" value={formData.city} onChange={handleFormChange} placeholder="e.g., Kochi" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="state">State *</Label>
                                    <Input id="state" name="state" value={formData.state} onChange={handleFormChange} placeholder="e.g., Kerala" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pincode">Pincode *</Label>
                                    <Input id="pincode" name="pincode" value={formData.pincode} onChange={handleFormChange} placeholder="e.g., 682042" required />
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading} className="bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] hover:from-[#040f22] hover:to-[#0a3272] text-white">
                                {loading
                                    ? editingCenter ? 'Updating...' : 'Creating...'
                                    : editingCenter ? 'Update Center' : 'Create Center'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation AlertDialog */}
            <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mb-2">
                            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <AlertDialogTitle>Delete Center</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirmed}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-600"
                        >
                            {loading ? 'Deleting...' : 'Delete Center'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
