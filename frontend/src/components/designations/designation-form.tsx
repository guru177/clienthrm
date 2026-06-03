import axios from '@/lib/axios';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Designation {
    id: number;
    name: string;
    slug?: string;
    description?: string;
    level?: number;
    is_active: boolean;
}

interface DesignationFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    designation?: Designation | null;
}

export default function DesignationForm({
    open,
    onClose,
    onSuccess,
    designation = null,
}: DesignationFormProps) {
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        level: '',
        is_active: true,
    });

    useEffect(() => {
        if (designation) {
            setFormData({
                name: designation.name,
                description: designation.description || '',
                level: designation.level?.toString() || '',
                is_active: designation.is_active,
            });
        } else {
            setFormData({
                name: '',
                description: '',
                level: '',
                is_active: true,
            });
        }
        setErrors({});
    }, [designation, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const url = designation
                ? `/admin/designations/${designation.id}`
                : '/admin/designations';
            const method = designation ? 'put' : 'post';

            const payload = {
                ...formData,
                level: formData.level ? parseInt(formData.level) : null,
            };

            const response = await axios[method](url, payload);
            handleApiResponse(response);
            onSuccess();
            onClose();
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {designation ? 'Edit Designation' : 'Create Designation'}
                    </DialogTitle>
                    <DialogDescription>
                        {designation
                            ? 'Update designation information'
                            : 'Add a new designation to your organization'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name">
                                Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder="e.g., Manager, Developer, Analyst"
                                disabled={loading}
                            />
                            {errors.name && (
                                <p className="text-sm text-red-500">{errors.name[0]}</p>
                            )}
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                }
                                placeholder="Brief description of this designation"
                                rows={3}
                                disabled={loading}
                            />
                            {errors.description && (
                                <p className="text-sm text-red-500">{errors.description[0]}</p>
                            )}
                        </div>

                        {/* Level */}
                        <div className="space-y-2">
                            <Label htmlFor="level">Level (Optional)</Label>
                            <Input
                                id="level"
                                type="number"
                                value={formData.level}
                                onChange={(e) =>
                                    setFormData({ ...formData, level: e.target.value })
                                }
                                placeholder="1-100 (1=entry, 100=executive)"
                                min="1"
                                max="100"
                                disabled={loading}
                            />
                            <p className="text-xs text-muted-foreground">
                                Hierarchy level for organizational structure
                            </p>
                            {errors.level && (
                                <p className="text-sm text-red-500">{errors.level[0]}</p>
                            )}
                        </div>

                        {/* Active Status */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="is_active">Active Status</Label>
                                <p className="text-sm text-muted-foreground">
                                    Enable or disable this designation
                                </p>
                            </div>
                            <Switch
                                id="is_active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, is_active: checked })
                                }
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading
                                ? designation
                                    ? 'Updating...'
                                    : 'Creating...'
                                : designation
                                    ? 'Update'
                                    : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
