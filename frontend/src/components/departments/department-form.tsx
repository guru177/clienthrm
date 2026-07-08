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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { handleApiResponse, handleApiError } from '@/lib/toast';

interface Branch {
    id: number | string;
    name: string;
}

interface Department {
    id: number;
    name: string;
    slug?: string;
    description?: string;
    center_id?: number;
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
    const [branches, setBranches] = useState<Branch[]>([]);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        center_id: '' as string | number,
        is_active: true,
    });

    useEffect(() => {
        if (!open) return;
        axios
            .get('/admin/settings/centers')
            .then((res) => {
                if (res.data.success) {
                    setBranches(res.data.data ?? []);
                }
            })
            .catch(handleApiError);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        if (!department?.id) {
            setFormData({
                name: '',
                description: '',
                center_id: '',
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
                    center_id: data.center_id ?? '',
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
        if (!formData.center_id) {
            setErrors({ center_id: ['Branch is required'] });
            return;
        }
        setLoading(true);
        setErrors({});

        try {
            const url = department
                ? `/admin/departments/${department.id}`
                : '/admin/departments';
            const method = department ? 'put' : 'post';

            const response = await axios[method](url, {
                ...formData,
                center_id: Number(formData.center_id),
            });
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
                            : 'Add a department under a branch'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="center_id">
                                Branch <span className="text-red-500">*</span>
                            </Label>
                            {branches.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">
                                    No branches configured. Add a branch first under Branches.
                                </p>
                            ) : (
                                <Select
                                    value={String(formData.center_id || '')}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, center_id: value })
                                    }
                                >
                                    <SelectTrigger id="center_id">
                                        <SelectValue placeholder="Select branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branches.map((branch) => (
                                            <SelectItem key={branch.id} value={String(branch.id)}>
                                                {branch.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            {errors.center_id && (
                                <p className="text-sm text-red-500">{errors.center_id[0]}</p>
                            )}
                        </div>

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
                        <Button type="submit" disabled={loading || branches.length === 0}>
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
