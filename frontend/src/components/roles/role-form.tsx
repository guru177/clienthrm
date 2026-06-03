import axios from '@/lib/axios';
import { Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { handleApiError, handleApiResponse } from '@/lib/toast';


interface Permission {
    id: number;
    name: string;
    slug: string;
    group: string;
}

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    permissions?: Permission[];
}

interface RoleFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    role?: Role | null;
    allPermissions: Permission[];
    onSuccess: (role: Role) => void;
}

export default function RoleForm({
    open,
    onOpenChange,
    role,
    allPermissions,
    onSuccess,
}: RoleFormProps) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
    });
    const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (role) {
            setFormData({
                name: role.name,
                description: role.description || '',
            });
            setSelectedPermissions(
                role.permissions?.map((p) => p.id) || []
            );
        } else {
            setFormData({ name: '', description: '' });
            setSelectedPermissions([]);
        }
        setErrors({});
    }, [role, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const payload = {
                ...formData,
                permissions: selectedPermissions,
            };

            const response = role
                ? await axios.put(`/admin/roles/${role.id}`, payload)
                : await axios.post('/admin/roles', payload);

            handleApiResponse(response);
            onSuccess(response.data.data);
        } catch (error: any) {
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            handleApiError(error);
        } finally {
            setLoading(false);
        }
    };

    const handlePermissionToggle = (permissionId: number) => {
        setSelectedPermissions((prev) =>
            prev.includes(permissionId)
                ? prev.filter((id) => id !== permissionId)
                : [...prev, permissionId]
        );
    };

    const handleGroupToggle = (group: string) => {
        const groupPermissions = allPermissions
            .filter((p) => p.group === group)
            .map((p) => p.id);

        const allSelected = groupPermissions.every((id) =>
            selectedPermissions.includes(id)
        );

        if (allSelected) {
            setSelectedPermissions((prev) =>
                prev.filter((id) => !groupPermissions.includes(id))
            );
        } else {
            setSelectedPermissions((prev) => [
                ...new Set([...prev, ...groupPermissions]),
            ]);
        }
    };

    const isGroupSelected = (group: string) => {
        const groupPermissions = allPermissions
            .filter((p) => p.group === group)
            .map((p) => p.id);
        return groupPermissions.every((id) => selectedPermissions.includes(id));
    };

    const groupedPermissions = allPermissions.reduce(
        (acc, permission) => {
            if (!acc[permission.group]) {
                acc[permission.group] = [];
            }
            acc[permission.group].push(permission);
            return acc;
        },
        {} as Record<string, Permission[]>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {role ? 'Edit Role' : 'Create Role'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">
                                Role Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder="e.g. Sales Manager"
                                disabled={loading}
                            />
                            {errors.name && (
                                <p className="text-sm text-destructive">
                                    {errors.name[0]}
                                </p>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        description: e.target.value,
                                    })
                                }
                                placeholder="Describe the responsibilities and access level of this role"
                                rows={3}
                                disabled={loading}
                            />
                            {errors.description && (
                                <p className="text-sm text-destructive">
                                    {errors.description[0]}
                                </p>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Permissions</Label>
                                <Badge variant="secondary">
                                    {selectedPermissions.length} of{' '}
                                    {allPermissions.length} selected
                                </Badge>
                            </div>

                            <div className="space-y-6 border rounded-lg p-4 max-h-96 overflow-y-auto">
                                {Object.entries(groupedPermissions).map(
                                    ([group, permissions]) => (
                                        <div key={group} className="space-y-3">
                                            <div className="flex items-center gap-2 pb-2 border-b">
                                                <Checkbox
                                                    id={`group-${group}`}
                                                    checked={isGroupSelected(group)}
                                                    onCheckedChange={() =>
                                                        handleGroupToggle(group)
                                                    }
                                                    disabled={loading}
                                                />
                                                <Label
                                                    htmlFor={`group-${group}`}
                                                    className="font-semibold text-base cursor-pointer"
                                                >
                                                    {group}
                                                </Label>
                                                <Badge variant="outline" className="ml-auto">
                                                    {permissions.length}
                                                </Badge>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 pl-6">
                                                {permissions.map((permission) => (
                                                    <div
                                                        key={permission.id}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Checkbox
                                                            id={`permission-${permission.id}`}
                                                            checked={selectedPermissions.includes(
                                                                permission.id
                                                            )}
                                                            onCheckedChange={() =>
                                                                handlePermissionToggle(
                                                                    permission.id
                                                                )
                                                            }
                                                            disabled={loading}
                                                        />
                                                        <Label
                                                            htmlFor={`permission-${permission.id}`}
                                                            className="text-sm cursor-pointer"
                                                        >
                                                            {permission.name}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                            {errors.permissions && (
                                <p className="text-sm text-destructive">
                                    {errors.permissions[0]}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : role ? 'Update' : 'Create'} Role
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
