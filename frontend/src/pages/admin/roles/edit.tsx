import { useNavigate } from 'react-router-dom';
import axios from '@/lib/axios';
import { ArrowLeft, Save, Shield, Users } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
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
    users_count: number;
    permissions_count: number;
    permissions: Permission[];
    created_at: string;
}

interface EditRolePageProps {
    role?: Role;
    allPermissions?: Permission[];
}

export default function EditRolePage({ role = {} as Role, allPermissions = [] }: EditRolePageProps) {
    const navigate = useNavigate();
    // Unwrap data from Inertia Resource wrapper
    const roleData = (role as any).data || role;
    const allPermissionsData = (allPermissions as any).data || allPermissions;

    // Ensure allPermissions is an array
    const permissionsList: Permission[] = Array.isArray(allPermissionsData) ? allPermissionsData : [];

    // Extract role permissions
    const rolePermissions: Permission[] = Array.isArray(roleData.permissions) ? roleData.permissions : [];

    const [formData, setFormData] = useState({
        name: roleData.name,
        description: roleData.description || '',
        permissions: rolePermissions.map((p) => p.id),
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    // Group permissions by category
    const groupedPermissions = permissionsList.reduce((acc, permission) => {
        if (!acc[permission.group]) {
            acc[permission.group] = [];
        }
        acc[permission.group].push(permission);
        return acc;
    }, {} as Record<string, Permission[]>);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        try {
            const response = await axios.put(`/admin/roles/${roleData.id}`, formData);
            handleApiResponse(response);

            // Update local state with response data if needed
            if (response.data.data) {
                const updatedRole = response.data.data;
                setFormData({
                    name: updatedRole.name,
                    description: updatedRole.description || '',
                    permissions: updatedRole.permissions?.map((p: Permission) => p.id) || formData.permissions,
                });
            }
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
        setFormData((prev) => ({
            ...prev,
            permissions: prev.permissions.includes(permissionId)
                ? prev.permissions.filter((id) => id !== permissionId)
                : [...prev.permissions, permissionId],
        }));
    };

    const handleGroupToggle = (group: string) => {
        const groupPermissionIds = groupedPermissions[group].map((p) => p.id);
        const allSelected = groupPermissionIds.every((id) =>
            formData.permissions.includes(id)
        );

        if (allSelected) {
            // Deselect all in group
            setFormData((prev) => ({
                ...prev,
                permissions: prev.permissions.filter(
                    (id) => !groupPermissionIds.includes(id)
                ),
            }));
        } else {
            // Select all in group
            setFormData((prev) => ({
                ...prev,
                permissions: [
                    ...prev.permissions,
                    ...groupPermissionIds.filter(
                        (id) => !prev.permissions.includes(id)
                    ),
                ],
            }));
        }
    };

    const isGroupFullySelected = (group: string) => {
        const groupPermissionIds = groupedPermissions[group].map((p) => p.id);
        return groupPermissionIds.every((id) => formData.permissions.includes(id));
    };

    const isGroupPartiallySelected = (group: string) => {
        const groupPermissionIds = groupedPermissions[group].map((p) => p.id);
        const selectedCount = groupPermissionIds.filter((id) =>
            formData.permissions.includes(id)
        ).length;
        return selectedCount > 0 && selectedCount < groupPermissionIds.length;
    };

    const breadcrumbs = [
        { label: 'Users', href: '/admin/users' },
        { label: 'Roles', href: '/admin/users' },
        { label: roleData.name, href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>

            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/admin/users')}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                    <Shield className="h-8 w-8 text-primary" />
                                    Edit Role
                                </h1>
                                <p className="text-muted-foreground">
                                    Update role details and manage permissions
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                            <Users className="h-3 w-3" />
                            {roleData.users_count} {roleData.users_count === 1 ? 'User' : 'Users'}
                        </Badge>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>
                                Update the role name and description
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">
                                    Role Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, name: e.target.value })
                                    }
                                    placeholder="e.g., Manager"
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">
                                        {errors.name[0]}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
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
                                    placeholder="Brief description of the role"
                                    rows={3}
                                />
                                {errors.description && (
                                    <p className="text-sm text-destructive">
                                        {errors.description[0]}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Shield className="h-4 w-4" />
                                <span>Role Slug:</span>
                                <code className="bg-muted px-2 py-1 rounded text-xs">
                                    {roleData.slug}
                                </code>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Permissions */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Permissions</CardTitle>
                                    <CardDescription>
                                        Select permissions for this role
                                    </CardDescription>
                                </div>
                                <Badge variant="outline">
                                    {formData.permissions.length} of {permissionsList.length} selected
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {(Object.entries(groupedPermissions) as [string, Permission[]][]).map(([group, permissions]) => (
                                <div key={group} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id={`group-${group}`}
                                                checked={isGroupFullySelected(group)}
                                                onCheckedChange={() => handleGroupToggle(group)}
                                                className={
                                                    isGroupPartiallySelected(group)
                                                        ? 'data-[state=checked]:bg-primary/50'
                                                        : ''
                                                }
                                            />
                                            <Label
                                                htmlFor={`group-${group}`}
                                                className="font-semibold text-base cursor-pointer"
                                            >
                                                {group}
                                            </Label>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">
                                            {
                                                permissions.filter((p) =>
                                                    formData.permissions.includes(p.id)
                                                ).length
                                            }{' '}
                                            / {permissions.length}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-6">
                                        {permissions.map((permission) => (
                                            <div
                                                key={permission.id}
                                                className="flex items-center gap-2"
                                            >
                                                <Checkbox
                                                    id={`permission-${permission.id}`}
                                                    checked={formData.permissions.includes(
                                                        permission.id
                                                    )}
                                                    onCheckedChange={() =>
                                                        handlePermissionToggle(permission.id)
                                                    }
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
                                    {group !== Object.keys(groupedPermissions).slice(-1)[0] && (
                                        <Separator className="mt-4" />
                                    )}
                                </div>
                            ))}
                            {errors.permissions && (
                                <p className="text-sm text-destructive">
                                    {errors.permissions[0]}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => navigate('/admin/users')}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <>Saving...</>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}