import { useState, useEffect } from 'react';
import axios from '@/lib/axios';
import { Trash2, Plus, Edit2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface InterviewCenter {
    id: string;
    name: string;
    address_line1: string;
    address_line2?: string;
    place: string;
    city: string;
    state: string;
    pincode: string;
}

export default function InterviewCentersManager() {
    const [centers, setCenters] = useState<InterviewCenter[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCenter, setEditingCenter] = useState<InterviewCenter | null>(null);
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
            const response = await axios.get('/admin/api/settings/interview-centers');
            if (response.data.success) {
                setCenters(response.data.data || []);
            }
        } catch (error) {
            console.error('Failed to load centers:', error);
        }
    };

    const handleOpenDialog = (center?: InterviewCenter) => {
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
            if (editingCenter) {
                // Update center
                const response = await axios.put(
                    `/admin/api/settings/interview-centers/${editingCenter.id}`,
                    formData
                );
                handleApiResponse(response);
            } else {
                // Create new center
                const response = await axios.post(
                    '/admin/api/settings/interview-centers',
                    formData
                );
                handleApiResponse(response);
            }

            handleCloseDialog();
            loadCenters();
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (centerId: string) => {
        if (!confirm('Are you sure you want to delete this center?')) {
            return;
        }

        setLoading(true);

        try {
            const response = await axios.delete(
                `/admin/api/settings/interview-centers/${centerId}`
            );
            handleApiResponse(response);
            loadCenters();
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Interview Centers</CardTitle>
                    <CardDescription>
                        Manage all interview centers for your company
                    </CardDescription>
                </div>
                <Button onClick={() => handleOpenDialog()} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Center
                </Button>
            </CardHeader>
            <CardContent>
                {centers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>No interview centers configured yet.</p>
                        <p className="text-sm mt-2">Add a center to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {centers.map((center) => (
                            <div
                                key={center.id}
                                className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-base mb-2">{center.name}</h3>
                                        <div className="text-sm text-muted-foreground space-y-1">
                                            <p>{center.address_line1}</p>
                                            {center.address_line2 && <p>{center.address_line2}</p>}
                                            <p>
                                                {center.place}, {center.city}, {center.state} {center.pincode}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleOpenDialog(center)}
                                            disabled={loading}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleDelete(center.id)}
                                            disabled={loading}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Dialog for adding/editing center */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>
                                {editingCenter ? 'Edit Center' : 'Add New Center'}
                            </DialogTitle>
                            <DialogDescription>
                                {editingCenter
                                    ? 'Update the interview center details'
                                    : 'Create a new interview center for candidate interviews'}
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Center Name *</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleFormChange}
                                        placeholder="e.g., Kochi Office"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address_line1">Address Line 1 *</Label>
                                    <Input
                                        id="address_line1"
                                        name="address_line1"
                                        value={formData.address_line1}
                                        onChange={handleFormChange}
                                        placeholder="Building name/number, street"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address_line2">Address Line 2</Label>
                                    <Input
                                        id="address_line2"
                                        name="address_line2"
                                        value={formData.address_line2}
                                        onChange={handleFormChange}
                                        placeholder="Apartment, suite, etc. (optional)"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="place">Place *</Label>
                                        <Input
                                            id="place"
                                            name="place"
                                            value={formData.place}
                                            onChange={handleFormChange}
                                            placeholder="e.g., Kakkanad"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="city">City *</Label>
                                        <Input
                                            id="city"
                                            name="city"
                                            value={formData.city}
                                            onChange={handleFormChange}
                                            placeholder="e.g., Kochi"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="state">State *</Label>
                                        <Input
                                            id="state"
                                            name="state"
                                            value={formData.state}
                                            onChange={handleFormChange}
                                            placeholder="e.g., Kerala"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="pincode">Pincode *</Label>
                                        <Input
                                            id="pincode"
                                            name="pincode"
                                            value={formData.pincode}
                                            onChange={handleFormChange}
                                            placeholder="e.g., 682042"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleCloseDialog}
                                    disabled={loading}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={loading}>
                                    {loading
                                        ? editingCenter
                                            ? 'Updating...'
                                            : 'Creating...'
                                        : editingCenter
                                            ? 'Update Center'
                                            : 'Create Center'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}
