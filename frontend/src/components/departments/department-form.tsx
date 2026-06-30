import axios from '@/lib/axios';
import { X } from 'lucide-react';
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

interface Department {
    id: number;
    name: string;
    slug?: string;
    description?: string;
    is_active: boolean;
}

interface DepartmentFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    department?: Department | null;
}

export default function DepartmentForm({
    open,
    onClose,
    onSuccess,
    department = null,
}: DepartmentFormProps) {
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        is_active: true,
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        if (!department?.id) {
            setFormData({
                name: '',
                description: '',
                is_active: true,
            });
            setErrors({});
            return;
        }

        let cancelled = false;
        const loadDepartment = async () => {
            try {
                const response = await axios.get(`/admin/departments/${department.id}`);
                if (cancelled || !response.data.success) {
                    return;
                }
                const data = response.data.data;
                setFormData({
                    name: data.name ?? '',
                    description: data.description || '',
                    is_active: data.is_active ?? true,
                });
                setErrors({});
            } catch (error) {
                if (!cancelled) {
                    handleApiError(error);
                }
            }
        };

        void loadDepartment();
        return () => {
            cancelled = true;
        };
    }, [department?.id, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const url = department
                ? `/admin/departments/${department.id}`
                : '/admin/departments';
            const method = department ? 'put' : 'post';

            const response = await axios[method](url, formData);
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
        <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {department ? 'Edit Department' : 'Create Department'}
                    </DialogTitle>
                    <DialogDescription>
                        {department
                            ? 'Update department information'
                            : 'Add a new department to your organization'}
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
                                placeholder="e.g., Engineering, Sales, HR"
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
                                placeholder="Brief description of this department"
                                rows={3}
                                disabled={loading}
                            />
                            {errors.description && (
                                <p className="text-sm text-red-500">{errors.description[0]}</p>
                            )}
                        </div>

                        {/* Active Status */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="is_active">Active Status</Label>
                                <p className="text-sm text-muted-foreground">
                                    Enable or disable this department
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
                                ? department
                                    ? 'Updating...'
                                    : 'Creating...'
                                : department
                                    ? 'Update'
                                    : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
